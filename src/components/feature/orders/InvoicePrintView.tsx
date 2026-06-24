/**
 * 거래명세서 인쇄 뷰 — `samples/주문서 대시보드.pdf` 양식 재현.
 *
 * 레이아웃:
 *  1) 중앙 타이틀 "거 래 명 세 서"
 *  2) 헤더 2단: 좌(거래처 귀하 / 날짜 / 안내문 / 은행계좌) | 우(공급자 rowSpan 테이블)
 *  3) 주문 섹션 N개: "주문서" / "추가주문" 배지 + (memo에 "직송") 옵션 배지
 *     본문: 카테고리 sub-row(colSpan=7) + 연속 번호 아이템 + 소계 행
 *  4) 합계 바 — 섹션 ≥ 2 인 경우에만 표시
 *
 * 🟠 공급자 정보(런코리아)는 dogfooding 하드코딩. Phase 5 멀티테넌트에서 companies 로 이전.
 * 🔴 본 컴포넌트는 createPortal 로 body 직속 렌더링. @media print 에서만 표시.
 * 🔴 공급가: calcSupplyPriceByCustomerGrade(sell_price, grade, gradeRates) — grade 없거나 0 이면 unit_price 폴백.
 */
import { calcSupplyPriceByCustomerGrade } from '@/utils/calculations';

const SUPPLIER_INFO = {
  name: '런코리아',
  representative: '양시혁',
  bizNo: '110-09-76120',
  phone: '010-8981-1434',
  fax: '02-6442-4219',
  address: '수원시 장안구 파장동 577 에쿠스빌딩2층',
  bank: '국민은행 024801-04-301418 예금주 양시혁',
};

export interface InvoiceItem {
  id: string;
  product: {
    code: string;
    name: string;
    /** 그룹핑 키 — 표 sub-header 행. */
    category?: string | null;
    sell_price?: number;
    grade_a?: number | null;
    grade_b?: number | null;
    grade_c?: number | null;
    grade_d?: number | null;
    grade_e?: number | null;
  };
  quantity: number;
  /** 재고부족 강제조정 전 원래 주문수량. null = 정상. */
  original_quantity?: number | null;
  unit_price: number;
  amount: number;
  is_return: boolean;
}

export interface InvoiceOrder {
  id: string;
  order_date: string;
  memo?: string | null;
  items: InvoiceItem[];
}

export interface InvoiceCustomer {
  id: string;
  name: string;
  grade?: string | null;
}

export interface InvoiceCustomerGroup {
  customer: InvoiceCustomer;
  orders: InvoiceOrder[];
}

export interface InvoicePrintViewProps {
  groups: InvoiceCustomerGroup[];
}

// ── 포맷 / 계산 헬퍼 ──────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function orderSubtotal(order: InvoiceOrder): number {
  return order.items.reduce((s, it) => s + it.amount, 0);
}

function sectionLabel(index: number): string {
  return index === 0 ? '주문서' : '추가주문';
}

function isDirectShip(memo?: string | null): boolean {
  return !!memo && memo.includes('직송');
}

/**
 * 공급가 = 판매가 × 거래처 등급별 공급율. 폴백 = unit_price.
 */
function computeSupplyPrice(
  item: InvoiceItem,
  customerGrade: string | null | undefined,
): number {
  if (!customerGrade || !item.product.sell_price) return item.unit_price;
  const computed = calcSupplyPriceByCustomerGrade(
    item.product.sell_price,
    customerGrade,
    {
      grade_a: item.product.grade_a ?? null,
      grade_b: item.product.grade_b ?? null,
      grade_c: item.product.grade_c ?? null,
      grade_d: item.product.grade_d ?? null,
      grade_e: item.product.grade_e ?? null,
    },
  );
  return computed > 0 ? computed : item.unit_price;
}

/**
 * 표 행 시퀀스 생성 — category 오름차순 정렬 + 변경 시점에 sub-header 삽입.
 *
 * 정책:
 *  - category 는 localeCompare('ko') 로 정렬. 빈 문자열은 자연스럽게 선두로 모임.
 *  - category 가 직전 행과 달라질 때만 sub-header 행 삽입.
 *  - 빈/null category 행은 sub-header 없이 그대로 표시 (사용자 요구).
 *  - No 카운터는 섹션 전체에서 연속(헤더 행은 카운트 안 함).
 */
type Row =
  | { kind: 'cat'; category: string; key: string }
  | { kind: 'item'; item: InvoiceItem; no: number; key: string };

