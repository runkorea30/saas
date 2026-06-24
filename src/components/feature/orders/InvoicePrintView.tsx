/**
 * 거래명세서 인쇄 뷰.
 *
 * - 거래처별 페이지 분할 (`.invoice-page-break`).
 * - 한 거래처 내 여러 주문은 "주문서" → "추가주문" 섹션으로 구분.
 * - `memo`에 "직송" 포함 시 섹션 제목에 "직송" 토큰 추가.
 *
 * 🟠 공급자 정보(런코리아)는 dogfooding 단계 하드코딩.
 *   Phase 5 멀티테넌트 단계에서 companies 테이블 필드로 이전 예정.
 *
 * 🔴 본 컴포넌트는 createPortal 로 body 직속에 렌더링되며,
 *    @media print CSS 에서 #root 를 숨기고 .invoice-print-portal 만 표시한다.
 */

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
    sell_price?: number;
  };
  quantity: number;
  /** order_items.unit_price — 실제 적용 단가(거래처별 공급가). */
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
  address?: string | null;
  phone?: string | null;
}

export interface InvoiceCustomerGroup {
  customer: InvoiceCustomer;
  orders: InvoiceOrder[];
}

export interface InvoicePrintViewProps {
  groups: InvoiceCustomerGroup[];
}

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

function sectionTitle(index: number, memo?: string | null): string {
  const base = index === 0 ? '주문서' : '추가주문';
  if (memo && memo.includes('직송')) return `${base} 직송`;
  return base;
}

