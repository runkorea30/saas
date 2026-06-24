/**
 * 알파문구 종합청구서 엑셀 생성 유틸.
 *
 * 알파문구(㈜알파문구 계열) 거래처에 대해 매월 발행하는 종합청구서 양식.
 * 원본 양식(xlrd 분석 결과)을 SheetJS aoa 14열 그리드로 재현.
 *
 * 양식 구조:
 *   row0  제목 "종   합   청   구   서"
 *   row1  접수일자 (다음달 3일 기준)
 *   row2  헤더 (사업장명/건수/청구금액/반품금액/D/C/기타공제/결제액/비고)
 *   row3~ 지점 데이터 행
 *   합계 행
 *   회사정보 행 (런코리아 / 양시혁 / 대표 / TEL)
 *   특이사항 + 입고상품명("엔젤러스")
 *   자금팀 담당자 섹션 (고정값)
 *
 * 🟠 본 유틸은 알파문구 전용 — 일반 거래처 청구서는 BillingPrintView 인쇄로 처리.
 */
import * as XLSX from 'xlsx';

export interface AlphaBranchItem {
  branchName: string;       // 지점명 (거래처 name)
  count: number;            // 주문 건수
  totalAmount: number;      // 청구금액 (반품 제외)
  returnAmount: number;     // 반품금액 (양수)
  settlementAmount: number; // 결제액 = totalAmount - returnAmount
  note?: string;            // 비고
}

export interface GenerateAlphaBillingExcelParams {
  /** 청구 대상 연도 */
  year: number;
  /** 청구 대상 월 (1~12) */
  month: number;
  branches: AlphaBranchItem[];
}

export function generateAlphaBillingExcel(
  params: GenerateAlphaBillingExcelParams,
): void {
  const { year, month, branches } = params;
  const wb = XLSX.utils.book_new();

  const C = 14; // 총 열 수
  const empty = (): (string | number)[] => Array(C).fill('');

  const rows: (string | number)[][] = [];

  // Row 0: 제목
  const r0 = empty();
  r0[0] = '종   합   청   구   서';
  rows.push(r0);

  // Row 1: 접수일자 (다음달 3일)
  const r1 = empty();
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  r1[0] = `접 수 일 자 :   ${nextYear}년    ${nextMonth}월  3 일                      ( ${month}  )월분`;
  rows.push(r1);

  // Row 2: 헤더
  const r2 = empty();
  r2[0] = '사 업 장 명';
  r2[1] = '건수';
  r2[2] = '청 구 금 액';
  r2[6] = '반품금액';
  r2[8] = 'D/C';
  r2[10] = '기타공제';
  r2[12] = '결 제 액';
  r2[13] = '비고';
  rows.push(r2);

  // Row 3~: 지점 데이터
  for (const branch of branches) {
    const r = empty();
    r[0] = branch.branchName;
    r[1] = branch.count || '';
    r[2] = branch.totalAmount || 0;
    r[6] = branch.returnAmount || 0;
    r[8] = 0;
    r[10] = 0;
    r[12] = branch.settlementAmount || 0;
    r[13] = branch.note || '';
    rows.push(r);
  }

  // 합계 행
  const totalCount = branches.reduce((s, b) => s + b.count, 0);
  const totalAmount = branches.reduce((s, b) => s + b.totalAmount, 0);
  const totalReturn = branches.reduce((s, b) => s + b.returnAmount, 0);
  const totalSettlement = branches.reduce((s, b) => s + b.settlementAmount, 0);
  const rTotal = empty();
  rTotal[0] = '합         계';
  rTotal[1] = totalCount;
  rTotal[2] = totalAmount;
  rTotal[6] = totalReturn;
  rTotal[8] = 0;
  rTotal[10] = 0;
  rTotal[12] = totalSettlement;
  rows.push(rTotal);

  // 회사 정보 행
  const rComp = empty();
  rComp[0] = '회   사   명';
  rComp[1] = '런코리아';
  rComp[3] = '담당자';
  rComp[4] = '양시혁';
  rComp[6] = '직 위';
  rComp[7] = '대표';
  rComp[9] = 'TEL';
  rComp[10] = '010-8981-1434';
  rComp[12] = '010-8981-1434';
  rows.push(rComp);

  // 특이사항 행
  const rNote = empty();
  rNote[0] = '특 이 사 항';
  rNote[1] = '청구서첩수 : 서울시 용산구 한강로 3가 16-18 자금팀';
  rNote[12] = '입고상품명';
  rows.push(rNote);

  // 엔젤러스 행
  const rAngelus = empty();
  rAngelus[12] = '엔젤러스';
  rows.push(rAngelus);

  // 자금팀 헤더 행
  const rFundHeader = empty();
  rFundHeader[0] = '자   금   팀';
  rFundHeader[2] = '담 당 분 야';
  rFundHeader[5] = '담 당 자';
  rFundHeader[7] = '전화번호 (펙스번호 )';
  rFundHeader[12] = '유 의 사 항';
  rows.push(rFundHeader);

  // 팀장 행
  const rTeamLead = empty();
  rTeamLead[0] = ' 팀           장';
  rTeamLead[2] = '자금팀총괄';
  rTeamLead[5] = '노 은 숙';
  rTeamLead[7] = '02-3788-6140 (fax:714-0660)';
  rTeamLead[12] = '청구서접수방법';
  rTeamLead[13] = '이메일 접수';
  rows.push(rTeamLead);

  // 주임 행
  const rStaff1 = empty();
  rStaff1[0] = '주          임 ';
  rStaff1[2] = '매입청구서';
  rStaff1[7] = '02-3788-6116 (fax:714-0660)';
  rStaff1[12] = '청 구 서 접수일';
  rStaff1[13] = '매월  5일 限';
  rows.push(rStaff1);

  // 사원 행
  const rStaff2 = empty();
  rStaff2[0] = '사           원';
  rStaff2[2] = '자금   결제';
  rStaff2[7] = '02-3788-6115(fax:714-0660)';
  rStaff2[12] = '세 금 계 산 서';
  rStaff2[13] = '원본회수원칙';
  rows.push(rStaff2);

  // 마지막 행
  const rLast = empty();
  rLast[0] = ' 모두에게 사랑받는 알파인이 되겠습니다.';
  rows.push(rLast);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 열 너비 (원본 xlrd width 단위 / 256 ≈ 문자 수 근사)
  ws['!cols'] = [
    { wch: 11 }, // col0 사업장명
    { wch: 6 },  // col1 건수
    { wch: 6 },  // col2
    { wch: 7 },  // col3
    { wch: 4 },  // col4
    { wch: 5 },  // col5
    { wch: 4 },  // col6
    { wch: 6 },  // col7
    { wch: 5 },  // col8
    { wch: 5 },  // col9
    { wch: 7 },  // col10
    { wch: 5 },  // col11
    { wch: 14 }, // col12 결제액
    { wch: 16 }, // col13 비고
  ];

  XLSX.utils.book_append_sheet(wb, ws, '청구서');
  XLSX.writeFile(wb, `알파문구_종합청구서_${year}년${month}월.xlsx`);
}
