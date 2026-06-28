/**
 * 손익계산서 페이지 하단 — 은행 거래내역 업로드/리뷰 섹션.
 *
 * 흐름:
 *   1. [+ XLS 업로드] 다중 파일 선택
 *   2. 각 파일에 계좌 별칭 입력
 *   3. [자동분류 실행] — DB unique 제약으로 중복 자동 스킵
 *   4. 토스트: "N건 추가, M건 중복 스킵"
 *   5. 리뷰 테이블 (현재 선택된 월) — 미분류 행 상단 정렬 + 빨간 점
 *   6. 미분류 0 건이면 [전체 확인 완료] 활성화 → is_confirmed=true 일괄 저장
 *
 * 🟠 표시 행은 현재 (year, month) 만, 업로드 자체는 모든 월 행 저장.
 * 🟠 업로드 batch year/month 는 첫 거래월 기준.
 */
import { useRef, useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useToast } from '@/components/ui/Toast';
import {
  useBankClassifyRules,
  useBankExpenseRows,
  useBankExpenseUploads,
  useConfirmAllBankExpenseRows,
  useDeleteBankExpenseUpload,
  useUpdateBankExpenseRow,
  useUploadBankExpenses,
  type BankExpenseRow,
} from '@/hooks/queries/useBankExpenses';
import { usePlExpenseCategories } from '@/hooks/queries/usePlExpenseCategories';

const BRAND = '#6B1F2A';

interface PendingFile {
  file: File;
  accountName: string;
}

interface Props {
  year: number;
  month: number;
}

