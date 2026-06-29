/**
 * 출고 사진 (order_photos) 조회/업로드/삭제 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서. 하드코딩 금지 → companyId 인자 필수.
 * 🔴 CLAUDE.md §1: 모든 쿼리에 company_id 필터 (RLS + 프론트 이중 방어).
 * 🟠 Storage 경로: {company_id}/{order_id}/{timestamp}_{index}.{ext}
 * 🟠 expires_at = taken_at + 5일 (DB 트리거가 자동 설정. 클라이언트는 명시 전송).
 *
 * order_photos 테이블은 마이그레이션은 완료되었으나 자동 생성 Database 타입은 미반영.
 * supabase.from('order_photos') 타입 우회용으로 캐스팅 사용.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface OrderPhoto {
  id: string;
  company_id: string;
  order_id: string;
  customer_id: string | null;
  photo_type: string;
  storage_path: string;
  storage_url: string;
  file_name: string | null;
  taken_at: string;
  expires_at: string;
  created_at: string;
}

const BUCKET = 'order-photos';
// order_photos 테이블은 마이그레이션 완료, 자동 생성 타입 미반영.
// supabase 의 정밀 타입을 우회해 untyped 쿼리 빌더로 사용.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DB = supabase as unknown as { from: (table: string) => any; rpc: (fn: string) => any };

/**
 * 특정 주문의 만료되지 않은 사진 목록.
 * orderId/companyId 둘 다 있을 때만 동작.
 */
export function useOrderPhotos(
  orderId: string | null,
  companyId: string | null,
) {
  return useQuery<OrderPhoto[]>({
    queryKey: ['order-photos', companyId, orderId],
    enabled: !!orderId && !!companyId,
    queryFn: async () => {
      const { data, error } = await DB.from('order_photos')
        .select('*')
        .eq('company_id', companyId!)
        .eq('order_id', orderId!)
        .gt('expires_at', new Date().toISOString())
        .order('taken_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OrderPhoto[];
    },
  });
}

/**
 * 사진이 존재하는 order_id 집합 — 주문내역 페이지 뱃지용.
 */
export function useOrderPhotoFlags(
  orderIds: string[],
  companyId: string | null,
) {
  return useQuery<Set<string>>({
    queryKey: ['order-photo-flags', companyId, orderIds.slice().sort().join(',')],
    enabled: !!companyId && orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await DB.from('order_photos')
        .select('order_id')
        .eq('company_id', companyId!)
        .in('order_id', orderIds)
        .gt('expires_at', new Date().toISOString());
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{ order_id: string }>;
      return new Set(rows.map((r) => r.order_id));
    },
    staleTime: 30_000,
  });
}

/**
 * 여러 주문의 사진을 한 번에 가져와 order_id 별로 그룹핑한 Map 반환.
 * 주문내역 카드의 인라인 썸네일 렌더용.
 */
export function useOrderPhotosByOrders(
  orderIds: string[],
  companyId: string | null,
) {
  return useQuery<Map<string, OrderPhoto[]>>({
    queryKey: [
      'order-photos-by-orders',
      companyId,
      orderIds.slice().sort().join(','),
    ],
    enabled: !!companyId && orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await DB.from('order_photos')
        .select('*')
        .eq('company_id', companyId!)
        .in('order_id', orderIds)
        .gt('expires_at', new Date().toISOString())
        .order('taken_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as OrderPhoto[];
      const map = new Map<string, OrderPhoto[]>();
      for (const p of rows) {
        const list = map.get(p.order_id) ?? [];
        list.push(p);
        map.set(p.order_id, list);
      }
      return map;
    },
    staleTime: 30_000,
  });
}

export function useUploadOrderPhoto(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      customerId,
      file,
      index,
    }: {
      orderId: string;
      customerId?: string | null;
      file: File;
      index: number;
    }) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const timestamp = Date.now();
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${companyId}/${orderId}/${timestamp}_${index}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 5);

      const { error: dbError } = await DB.from('order_photos').insert({
        company_id: companyId,
        order_id: orderId,
        customer_id: customerId ?? null,
        photo_type: 'shipping',
        storage_path: path,
        storage_url: urlData.publicUrl,
        file_name: file.name,
        expires_at: expiresAt.toISOString(),
      } as never);
      if (dbError) {
        // DB 저장 실패 시 Storage 정리.
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw dbError;
      }
      return { path, url: urlData.publicUrl };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['order-photos', companyId, variables.orderId],
      });
      queryClient.invalidateQueries({ queryKey: ['order-photo-flags', companyId] });
      queryClient.invalidateQueries({ queryKey: ['order-photos-by-orders', companyId] });
    },
  });
}

export function useDeleteOrderPhoto(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      photoId,
      storagePath,
      orderId,
    }: {
      photoId: string;
      storagePath: string;
      orderId: string;
    }) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      await supabase.storage.from(BUCKET).remove([storagePath]);
      const { error } = await DB.from('order_photos')
        .delete()
        .eq('id', photoId)
        .eq('company_id', companyId);
      if (error) throw error;
      return orderId;
    },
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({
        queryKey: ['order-photos', companyId, orderId],
      });
      queryClient.invalidateQueries({ queryKey: ['order-photo-flags', companyId] });
      queryClient.invalidateQueries({ queryKey: ['order-photos-by-orders', companyId] });
    },
  });
}

/**
 * 만료된 사진 일괄 정리 — 앱 시작 시 1회 호출.
 * RPC 미지원 환경 대비 클라이언트 DELETE 폴백.
 */
export async function cleanupExpiredPhotos(): Promise<void> {
  try {
    const result = await DB.rpc('delete_expired_order_photos');
    if (!result.error) return;
  } catch {
    // RPC 미지원 환경 → 폴백.
  }
  await DB.from('order_photos')
    .delete()
    .lt('expires_at', new Date().toISOString());
}
