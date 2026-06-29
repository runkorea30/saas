/**
 * 설정 > 거래처 포털 공지사항.
 *
 * OPS 운영자가 공지사항 제목/본문을 수정하면 거래처 포털(NoticePanel)에 즉시 반영.
 * 비워두면 거래처 포털에서 기본 문구가 표시됨.
 *
 * 🔴 CLAUDE.md §1: companyId 컨텍스트는 useCompany() 경유.
 */
import { useState, useEffect } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';

export function PortalNoticePage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('companies')
      .select('notice_title, notice_body')
      .eq('id', companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTitle(data.notice_title ?? '');
          setBody(data.notice_body ?? '');
        }
        setLoading(false);
      });
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({
        notice_title: title.trim() || null,
        notice_body: body.trim() || null,
      })
      .eq('id', companyId);
    setSaving(false);
    if (error) {
      showToast({ kind: 'error', text: '저장에 실패했습니다.' });
    } else {
      showToast({ kind: 'success', text: '공지사항을 저장했습니다.' });
    }
  };

  if (loading) {
    return <div style={{ padding: 32, color: '#6B7280' }}>불러오는 중…</div>;
  }

  return (
    <div style={{ maxWidth: 640, margin: '32px auto', padding: '0 24px' }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          marginBottom: 4,
          color: '#1C1917',
        }}
      >
        거래처 포털 공지사항
      </h2>
      <p style={{ fontSize: 12.5, color: '#78716C', marginBottom: 24 }}>
        여기서 저장한 내용이 거래처 포털 공지사항에 즉시 반영됩니다.
        비워두면 포털에서 기본 문구가 표시됩니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#44403C' }}>
            제목
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 7월 출고 일정 안내"
            style={{
              height: 38,
              padding: '0 12px',
              border: '1px solid #D6D3D1',
              borderRadius: 8,
              fontSize: 13.5,
              outline: 'none',
              color: '#1C1917',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#44403C' }}>
            본문
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="거래처에게 전달할 공지 내용을 입력하세요."
            rows={6}
            style={{
              padding: '10px 12px',
              border: '1px solid #D6D3D1',
              borderRadius: 8,
              fontSize: 13.5,
              outline: 'none',
              color: '#1C1917',
              resize: 'vertical',
              lineHeight: 1.6,
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              height: 38,
              padding: '0 20px',
              background: saving ? '#93C5FD' : '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
