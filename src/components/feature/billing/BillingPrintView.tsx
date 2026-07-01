/**
 * 청구서 / 거래명세서 인쇄 뷰 — 월간 단위, 날짜별 그룹핑.
 *
 * 레이아웃:
 *  1) 중앙 타이틀 — '청 구 서' 또는 '거 래 명 세 서' (알파문구 계열은 거래명세서)
 *  2) 헤더 2단: 좌(거래처 귀하 / 기간 / 안내문 / 은행계좌) | 우(공급자 rowSpan 테이블)
 *  3) 날짜 섹션 N개: YYYY-MM-DD 배지 + 표(No|제품명|코드|수량|공급가|판매가|합계) + 일별 소계
 *  4) 합계 바 — 항상 표시 (월 합계)
 *
 * 🟠 공급자 정보(런코리아) 하드코딩 — Phase 5 멀티테넌트에서 companies 로 이전.
 *    InvoicePrintView 와 동일한 dogfooding 정책.
 * 🔴 createPortal 로 body 직속 렌더링하는 호출부 패턴 따를 것. @media print 에서만 표시.
 * 🔴 공급가: calcSupplyPriceByCustomerGrade(sell_price, grade, gradeRates) — grade/공급율 없으면 unit_price 폴백.
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

export interface BillingItem {
  id: string;
  product: {
    code: string;
    name: string;
    sell_price?: number | null;
    grade_a?: number | null;
    grade_b?: number | null;
    grade_c?: number | null;
    grade_d?: number | null;
    grade_e?: number | null;
  };
  quantity: number;
  unit_price: number;
  amount: number;
  is_return: boolean;
}

export interface BillingDateGroup {
  /** 'YYYY-MM-DD' (KST 기준) */
  date: string;
  items: BillingItem[];
}

export interface BillingCustomer {
  id: string;
  name: string;
  grade?: string | null;
}

export interface BillingPrintViewProps {
  customer: BillingCustomer;
  year: number;
  month: number;
  groups: BillingDateGroup[];
  documentTitle: '청구서' | '거래명세서';
  /**
   * 이번 달 직송 주문 건수 — 헤더에 한 줄 요약 표시.
   * 0 또는 미지정이면 표시 생략. 상세 표시는 정책상 거래명세서(InvoicePrintView)만.
   */
  directShippingCount?: number;
}

// ── 포맷 / 계산 헬퍼 ──────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

function spacedTitle(t: '청구서' | '거래명세서'): string {
  // '청 구 서' / '거 래 명 세 서'
  return t.split('').join(' ');
}

function groupSubtotal(g: BillingDateGroup): number {
  return g.items.reduce((s, it) => s + it.amount, 0);
}

function computeSupplyPrice(
  item: BillingItem,
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

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

export function BillingPrintView({
  customer,
  year,
  month,
  groups,
  documentTitle,
  directShippingCount = 0,
}: BillingPrintViewProps) {
  const grandTotal = groups.reduce((s, g) => s + groupSubtotal(g), 0);
  const paddedMonth = String(month).padStart(2, '0');

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
      {/* 🟠 종이 절약: section padding 4mm → 2mm (@page margin-top 도 6mm 로 축소됨) */}
      <section style={{ padding: '2mm 0' }}>
        {/* 1) 타이틀 */}
        <h1
          style={{
            fontSize: '22pt',
            fontWeight: 700,
            letterSpacing: '0.4em',
            textAlign: 'center',
            // 🟠 종이 절약: 6mm → 3mm
            margin: '0 0 3mm 0',
            borderBottom: '2px solid #111',
            paddingBottom: '1.5mm',
          }}
        >
          {spacedTitle(documentTitle)}
        </h1>

        {/* 2) 헤더 2단 */}
        <div
          style={{
            display: 'flex',
            gap: '6mm',
            alignItems: 'flex-start',
            // 🟠 종이 절약: 헤더 ↔ 날짜 섹션 간격 6mm → 2mm
            marginBottom: '2mm',
          }}
        >
          {/* 좌측 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '15pt', fontWeight: 700 }}>
              {customer.name}{' '}
              <span style={{ fontSize: '11pt', fontWeight: 400 }}>귀하</span>
            </div>
            <div style={{ marginTop: '2mm', fontSize: '10pt' }}>
              기간: {year}년 {paddedMonth}월
            </div>
            {directShippingCount > 0 && (
              <div
                style={{
                  marginTop: '1mm',
                  fontSize: '9.5pt',
                  color: '#333',
                  fontWeight: 600,
                }}
              >
                · 이번 달 직송 {directShippingCount}건 포함
              </div>
            )}
            <div style={{ marginTop: '1mm', fontSize: '10pt', color: '#333' }}>
              아래와 같이 청구드립니다.
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ marginTop: '3mm', fontWeight: 700, fontSize: '11pt' }}>
              {SUPPLIER_INFO.bank}
            </div>
          </div>

          {/* 우측 — 공급자 rowSpan 테이블 */}
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

        {/* 3) 날짜별 섹션 */}
        {groups.map((g) => {
          const subtotal = groupSubtotal(g);
          return (
            <div key={g.date} style={{ marginBottom: '2mm' }}>
              <div
                style={{
                  background: '#eef2f6',
                  border: '1px solid #cdd6e0',
                  padding: '0.8mm 3mm',
                  fontSize: '11pt',
                  fontWeight: 700,
                }}
              >
                {g.date}
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
                    <th style={thCenter('22mm')}>코드</th>
                    <th style={thLeft()}>제품명</th>
                    <th style={thRight('14mm')}>수량</th>
                    <th style={thRight('20mm')}>공급가</th>
                    <th style={thRight('20mm')}>판매가</th>
                    <th style={thRight('26mm')}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it, idx) => {
                    const supplyPrice = computeSupplyPrice(it, customer.grade);
                    return (
                      <tr
                        key={it.id}
                        style={{ color: it.is_return ? '#a23' : '#111' }}
                      >
                        <td style={td('center')}>{idx + 1}</td>
                        <td style={td('center')}>{it.product.code}</td>
                        <td style={td('left')}>{it.product.name}</td>
                        <td style={td('right')}>{fmt(it.quantity)}</td>
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

        {/* 4) 월 합계 바 */}
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
      </section>
    </div>
  );
}

// ── 셀 스타일 헬퍼 ─────────────────────────────────────────────────────

function thCenter(width: string): React.CSSProperties {
  return {
    width,
    border: '1px solid #000',
    // 🟠 종이 절약: 1.5mm → 0.8mm (~3px)
    padding: '0.8mm 2mm',
    textAlign: 'center',
    fontWeight: 700,
  };
}
function thLeft(): React.CSSProperties {
  return {
    border: '1px solid #000',
    padding: '0.8mm 3mm',
    textAlign: 'left',
    fontWeight: 700,
  };
}
function thRight(width: string): React.CSSProperties {
  return {
    width,
    border: '1px solid #000',
    padding: '0.8mm 3mm',
    textAlign: 'right',
    fontWeight: 700,
  };
}

function td(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return {
    border: '1px solid #000',
    // 🟠 종이 절약: 1.2mm → 0.6mm (~2.3px). 텍스트 붙지 않는 최소치.
    padding: '0.6mm 2mm',
    textAlign: align,
    fontVariantNumeric: align === 'right' ? 'tabular-nums' : 'normal',
  };
}
