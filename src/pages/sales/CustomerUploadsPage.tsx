/**
 * 거래처 포털에서 올라온 파일(이미지/PDF/엑셀) 업로드함.
 * - 엑셀 파싱 성공(status='done') 항목은 자동으로 orders 생성됨 → 참고용 표시.
 * - 이미지/PDF(status='pending') 항목은 운영자가 직접 보고 주문을 수동 입력해야 함.
 * - "주문 입력하기" 클릭 → /sales/order-entry?customerId={id} 로 이동.
 * - 수동 입력 완료 후 "처리완료" 버튼으로 status를 'done'으로 변경.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, FileText, Check, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';

interface UploadRow {
  id: string;
  created_at: string;
  customer_id: string;
  customer_name: string;
  file_name: string;
  file_url: string | null;
  message: string | null;
  status: string;
}

export function CustomerUploadsPage() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const { data: uploads = [], isLoading } = useQuery<UploadRow[]>({
    queryKey: ['customer-uploads', companyId, filter],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from('customer_order_uploads')
        .select('id, created_at, customer_id, file_name, file_url, message, status, customers(name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (filter === 'pending') {
        query = query.eq('status', 'pending');
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        created_at: row.created_at,
        customer_id: row.customer_id,
        customer_name: row.customers?.name ?? '(알수없음)',
        file_name: row.file_name,
        file_url: row.file_url,
        message: row.message,
        status: row.status,
      }));
    },
    enabled: !!companyId,
  });

  const handleMarkDone = async (id: string) => {
    await supabase
      .from('customer_order_uploads')
      .update({ status: 'done' })
      .eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['customer-uploads'] });
  };

  const handleOpenOrderEntry = (customerId: string) => {
    navigate(`/sales/order-entry?customerId=${customerId}`);
  };

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
  const isPdf = (name: string) => /\.pdf$/i.test(name);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#1C1917' }}>
            거래처 업로드함
          </h2>
          <p style={{ fontSize: 12.5, color: '#78716C', margin: '4px 0 0' }}>
            거래처가 이미지·PDF로 보낸 주문서입니다. 내용을 확인하고 직접 주문을 입력해주세요.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <FilterButton active={filter === 'pending'} onClick={() => setFilter('pending')}>
            처리 대기
          </FilterButton>
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
            전체
          </FilterButton>
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#A8A29E' }}>불러오는 중…</div>
      )}

      {!isLoading && uploads.length === 0 && (
        <div style={{ padding: 60, textAlign: 'center', color: '#A8A29E', fontSize: 13 }}>
          {filter === 'pending' ? '처리 대기 중인 업로드가 없습니다.' : '업로드 내역이 없습니다.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {uploads.map((u) => (
          <div
            key={u.id}
            style={{
              display: 'flex',
              gap: 16,
              padding: 16,
              border: '1px solid #E7E5E4',
              borderRadius: 10,
              background: u.status === 'done' ? '#FAFAF9' : '#FFFFFF',
              opacity: u.status === 'done' ? 0.65 : 1,
            }}
          >
            {/* 썸네일 */}
            <div
              style={{
                width: 96,
                height: 96,
                flexShrink: 0,
                borderRadius: 8,
                overflow: 'hidden',
                background: '#F5F5F4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #E7E5E4',
              }}
            >
              {u.file_url && isImage(u.file_name) ? (
                <a href={u.file_url} target="_blank" rel="noreferrer">
                  <img
                    src={u.file_url}
                    alt={u.file_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                  />
                </a>
              ) : u.file_url && isPdf(u.file_name) ? (
                <a
                  href={u.file_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#78716C' }}
                >
                  <FileText size={28} />
                  <span style={{ fontSize: 10 }}>PDF 보기</span>
                </a>
              ) : (
                <ImageIcon size={28} color="#D6D3D1" />
              )}
            </div>

            {/* 정보 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1917' }}>
                  {u.customer_name}
                </span>
                <span style={{ fontSize: 12, color: '#A8A29E' }}>
                  {new Date(u.created_at).toLocaleString('ko-KR')}
                </span>
                {u.status === 'done' && (
                  <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>처리완료</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: '#57534E', marginBottom: 6 }}>
                {u.file_name}
              </div>
              {u.message && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: '#44403C',
                    background: '#F5F5F4',
                    padding: '6px 10px',
                    borderRadius: 6,
                    marginBottom: 8,
                  }}
                >
                  전달 메시지: {u.message}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                {u.file_url && (
                  <a
                    href={u.file_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      color: '#2563EB',
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={12} /> 원본 새창 보기
                  </a>
                )}
              </div>
            </div>

            {/* 액션 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => handleOpenOrderEntry(u.customer_id)}
                style={{
                  height: 32,
                  padding: '0 14px',
                  background: '#1C1917',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                주문 입력하기
              </button>
              {u.status !== 'done' && (
                <button
                  type="button"
                  onClick={() => handleMarkDone(u.id)}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    background: '#FFFFFF',
                    color: '#57534E',
                    border: '1px solid #D6D3D1',
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Check size={12} /> 처리완료
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 30,
        padding: '0 14px',
        borderRadius: 6,
        border: active ? '1px solid #1C1917' : '1px solid #E7E5E4',
        background: active ? '#1C1917' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#57534E',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
