/**
 * 거래처 포털 직송 정보 입력 테이블.
 *
 * CustomerOrderPage LeftPanel 에 인라인되어 있던 7컬럼 직송 입력 + 거래처/신용
 * 자동값 + 엑셀 다중 셀 paste 분배 + 행 삭제 로직을 독립 컴포넌트로 추출.
 *
 * CustomerOrderInput(직접 입력 모드)에도 동일 컴포넌트를 재사용하기 위해 분리.
 * 시각/기능 동등성을 위해 CustomerOrderPage 인라인 구현을 그대로 옮긴 형태.
 */
import { Trash2 } from 'lucide-react';

// ── 타입 / 상수 ────────────────────────────────────────────────────────

export interface ShippingRow {
  name: string;      // 받는사람
  zipcode: string;   // 우편번호
  address: string;   // 주소
  phone1: string;    // 연락처1
  phone2: string;    // 연락처2
  blank: string;     // 빈칸 (헤더 무라벨, 사용자 자유 입력)
  product: string;   // 제품
}

/** 엑셀 붙여넣기 매핑용 컬럼 키 순서. 거래처/신용 은 자동값이라 제외. */
export const SHIPPING_COLS: ReadonlyArray<keyof ShippingRow> = [
  'name',
  'zipcode',
  'address',
  'phone1',
  'phone2',
  'blank',
  'product',
];

export const emptyShipping = (): ShippingRow => ({
  name: '',
  zipcode: '',
  address: '',
  phone1: '',
  phone2: '',
  blank: '',
  product: '',
});

export const CREDIT_LABEL = '신용';

// ── 컴포넌트 ───────────────────────────────────────────────────────────

interface Props {
  rows: ShippingRow[];
  onChange: (rows: ShippingRow[]) => void;
  /** 거래처/신용 자동값 셀에 표시할 거래처명. */
  customerName: string;
  /**
   * 상단 경고 배너 — LeftPanel(파일 업로드 모드)에서만 표시.
   * 파일 업로드 + 직송 동시 입력 시 직송 정보부터 입력하라는 주의 문구.
   */
  showWarning?: boolean;
}