function fmtWon(n: number): string {
  return n.toLocaleString('ko-KR');
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

const EXCLUDE_REASONS = [
  { value: 'internal', label: '내부이동' },
  { value: 'living', label: '생활비' },
  { value: 'deposit', label: '입금' },
  { value: 'other', label: '기타제외' },
];

export function BankExpenseSection({ year, month }: Props) {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const rulesQ = useBankClassifyRules(companyId);
  const rowsQ = useBankExpenseRows(companyId, year, month);
  const uploadsQ = useBankExpenseUploads(companyId, year);
  const categoriesQ = usePlExpenseCategories(companyId);

  const uploadMut = useUploadBankExpenses();
  const updateMut = useUpdateBankExpenseRow();
  const confirmAllMut = useConfirmAllBankExpenseRows();
  const deleteUploadMut = useDeleteBankExpenseUpload();

  const rules = rulesQ.data ?? [];
  const rows = rowsQ.data ?? [];
  const uploads = uploadsQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  // 정렬: 미분류(0) → 분류됨(1) → 제외됨(2) → 확인완료(3)
  const sorted = [...rows].sort((a, b) => {
    const score = (r: BankExpenseRow) => {
      if (r.is_confirmed) return 3;
      if (r.is_excluded) return 2;
      if (r.pl_category_id) return 1;
      return 0;
    };
    return score(a) - score(b);
  });

  const unclassified = rows.filter(
    (r) => !r.is_excluded && !r.pl_category_id && !r.is_confirmed,
  );
  const hasUnclassified = unclassified.length > 0;

  // ───── 파일 선택 / 드래그앤드롭 ─────
  const handleFiles = (files: File[]) => {
    if (files.length === 0) return;
    const next: PendingFile[] = files.map((f) => ({ file: f, accountName: '' }));
    setPendingFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => /\.xlsx?$/i.test(f.name),
    );
    handleFiles(files);
  };

  const updatePendingAccountName = (i: number, name: string) => {
    setPendingFiles((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, accountName: name } : p)),
    );
  };

  const removePending = (i: number) => {
    setPendingFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  // ───── 처리 ─────
  const handleProcessUpload = async () => {
    if (!companyId || pendingFiles.length === 0) return;
    let totalAdded = 0;
    let totalSkipped = 0;
    const labels: string[] = [];
    for (const pf of pendingFiles) {
      try {
        const res = await uploadMut.mutateAsync({
          companyId,
          file: pf.file,
          accountName: pf.accountName.trim() || null,
          rules,
        });
        totalAdded += res.inserted_count;
        totalSkipped += res.skipped_count;
        labels.push(`${res.account_label} ${res.inserted_count}건`);
      } catch (e) {
        showToast({
          kind: 'error',
          text: `${pf.file.name}: ${e instanceof Error ? e.message : '실패'}`,
        });
      }
    }
    setPendingFiles([]);
    showToast({
      kind: 'success',
      text: `처리 완료: ${totalAdded}건 추가${totalSkipped > 0 ? `, ${totalSkipped}건 중복 스킵` : ''}`,
    });
  };

  const handleDeleteUpload = (id: string) => {
    if (!window.confirm('이 업로드와 모든 행을 삭제하시겠습니까?')) return;
    deleteUploadMut.mutate(id, {
      onSuccess: () => showToast({ kind: 'success', text: '삭제됨' }),
      onError: (e) => showToast({ kind: 'error', text: e.message }),
    });
  };

  const handleRowCategory = (rowId: string, value: string) => {
    if (value === '__exclude__') {
      updateMut.mutate({
        id: rowId,
        patch: {
          pl_category_id: null,
          is_excluded: true,
          exclude_reason: 'other',
        },
      });
    } else if (value === '__clear__') {
      updateMut.mutate({
        id: rowId,
        patch: {
          pl_category_id: null,
          is_excluded: false,
          exclude_reason: null,
        },
      });
    } else {
      updateMut.mutate({
        id: rowId,
        patch: {
          pl_category_id: value,
          is_excluded: false,
          exclude_reason: null,
        },
      });
    }
  };

  const handleExcludeReason = (rowId: string, reason: string) => {
    updateMut.mutate({
      id: rowId,
      patch: { exclude_reason: reason },
    });
  };

  const handleToggleConfirm = (rowId: string, checked: boolean) => {
    updateMut.mutate({ id: rowId, patch: { is_confirmed: checked } });
  };

  const handleConfirmAll = () => {
    if (!companyId || hasUnclassified) return;
    confirmAllMut.mutate(
      { companyId, year, month },
      {
        onSuccess: () =>
          showToast({ kind: 'success', text: '확인 완료' }),
        onError: (e) => showToast({ kind: 'error', text: e.message }),
      },
    );
  };

  // ───── 렌더 ─────
  return (
    <section
      className="mt-6"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 16,
      }}
    >
      <header className="mb-3">
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          거래내역 업로드
        </h2>
        <p
          style={{
            fontSize: 11.5,
            color: 'var(--ink-3)',
            marginTop: 2,
          }}
        >
          KB국민은행 XLS 업로드 → 키워드 기반 자동분류 → 확인 후 판관비에 합산.
        </p>
      </header>

      {/* 드롭존 — 클릭 + 드래그앤드롭 병행 */}
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative flex flex-col items-center justify-center w-full rounded-lg cursor-pointer transition-colors mb-3"
        style={{
          height: 112,
          border: `2px dashed ${isDragging ? BRAND : 'var(--line-strong, #d6d3d1)'}`,
          background: isDragging ? `${BRAND}0d` : 'var(--surface-2)',
        }}
      >
        <Upload
          size={24}
          color={isDragging ? BRAND : 'var(--ink-3)'}
          strokeWidth={1.6}
        />
        <p
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: 500,
            color: isDragging ? BRAND : 'var(--ink-2)',
          }}
        >
          {isDragging
            ? '파일을 놓으세요'
            : 'XLS 파일을 드래그하거나 클릭하여 선택'}
        </p>
        <p
          style={{
            marginTop: 2,
            fontSize: 11,
            color: 'var(--ink-3)',
          }}
        >
          KB국민은행 XLS · 여러 파일 동시 가능
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            handleFiles(files);
            e.target.value = '';
          }}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: 'pointer',
          }}
        />
      </label>

      {/* 업로드 대기 목록 */}
      {pendingFiles.length > 0 && (
        <div
          className="mb-4"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 10,
          }}
        >
          <p
            style={{
              fontSize: 11.5,
              color: 'var(--ink-2)',
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            업로드 대기 ({pendingFiles.length}개) — 계좌 별칭 입력 후 실행
          </p>
          <div className="space-y-1.5">
            {pendingFiles.map((pf, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'var(--ink-3)',
                    width: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={pf.file.name}
                >
                  {pf.file.name}
                </span>
                <input
                  type="text"
                  placeholder="계좌 별칭 (예: 사업자통장)"
                  value={pf.accountName}
                  onChange={(e) => updatePendingAccountName(i, e.target.value)}
                  style={{
                    flex: 1,
                    height: 26,
                    padding: '0 8px',
                    border: '1px solid var(--line)',
                    borderRadius: 4,
                    fontSize: 12,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => removePending(i)}
                  className="text-ink-3 hover:text-ink"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleProcessUpload}
            disabled={uploadMut.isPending}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              background: BRAND,
              color: '#fff',
              fontSize: 12.5,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              opacity: uploadMut.isPending ? 0.6 : 1,
            }}
          >
            {uploadMut.isPending ? '처리 중…' : '자동분류 실행'}
          </button>
        </div>
      )}

      {/* 업로드 이력 */}
      {uploads.length > 0 && (
        <div className="mb-3">
          <p
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              marginBottom: 4,
            }}
          >
            {year}년 업로드 이력 (XLS 한 파일에 여러 달 데이터 포함 가능)
          </p>
          <div className="space-y-1">
            {uploads.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-2"
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11.5,
                  color: 'var(--ink-2)',
                }}
              >
                <span style={{ flex: 1 }}>
                  {u.account_name ?? u.account_number ?? '(미지정 계좌)'}
                </span>
                <span style={{ color: 'var(--ink-3)' }}>
                  {u.row_count}건
                </span>
                <span style={{ color: 'var(--ink-3)' }}>
                  {new Date(u.created_at).toLocaleDateString('ko-KR')}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteUpload(u.id)}
                  style={{
                    color: 'var(--danger)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 리뷰 테이블 */}
      {rowsQ.isLoading && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>로딩 중…</div>
      )}

      {!rowsQ.isLoading && rows.length === 0 && (
        <div
          style={{
            padding: 20,
            fontSize: 12.5,
            color: 'var(--ink-3)',
            textAlign: 'center',
            background: 'var(--surface-2)',
            borderRadius: 8,
          }}
        >
          이번 달 거래내역이 없습니다. 상단 [+ XLS 업로드] 로 시작하세요.
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '70px minmax(120px, 1fr) minmax(140px, 1.4fr) 100px 180px 130px 60px',
                gap: 8,
                padding: '8px 12px',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--line)',
                fontSize: 11,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-num)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <span>날짜</span>
              <span>보낸분/받는분</span>
              <span>적요 / 메모</span>
              <span style={{ textAlign: 'right' }}>출금액</span>
              <span>분류</span>
              <span>제외 사유</span>
              <span style={{ textAlign: 'center' }}>확인</span>
            </div>
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              {sorted.map((r) => {
                const isUnclassified =
                  !r.is_excluded && !r.pl_category_id && !r.is_confirmed;
                const selectVal = r.is_excluded
                  ? '__exclude__'
                  : r.pl_category_id ?? '';
                return (
                  <div
                    key={r.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        '70px minmax(120px, 1fr) minmax(140px, 1.4fr) 100px 180px 130px 60px',
                      gap: 8,
                      padding: '6px 12px',
                      borderBottom: '1px solid var(--line)',
                      alignItems: 'center',
                      fontSize: 12,
                      background: r.is_confirmed
                        ? 'var(--success-wash)'
                        : r.is_excluded
                          ? 'var(--surface-2)'
                          : 'var(--surface)',
                      opacity: r.is_excluded && !r.is_confirmed ? 0.6 : 1,
                    }}
                  >
                    <span
                      className="num"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      {isUnclassified && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'var(--danger)',
                            marginRight: 4,
                            verticalAlign: 'middle',
                          }}
                        />
                      )}
                      {fmtDate(r.transaction_date)}
                    </span>
                    <span
                      style={{
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={r.counterpart ?? ''}
                    >
                      {r.counterpart || '—'}
                    </span>
                    <span
                      style={{
                        color: 'var(--ink-3)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 11.5,
                      }}
                      title={`${r.description ?? ''} ${r.memo ? '· ' + r.memo : ''}`}
                    >
                      {r.description || '—'}
                      {r.memo && (
                        <span style={{ color: 'var(--ink-4)', marginLeft: 4 }}>
                          · {r.memo}
                        </span>
                      )}
                    </span>
                    <span
                      className="num"
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: r.withdrawal > 0 ? 'var(--ink)' : 'var(--ink-3)',
                      }}
                    >
                      {r.withdrawal > 0 ? `₩${fmtWon(r.withdrawal)}` : '—'}
                    </span>
                    <select
                      value={selectVal}
                      onChange={(e) => handleRowCategory(r.id, e.target.value)}
                      disabled={r.is_confirmed}
                      style={{
                        height: 26,
                        padding: '0 6px',
                        border: '1px solid var(--line)',
                        borderRadius: 4,
                        fontSize: 11.5,
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                      }}
                    >
                      <option value="">— 미분류 —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__exclude__">제외</option>
                      <option value="__clear__">초기화</option>
                    </select>
                    {r.is_excluded ? (
                      <select
                        value={r.exclude_reason ?? 'other'}
                        onChange={(e) =>
                          handleExcludeReason(r.id, e.target.value)
                        }
                        disabled={r.is_confirmed}
                        style={{
                          height: 26,
                          padding: '0 6px',
                          border: '1px solid var(--line)',
                          borderRadius: 4,
                          fontSize: 11.5,
                          background: 'var(--surface)',
                          color: 'var(--ink-2)',
                        }}
                      >
                        {EXCLUDE_REASONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>
                        —
                      </span>
                    )}
                    <span style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={r.is_confirmed}
                        onChange={(e) =>
                          handleToggleConfirm(r.id, e.target.checked)
                        }
                        disabled={isUnclassified}
                        style={{
                          accentColor: BRAND,
                          cursor: isUnclassified ? 'not-allowed' : 'pointer',
                        }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단 액션 */}
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              총 {rows.length}건 · 확인 완료 {rows.filter((r) => r.is_confirmed).length}건
              {hasUnclassified && (
                <span style={{ color: 'var(--danger)', marginLeft: 8 }}>
                  · 미분류 {unclassified.length}건 (분류 또는 제외 처리 필요)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleConfirmAll}
              disabled={hasUnclassified || confirmAllMut.isPending}
              title={
                hasUnclassified ? '미분류 항목을 먼저 처리해주세요' : ''
              }
              style={{
                padding: '6px 14px',
                background: hasUnclassified ? 'var(--surface-2)' : BRAND,
                color: hasUnclassified ? 'var(--ink-3)' : '#fff',
                fontSize: 12.5,
                borderRadius: 6,
                border: 'none',
                cursor: hasUnclassified ? 'not-allowed' : 'pointer',
                opacity: hasUnclassified ? 0.6 : 1,
              }}
            >
              전체 확인 완료
            </button>
          </div>
        </>
      )}
    </section>
  );
}
