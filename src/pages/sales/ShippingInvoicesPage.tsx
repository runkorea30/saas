/**
 * 송장대장 페이지 — 판매 > 송장대장.
 *
 * 탭 구조:
 *  - 그리드 보기: shipping_invoices 조회 그리드 (수취인/업체명 검색, 재다운로드, 소프트 삭제)
 *  - 통계자료: 선택 기간 내 일별/월별 발송 라벨 수 (COUNT(*), 소프트 삭제분 제외)
 *
 * 기간 필터: 주문내역과 동일한 Segmented 컴포넌트(오늘/이번 주/이번 달/지난 달/90일/사용자 지정)
 * 재사용. 기본값은 '오늘'.
 *
 * 삭제 원칙: 하드 DELETE 금지, deleted_at 소프트 삭제.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 훅에서만 획득.
 * 🔴 CLAUDE.md §5: fetchAllRows 경유 (useShippingInvoices 내부에서 처리).
 * 🔴 KST 규칙: getFullYear/getMonth/getDate 만 사용. toISOString().slice(0,10) 금지.
 */
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, Download, Folder, FolderCheck, List, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import {
  useMarkShippingInvoicesDownloaded,
  useShippingInvoiceStats,
  useShippingInvoices,
  useSoftDeleteShippingInvoices,
  type ShippingInvoiceDbRow,
  type ShippingStatsBucket,
} from '@/hooks/useShippingInvoices';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { Segmented, periodRange } from '@/components/feature/orders/primitives';
import type { PeriodKey } from '@/types/orders';
import { buildLogenWorkbookArrayBuffer } from '@/utils/logenExcelExport';
import {
  LOGEN_EXPORT_FILENAME,
  downloadBlobToUserFolder,
  getLogenFolderHandle,
  isFolderPickerSupported,
  pickLogenFolder,
  saveLogenFolderHandle,
  writeLogenExcelFile,
} from '@/utils/logenFolderStorage';

/**
 * Date → 'YYYY-MM-DD' (로컬/KST 기준).
 * 🔴 프로젝트 확정 원칙: getFullYear/getMonth/getDate 사용, toISOString 금지.
 */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const PERIOD_OPTIONS: { id: PeriodKey; label: string }[] = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
  { id: 'lastmonth', label: '지난 달' },
  { id: '90d', label: '90일' },
  { id: 'custom', label: '사용자 지정' },
];

const btnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  height: 30,
  borderRadius: 8,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink-2)',
  fontFamily: 'var(--font-kr)',
  fontSize: 12.5,
  cursor: 'pointer',
};

const primaryBtn: React.CSSProperties = {
  ...btnBase,
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--surface)',
  fontWeight: 600,
};

const dangerBtn: React.CSSProperties = {
  ...btnBase,
  border: 'none',
  background: 'var(--danger)',
  color: '#FDFAF4',
  fontWeight: 600,
};

/**
 * 다크모드 가독성:
 * - `colorScheme: 'light dark'` 로 브라우저에게 두 모드 다 그릴 수 있음을
 *   알림 — 실제 그리기 색상은 CSS 색상 토큰(background/color) 을 따르되,
 *   네이티브 달력 팝업/스피너/아이콘도 현재 컨텐츠 색상을 이어받는다.
 * - 배경/글자색은 하드코딩 hex 대신 프로젝트 공용 토큰 사용.
 */
const dateInputStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 12.5,
  fontFamily: 'var(--font-num)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  colorScheme: 'light dark',
};

const searchInputStyle: React.CSSProperties = {
  padding: '4px 8px 4px 26px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 12.5,
  fontFamily: 'var(--font-kr)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  width: 150,
  outline: 'none',
};

/** 입력값 변경 후 300ms 지연된 값을 반환 (디바운스). */
function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

type TabKey = 'list' | 'stats';

