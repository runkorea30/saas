/**
 * 은행거래 — 입출금 장부 탭.
 *
 * - KB 엑셀 업로드 → parseKBBank → applyAutoMatch → 미리보기 모달 → 일괄 저장.
 * - 검색·상태 필터.
 * - 행별 거래처 select / 매칭상태 / 정산이동 / 제외/매칭해제 액션.
 */
import { useMemo, useRef, useState } from 'react';
import { Upload, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import {
  useAddBankTransactions,
  useUpdateBankTransaction,
  useAddBankExcludeKeyword,
} from '@/hooks/useBanking';
import { parseKBBank, applyAutoMatch, type MatchedBankRow } from '@/utils/bankParser';
import { fmtWon } from '@/components/feature/orders/primitives';
import type {
  BankTransaction,
  BankMapping,
  BankExcludeKeyword,
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

  const onToggleMoved = (tx: BankTransaction, val: boolean) => {
    updateTx.mutate(
      { id: tx.id, moved_to_monthly: val },
      {
        onError: (e) =>
          showToast({
            kind: 'error',
            text: `갱신 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
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
              <th className="text-center px-3 py-2 font-medium">매칭상태</th>
              <th className="text-center px-3 py-2 font-medium">매칭방법</th>
              <th className="text-center px-3 py-2 font-medium">정산이동</th>
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
                    <StatusChip status={tx.match_status} />
                  </td>
                  <td className="px-3 py-2 text-center text-[var(--ink-2)]">
                    {tx.match_type ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={tx.moved_to_monthly}
                      onChange={(e) => onToggleMoved(tx, e.target.checked)}
                    />
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
                      <button
                        type="button"
                        onClick={() => onUnmatch(tx)}
                        className="text-[11.5px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:underline"
                      >
                        매칭해제
                      </button>
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
    <span className="inline-block rounded-md bg-gray-100 text-gray-500 text-[11px] px-2 py-0.5">
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
          <span className="text-green-700 font-medium">{stats.auto}건</span> · 제외{' '}
          <span className="text-gray-500 font-medium">{stats.excl}건</span> · 미매칭{' '}
          <span className="text-amber-700 font-medium">{stats.unmatched}건</span>
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
                ? 'bg-gray-50 text-gray-400 line-through'
                : r.matched_customer_id
                  ? 'bg-green-50'
                  : 'bg-amber-50';
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