function buildRows(items: InvoiceItem[]): Row[] {
  // 1) category 오름차순 정렬.
  const sorted = [...items].sort((a, b) => {
    const ca = a.product.category ?? '';
    const cb = b.product.category ?? '';
    return ca.localeCompare(cb, 'ko');
  });

  // 2) 평탄화 — category 가 바뀌는 시점에만 헤더 삽입.
  const rows: Row[] = [];
  let lastCategory = '';
  let no = 0;
  for (const it of sorted) {
    const cat = (it.product.category ?? '').trim();
    if (cat && cat !== lastCategory) {
      rows.push({ kind: 'cat', category: cat, key: `cat-${cat}` });
      lastCategory = cat;
    }
    no += 1;
    rows.push({ kind: 'item', item: it, no, key: `it-${it.id}` });
  }
  return rows;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

export function InvoicePrintView({ groups }: InvoicePrintViewProps) {
  const today = fmtDate(new Date().toISOString());

  return (
    <div
      style={{
        fontFamily:
          "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
        color: '#111',
        background: '#fff',
        padding: '0',
        fontSize: '10pt',
      }}
    >
      {groups.map((g, gi) => {
        const grandTotal = g.orders.reduce((s, o) => s + orderSubtotal(o), 0);
        const isLast = gi === groups.length - 1;
        const showGrandTotal = g.orders.length >= 2;
        return (
          <section
            key={g.customer.id}
            style={{
              // 마지막 거래처는 page-break 없음 — 빈 페이지 방지.
              pageBreakAfter: isLast ? 'auto' : 'always',
              breakAfter: isLast ? 'auto' : 'page',
              padding: '4mm 0',
            }}
          >
            {/* 1) 타이틀 */}
            <h1
              style={{
                fontSize: '22pt',
                fontWeight: 700,
                letterSpacing: '0.4em',
                textAlign: 'center',
                margin: '0 0 6mm 0',
                borderBottom: '2px solid #111',
                paddingBottom: '2mm',
              }}
            >
              거 래 명 세 서
            </h1>

            {/* 2) 헤더 2단: 좌(거래처/날짜/안내문/은행) | 우(공급자 테이블) */}
            <div
              style={{
                display: 'flex',
                gap: '6mm',
                alignItems: 'flex-start',
                marginBottom: '6mm',
              }}
            >
              {/* 좌측 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '15pt', fontWeight: 700 }}>
                  {g.customer.name}{' '}
                  <span style={{ fontSize: '11pt', fontWeight: 400 }}>귀하</span>
                </div>
                <div style={{ marginTop: '2mm', fontSize: '10pt' }}>
                  날짜: {today}
                </div>
                <div style={{ marginTop: '1mm', fontSize: '10pt', color: '#333' }}>
                  아래와 같이 명세서를 발행합니다.
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ marginTop: '3mm', fontWeight: 700, fontSize: '11pt' }}>
                  {SUPPLIER_INFO.bank}
                </div>
              </div>

              {/* 우측 — 공급자 rowSpan 테이블 (가로쓰기, 2컬럼 단순 구조) */}
              <table
                style={{
                  borderCollapse: 'collapse',
                  fontSize: '11px',
                  minWidth: '95mm',
                }}
              >
                <tbody>
                  <tr>
                    <td
                      rowSpan={4}
                      style={{
                        border: '1px solid #000',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        fontWeight: 'bold',
                        width: '48px',
                        padding: '4px',
                      }}
                    >
                      공급자
                    </td>
                    <td style={{ border: '1px solid #000', padding: '2px 8px' }}>
                      상호&nbsp;&nbsp;{SUPPLIER_INFO.name}
                      &nbsp;&nbsp;&nbsp;&nbsp;대표자&nbsp;&nbsp;
                      {SUPPLIER_INFO.representative}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '2px 8px' }}>
                      사업자번호&nbsp;&nbsp;{SUPPLIER_INFO.bizNo}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '2px 8px' }}>
                      전화&nbsp;&nbsp;{SUPPLIER_INFO.phone}
                      &nbsp;&nbsp;&nbsp;&nbsp;팩스&nbsp;&nbsp;
                      {SUPPLIER_INFO.fax}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '2px 8px' }}>
                      주소&nbsp;&nbsp;{SUPPLIER_INFO.address}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 3) 주문 섹션들 */}
            {g.orders.map((o, oi) => {
              const subtotal = orderSubtotal(o);
              const rows = buildRows(o.items);
              return (
                <div key={o.id} style={{ marginBottom: '6mm' }}>
                  {/* 섹션 타이틀 — 배지 + 직송 배지 (옵션) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2mm',
                      background: '#eef2f6',
                      border: '1px solid #cdd6e0',
                      padding: '2mm 3mm',
                      fontSize: '11pt',
                      fontWeight: 700,
                    }}
                  >
                    <span>{sectionLabel(oi)}</span>
                    {isDirectShip(o.memo) && (
                      <span
                        style={{
                          fontSize: '8.5pt',
                          fontWeight: 600,
                          background: '#fff',
                          border: '1px solid #99a3b1',
                          borderRadius: '3px',
                          padding: '0.5mm 2mm',
                          color: '#333',
                        }}
                      >
                        직송
                      </span>
                    )}
                  </div>

                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '10pt',
                    }}
                  >
                    <thead>
                      <tr style={{ background: '#f3f3f3' }}>
                        <th style={thCenter('10mm')}>No</th>
                        <th style={thLeft()}>제품명</th>
                        <th style={thCenter('22mm')}>코드</th>
                        <th style={thRight('14mm')}>수량</th>
                        <th style={thRight('20mm')}>공급가</th>
                        <th style={thRight('20mm')}>판매가</th>
                        <th style={thRight('26mm')}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        if (r.kind === 'cat') {
                          return (
                            <tr key={r.key}>
                              <td
                                colSpan={7}
                                style={{
                                  background: '#f9f6ef',
                                  border: '1px solid #000',
                                  padding: '1.5mm 3mm',
                                  fontWeight: 700,
                                }}
                              >
                                {r.category}
                              </td>
                            </tr>
                          );
                        }
                        const it = r.item;
                        const supplyPrice = computeSupplyPrice(it, g.customer.grade);
                        return (
                          <tr
                            key={r.key}
                            style={{
                              color: it.is_return ? '#a23' : '#111',
                            }}
                          >
                            <td style={td('center')}>{r.no}</td>
                            <td style={td('left')}>{it.product.name}</td>
                            <td style={td('center')}>{it.product.code}</td>
                            <td style={td('right')}>
                              {it.original_quantity != null && (
                                <span
                                  style={{
                                    marginRight: '4px',
                                    color: '#aaa',
                                    textDecoration: 'line-through',
                                    fontSize: 'inherit',
                                  }}
                                >
                                  {fmt(it.original_quantity)}
                                </span>
                              )}
                              {fmt(it.quantity)}
                            </td>
                            <td style={td('right')}>{fmt(supplyPrice)}</td>
                            <td style={td('right')}>
                              {it.product.sell_price
                                ? fmt(it.product.sell_price)
                                : '—'}
                            </td>
                            <td style={td('right')}>{fmt(it.amount)}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            ...td('right'),
                            fontWeight: 700,
                            background: '#f3f3f3',
                          }}
                        >
                          소 계
                        </td>
                        <td
                          style={{
                            ...td('right'),
                            fontWeight: 700,
                            background: '#f3f3f3',
                          }}
                        >
                          {fmt(subtotal)}원
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}

            {/* 4) 합계 바 — 섹션 ≥ 2 일 때만 */}
            {showGrandTotal && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#eef2f6',
                  border: '1px solid #cdd6e0',
                  padding: '3mm 4mm',
                  fontWeight: 700,
                  fontSize: '13pt',
                  marginTop: '2mm',
                }}
              >
                <span style={{ letterSpacing: '0.3em' }}>합 계</span>
                <span>{fmt(grandTotal)}원</span>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── 셀 스타일 헬퍼 ─────────────────────────────────────────────────────

function thCenter(width: string): React.CSSProperties {
  return {
    width,
    border: '1px solid #000',
    padding: '1.5mm 2mm',
    textAlign: 'center',
    fontWeight: 700,
  };
}
function thLeft(): React.CSSProperties {
  return {
    border: '1px solid #000',
    padding: '1.5mm 3mm',
    textAlign: 'left',
    fontWeight: 700,
  };
}
function thRight(width: string): React.CSSProperties {
  return {
    width,
    border: '1px solid #000',
    padding: '1.5mm 3mm',
    textAlign: 'right',
    fontWeight: 700,
  };
}

function td(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return {
    border: '1px solid #000',
    padding: '1.2mm 2mm',
    textAlign: align,
    fontVariantNumeric: align === 'right' ? 'tabular-nums' : 'normal',
  };
}