export function ShippingInvoicesPage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();

  // ───── 탭 ─────
  const [tab, setTab] = useState<TabKey>('list');

  // ───── 기간 필터 (주문내역과 동일 패턴) ─────
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({
    from: toDateKey(new Date()),
    to: toDateKey(new Date()),
  }));
  const [dateFrom, dateTo] = useMemo(() => {
    if (period === 'custom') return [custom.from, custom.to];
    const [s, e] = periodRange(period, new Date());
    return [toDateKey(s), toDateKey(e)];
  }, [period, custom]);

  const [recipientInput, setRecipientInput] = useState('');
  const [customerInput, setCustomerInput] = useState('');
  const recipientQuery = useDebounced(recipientInput, 300);
  const customerQuery = useDebounced(customerInput, 300);

  const { data: rows = [], isLoading } = useShippingInvoices(companyId, {
    dateFrom,
    dateTo,
    recipientQuery,
    customerQuery,
  });
  const { data: stats, isLoading: statsLoading } = useShippingInvoiceStats(
    companyId,
    { dateFrom, dateTo },
  );
  const markDownloadedMutation = useMarkShippingInvoicesDownloaded();
  const softDeleteMutation = useSoftDeleteShippingInvoices();

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [folderName, setFolderName] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const selectedRows = useMemo(
    () => rows.filter((r) => checked[r.id]),
    [rows, checked],
  );

  const handleSetFolder = async () => {
    if (!isFolderPickerSupported()) {
      showToast({
        kind: 'info',
        text: '이 브라우저는 폴더 자동저장 미지원 — 다운로드로 저장됩니다.',
      });
      return;
    }
    const handle = await pickLogenFolder();
    if (!handle) return;
    await saveLogenFolderHandle(handle);
    setFolderName(handle.name);
    showToast({ kind: 'success', text: `업로드 폴더 설정: ${handle.name}` });
  };

  const handleRedownload = async () => {
    if (!companyId) return;
    if (selectedRows.length === 0) {
      showToast({ kind: 'info', text: '재다운로드할 행을 선택하세요.' });
      return;
    }
    const buf = buildLogenWorkbookArrayBuffer(selectedRows);
    let savedTo: 'folder' | 'download' = 'download';
    try {
      if (isFolderPickerSupported()) {
        let handle = await getLogenFolderHandle();
        if (!handle) {
          handle = await pickLogenFolder();
          if (handle) await saveLogenFolderHandle(handle);
        }
        if (handle) {
          await writeLogenExcelFile(handle, buf);
          savedTo = 'folder';
        } else {
          downloadBlobToUserFolder(buf);
        }
      } else {
        downloadBlobToUserFolder(buf);
      }
    } catch (e) {
      downloadBlobToUserFolder(buf);
      const msg = e instanceof Error ? e.message : '';
      showToast({ kind: 'error', text: `폴더 저장 실패, 다운로드로 대체: ${msg}` });
    }
    try {
      await markDownloadedMutation.mutateAsync({
        companyId,
        ids: selectedRows.map((r) => r.id),
      });
    } catch {
      // ignore
    }
    showToast({
      kind: 'success',
      text:
        savedTo === 'folder'
          ? `${selectedRows.length}건 재다운로드 완료 (${LOGEN_EXPORT_FILENAME} 덮어쓰기)`
          : `${selectedRows.length}건 재다운로드 완료 (${LOGEN_EXPORT_FILENAME})`,
    });
    setChecked({});
  };

  const handleConfirmDelete = async () => {
    if (!companyId) return;
    if (selectedRows.length === 0) return;
    try {
      await softDeleteMutation.mutateAsync({
        companyId,
        ids: selectedRows.map((r) => r.id),
      });
      showToast({ kind: 'success', text: `${selectedRows.length}건 삭제 완료` });
      setChecked({});
      setDeleteOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '삭제 실패';
      showToast({ kind: 'error', text: `삭제 실패: ${msg}` });
    }
  };

  const toggleAll = () => {
    if (rows.every((r) => checked[r.id]) && rows.length > 0) {
      setChecked({});
    } else {
      const next: Record<string, boolean> = {};
      rows.forEach((r) => (next[r.id] = true));
      setChecked(next);
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '12px 32px 80px', maxWidth: 1720, width: '100%', margin: '0 auto' }}>
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 2,
        }}
      >
        판매 › 송장대장
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>
          송장대장
        </h1>
        {/* 탭 전환 — 그리드 보기 / 통계자료 */}
        <div style={{ marginLeft: 12 }}>
          <Segmented<TabKey>
            options={[
              { id: 'list', label: '그리드 보기', icon: <List size={12} /> },
              { id: 'stats', label: '통계자료', icon: <BarChart3 size={12} /> },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        {/* 기간 세그먼트 */}
        <div style={{ marginLeft: 4 }}>
          <Segmented<PeriodKey>
            options={PERIOD_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={period}
            onChange={setPeriod}
            compact
          />
        </div>
        {period === 'custom' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} color="var(--ink-3)" />
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              style={dateInputStyle}
            />
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>~</span>
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              style={dateInputStyle}
            />
          </div>
        )}
        {tab === 'list' && (
          <>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-3)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="search"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder="수취인명"
                style={searchInputStyle}
              />
            </div>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-3)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="search"
                value={customerInput}
                onChange={(e) => setCustomerInput(e.target.value)}
                placeholder="업체명"
                style={searchInputStyle}
              />
            </div>
          </>
        )}
        <div style={{ flex: 1 }} />
        {tab === 'list' && (
          <>
            <button type="button" onClick={handleSetFolder} style={btnBase}>
              {folderName ? <FolderCheck size={13} /> : <Folder size={13} />}
              업로드 폴더 설정{folderName ? ` (${folderName})` : ''}
            </button>
            <button
              type="button"
              onClick={() => void handleRedownload()}
              style={primaryBtn}
              disabled={selectedRows.length === 0}
            >
              <RefreshCw size={13} /> 선택 재다운로드 ({selectedRows.length})
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              style={dangerBtn}
              disabled={selectedRows.length === 0}
            >
              <Trash2 size={13} /> 선택 삭제 ({selectedRows.length})
            </button>
          </>
        )}
      </div>

      {tab === 'list' ? (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 90px 1fr 1fr 1.6fr 120px 120px 1fr 100px 70px 90px',
              gap: 0,
              padding: '10px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--ink-3)',
              background: 'var(--surface-2, #fafafa)',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div>
              <input
                type="checkbox"
                onChange={toggleAll}
                checked={rows.length > 0 && rows.every((r) => checked[r.id])}
              />
            </div>
            <div>날짜</div>
            <div>수취인명</div>
            <div>거래처명</div>
            <div>주소</div>
            <div>전화</div>
            <div>휴대폰</div>
            <div>브랜드</div>
            <div>결제유형</div>
            <div style={{ textAlign: 'right' }}>라벨수</div>
            <div style={{ textAlign: 'center' }}>다운로드</div>
          </div>
          {isLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              불러오는 중…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              해당 조건의 송장 이력이 없습니다.
            </div>
          ) : (
            rows.map((r) => <InvoiceRow key={r.id} r={r} checked={!!checked[r.id]} onToggle={() => setChecked((c) => ({ ...c, [r.id]: !c[r.id] }))} />)
          )}
        </div>
      ) : (
        <StatsView
          loading={statsLoading}
          total={stats?.total ?? 0}
          daily={stats?.daily ?? []}
          monthly={stats?.monthly ?? []}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="송장 삭제"
        confirmLabel="삭제"
        confirmVariant="danger"
        busy={softDeleteMutation.isPending}
        onConfirm={() => void handleConfirmDelete()}
        body={
          <>
            {selectedRows.length}건을 삭제하시겠습니까?
            <br />
            로젠 시스템에 이미 업로드된 송장이라면 그쪽에서도 별도로 취소해야 합니다.
          </>
        }
      />
    </div>
  );
}

