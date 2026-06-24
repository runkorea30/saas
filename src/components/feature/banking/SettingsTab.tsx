/**
 * 은행거래 — 매칭 설정 탭.
 *
 * A) 입금자 자동매핑 룰 (CRUD)
 * B) 제외 키워드 (CRUD)
 */
import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import {
  useAddBankMapping,
  useDeleteBankMapping,
  useAddBankExcludeKeyword,
  useDeleteBankExcludeKeyword,
} from '@/hooks/useBanking';
import type { BankMapping, BankExcludeKeyword } from '@/types/database';

interface Props {
  mappings: BankMapping[];
  excludeKeywords: BankExcludeKeyword[];
  customers: { id: string; name: string }[];
}

export function SettingsTab({ mappings, excludeKeywords, customers }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <MappingSection mappings={mappings} customers={customers} />
      <KeywordSection keywords={excludeKeywords} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// A. 자동매핑 룰
// ───────────────────────────────────────────────────────────

function MappingSection({
  mappings,
  customers,
}: {
  mappings: BankMapping[];
  customers: { id: string; name: string }[];
}) {
  const { showToast } = useToast();
  const add = useAddBankMapping();
  const del = useDeleteBankMapping();

  const [drafting, setDrafting] = useState(false);
  const [draftKeyword, setDraftKeyword] = useState('');
  const [draftCustomerId, setDraftCustomerId] = useState('');

  const resetDraft = () => {
    setDrafting(false);
    setDraftKeyword('');
    setDraftCustomerId('');
  };

  const onSaveDraft = async () => {
    const key = draftKeyword.trim();
    if (!key || !draftCustomerId) {
      showToast({ kind: 'error', text: '입금자 키워드와 거래처를 모두 입력하세요.' });
      return;
    }
    const cust = customers.find((c) => c.id === draftCustomerId);
    if (!cust) return;
    try {
      const { updatedCount } = await add.mutateAsync({
        bank_name: key,
        customer_id: cust.id,
        customer_name: cust.name,
      });
      showToast({
        kind: 'success',
        text:
          updatedCount > 0
            ? `매핑 룰 추가 완료 — 기존 미매칭 ${updatedCount}건 자동 매칭되었습니다`
            : '매핑 룰 추가 완료',
      });
      resetDraft();
    } catch (err) {
      showToast({
        kind: 'error',
        text: `추가 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      });
    }
  };

  const onDelete = async (id: string) => {
    try {
      await del.mutateAsync(id);
      showToast({ kind: 'success', text: '매핑 룰 삭제됨' });
    } catch (err) {
      showToast({
        kind: 'error',
        text: `삭제 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      });
    }
  };

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <header
        className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]"
        style={{ background: 'var(--surface-2)' }}
      >
        <h3 className="text-[13px] font-semibold text-[var(--ink)]">
          입금자 자동매핑 룰
        </h3>
        {!drafting && (
          <button
            type="button"
            className="btn-base inline-flex items-center gap-1"
            style={{ height: 28, fontSize: 12 }}
            onClick={() => setDrafting(true)}
          >
            <Plus size={12} /> 룰 추가
          </button>
        )}
      </header>

      <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
        <thead className="text-[var(--ink-3)] text-[11px] uppercase">
          <tr>
            <th className="text-left px-3 py-2 font-medium">입금자 키워드</th>
            <th className="text-left px-3 py-2 font-medium">거래처</th>
            <th className="px-3 py-2 w-20"></th>
          </tr>
        </thead>
        <tbody>
          {drafting && (
            <tr className="border-t border-[var(--line)] bg-[var(--surface-2)]">
              <td className="px-3 py-2">
                <input
                  type="text"
                  autoFocus
                  value={draftKeyword}
                  onChange={(e) => setDraftKeyword(e.target.value)}
                  placeholder="예: 주식회사디엔에스그"
                  className="w-full border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
                  style={{ height: 28, padding: '0 8px' }}
                />
              </td>
              <td className="px-3 py-2">
                <select
                  value={draftCustomerId}
                  onChange={(e) => setDraftCustomerId(e.target.value)}
                  className="w-full border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
                  style={{ height: 28, padding: '0 6px' }}
                >
                  <option value="">거래처 선택</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1 justify-end">
                  <button
                    type="button"
                    className="btn-base primary"
                    style={{ height: 26, fontSize: 11.5, padding: '0 8px' }}
                    onClick={onSaveDraft}
                    disabled={add.isPending}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    className="btn-base"
                    style={{ height: 26, fontSize: 11.5, padding: '0 8px' }}
                    onClick={resetDraft}
                    disabled={add.isPending}
                  >
                    취소
                  </button>
                </div>
              </td>
            </tr>
          )}
          {mappings.length === 0 && !drafting ? (
            <tr>
              <td
                colSpan={3}
                className="text-center py-8 text-[var(--ink-3)] text-[12px]"
              >
                등록된 매핑 룰이 없습니다.
              </td>
            </tr>
          ) : (
            mappings.map((m) => (
              <tr key={m.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-2 text-[var(--ink)]">{m.bank_name}</td>
                <td className="px-3 py-2 text-[var(--ink-2)]">{m.customer_name}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(m.id)}
                    title="삭제"
                    className="text-[var(--ink-3)] hover:text-[var(--danger)]"
                    disabled={del.isPending}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// B. 제외 키워드
// ───────────────────────────────────────────────────────────

function KeywordSection({ keywords }: { keywords: BankExcludeKeyword[] }) {
  const { showToast } = useToast();
  const add = useAddBankExcludeKeyword();
  const del = useDeleteBankExcludeKeyword();

  const [input, setInput] = useState('');

  const onAdd = async () => {
    const key = input.trim();
    if (!key) return;
    if (keywords.some((k) => k.keyword === key)) {
      showToast({ kind: 'error', text: '이미 등록된 키워드입니다.' });
      return;
    }
    try {
      await add.mutateAsync(key);
      showToast({ kind: 'success', text: '키워드 추가됨' });
      setInput('');
    } catch (err) {
      showToast({
        kind: 'error',
        text: `추가 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      });
    }
  };

  const onDelete = async (id: string) => {
    try {
      await del.mutateAsync(id);
      showToast({ kind: 'success', text: '키워드 삭제됨' });
    } catch (err) {
      showToast({
        kind: 'error',
        text: `삭제 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      });
    }
  };

  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <header
        className="px-4 py-3 border-b border-[var(--line)]"
        style={{ background: 'var(--surface-2)' }}
      >
        <h3 className="text-[13px] font-semibold text-[var(--ink)]">제외 키워드</h3>
        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
          입금자명에 이 키워드가 포함되면 업로드 시 자동 제외 처리됩니다.
        </p>
      </header>

      <div className="px-4 py-3 flex flex-wrap gap-1.5 min-h-[60px]">
        {keywords.length === 0 ? (
          <span className="text-[12px] text-[var(--ink-3)]">
            등록된 키워드가 없습니다.
          </span>
        ) : (
          keywords.map((k) => (
            <span
              key={k.id}
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 text-[var(--ink-2)] text-[12px] px-2 py-1"
            >
              {k.keyword}
              <button
                type="button"
                onClick={() => onDelete(k.id)}
                title="삭제"
                className="text-gray-400 hover:text-[var(--danger)]"
                disabled={del.isPending}
              >
                <X size={11} />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="px-4 pb-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAdd();
          }}
          placeholder="예: 환급 / 수수료"
          className="flex-1 border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
          style={{ height: 30, padding: '0 10px' }}
        />
        <button
          type="button"
          className="btn-base primary inline-flex items-center gap-1"
          style={{ height: 30, fontSize: 12.5, padding: '0 12px' }}
          onClick={onAdd}
          disabled={add.isPending}
        >
          <Plus size={12} /> 추가
        </button>
      </div>
    </section>
  );
}
