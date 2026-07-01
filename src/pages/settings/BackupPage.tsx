/**
 * 설정 > 데이터 백업.
 *
 * Supabase 무료 플랜 백업 대안 — 주요 업무 테이블을 JSON 단일 파일로 내보내기.
 *
 * · 수동 백업: "지금 백업" 버튼 → 브라우저 다운로드
 * · 자동 스케줄: 시간/요일 지정 → 브라우저가 열려 있을 때만 동작(setInterval)
 * · 마지막 백업 시각 localStorage 기록
 *
 * 🔴 CLAUDE.md §1: 모든 테이블에 company_id 필터.
 * 🔴 CLAUDE.md §5: 조회는 fetchAllRows 경유.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useCompany } from '@/hooks/useCompany';
import { useToast } from '@/components/ui/Toast';

// ── 백업 대상 테이블 (모두 company_id 필터) ─────────────────────────────
const BACKUP_TABLES = [
  'orders',
  'order_items',
  'customers',
  'customer_groups',
  'customer_users',
  'customer_order_uploads',
  'products',
  'inventory_lots',
  'inventory_transactions',
  'group_payments',
  'bank_transactions',
  'bank_transaction_splits',
  'bank_expense_uploads',
  'bank_expense_rows',
  'bank_mappings',
  'bank_exclude_keywords',
  'bank_classify_rules',
  'tax_invoices',
  'invoice_verifications',
  'pl_expenses',
  'pl_expense_categories',
  'purchase_orders',
  'purchase_order_items',
  'purchases',
  'import_invoices',
  'user_preferences',
  'portal_preferences',
] as const;

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface BackupSchedule {
  enabled: boolean;
  hour: number;
  minute: number;
  weekdays: number[];   // 0=일 ~ 6=토
}

const DEFAULT_SCHEDULE: BackupSchedule = {
  enabled: false,
  hour: 2,
  minute: 0,
  weekdays: [1, 2, 3, 4, 5],
};

function scheduleKey(companyId: string) {
  return `mc.backup.schedule.${companyId}`;
}
function lastBackupKey(companyId: string) {
  return `mc.backup.lastAt.${companyId}`;
}

function loadSchedule(companyId: string): BackupSchedule {
  try {
    const raw = localStorage.getItem(scheduleKey(companyId));
    if (!raw) return DEFAULT_SCHEDULE;
    const parsed = JSON.parse(raw) as Partial<BackupSchedule>;
    return {
      enabled: Boolean(parsed.enabled),
      hour: typeof parsed.hour === 'number' ? parsed.hour : DEFAULT_SCHEDULE.hour,
      minute: typeof parsed.minute === 'number' ? parsed.minute : DEFAULT_SCHEDULE.minute,
      weekdays: Array.isArray(parsed.weekdays)
        ? parsed.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : DEFAULT_SCHEDULE.weekdays,
    };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

function saveSchedule(companyId: string, schedule: BackupSchedule) {
  localStorage.setItem(scheduleKey(companyId), JSON.stringify(schedule));
}

function loadLastBackup(companyId: string): Date | null {
  const raw = localStorage.getItem(lastBackupKey(companyId));
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

function saveLastBackup(companyId: string, at: Date) {
  localStorage.setItem(lastBackupKey(companyId), at.toISOString());
}

/** KST timestamp for filename: YYYY-MM-DD_HH-mm */
function fmtFilenameTsKst(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p2(kst.getUTCMonth() + 1)}-${p2(kst.getUTCDate())}_${p2(kst.getUTCHours())}-${p2(kst.getUTCMinutes())}`;
}

function fmtRelative(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 60_000) return '방금 전';
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

function fmtKstDisplay(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p2(kst.getUTCMonth() + 1)}-${p2(kst.getUTCDate())} ${p2(kst.getUTCHours())}:${p2(kst.getUTCMinutes())}`;
}

/** 한 테이블의 company_id 필터 데이터를 모두 fetch. 실패 시 tableName 을 던짐. */
async function fetchTableRows(
  tableName: string,
  companyId: string,
): Promise<unknown[]> {
  try {
    // 🟠 companies 자체는 백업 대상에서 제외 (별도 처리) — 여기는 company_id 필터 테이블만.
    return await fetchAllRows(() =>
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(tableName as any)
        .select('*')
        .eq('company_id', companyId),
    );
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(`${tableName}: ${err}`);
  }
}