/**
 * 통계자료 뷰 — 일별/월별 라벨 수 CSS 막대 차트.
 * recharts 도입 지양 위해 순수 CSS 로 얇게 구현 (막대 폭 = 최대값 대비 비율).
 */
function StatsView({
  loading,
  total,
  daily,
  monthly,
  dateFrom,
  dateTo,
}: {
  loading: boolean;
  total: number;
  daily: ShippingStatsBucket[];
  monthly: ShippingStatsBucket[];
  dateFrom: string;
  dateTo: string;
}) {
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
        통계 불러오는 중…
      </div>
    );
  }
  if (total === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
        해당 기간({dateFrom} ~ {dateTo}) 에 발송 이력이 없습니다.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI 요약 */}
      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '14px 18px',
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 8,
          alignSelf: 'flex-start',
        }}
      >
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>기간 총 발송</span>
        <span style={{ fontFamily: 'var(--font-num)', fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}>
          {total.toLocaleString('ko-KR')}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>건</span>
        <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--ink-4)' }}>
          ({dateFrom} ~ {dateTo})
        </span>
      </div>

      <StatsBarChart title="일별 발송 수량" buckets={daily} />
      <StatsBarChart title="월별 발송 수량" buckets={monthly} />
    </div>
  );
}

function StatsBarChart({
  title,
  buckets,
}: {
  title: string;
  buckets: ShippingStatsBucket[];
}) {
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0);
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface-2, #fafafa)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ink-2)',
        }}
      >
        {title}
      </div>
      {buckets.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
          집계할 데이터가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {buckets.map((b) => {
            const pct = max > 0 ? (b.count / max) * 100 : 0;
            return (
              <div
                key={b.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr 60px',
                  gap: 10,
                  alignItems: 'center',
                  padding: '8px 14px',
                  borderTop: '1px solid var(--line)',
                  fontSize: 12,
                }}
              >
                <div style={{ fontFamily: 'var(--font-num)', color: 'var(--ink-2)' }}>{b.key}</div>
                <div
                  style={{
                    position: 'relative',
                    height: 14,
                    background: 'var(--surface-2)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${pct}%`,
                      background: 'var(--brand)',
                      borderRadius: 3,
                    }}
                  />
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-num)',
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  {b.count.toLocaleString('ko-KR')}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InvoiceRow({
  r,
  checked,
  onToggle,
}: {
  r: ShippingInvoiceDbRow;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 90px 1fr 1fr 1.6fr 120px 120px 1fr 100px 70px 90px',
        gap: 0,
        padding: '10px 12px',
        fontSize: 12.5,
        color: 'var(--ink)',
        borderBottom: '1px solid var(--line)',
        alignItems: 'center',
      }}
    >
      <div>
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </div>
      <div style={{ fontFamily: 'var(--font-num)', color: 'var(--ink-2)' }}>{r.order_date}</div>
      <div>
        {r.recipient_name || <span style={{ color: 'var(--ink-3)' }}>(미지정)</span>}
        {r.is_direct && (
          <span
            style={{
              marginLeft: 6,
              padding: '1px 6px',
              background: 'var(--warning-soft, #fef3c7)',
              color: 'var(--warning-ink, #92400e)',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            직송
          </span>
        )}
      </div>
      <div style={{ color: 'var(--ink-2)' }}>{r.customer_name || '-'}</div>
      <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>
        {r.zipcode ? `[${r.zipcode}] ` : ''}
        {r.address || '-'}
      </div>
      <div style={{ fontFamily: 'var(--font-num)', color: 'var(--ink-2)' }}>{r.phone || '-'}</div>
      <div style={{ fontFamily: 'var(--font-num)', color: 'var(--ink-2)' }}>{r.phone2 || '-'}</div>
      <div style={{ color: 'var(--ink-2)' }}>{r.brand}</div>
      <div style={{ color: 'var(--ink-2)' }}>{r.credit || '-'}</div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-num)' }}>{r.label_count}</div>
      <div style={{ textAlign: 'center' }}>
        {r.downloaded_at ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              background: 'var(--success-soft, #dcfce7)',
              color: 'var(--success-ink, #14532d)',
              borderRadius: 4,
              fontSize: 10.5,
              fontWeight: 600,
            }}
          >
            <Download size={10} />
            완료
          </span>
        ) : (
          <span
            style={{
              padding: '2px 6px',
              background: 'var(--warning-soft, #fef3c7)',
              color: 'var(--warning-ink, #92400e)',
              borderRadius: 4,
              fontSize: 10.5,
              fontWeight: 600,
            }}
          >
            미다운로드
          </span>
        )}
      </div>
    </div>
  );
}
