/**
 * BillingPrintView DOM 요소를 캡처해서 A4 PDF (base64) 로 변환.
 *
 * - html2canvas 로 element 를 1장의 이미지로 캡처 (scale 2 → 해상도 확보)
 * - jsPDF 로 A4 단일/다중 페이지에 분할 삽입
 * - 결과: 순수 base64 문자열 (data URI prefix 제외) — Gmail 첨부용
 *
 * 🟠 element 는 화면에 보여야(보이지 않더라도 0x0 이 아닌 실제 크기) 캡처 가능.
 *   호출부에서 off-screen 컨테이너(position:absolute; left:-99999px) 에 렌더 후 넘긴다.
 */
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function generateBillingPdfBase64(
  element: HTMLElement,
): Promise<string> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // 캔버스 비율 유지 → 폭을 페이지에 맞추고 높이를 환산.
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  if (imgHeight <= pageHeight) {
    // 1페이지에 들어가는 경우.
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      0,
      0,
      imgWidth,
      imgHeight,
    );
  } else {
    // 다중 페이지 — 캔버스를 페이지 높이 단위로 잘라서 추가.
    const pageCanvasHeightPx = Math.floor(
      (pageHeight * canvas.width) / pageWidth,
    );
    let renderedHeightPx = 0;
    let isFirst = true;
    while (renderedHeightPx < canvas.height) {
      const sliceHeight = Math.min(
        pageCanvasHeightPx,
        canvas.height - renderedHeightPx,
      );
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context 획득 실패');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        renderedHeightPx,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight,
      );

      const sliceImgHeight = (sliceHeight * pageWidth) / canvas.width;
      if (!isFirst) pdf.addPage();
      pdf.addImage(
        sliceCanvas.toDataURL('image/png'),
        'PNG',
        0,
        0,
        imgWidth,
        sliceImgHeight,
      );
      isFirst = false;
      renderedHeightPx += sliceHeight;
    }
  }

  // jsPDF datauristring → 'data:application/pdf;base64,xxxx'
  // 쉼표 뒤만 잘라서 순수 base64 반환.
  const dataUri = pdf.output('datauristring');
  return dataUri.split(',')[1] ?? '';
}