async function buildAndDownloadBackup(
  companyId: string,
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<{ filename: string; sizeKb: number; tableCount: number }> {
  const total = BACKUP_TABLES.length;
  const tables: Record<string, unknown[]> = {};

  for (let i = 0; i < total; i++) {
    const t = BACKUP_TABLES[i];
    onProgress?.(i, total, t);
    tables[t] = await fetchTableRows(t, companyId);
  }
  onProgress?.(total, total, 'packaging');

  const now = new Date();
  const payload = {
    backup_at: now.toISOString(),
    version: '1.0',
    company_id: companyId,
    tables,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const filename = `mochicraft_backup_${fmtFilenameTsKst(now)}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  saveLastBackup(companyId, now);
  return {
    filename,
    sizeKb: Math.round(blob.size / 1024),
    tableCount: total,
  };
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────
export function BackupPage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [lastBackup, setLastBackup] = useState<Date | null>(null);
  const [schedule, setSchedule] = useState<BackupSchedule>(DEFAULT_SCHEDULE);
  const [now, setNow] = useState<Date>(new Date());

  // 최초 로드 시 스케줄/마지막 백업 시각 복원
  useEffect(() => {
    if (!companyId) return;
    setSchedule(loadSchedule(companyId));
    setLastBackup(loadLastBackup(companyId));
  }, [companyId]);

  // 1분마다 now 갱신 (경과 시간 렌더 최신화)
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const doBackup = useCallback(
    async (source: 'manual' | 'auto') => {
      if (!companyId || busy) return;
      setBusy(true);
      setProgress({ done: 0, total: BACKUP_TABLES.length, current: BACKUP_TABLES[0] });
      try {
        const result = await buildAndDownloadBackup(companyId, (done, total, current) =>
          setProgress({ done, total, current }),
        );
        setLastBackup(new Date());
        showToast({
          kind: 'success',
          text: `${source === 'auto' ? '자동 ' : ''}백업 완료: ${result.filename} (${result.sizeKb} KB · ${result.tableCount}개 테이블)`,
        });
      } catch (e) {
        showToast({
          kind: 'error',
          text: `백업 실패 — ${e instanceof Error ? e.message : String(e)}`,
        });
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [companyId, busy, showToast],
  );

  // 스케줄 저장 (변경 즉시)
  useEffect(() => {
    if (!companyId) return;
    saveSchedule(companyId, schedule);
  }, [companyId, schedule]);

  // 자동 백업 트리거 — 매 분 last 시각 대비 스케줄 시각 도달 여부 체크
  const lastAutoTriggerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!companyId || !schedule.enabled) return;
    const check = async () => {
      const nowLocal = new Date();
      const kst = new Date(nowLocal.getTime() + 9 * 3600_000);
      const kstWeekday = kst.getUTCDay();
      const kstHour = kst.getUTCHours();
      const kstMinute = kst.getUTCMinutes();
      if (!schedule.weekdays.includes(kstWeekday)) return;
      if (kstHour !== schedule.hour || kstMinute !== schedule.minute) return;
      // 같은 스케줄 시각에 중복 트리거 방지 (KST YYYY-MM-DD_HH-mm 키)
      const triggerKey = fmtFilenameTsKst(nowLocal);
      if (lastAutoTriggerRef.current === triggerKey) return;
      lastAutoTriggerRef.current = triggerKey;
      // eslint-disable-next-line no-console
      console.log('[backup.auto] 트리거', triggerKey);
      await doBackup('auto');
    };
    // 즉시 1회 + 60초 주기
    void check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [companyId, schedule, doBackup]);

  const weekdayToggle = (d: number) => {
    setSchedule((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(d)
        ? prev.weekdays.filter((x) => x !== d)
        : [...prev.weekdays, d].sort(),
    }));
  };

  const relative = useMemo(
    () => (lastBackup ? fmtRelative(lastBackup, now) : null),
    [lastBackup, now],
  );

  if (!companyId) {
    return <div style={{ padding: 32, color: 'var(--ink-3)' }}>불러오는 중…</div>;
  }

  return (
    <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 24px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: 'var(--ink)' }}>
        데이터 백업
      </h2>
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 24 }}>
        주요 업무 테이블 데이터를 JSON 단일 파일로 내보냅니다. Supabase 유료 플랜의 자동 백업을
        대체하는 최소 안전장치입니다.
      </p>

      {/* ── 수동 백업 ── */}
      <section
        style={{
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: 20,
          background: 'var(--surface)',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
              지금 백업
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {BACKUP_TABLES.length}개 테이블을 JSON 파일로 다운로드합니다.
            </div>
          </div>
          <button
            type="button"
            onClick={() => doBackup('manual')}
            disabled={busy}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
              height: 34,
              background: 'var(--brand)',
              color: '#FDFAF4',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {busy ? (
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Download size={14} strokeWidth={1.8} />
            )}
            {busy ? '백업 중…' : '지금 백업'}
          </button>
        </div>
        {progress && busy && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-2)' }}>
            {progress.done}/{progress.total} · {progress.current}
          </div>
        )}
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px dashed var(--line)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--ink-3)',
          }}
        >
          {lastBackup ? (
            <>
              <CheckCircle2 size={13} strokeWidth={1.8} color="var(--success)" />
              마지막 백업: {fmtKstDisplay(lastBackup)} ({relative})
            </>
          ) : (
            <>
              <Clock size={13} strokeWidth={1.8} />
              아직 백업한 기록이 없습니다.
            </>
          )}
        </div>
      </section>

      {/* ── 자동 백업 스케줄 ── */}
      <section
        style={{
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: 20,
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
              자동 백업 스케줄
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              지정한 시각에 자동으로 JSON 파일이 다운로드됩니다.
            </div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={schedule.enabled}
              onChange={(e) => setSchedule((p) => ({ ...p, enabled: e.target.checked }))}
              style={{ width: 16, height: 16 }}
            />
            {schedule.enabled ? '사용 중' : '사용 안 함'}
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>시각</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={schedule.hour}
              onChange={(e) => setSchedule((p) => ({ ...p, hour: Number(e.target.value) }))}
              disabled={!schedule.enabled}
              style={{
                height: 30,
                padding: '0 8px',
                border: '1px solid var(--line)',
                borderRadius: 6,
                fontSize: 12.5,
                background: 'var(--surface)',
                color: 'var(--ink)',
              }}
            >
              {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>
              ))}
            </select>
            <select
              value={schedule.minute}
              onChange={(e) => setSchedule((p) => ({ ...p, minute: Number(e.target.value) }))}
              disabled={!schedule.enabled}
              style={{
                height: 30,
                padding: '0 8px',
                border: '1px solid var(--line)',
                borderRadius: 6,
                fontSize: 12.5,
                background: 'var(--surface)',
                color: 'var(--ink)',
              }}
            >
              {[0, 10, 20, 30, 40, 50].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>(KST)</span>
          </div>

          <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>요일</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {WEEKDAY_LABELS.map((label, d) => {
              const active = schedule.weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => weekdayToggle(d)}
                  disabled={!schedule.enabled}
                  style={{
                    width: 34,
                    height: 30,
                    borderRadius: 6,
                    border: `1px solid ${active ? 'var(--brand)' : 'var(--line)'}`,
                    background: active ? 'var(--brand)' : 'var(--surface)',
                    color: active ? '#FDFAF4' : 'var(--ink-3)',
                    fontSize: 12,
                    cursor: schedule.enabled ? 'pointer' : 'not-allowed',
                    opacity: schedule.enabled ? 1 : 0.5,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            background: 'var(--warning-wash)',
            border: '1px solid var(--warning)',
            borderRadius: 6,
            fontSize: 11.5,
            color: 'var(--warning)',
          }}
        >
          ⚠️ 자동 백업은 OPS가 브라우저에서 열려 있는 동안만 동작합니다.
          업무 종료 시점에 브라우저를 열어둔 채로 백업 시각을 설정해 주세요.
        </div>
      </section>
    </div>
  );
}
