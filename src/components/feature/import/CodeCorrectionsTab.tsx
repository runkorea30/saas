/**
 * CodeCorrectionsTab — OCR 오독 코드 관리 탭.
 *
 * 인보이스 PDF 파싱 시 OCR이 제품코드를 잘못 읽는 경우(예: 722 → 720 오독,
 * 뒷글자 잘림 등)를 위한 수동 1:1 교정 테이블 관리 화면.
 * "잘못된 코드"를 한 번 등록해두면, 이후 모든 인보이스 비교에서 자동으로
 * "올바른 코드"로 치환되어 매칭된다 (InvoiceUploadCard.compareOrderInvoice 에서 사용).
 *
 * 🟠 code_corrections 테이블은 자동생성 Supabase 타입에 아직 미반영
 *    (memory: supabase_types_desync). 좁은 캐스팅으로 우회.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useToast } from '@/components/ui/Toast';
import { normalizeCode } from './InvoiceUploadCard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

interface CorrectionRow {
  id: string;
  wrong_code: string;
  correct_code: string;
  note: string | null;
  created_at: string;
}

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--line)',
  background: 'var(--bg)',
  color: 'var(--ink)',
  fontSize: 13,
};

export function CodeCorrectionsTab() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [wrongInput, setWrongInput] = useState('');
  const [correctInput, setCorrectInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: corrections = [], isLoading } = useQuery<CorrectionRow[]>({
    queryKey: ['code-corrections', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await db
        .from('code_corrections')
        .select('id, wrong_code, correct_code, note, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CorrectionRow[];
    },
  });

  const handleAdd = async () => {
    if (!companyId) return;
    const wrong = normalizeCode(wrongInput);
    const correct = normalizeCode(correctInput);
    if (!wrong || !correct) {
      showToast({ kind: 'error', text: '잘못된 코드와 올바른 코드를 모두 입력해주세요.' });
      return;
    }
    if (wrong === correct) {
      showToast({ kind: 'error', text: '잘못된 코드와 올바른 코드가 같습니다.' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await db.from('code_corrections').upsert(
        {
          company_id: companyId,
          wrong_code: wrong,
          correct_code: correct,
          note: noteInput.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,wrong_code' },
      );
      if (error) throw error;
      setWrongInput('');
      setCorrectInput('');
      setNoteInput('');
      await queryClient.invalidateQueries({ queryKey: ['code-corrections', companyId] });
      showToast({
        kind: 'success',
        text: '등록되었습니다. 다음 인보이스 비교부터 자동 적용됩니다.',
      });
    } catch (e) {
      showToast({ kind: 'error', text: e instanceof Error ? e.message : '등록 실패' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    const { error } = await db
      .from('code_corrections')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) {
      showToast({ kind: 'error', text: '삭제 실패' });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['code-corrections', companyId] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: 16,
        }}
      >
        <h2
          className="disp"
          style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}
        >
          OCR 오독 코드 관리
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--ink-3)' }}>
          인보이스 PDF에서 제품코드가 잘못 인식될 때(예: 72201000hard → 72001000h), 여기 등록해두면
          이후 모든 인보이스 비교에서 자동으로 올바른 코드로 치환되어 매칭됩니다.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--ink-3)' }}
          >
            잘못 인식된 코드
            <input
              value={wrongInput}
              onChange={(e) => setWrongInput(e.target.value)}
              placeholder="예: 72001000h"
              style={{ ...inputStyle, width: 180 }}
            />
          </label>
          <label
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--ink-3)' }}
          >
            올바른 OPS 코드
            <input
              value={correctInput}
              onChange={(e) => setCorrectInput(e.target.value)}
              placeholder="예: 72201000hard"
              style={{ ...inputStyle, width: 180 }}
            />
          </label>
          <label
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--ink-3)' }}
          >
            메모 (선택)
            <input
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="예: 2-하드 4온즈, 뒷글자 잘림"
              style={{ ...inputStyle, width: 220 }}
            />
          </label>
          <button
            type="button"
            className="btn-base primary"
            onClick={handleAdd}
            disabled={saving || !companyId}
            style={{ height: 32, fontSize: 12.5, padding: '0 16px' }}
          >
            {saving ? '저장 중…' : '등록'}
          </button>
        </div>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-3)', textAlign: 'left' }}>
              <th style={{ padding: '10px 14px' }}>잘못된 코드</th>
              <th style={{ padding: '10px 14px' }}>올바른 코드</th>
              <th style={{ padding: '10px 14px' }}>메모</th>
              <th style={{ padding: '10px 14px' }}>등록일</th>
              <th style={{ padding: '10px 14px', width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--ink-3)' }}>
                  불러오는 중…
                </td>
              </tr>
            )}
            {!isLoading && corrections.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--ink-3)' }}>
                  등록된 교정 규칙이 없습니다.
                </td>
              </tr>
            )}
            {corrections.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 14px', color: 'var(--danger)', fontFamily: 'monospace' }}>
                  {c.wrong_code}
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--success)', fontFamily: 'monospace' }}>
                  {c.correct_code}
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--ink-3)' }}>{c.note || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink-3)' }}>
                  {new Date(c.created_at).toLocaleDateString('ko-KR')}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    title="삭제"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--ink-3)',
                      display: 'flex',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