export function DirectShippingTable({
  rows,
  onChange,
  customerName,
  showWarning = false,
}: Props) {
  const updateCell = (
    index: number,
    field: keyof ShippingRow,
    value: string,
  ) => {
    const next = [...rows];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  const removeRow = (idx: number) => {
    onChange(
      rows.length === 1 ? [emptyShipping()] : rows.filter((_, i) => i !== idx),
    );
  };

  /**
   * 직송 셀에 엑셀 다중 셀(또는 행) 붙여넣기를 자동 분배.
   * - 단일 셀(텍스트에 탭/줄바꿈 없음) 이면 기본 paste 허용 → preventDefault 하지 않음.
   * - 다중 셀이면 \n 으로 행, \t 으로 컬럼 분리해 (rowIndex+ri, colIndex+ci) 위치에 채움.
   * - 부족한 행은 emptyShipping 으로 자동 확장.
   * - 거래처/신용 컬럼(SHIPPING_COLS 길이 초과 인덱스) 은 자동값이라 덮어쓰지 않음.
   */
  const handlePaste =
    (rowIndex: number, colIndex: number) =>
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text');
      if (!text) return;
      if (!text.includes('\t') && !text.includes('\n')) return;
      e.preventDefault();
      const matrix = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n+$/, '')
        .split('\n')
        .map((line) => line.split('\t'));

      const next = [...rows];
      matrix.forEach((cols, ri) => {
        const ti = rowIndex + ri;
        while (next.length <= ti) next.push(emptyShipping());
        const target = { ...next[ti] };
        cols.forEach((val, ci) => {
          const keyIdx = colIndex + ci;
          if (keyIdx < SHIPPING_COLS.length) {
            target[SHIPPING_COLS[keyIdx]] = val.trim();
          }
        });
        next[ti] = target;
      });
      onChange(next);
    };

  return (
    <>
      {showWarning && (
        <div className="mb-2 rounded-md border border-[var(--p-danger-soft-border)] bg-[var(--p-danger-soft-bg)] px-3 py-2 text-[12px] font-medium text-[var(--p-danger-strong)]">
          ⚠ 절대주의: 직송은 직송정보부터 입력하세요. 일반주문시와 구분해주세요
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-[var(--p-bg)]">
              <ShipTh>받는사람</ShipTh>
              <ShipTh>우편번호</ShipTh>
              <ShipTh>주소</ShipTh>
              <ShipTh>연락처1</ShipTh>
              <ShipTh>연락처2</ShipTh>
              <ShipTh />
              <ShipTh>제품</ShipTh>
              <ShipTh>거래처</ShipTh>
              <ShipTh>신용</ShipTh>
              <ShipTh width={36} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-[var(--p-bg)]">
                <ShipTd>
                  <CellInput
                    value={row.name}
                    onChange={(v) => updateCell(i, 'name', v)}
                    onPaste={handlePaste(i, 0)}
                  />
                </ShipTd>
                <ShipTd>
                  <CellInput
                    value={row.zipcode}
                    onChange={(v) => updateCell(i, 'zipcode', v)}
                    onPaste={handlePaste(i, 1)}
                  />
                </ShipTd>
                <ShipTd>
                  <CellInput
                    value={row.address}
                    onChange={(v) => updateCell(i, 'address', v)}
                    onPaste={handlePaste(i, 2)}
                  />
                </ShipTd>
                <ShipTd>
                  <CellInput
                    value={row.phone1}
                    onChange={(v) => updateCell(i, 'phone1', v)}
                    onPaste={handlePaste(i, 3)}
                  />
                </ShipTd>
                <ShipTd>
                  <CellInput
                    value={row.phone2}
                    onChange={(v) => updateCell(i, 'phone2', v)}
                    onPaste={handlePaste(i, 4)}
                  />
                </ShipTd>
                <ShipTd>
                  <CellInput
                    value={row.blank}
                    onChange={(v) => updateCell(i, 'blank', v)}
                    onPaste={handlePaste(i, 5)}
                  />
                </ShipTd>
                <ShipTd>
                  <CellInput
                    value={row.product}
                    onChange={(v) => updateCell(i, 'product', v)}
                    onPaste={handlePaste(i, 6)}
                  />
                </ShipTd>
                <ShipTd>
                  <ReadOnlyCell value={customerName} />
                </ShipTd>
                <ShipTd>
                  <ReadOnlyCell value={CREDIT_LABEL} />
                </ShipTd>
                <ShipTd width={36}>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    title="행 삭제"
                    className="cursor-pointer border-none bg-transparent p-1 text-[var(--p-ink-3)] hover:text-[var(--p-danger-strong)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </ShipTd>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── 내부 헬퍼 셀 ──────────────────────────────────────────────────────

function ShipTh({
  children,
  width,
}: {
  children?: React.ReactNode;
  width?: number;
}) {
  return (
    <th
      style={{
        padding: '8px 6px',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--p-ink-2)',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        width,
      }}
    >
      {children}
    </th>
  );
}

function ShipTd({
  children,
  width,
}: {
  children?: React.ReactNode;
  width?: number;
}) {
  return (
    <td style={{ padding: '4px 4px', width, verticalAlign: 'middle' }}>
      {children}
    </td>
  );
}

function CellInput({
  value,
  onChange,
  onPaste,
}: {
  value: string;
  onChange: (v: string) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={onPaste}
      style={{
        width: '100%',
        height: 28,
        padding: '0 6px',
        fontSize: 12,
        border: '1px solid var(--p-line)',
        borderRadius: 4,
        outline: 'none',
        background: 'var(--p-card-bg)',
      }}
    />
  );
}

/** 직송 테이블의 자동값 셀 (거래처 / 신용). 편집 불가, 회색 배경. */
function ReadOnlyCell({ value }: { value: string }) {
  return (
    <div
      title={value}
      style={{
        width: '100%',
        height: 28,
        padding: '0 6px',
        fontSize: 12,
        border: '1px solid var(--p-line)',
        borderRadius: 4,
        background: 'var(--p-bg)',
        color: 'var(--p-ink-3)',
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {value}
    </div>
  );
}

/**
 * 직송 행 → 저장용 정규화: 빈 행 제거 + 거래처/신용 자동값 주입.
 * CustomerOrderPage 의 LeftPanel handleSubmitFile 과 동일 패턴 — 양쪽 진입점
 * 일관성 보장을 위한 공용 헬퍼.
 */
export function filledShippingForInsert(
  rows: ShippingRow[],
  customerName: string,
): Array<ShippingRow & { customer: string; credit: string }> {
  return rows
    .filter((s) => s.name || s.address || s.phone1 || s.product)
    .map((s) => ({
      ...s,
      customer: customerName,
      credit: CREDIT_LABEL,
    }));
}