function orderSubtotal(order: InvoiceOrder): number {
  return order.items.reduce((s, it) => s + it.amount, 0);
}

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
      }}
    >
      {groups.map((g, gi) => {
        const grandTotal = g.orders.reduce((s, o) => s + orderSubtotal(o), 0);
        const isLast = gi === groups.length - 1;
        return (
          <section
            key={g.customer.id}
            className={isLast ? undefined : 'invoice-page-break'}
            style={{ padding: '4mm 0' }}
          >
            {/* 헤더 */}
            <header
              className="invoice-no-break"
              style={{ marginBottom: '6mm' }}
            >
              <h1
                style={{
                  fontSize: '20pt',
                  fontWeight: 700,
                  letterSpacing: '0.3em',
                  textAlign: 'center',
                  margin: '0 0 4mm 0',
                  borderBottom: '2px solid #111',
                  paddingBottom: '2mm',
                }}
              >
                거 래 명 세 서
              </h1>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  fontSize: '11pt',
                  marginBottom: '2mm',
                }}
              >
                <div style={{ fontSize: '13pt', fontWeight: 600 }}>
                  {g.customer.name} 귀하
                </div>
                <div>날짜: {today}</div>
              </div>
              <div style={{ fontSize: '10pt', color: '#333' }}>
                아래와 같이 명세서를 발행합니다.
              </div>
              <div style={{ fontSize: '10pt', color: '#333', marginTop: '1mm' }}>
                {SUPPLIER_INFO.bank}
              </div>
            </header>

            {/* 공급자 정보 박스 */}
            <table
              className="invoice-no-break"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '10pt',
                marginBottom: '6mm',
                border: '1px solid #111',
              }}
            >
              <tbody>
                <tr>
                  <td
                    rowSpan={4}
                    style={{
                      width: '12%',
                      padding: '3mm',
                      textAlign: 'center',
                      borderRight: '1px solid #111',
                      fontWeight: 600,
                      background: '#f3f3f3',
                    }}
                  >
                    공<br />급<br />자
                  </td>
                  <td style={cellLabel}>상호</td>
                  <td style={cellValue}>{SUPPLIER_INFO.name}</td>
                  <td style={cellLabel}>대표자</td>
                  <td style={cellValue}>{SUPPLIER_INFO.representative}</td>
                </tr>
                <tr>
                  <td style={cellLabel}>사업자번호</td>
                  <td style={cellValue} colSpan={3}>
                    {SUPPLIER_INFO.bizNo}
                  </td>
                </tr>
                <tr>
                  <td style={cellLabel}>전화</td>
                  <td style={cellValue}>{SUPPLIER_INFO.phone}</td>
                  <td style={cellLabel}>팩스</td>
                  <td style={cellValue}>{SUPPLIER_INFO.fax}</td>
                </tr>
                <tr>
                  <td style={cellLabel}>주소</td>
                  <td style={cellValue} colSpan={3}>
                    {SUPPLIER_INFO.address}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 주문서 / 추가주문 섹션들 */}
            {g.orders.map((o, oi) => {
              const subtotal = orderSubtotal(o);
              return (
                <div
                  key={o.id}
                  className="invoice-no-break"
                  style={{ marginBottom: '6mm' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      fontSize: '11pt',
                      fontWeight: 600,
                      marginBottom: '2mm',
                      borderBottom: '1px solid #111',
                      paddingBottom: '1mm',
                    }}
                  >
                    <span>{sectionTitle(oi, o.memo)}</span>
                    <span style={{ fontSize: '9pt', fontWeight: 400, color: '#555' }}>
                      {fmtDate(o.order_date)} · {o.id.slice(0, 8)}
                    </span>
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
                        <th style={th(36)}>No</th>
                        <th style={thLeft()}>제품명</th>
                        <th style={th(80)}>코드</th>
                        <th style={thRight(50)}>수량</th>
                        <th style={thRight(80)}>공급가</th>
                        <th style={thRight(80)}>판매가</th>
                        <th style={thRight(95)}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.items.map((it, idx) => (
                        <tr
                          key={it.id}
                          style={{
                            borderBottom: '1px solid #ccc',
                            color: it.is_return ? '#a23' : '#111',
                          }}
                        >
                          <td style={td()}>{idx + 1}</td>
                          <td style={tdLeft()}>{it.product.name}</td>
                          <td style={td()}>{it.product.code}</td>
                          <td style={tdRight()}>{fmt(it.quantity)}</td>
                          <td style={tdRight()}>{fmt(it.unit_price)}</td>
                          <td style={tdRight()}>
                            {it.product.sell_price
                              ? fmt(it.product.sell_price)
                              : '—'}
                          </td>
                          <td style={tdRight()}>{fmt(it.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            textAlign: 'right',
                            padding: '2mm 3mm',
                            fontWeight: 600,
                            borderTop: '1.5px solid #111',
                          }}
                        >
                          소 계
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            padding: '2mm 3mm',
                            fontWeight: 600,
                            borderTop: '1.5px solid #111',
                          }}
                        >
                          {fmt(subtotal)}원
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {o.memo && (
                    <div
                      style={{
                        fontSize: '9pt',
                        color: '#555',
                        marginTop: '1.5mm',
                        paddingLeft: '1mm',
                      }}
                    >
                      메모: {o.memo}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 푸터 — 받는사람 + 합계 */}
            <div
              className="invoice-no-break"
              style={{
                borderTop: '2px solid #111',
                paddingTop: '3mm',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: '11pt',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, marginBottom: '1mm' }}>
                  받는사람: {g.customer.name}
                </div>
                {g.customer.address && (
                  <div style={{ fontSize: '10pt', color: '#333' }}>
                    {g.customer.address}
                  </div>
                )}
                {g.customer.phone && (
                  <div style={{ fontSize: '10pt', color: '#333' }}>
                    {g.customer.phone}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '14pt', fontWeight: 700 }}>
                합 계: {fmt(grandTotal)}원
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── 셀 스타일 헬퍼 (테이블 가독성 통일) ─────────────────────────────────
const baseCell: React.CSSProperties = {
  padding: '2mm 3mm',
  border: '1px solid #111',
};
const cellLabel: React.CSSProperties = {
  ...baseCell,
  width: '12%',
  background: '#f8f8f8',
  fontWeight: 600,
};
const cellValue: React.CSSProperties = {
  ...baseCell,
};

function th(width: number): React.CSSProperties {
  return {
    width,
    border: '1px solid #111',
    padding: '2mm 2mm',
    textAlign: 'center',
    fontWeight: 600,
  };
}
function thLeft(): React.CSSProperties {
  return {
    border: '1px solid #111',
    padding: '2mm 3mm',
    textAlign: 'left',
    fontWeight: 600,
  };
}
function thRight(width: number): React.CSSProperties {
  return {
    width,
    border: '1px solid #111',
    padding: '2mm 3mm',
    textAlign: 'right',
    fontWeight: 600,
  };
}
function td(): React.CSSProperties {
  return {
    border: '1px solid #ccc',
    padding: '1.5mm 2mm',
    textAlign: 'center',
  };
}
function tdLeft(): React.CSSProperties {
  return {
    border: '1px solid #ccc',
    padding: '1.5mm 3mm',
    textAlign: 'left',
  };
}
function tdRight(): React.CSSProperties {
  return {
    border: '1px solid #ccc',
    padding: '1.5mm 3mm',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  };
}
