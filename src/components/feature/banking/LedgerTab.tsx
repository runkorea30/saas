/**
 * 은행거래 — 입출금 장부 탭.
 *
 * - KB 엑셀 업로드 → parseKBBank → applyAutoMatch → 미리보기 모달 → 일괄 저장.
 * - 검색·상태 필터.
 * - 행별 거래처 select / 매칭상태 / 매출월 / 제외/매칭해제 액션.
 *   (정산이동 컬럼은 UI에서 숨김. DB 컬럼 moved_to_monthly 는 유지.)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Search, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import {
  useAddBankTransactions,
  useUpdateBankTransaction,
  useAddBankExcludeKeyword,
  useBankTransactionSplits,
  useUpsertBankTransactionSplits,
} from '@/hooks/useBanking';
import { parseKBBank, applyAutoMatch, type MatchedBankRow } from '@/utils/bankParser';
import { fmtWon } from '@/components/feature/orders/primitives';
import type {
  BankTransaction,
  BankMapping,
  BankExcludeKeyword,
  BankTransactionSplit,
} from '@/types/database';

type StatusFilter = 'all' | 'matched' | 'unmatched' | 'excluded';

interface Props {
  transactions: BankTransaction[];
  mappings: BankMapping[];
  excludeKeywords: BankExcludeKeyword[];
  customers: { id: string; name: string }[];
}

export function LedgerTab({ transactions, mappings, excludeKeywords, customers }: Props) {
  const { showToast } = useToast();
  const addTxs = useAddBankTransactions();
  const updateTx = useUpdateBankTransaction();
  const addKeyword = useAddBankExcludeKeyword();
  const { data: splits = [] } = useBankTransactionSplits();
  const upsertSplits = useUpsertBankTransactionSplits();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // 업로드 미리보기 상태
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<MatchedBankRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  // 제외 사유 입력 모달
  const [excludeTarget, setExcludeTarget] = useState<BankTransaction | null>(null);
  const [excludeReason, setExcludeReason] = useState('');

  // 제외 후 키워드 등록 확인 모달
  const [keywordConfirm, setKeywordConfirm] = useState<string | null>(null);

  // 분할 모달
  const [splitTarget, setSplitTarget] = useState<BankTransaction | null>(null);

  // bank_transaction_id → splits[] 맵 (행별 표시용)
  const splitsByTx = useMemo(() => {
    const m = new Map<string, BankTransactionSplit[]>();
    for (const sp of splits) {
      const arr = m.get(sp.bank_transaction_id) ?? [];
      arr.push(sp);
      m.set(sp.bank_transaction_id, arr);
    }
    return m;
  }, [splits]);

  // ───── 파일 업로드 ─────
  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 가능하게
    if (!file) return;

    setParsing(true);
    try {
      const parsed = await parseKBBank(file);
      const matched = applyAutoMatch(parsed, mappings, excludeKeywords, customers);
      if (matched.length === 0) {
        showToast({ kind: 'error', text: '입금 내역이 없습니다.' });
        return;
      }
      setPreview(matched);
    } catch (err) {
      showToast({
        kind: 'error',
        text: `엑셀 파싱 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      });
    } finally {
      setParsing(false);
    }
  };

  const onSavePreview = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const payload = preview.map((r) => ({
        transaction_date: r.transaction_date,
        depositor_name: r.depositor_name,
        amount: r.amount,
        description: r.description,
        match_status: r.auto_excluded
          ? ('excluded' as const)
          : r.matched_customer_id
            ? ('matched' as const)
            : ('unmatched' as const),
        match_type: r.suggested_match_type,
        is_excluded: r.auto_excluded,
        exclude_reason: r.auto_excluded ? '자동 제외 (키워드 일치)' : null,
        customer_id: r.matched_customer_id,
      }));
      const saved = await addTxs.mutateAsync(payload);
      const dup = preview.length - saved.length;
      setPreview(null);
      showToast({
        kind: 'success',
        text:
          dup > 0
            ? `${saved.length}건 저장 완료 (중복 ${dup}건 제외)`
            : `${saved.length}건 저장 완료`,
      });
    } catch (err) {
      showToast({
        kind: 'error',
        text: `저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  // ───── 행 액션 ─────
  const onChangeCustomer = (tx: BankTransaction, customerId: string) => {
    if (!customerId) return;
    updateTx.mutate(
      {
        id: tx.id,
        match_status: 'matched',
        customer_id: customerId,
        match_type: '수동',
      },
      {
        onSuccess: () => showToast({ kind: 'success', text: '매칭 완료' }),
        onError: (e) =>
          showToast({
            kind: 'error',
            text: `매칭 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
          }),
      },
    );
  };

  const openExcludeModal = (tx: BankTransaction) => {
    setExcludeTarget(tx);
    setExcludeReason('');
  };

  const confirmExclude = async () => {
    if (!excludeTarget) return;
    const depositor = excludeTarget.depositor_name ?? '';
    try {
      await updateTx.mutateAsync({
        id: excludeTarget.id,
        is_excluded: true,
        match_status: 'excluded',
        exclude_reason: excludeReason.trim() || '수동 제외',
      });
      setExcludeTarget(null);
      showToast({ kind: 'success', text: '제외 처리 완료' });
      if (depositor) setKeywordConfirm(depositor);
    } catch (err) {
      showToast({
        kind: 'error',
        text: `제외 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      });
    }
  };

  const confirmAddKeyword = async () => {
    if (!keywordConfirm) return;
    try {
      await addKeyword.mutateAsync(keywordConfirm);
      showToast({ kind: 'success', text: '제외 키워드 추가됨' });
    } catch (err) {
      showToast({
        kind: 'error',
        text: `키워드 추가 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      });
    } finally {
      setKeywordConfirm(null);
    }
  };

  // 매출월 select 옵션: 현재월 기준 과거 12개월 (오늘 포함, 내림차순)
  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      );
    }
    return out;
  }, []);

  const onChangeTargetMonth = (tx: BankTransaction, value: string) => {
    updateTx.mutate(
      { id: tx.id, target_sales_month: value || null },
      {
        onError: (e) =>
          showToast({
            kind: 'error',
            text: `매출월 변경 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
          }),
      },
    );
  };

  const onUnmatch = (tx: BankTransaction) => {
    updateTx.mutate(
      {
        id: tx.id,
        match_status: 'unmatched',
        customer_id: null,
        match_type: null,
      },
      {
        onSuccess: () => showToast({ kind: 'success', text: '매칭 해제됨' }),
        onError: (e) =>
          showToast({
            kind: 'error',
            text: `해제 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
          }),
      },
    );
  };

  // ───── 필터링 ─────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (statusFilter !== 'all' && tx.match_status !== statusFilter) return false;
      if (q) {
        const dep = (tx.depositor_name ?? '').toLowerCase();
        const cust = tx.customer?.name?.toLowerCase() ?? '';
        if (!dep.includes(q) && !cust.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, query, statusFilter]);

  return (
    <div className="flex flex-col gap-3">
      {/* 툴바 */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          type="button"
          className="btn-base primary inline-flex items-center gap-1.5"
          style={{ height: 32, fontSize: 12.5, padding: '0 12px' }}
          onClick={onPickFile}
          disabled={parsing}
        >
          <Upload size={13} />
          {parsing ? '파싱 중…' : 'KB국민은행 엑셀 업로드'}
        </button>

        <div className="relative">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
          />
          <input
            type="text"
            placeholder="입금자명 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
            style={{ height: 32, padding: '0 10px 0 26px', minWidth: 220 }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
          style={{ height: 32, padding: '0 8px' }}
        >
          <option value="all">상태 전체</option>
          <option value="matched">매칭</option>
          <option value="unmatched">미매칭</option>
          <option value="excluded">제외</option>
        </select>

        <span className="text-[11.5px] text-[var(--ink-3)] ml-auto">
          {filtered.length}건 / 전체 {transactions.length}건
        </span>
      </div>

      {/* 거래 테이블 */}
      <div
        className="rounded-lg border border-[var(--line)] overflow-hidden"
        style={{ background: 'var(--surface)' }}
      >
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <thead className="bg-[var(--surface-2)] text-[var(--ink-3)] text-[11px] uppercase">
            <tr>
              <th className="text-left px-3 py-2 font-medium">거래일</th>
              <th className="text-left px-3 py-2 font-medium">입금자명</th>
              <th className="text-right px-3 py-2 font-medium">입금액</th>
              <th className="text-left px-3 py-2 font-medium">거래처</th>
              <th className="text-center px-3 py-2 font-medium">매출월</th>
              <th className="text-center px-3 py-2 font-medium">매칭상태</th>
              <th className="text-center px-3 py-2 font-medium">매칭방법</th>
              <th className="text-right px-3 py-2 font-medium">액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-10 text-[var(--ink-3)] text-[12.5px]"
                >
                  표시할 거래가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((tx) => (
                <tr key={tx.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2 num text-[var(--ink-2)]">
                    {tx.transaction_date.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 text-[var(--ink)]">
                    {tx.depositor_name ?? '—'}
                  </td>
                  <td className="px-3 py-2 num text-right text-[var(--ink)] font-medium">
                    ₩{fmtWon(tx.amount)}
                  </td>
                  <td className="px-3 py-2">
                    {tx.match_status === 'matched' ? (
                      <span className="text-[var(--ink)]">
                        {tx.customer?.name ?? '—'}
                      </span>
                    ) : (
                      <select
                        value={tx.customer_id ?? ''}
                        onChange={(e) => onChangeCustomer(tx, e.target.value)}
                        className="border border-[var(--line)] rounded-md text-[12px] bg-[var(--surface)]"
                        style={{ height: 26, padding: '0 6px', minWidth: 140 }}
                      >
                        <option value="">거래처 선택</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {tx.match_status === 'matched' ? (
                      <select
                        value={tx.target_sales_month ?? ''}
                        onChange={(e) => onChangeTargetMonth(tx, e.target.value)}
                        className={`border border-[var(--line)] rounded p-1 text-sm bg-[var(--surface)] ${
                          tx.target_sales_month ? 'text-blue-600 font-medium' : 'text-[var(--ink-3)]'
                        }`}
                        style={{ minWidth: 100 }}
                      >
                        <option value="">자동</option>
                        {monthOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[var(--ink-3)]">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusChip status={tx.match_status} />
                  </td>
                  <td className="px-3 py-2 text-center text-[var(--ink-2)]">
                    {tx.match_type ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {tx.match_status === 'unmatched' && (
                      <button
                        type="button"
                        onClick={() => openExcludeModal(tx)}
                        className="text-[11.5px] text-[var(--danger)] hover:underline"
                      >
                        제외
                      </button>
                    )}
                    {tx.match_status === 'matched' && (
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setSplitTarget(tx)}
                          className={`text-[11.5px] hover:underline ${
                            (splitsByTx.get(tx.id)?.length ?? 0) > 0
                              ? 'text-blue-600 font-medium'
                              : 'text-[var(--ink-3)] hover:text-[var(--ink)]'
                          }`}
                          title={
                            (splitsByTx.get(tx.id)?.length ?? 0) > 0
                              ? `분할 ${splitsByTx.get(tx.id)!.length}건`
                              : '입금 분할'
                          }
                        >
                          분할{(splitsByTx.get(tx.id)?.length ?? 0) > 0 && ` (${splitsByTx.get(tx.id)!.length})`}
                        </button>
                        <button
                          type="button"
                          onClick={() => onUnmatch(tx)}
                          className="text-[11.5px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:underline"
                        >
                          매칭해제
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 업로드 미리보기 모달 */}
      <UploadPreviewModal
        rows={preview}
        saving={saving}
        onClose={() => setPreview(null)}
        onSave={onSavePreview}
      />

      {/* 제외 사유 입력 모달 */}
      <Modal
        open={excludeTarget !== null}
        onClose={() => (updateTx.isPending ? undefined : setExcludeTarget(null))}
        title="입금 제외 처리"
        width={420}
        footer={
          <>
            <button
              type="button"
              className="btn-base"
              style={{ height: 32, fontSize: 12.5 }}
              onClick={() => setExcludeTarget(null)}
              disabled={updateTx.isPending}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-base primary"
              style={{ height: 32, fontSize: 12.5 }}
              onClick={confirmExclude}
              disabled={updateTx.isPending}
            >
              {updateTx.isPending ? '처리 중…' : '제외'}
            </button>
          </>
        }
      >
        <div className="text-[12.5px] text-[var(--ink-2)] mb-2">
          <span className="font-medium">{excludeTarget?.depositor_name ?? '—'}</span> ·
          ₩{fmtWon(excludeTarget?.amount ?? 0)}
        </div>
        <label className="text-[11.5px] text-[var(--ink-3)] block mb-1">
          제외 사유 (선택)
        </label>
        <textarea
          value={excludeReason}
          onChange={(e) => setExcludeReason(e.target.value)}
          placeholder="예: 환급금 / 본인 송금 등"
          rows={3}
          className="w-full border border-[var(--line)] rounded-md text-[12.5px] p-2"
          style={{ background: 'var(--surface)' }}
        />
      </Modal>

      {/* 키워드 등록 확인 다이얼로그 */}
      <ConfirmDialog
        open={keywordConfirm !== null}
        onClose={() => setKeywordConfirm(null)}
        title="제외 키워드 추가"
        body={
          <>
            <span className="font-medium">「{keywordConfirm}」</span>를 제외 키워드에
            추가하시겠습니까? 이후 동일한 입금자명이 들어오면 자동으로 제외 처리됩니다.
          </>
        }
        confirmLabel="추가"
        onConfirm={confirmAddKeyword}
        busy={addKeyword.isPending}
      />

      {/* 입금 분할 모달 */}
      <SplitModal
        target={splitTarget}
        initialSplits={splitTarget ? splitsByTx.get(splitTarget.id) ?? [] : []}
        monthOptions={monthOptions}
        busy={upsertSplits.isPending}
        onClose={() => (upsertSplits.isPending ? undefined : setSplitTarget(null))}
        onSave={async (rows) => {
          if (!splitTarget) return;
          try {
            await upsertSplits.mutateAsync({
              bankTransactionId: splitTarget.id,
              splits: rows,
            });
            setSplitTarget(null);
            showToast({
              kind: 'success',
              text:
                rows.length === 0
                  ? '분할 해제 완료'
                  : `분할 ${rows.length}건 저장 완료`,
            });
          } catch (err) {
            showToast({
              kind: 'error',
              text: `분할 저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
            });
          }
        }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function StatusChip({ status }: { status: 'matched' | 'unmatched' | 'excluded' }) {
  if (status === 'matched') {
    return (
      <span className="inline-block rounded-md bg-green-100 text-green-700 text-[11px] px-2 py-0.5">
        매칭
      </span>
    );
  }
  if (status === 'unmatched') {
    return (
      <span className="inline-block rounded-md bg-amber-100 text-amber-700 text-[11px] px-2 py-0.5">
        미매칭
      </span>
    );
  }
  return (
    <span className="inline-block rounded-md bg-surface-2 text-ink-3 text-[11px] px-2 py-0.5">
      제외
    </span>
  );
}

interface PreviewProps {
  rows: MatchedBankRow[] | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

function UploadPreviewModal({ rows, saving, onClose, onSave }: PreviewProps) {
  const stats = useMemo(() => {
    if (!rows) return null;
    const total = rows.length;
    const auto = rows.filter((r) => !r.auto_excluded && r.matched_customer_id).length;
    const excl = rows.filter((r) => r.auto_excluded).length;
    const unmatched = total - auto - excl;
    return { total, auto, excl, unmatched };
  }, [rows]);

  return (
    <Modal
      open={rows !== null}
      onClose={() => (saving ? undefined : onClose())}
      title="업로드 미리보기"
      width={900}
      footer={
        <>
          <button
            type="button"
            className="btn-base"
            style={{ height: 32, fontSize: 12.5 }}
            onClick={onClose}
            disabled={saving}
          >
            취소
          </button>
          <button
            type="button"
            className="btn-base primary"
            style={{ height: 32, fontSize: 12.5 }}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      {stats && (
        <div className="text-[12.5px] text-[var(--ink-2)] mb-3">
          총 <span className="font-medium">{stats.total}건</span> · 자동매칭{' '}
          <span className="text-[var(--success)] font-medium">{stats.auto}건</span> · 제외{' '}
          <span className="text-ink-3 font-medium">{stats.excl}건</span> · 미매칭{' '}
          <span className="text-[var(--warning)] font-medium">{stats.unmatched}건</span>
        </div>
      )}
      <div
        className="rounded-md border border-[var(--line)] overflow-auto"
        style={{ maxHeight: '52vh' }}
      >
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <thead className="bg-[var(--surface-2)] text-[var(--ink-3)] text-[11px] uppercase sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium">거래일</th>
              <th className="text-left px-3 py-2 font-medium">입금자명</th>
              <th className="text-right px-3 py-2 font-medium">입금액</th>
              <th className="text-left px-3 py-2 font-medium">매칭 거래처</th>
              <th className="text-center px-3 py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r, i) => {
              const cls = r.auto_excluded
                ? 'bg-surface-sunken text-ink-4 line-through'
                : r.matched_customer_id
                  ? 'bg-success-wash'
                  : 'bg-warning-wash';
              return (
                <tr key={i} className={`border-t border-[var(--line)] ${cls}`}>
                  <td className="px-3 py-1.5 num">{r.transaction_date}</td>
                  <td className="px-3 py-1.5">{r.depositor_name}</td>
                  <td className="px-3 py-1.5 num text-right">₩{fmtWon(r.amount)}</td>
                  <td className="px-3 py-1.5">{r.matched_customer_name ?? '—'}</td>
                  <td className="px-3 py-1.5 text-center text-[11px]">
                    {r.auto_excluded
                      ? '제외'
                      : r.suggested_match_type === '매핑'
                        ? '매핑'
                        : r.suggested_match_type === '자동'
                          ? '자동'
                          : '미매칭'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────
// 입금 분할 모달

interface SplitDraft {
  target_sales_month: string;
  amount: number;
  memo: string;
}

interface SplitModalProps {
  target: BankTransaction | null;
  initialSplits: BankTransactionSplit[];
  monthOptions: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (splits: { target_sales_month: string; amount: number; memo?: string }[]) => void;
}

function SplitModal({
  target,
  initialSplits,
  monthOptions,
  busy,
  onClose,
  onSave,
}: SplitModalProps) {
  const [drafts, setDrafts] = useState<SplitDraft[]>([]);

  // target 변경 시 드래프트 초기화 (기존 분할이 있으면 그대로, 없으면 빈 행 1개)
  useEffect(() => {
    if (!target) {
      setDrafts([]);
      return;
    }
    if (initialSplits.length > 0) {
      setDrafts(
        initialSplits.map((s) => ({
          target_sales_month: s.target_sales_month,
          amount: s.amount,
          memo: s.memo ?? '',
        })),
      );
    } else {
      setDrafts([
        { target_sales_month: monthOptions[0] ?? '', amount: target.amount, memo: '' },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const original = target?.amount ?? 0;
  const total = drafts.reduce((s, d) => s + (Number.isFinite(d.amount) ? d.amount : 0), 0);
  const diff = original - total;
  const canSave =
    !busy &&
    drafts.length > 0 &&
    diff === 0 &&
    drafts.every((d) => d.target_sales_month && d.amount > 0);

  const addRow = () => {
    setDrafts((rows) => [
      ...rows,
      {
        target_sales_month: monthOptions[0] ?? '',
        amount: Math.max(0, diff),
        memo: '',
      },
    ]);
  };

  const updateRow = (i: number, patch: Partial<SplitDraft>) => {
    setDrafts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const removeRow = (i: number) => {
    setDrafts((rows) => rows.filter((_, idx) => idx !== i));
  };

  const onClickSave = () => {
    onSave(
      drafts.map((d) => ({
        target_sales_month: d.target_sales_month,
        amount: d.amount,
        memo: d.memo.trim() || undefined,
      })),
    );
  };

  const onClickRelease = () => {
    // 분할 해제 — 빈 배열 저장으로 기존 분할 모두 삭제
    onSave([]);
  };

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={
        target
          ? `입금 분할 — ${target.depositor_name ?? '—'} ₩${fmtWon(target.amount)}`
          : ''
      }
      width={620}
      footer={
        <>
          {initialSplits.length > 0 && (
            <button
              type="button"
              className="btn-base"
              style={{ height: 32, fontSize: 12.5, color: 'var(--danger)' }}
              onClick={onClickRelease}
              disabled={busy}
            >
              분할 해제
            </button>
          )}
          <button
            type="button"
            className="btn-base"
            style={{ height: 32, fontSize: 12.5 }}
            onClick={onClose}
            disabled={busy}
          >
            취소
          </button>
          <button
            type="button"
            className="btn-base primary"
            style={{ height: 32, fontSize: 12.5 }}
            onClick={onClickSave}
            disabled={!canSave}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {drafts.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={d.target_sales_month}
              onChange={(e) => updateRow(i, { target_sales_month: e.target.value })}
              className="border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
              style={{ height: 30, padding: '0 8px', minWidth: 110 }}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={Number.isFinite(d.amount) ? d.amount : ''}
              onChange={(e) => updateRow(i, { amount: Number(e.target.value) })}
              placeholder="금액"
              className="border border-[var(--line)] rounded-md text-[12.5px] num text-right bg-[var(--surface)]"
              style={{ height: 30, padding: '0 10px', width: 140 }}
            />
            <input
              type="text"
              value={d.memo}
              onChange={(e) => updateRow(i, { memo: e.target.value })}
              placeholder="메모 (선택)"
              className="flex-1 border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
              style={{ height: 30, padding: '0 10px' }}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-[var(--ink-3)] hover:text-[var(--danger)]"
              title="삭제"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="self-start inline-flex items-center gap-1 text-[11.5px] text-[var(--ink-2)] hover:text-[var(--ink)] mt-1"
        >
          <Plus size={12} /> 행 추가
        </button>

        <div
          className="mt-2 rounded-md border border-[var(--line)] text-[12.5px]"
          style={{ background: 'var(--surface-2)' }}
        >
          <div className="grid grid-cols-3 px-3 py-2 gap-3">
            <div>
              <div className="text-[10.5px] text-[var(--ink-3)] uppercase">원본</div>
              <div className="num font-medium">₩{fmtWon(original)}</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[var(--ink-3)] uppercase">합계</div>
              <div className="num font-medium">₩{fmtWon(total)}</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[var(--ink-3)] uppercase">차이</div>
              <div
                className={`num font-medium ${
                  diff === 0
                    ? 'text-green-600'
                    : diff > 0
                      ? 'text-red-600'
                      : 'text-blue-600'
                }`}
              >
                ₩{fmtWon(diff)}
              </div>
            </div>
          </div>
        </div>

        {diff !== 0 && (
          <p className="text-[11.5px] text-[var(--ink-3)] mt-1">
            합계가 원본과 일치해야 저장할 수 있습니다.
          </p>
        )}
      </div>
    </Modal>
  );
}
