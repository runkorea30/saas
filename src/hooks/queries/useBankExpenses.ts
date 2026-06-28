/**
 * 은행 거래내역 업로드/분류/리뷰 데이터 훅 모음.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🔴 CLAUDE.md §5: 목록 조회 fetchAllRows 경유.
 * 🟠 중복은 DB unique(company_id, transaction_date, counterpart, withdrawal) 로 차단,
 *    upsert ignoreDuplicates:true 로 조용히 스킵.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { ClassifyRule } from '@/utils/classifyBankRow';
import { classifyRow } from '@/utils/classifyBankRow';
import { parseBankXls } from '@/utils/parseBankXls';

export interface BankExpenseRow {
  id: string;
  upload_id: string;
  transaction_date: string;
  counterpart: string | null;
  memo: string | null;
  description: string | null;
  withdrawal: number;
  deposit: number;
  pl_category_id: string | null;
  exclude_reason: string | null;
  is_excluded: boolean;
  is_confirmed: boolean;
  year: number;
  month: number;
}

export interface BankExpenseUpload {
  id: string;
  account_name: string | null;
  account_number: string | null;
  upload_date: string;
  year: number;
  month: number;
  row_count: number;
  created_at: string;
}

// ───────────────────────────────────────────────────────────
// 조회

export function useBankClassifyRules(companyId: string | null) {
  return useQuery({
    queryKey: ['bank-classify-rules', companyId],
    enabled: Boolean(companyId),
    staleTime: 1000 * 60 * 10,
    queryFn: () =>
      fetchAllRows<ClassifyRule>(() =>
        supabase
          .from('bank_classify_rules')
          .select(
            'id, keyword, match_field, action, pl_category_id, exclude_reason, sort_order',
          )
          .eq('company_id', companyId!)
          .order('sort_order', { ascending: true }),
      ),
  });
}

export function useBankExpenseRows(
  companyId: string | null,
  year: number,
  month: number,
) {
  return useQuery({
    queryKey: ['bank-expense-rows', companyId, year, month],
    enabled: Boolean(companyId),
    staleTime: 1000 * 60 * 2,
    queryFn: () =>
      fetchAllRows<BankExpenseRow>(() =>
        supabase
          .from('bank_expense_rows')
          .select(
            'id, upload_id, transaction_date, counterpart, memo, description, withdrawal, deposit, pl_category_id, exclude_reason, is_excluded, is_confirmed, year, month',
          )
          .eq('company_id', companyId!)
          .eq('year', year)
          .eq('month', month)
          .order('transaction_date', { ascending: false }),
      ),
  });
}

export function useBankExpenseUploads(
  companyId: string | null,
  year: number,
  month: number,
) {
  return useQuery({
    queryKey: ['bank-expense-uploads', companyId, year, month],
    enabled: Boolean(companyId),
    staleTime: 1000 * 60 * 2,
    queryFn: () =>
      fetchAllRows<BankExpenseUpload>(() =>
        supabase
          .from('bank_expense_uploads')
          .select(
            'id, account_name, account_number, upload_date, year, month, row_count, created_at',
          )
          .eq('company_id', companyId!)
          .eq('year', year)
          .eq('month', month)
          .order('created_at', { ascending: false }),
      ),
  });
}

// ───────────────────────────────────────────────────────────
// 업로드 + 자동분류

export interface UploadBankFileArgs {
  companyId: string;
  file: File;
  accountName: string | null;
  rules: ReadonlyArray<ClassifyRule>;
}

export interface UploadBankFileResult {
  account_label: string;
  parsed_count: number;
  inserted_count: number;
  skipped_count: number;
}

export function useUploadBankExpenses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: UploadBankFileArgs,
    ): Promise<UploadBankFileResult> => {
      const { companyId, file, accountName, rules } = args;
      const parsed = await parseBankXls(file);

      if (parsed.rows.length === 0) {
        return {
          account_label: accountName ?? parsed.account_number ?? file.name,
          parsed_count: 0,
          inserted_count: 0,
          skipped_count: 0,
        };
      }

      // 배치 메타 — 첫 행 기준 year/month (XLS 가 여러 달 섞여도 메타는 첫 거래월).
      const firstDate = new Date(parsed.rows[0].transaction_date);
      const batchYear = firstDate.getUTCFullYear();
      const batchMonth = firstDate.getUTCMonth() + 1;

      const { data: upload, error: uploadErr } = await supabase
        .from('bank_expense_uploads')
        .insert({
          company_id: companyId,
          account_name: accountName,
          account_number: parsed.account_number,
          upload_date: new Date().toISOString().slice(0, 10),
          year: batchYear,
          month: batchMonth,
          row_count: parsed.rows.length,
        })
        .select('id')
        .single();
      if (uploadErr || !upload) throw uploadErr ?? new Error('upload row 생성 실패');

      const classified = parsed.rows.map((row) => {
        const d = new Date(row.transaction_date);
        const res = classifyRow(row, rules);
        return {
          company_id: companyId,
          upload_id: upload.id,
          transaction_date: row.transaction_date,
          counterpart: row.counterpart || null,
          memo: row.memo || null,
          description: row.description || null,
          withdrawal: row.withdrawal,
          deposit: row.deposit,
          pl_category_id: res.pl_category_id,
          exclude_reason: res.exclude_reason,
          is_excluded: res.is_excluded,
          is_confirmed: false,
          year: d.getUTCFullYear(),
          month: d.getUTCMonth() + 1,
        };
      });

      // before/after count 차이로 실제 삽입 건수 산출 (upsert ignoreDuplicates 는 결과를 안 줌).
      const { count: beforeCount } = await supabase
        .from('bank_expense_rows')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);

      const { error: insErr } = await supabase
        .from('bank_expense_rows')
        .upsert(classified, {
          onConflict: 'company_id,transaction_date,counterpart,withdrawal',
          ignoreDuplicates: true,
        });
      if (insErr) throw insErr;

      const { count: afterCount } = await supabase
        .from('bank_expense_rows')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);

      const inserted = (afterCount ?? 0) - (beforeCount ?? 0);
      const skipped = classified.length - inserted;

      // 빈 업로드(전부 중복) 인 경우 batch row 도 같이 정리.
      if (inserted === 0) {
        await supabase.from('bank_expense_uploads').delete().eq('id', upload.id);
      } else if (inserted !== classified.length) {
        await supabase
          .from('bank_expense_uploads')
          .update({ row_count: inserted })
          .eq('id', upload.id);
      }

      return {
        account_label: accountName ?? parsed.account_number ?? file.name,
        parsed_count: parsed.rows.length,
        inserted_count: inserted,
        skipped_count: skipped,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-expense-rows'] });
      qc.invalidateQueries({ queryKey: ['bank-expense-uploads'] });
      qc.invalidateQueries({ queryKey: ['bank-expense-rows-pl'] });
    },
  });
}

// ───────────────────────────────────────────────────────────
// 행 수정 / 확인 / 삭제

export interface UpdateBankRowArgs {
  id: string;
  patch: Partial<{
    pl_category_id: string | null;
    is_excluded: boolean;
    exclude_reason: string | null;
    is_confirmed: boolean;
  }>;
}

export function useUpdateBankExpenseRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UpdateBankRowArgs) => {
      const { error } = await supabase
        .from('bank_expense_rows')
        .update(args.patch)
        .eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-expense-rows'] });
      qc.invalidateQueries({ queryKey: ['bank-expense-rows-pl'] });
    },
  });
}

export interface ConfirmAllArgs {
  companyId: string;
  year: number;
  month: number;
}

export function useConfirmAllBankExpenseRows() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: ConfirmAllArgs) => {
      const { error } = await supabase
        .from('bank_expense_rows')
        .update({ is_confirmed: true })
        .eq('company_id', args.companyId)
        .eq('year', args.year)
        .eq('month', args.month);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-expense-rows'] });
      qc.invalidateQueries({ queryKey: ['bank-expense-rows-pl'] });
    },
  });
}

export function useDeleteBankExpenseUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uploadId: string) => {
      // CASCADE 로 rows 도 함께 삭제 (마이그레이션에서 ON DELETE CASCADE 설정).
      const { error } = await supabase
        .from('bank_expense_uploads')
        .delete()
        .eq('id', uploadId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-expense-rows'] });
      qc.invalidateQueries({ queryKey: ['bank-expense-uploads'] });
      qc.invalidateQueries({ queryKey: ['bank-expense-rows-pl'] });
    },
  });
}
