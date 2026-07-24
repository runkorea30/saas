/**
 * 송금용 PDF 편집 — 인보이스 PDF 1페이지에 "ETD : {출발지} // ETA : {도착지}" 문구 삽입.
 *
 * 🟠 은행 송금 요청으로 삽입하는 1회성 산출물. 원본은 건드리지 않고 새 PDF 로 다운로드만.
 * 🟠 문구 삽입/미리보기/병합은 클라이언트(pdfjs + pdf-lib). 항목 17 금액요약만:
 *    제품/운임 합계는 기존 파이프라인(parseInvoicePDF, 서버) 재사용, Statement Amount Due 는 pdfjs 텍스트.
 * 🟠 위치: 1페이지 "BILL TO" 위(자동 탐지), 못 찾으면 수동 슬라이더(위에서 %)로 폴백.
 *    가로는 항상 페이지 중앙 정렬.
 */
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { parseInvoicePDF } from '@/utils/invoiceParser';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Phase 4: 이관/입고확정으로 등록된 인보이스 조회 버킷/카테고리. */
const STORAGE_BUCKET = 'documents';

/** Phase 4: 송금 도구에서 선택 가능한 등록 인보이스 1건(document_files angelus_invoice). */
interface RegisteredInvoice {
  id: string;
  file_name: string;
  file_path: string;
  doc_subtype: string | null;
  related_po_reference: string | null;
  extracted_doc_no: string | null;
  uploaded_at: string | null;
}

/** 등록 인보이스 드롭다운 표시 라벨. */
function registeredLabel(r: RegisteredInvoice): string {
  const ref = r.related_po_reference || r.extracted_doc_no || '—';
  const kind =
    r.doc_subtype === 'product'
      ? '제품'
      : r.doc_subtype === 'freight'
        ? '운임'
        : (r.doc_subtype ?? '기타');
  return `${ref} · ${kind} · ${r.file_name}`;
}

/** 삽입 문구 폰트 크기(pt) 및 BILL TO 위 여백(pt). */
const FONT_PTS = 10.5;
const GAP_ABOVE_BILLTO_PTS = 22;
/** 미리보기 캔버스 최대 가로(px). */
const PREVIEW_MAX_W = 520;

/** 지시서 007: 송금 요청이 매번 동일하므로 출발지/도착지 고정 기본값(수정 가능). */
const DEFAULT_ETD = 'Long Beach LA';
const DEFAULT_ETA = 'Incheon';

/** src PDF 의 모든 페이지를 dst 에 순서대로 복사해 이어붙임(항목 11·12 병합용). */
async function appendAllPages(
  dst: PDFDocument,
  src: PDFDocument,
): Promise<void> {
  const pages = await dst.copyPages(src, src.getPageIndices());
  pages.forEach((p) => dst.addPage(p));
}

interface PageInfo {
  widthPts: number;
  heightPts: number;
  /** 자동 탐지된 BILL TO 텍스트 baseline y (PDF 하단 기준, pt). 못 찾으면 null. */
  billToYPts: number | null;
}

/** 항목 17: 금액 추출 상태 — 로딩/성공(값)/실패(파싱 불가). */
type AmountInfo = { status: 'loading' | 'ok' | 'fail'; value: number | null };

/** USD 금액 표시. null 이면 '—'. */
function fmtUsd(n: number | null): string {
  if (n == null) return '—';
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * 항목 17: 제품/운임 인보이스 합계(USD) — 기존 파이프라인(parseInvoicePDF) 재사용해 rows[].amount 합.
 * 파싱 실패/빈 결과면 null(=금액 확인 필요, 에러로 막지 않음).
 */
async function extractInvoiceTotalUsd(file: File): Promise<number | null> {
  try {
    const parsed = await parseInvoicePDF(file);
    if (!parsed.rows.length) return null;
    const sum = parsed.rows.reduce(
      (s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0),
      0,
    );
    return sum > 0 ? sum : null;
  } catch {
    return null;
  }
}

/**
 * 항목 17: Statement PDF 의 "Amount Due" 금액(USD) — 클라이언트 pdfjs 텍스트에서 추출.
 * "$6,403.03" 형식(통화기호/콤마 포함) 고려. 실패 시 null.
 */
async function extractStatementAmountDue(file: File): Promise<number | null> {
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) })
      .promise;
    let text = '';
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += ` ${content.items
        .map((it) => (it as { str?: string }).str ?? '')
        .join(' ')}`;
    }
    await doc.destroy();
    const m = text.match(/Amount\s*Due[^$\d-]*\$?\s*([\d,]+\.\d{2})/i);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function EtdEtaStampTab() {
  const { showToast } = useToast();
  const { companyId } = useCompany();
  const [file, setFile] = useState<File | null>(null);
  // Phase 4: 등록 인보이스 선택 후 Storage fetch 진행 중 여부.
  const [pickBusy, setPickBusy] = useState(false);
  // 지시서 007: 고정 기본값으로 시작(수정 가능, 새로고침 시 다시 기본값).
  const [etd, setEtd] = useState(DEFAULT_ETD);
  const [eta, setEta] = useState(DEFAULT_ETA);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [useAuto, setUseAuto] = useState(true);
  /** 수동 모드 수직 위치 — 위에서부터 %. */
  const [topPct, setTopPct] = useState(28);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  // 항목 11: 페덱스 운임 인보이스를 제품 인보이스 뒤에 병합.
  const [mergeFreight, setMergeFreight] = useState(false);
  const [freightFile, setFreightFile] = useState<File | null>(null);
  // 항목 12: Statement PDF 를 맨 앞 페이지로 삽입.
  const [addStatement, setAddStatement] = useState(false);
  const [statementFile, setStatementFile] = useState<File | null>(null);
  // 항목 17: 금액 요약 — 제품/운임 합계 + Statement Amount Due(우선).
  const [productAmount, setProductAmount] = useState<AmountInfo | null>(null);
  const [freightAmount, setFreightAmount] = useState<AmountInfo | null>(null);
  const [statementAmount, setStatementAmount] = useState<AmountInfo | null>(
    null,
  );

  // 원본 PDF 바이트(pdf-lib 생성용) — state 로 안 두고 ref (재렌더 불필요).
  const bytesRef = useRef<ArrayBuffer | null>(null);
  // 렌더된 1페이지 원본 캔버스(오프스크린) — 오버레이 갱신 시 재사용.
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scaleRef = useRef(1);

  const stampText = `ETD : ${etd.trim() || '—'} // ETA : ${eta.trim() || '—'}`;

  /** 현재 설정으로 삽입 y(PDF 하단 기준 pt) 계산. */
  const computeStampYPts = (info: PageInfo): number => {
    if (useAuto && info.billToYPts != null) {
      return info.billToYPts + GAP_ABOVE_BILLTO_PTS;
    }
    return info.heightPts * (1 - topPct / 100);
  };

  /** base 캔버스(렌더된 페이지) 위에 문구 오버레이를 그려 미리보기 갱신. */
  const redrawPreview = (info: PageInfo) => {
    const base = baseCanvasRef.current;
    const view = previewCanvasRef.current;
    if (!base || !view) return;
    const ctx = view.getContext('2d');
    if (!ctx) return;
    view.width = base.width;
    view.height = base.height;
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(base, 0, 0);

    const scale = scaleRef.current;
    const stampYPts = computeStampYPts(info);
    const canvasY = (info.heightPts - stampYPts) * scale;
    const canvasX = view.width / 2;
    ctx.font = `${Math.round(FONT_PTS * scale)}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(stampText, canvasX, canvasY);
  };

  /** 항목 17: 파일에서 금액 추출 → 상태 반영(로딩→ok/fail). */
  const runAmountExtract = (
    f: File,
    extractor: (file: File) => Promise<number | null>,
    setter: (v: AmountInfo | null) => void,
  ) => {
    setter({ status: 'loading', value: null });
    void extractor(f).then((v) =>
      setter(
        v == null ? { status: 'fail', value: null } : { status: 'ok', value: v },
      ),
    );
  };

  const handlePickFreight = (f: File | null) => {
    setFreightFile(f);
    if (!f) {
      setFreightAmount(null);
      return;
    }
    runAmountExtract(f, extractInvoiceTotalUsd, setFreightAmount);
  };

  const handlePickStatement = (f: File | null) => {
    setStatementFile(f);
    if (!f) {
      setStatementAmount(null);
      return;
    }
    runAmountExtract(f, extractStatementAmountDue, setStatementAmount);
  };

  const handleFile = async (f: File) => {
    setLoading(true);
    try {
      const buf = await f.arrayBuffer();
      // pdf-lib 는 원본 바이트가 필요 — pdfjs 가 detach 하지 않도록 복제본 보관.
      bytesRef.current = buf.slice(0);

      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const page = await doc.getPage(1);
      const view = page.view; // [x0,y0,x1,y1] (pt)
      const widthPts = view[2] - view[0];
      const heightPts = view[3] - view[1];

      // BILL TO 자동 탐지 — 텍스트 아이템 중 "BILL" 포함 첫 항목의 baseline y.
      const content = await page.getTextContent();
      let billToYPts: number | null = null;
      for (const it of content.items) {
        const s = (it as { str?: string }).str ?? '';
        if (s.replace(/\s+/g, ' ').toUpperCase().includes('BILL')) {
          const tf = (it as { transform?: number[] }).transform;
          if (tf && tf.length >= 6) billToYPts = tf[5];
          break;
        }
      }

      // 미리보기 렌더 — 페이지 가로를 PREVIEW_MAX_W 에 맞춤.
      const scale = Math.min(PREVIEW_MAX_W / widthPts, 1.5);
      scaleRef.current = scale;
      const viewport = page.getViewport({ scale });
      const base = document.createElement('canvas');
      base.width = Math.ceil(viewport.width);
      base.height = Math.ceil(viewport.height);
      const bctx = base.getContext('2d');
      if (!bctx) throw new Error('캔버스 컨텍스트 생성 실패');
      await page.render({ canvasContext: bctx, viewport }).promise;
      baseCanvasRef.current = base;

      const info: PageInfo = { widthPts, heightPts, billToYPts };
      setPageInfo(info);
      setUseAuto(billToYPts != null);
      setFile(f);
      // 항목 17: 제품 인보이스 합계 추출(비동기, 미리보기 블로킹 안 함).
      runAmountExtract(f, extractInvoiceTotalUsd, setProductAmount);
      // 다음 렌더 프레임에서 오버레이(문구는 아직 빈 값이어도 위치 확인용).
      requestAnimationFrame(() => redrawPreview(info));

      if (billToYPts == null) {
        showToast({
          kind: 'info',
          text: '"BILL TO" 위치를 자동으로 찾지 못했습니다. 아래 슬라이더로 위치를 조정해 주세요.',
        });
      }
      await doc.destroy();
    } catch (e) {
      showToast({
        kind: 'error',
        text: `PDF 열기 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setLoading(false);
    }
  };

  // ───── Phase 4: 이관/입고확정으로 등록된 인보이스 목록(document_files angelus_invoice) ─────
  const { data: registeredInvoices = [] } = useQuery<RegisteredInvoice[]>({
    queryKey: ['remittance-registered-invoices', companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async () =>
      fetchAllRows<RegisteredInvoice>(() =>
        supabase
          .from('document_files')
          .select(
            'id, file_name, file_path, doc_subtype, related_po_reference, extracted_doc_no, uploaded_at',
          )
          .eq('company_id', companyId!)
          .eq('category', 'angelus_invoice')
          .order('uploaded_at', { ascending: false }),
      ),
  });

  /**
   * Phase 4: 등록 인보이스 선택 → Storage 에서 PDF 를 받아 File 로 만들어 기존 handleFile 에 태움.
   * (직접 업로드 경로와 동일한 스탬프/병합 파이프라인 재사용.)
   */
  const handlePickRegistered = async (id: string) => {
    const rec = registeredInvoices.find((r) => r.id === id);
    if (!rec?.file_path) return;
    setPickBusy(true);
    try {
      let blob: Blob | null = null;
      if (rec.file_path.startsWith('data:')) {
        blob = await (await fetch(rec.file_path)).blob();
      } else {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(rec.file_path);
        if (error) throw error;
        blob = data ?? null;
      }
      if (!blob) throw new Error('파일을 불러오지 못했습니다.');
      const picked = new File([blob], rec.file_name || 'invoice.pdf', {
        type: 'application/pdf',
      });
      await handleFile(picked);
    } catch (e) {
      showToast({
        kind: 'error',
        text: `등록 인보이스 불러오기 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setPickBusy(false);
    }
  };

  const handleGenerate = async () => {
    if (!bytesRef.current || !pageInfo || !file) return;
    if (!etd.trim() || !eta.trim()) {
      showToast({ kind: 'error', text: 'ETD / ETA 를 모두 입력해 주세요.' });
      return;
    }
    if (mergeFreight && !freightFile) {
      showToast({ kind: 'error', text: '병합할 운임 인보이스 PDF 를 선택해 주세요.' });
      return;
    }
    if (addStatement && !statementFile) {
      showToast({ kind: 'error', text: '맨 앞에 넣을 Statement PDF 를 선택해 주세요.' });
      return;
    }
    setGenerating(true);
    try {
      const pdfDoc = await PDFDocument.load(bytesRef.current.slice(0));
      const first = pdfDoc.getPages()[0];
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const textWidth = font.widthOfTextAtSize(stampText, FONT_PTS);
      const { width } = first.getSize();
      const stampYPts = computeStampYPts(pageInfo);
      first.drawText(stampText, {
        x: (width - textWidth) / 2,
        y: stampYPts,
        size: FONT_PTS,
        font,
        color: rgb(0.07, 0.07, 0.07),
      });

      // 항목 11·12: 병합 옵션이 있으면 [Statement] → [제품(ETD/ETA 삽입)] → [운임] 순으로 합침.
      const includeFreight = mergeFreight && Boolean(freightFile);
      const includeStatement = addStatement && Boolean(statementFile);
      const willMerge = includeFreight || includeStatement;
      let outDoc = pdfDoc;
      if (willMerge) {
        const merged = await PDFDocument.create();
        if (statementFile && includeStatement) {
          const sdoc = await PDFDocument.load(await statementFile.arrayBuffer());
          await appendAllPages(merged, sdoc);
        }
        await appendAllPages(merged, pdfDoc);
        if (freightFile && includeFreight) {
          const fdoc = await PDFDocument.load(await freightFile.arrayBuffer());
          await appendAllPages(merged, fdoc);
        }
        outDoc = merged;
      }
      const out = await outDoc.save();
      const baseName = file.name.replace(/\.pdf$/i, '');
      const suffix = willMerge ? '_송금용' : '_ETD-ETA';
      // pdf-lib save() 반환 Uint8Array 를 새 버퍼로 복사해 Blob 타입 호환.
      const blob = new Blob([new Uint8Array(out)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}${suffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      showToast({ kind: 'success', text: 'PDF 생성 완료 (다운로드됨)' });
    } catch (e) {
      showToast({
        kind: 'error',
        text: `PDF 생성 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 안내 */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          fontSize: 12.5,
          color: 'var(--ink-2)',
          lineHeight: 1.6,
        }}
      >
        인보이스 PDF 를 올리고 ETD/ETA 를 입력하면 <strong>1페이지</strong> "BILL TO" 위(가운데
        정렬)에 <code>ETD : ... // ETA : ...</code> 문구를 넣은 새 PDF 를 만들어 다운로드합니다.
        원본 파일은 변경되지 않습니다.
      </div>

      {/* 입력 영역 */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <label
          className="btn-base primary"
          style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? <Loader2 className="ico-sm animate-spin" /> : <FileText className="ico-sm" />}
          <span>{loading ? '여는 중…' : 'PDF 선택'}</span>
          <input
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            disabled={loading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void handleFile(f);
            }}
          />
        </label>
        {registeredInvoices.length > 0 && (
          <select
            value=""
            disabled={loading || pickBusy}
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = '';
              if (v) void handlePickRegistered(v);
            }}
            title="이관/입고확정으로 등록된 인보이스에서 선택"
            style={{
              height: 34,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid var(--line-strong)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 12.5,
              maxWidth: 300,
              fontFamily: 'var(--font-kr)',
              cursor: loading || pickBusy ? 'not-allowed' : 'pointer',
              opacity: loading || pickBusy ? 0.6 : 1,
            }}
          >
            <option value="">
              {pickBusy ? '불러오는 중…' : '등록된 인보이스에서 선택'}
            </option>
            {registeredInvoices.map((r) => (
              <option key={r.id} value={r.id}>
                {registeredLabel(r)}
              </option>
            ))}
          </select>
        )}

        {file && (
          <span style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
            {file.name}
          </span>
        )}

        <LabeledInput label="ETD (출발지)" value={etd} onChange={setEtd} placeholder="예: Long Beach LA" onInput={() => pageInfo && redrawPreview(pageInfo)} />
        <LabeledInput label="ETA (도착지)" value={eta} onChange={setEta} placeholder="예: Incheon" onInput={() => pageInfo && redrawPreview(pageInfo)} />

        <button
          type="button"
          className="btn-base primary"
          onClick={() => void handleGenerate()}
          disabled={!pageInfo || generating}
          style={{ marginLeft: 'auto', opacity: !pageInfo || generating ? 0.6 : 1 }}
        >
          {generating ? <Loader2 className="ico-sm animate-spin" /> : <FileText className="ico-sm" />}
          <span>{generating ? '생성 중…' : 'PDF 생성'}</span>
        </button>
      </div>

      {/* 항목 17: 금액 요약 (제품/운임 합계 + Statement Amount Due 우선) */}
      {productAmount && (
        <AmountSummaryCard
          productAmount={productAmount}
          freightAmount={freightAmount}
          statementAmount={statementAmount}
          showFreight={mergeFreight && Boolean(freightFile)}
          showStatement={addStatement && Boolean(statementFile)}
        />
      )}

      {/* 위치 조정 */}
      {pageInfo && (
        <div
          style={{
            padding: '10px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
            <input
              type="checkbox"
              checked={useAuto}
              disabled={pageInfo.billToYPts == null}
              onChange={(e) => {
                setUseAuto(e.target.checked);
                requestAnimationFrame(() => redrawPreview(pageInfo));
              }}
            />
            BILL TO 위 자동 배치
            {pageInfo.billToYPts == null && (
              <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>(자동 탐지 실패)</span>
            )}
          </label>

          {!useAuto && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', flex: 1, minWidth: 220 }}>
              <span>수직 위치(위에서 %)</span>
              <input
                type="range"
                min={0}
                max={100}
                value={topPct}
                onChange={(e) => {
                  setTopPct(Number(e.target.value));
                  requestAnimationFrame(() => redrawPreview(pageInfo));
                }}
                style={{ flex: 1 }}
              />
              <span style={{ width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{topPct}%</span>
            </label>
          )}
        </div>
      )}

      {/* 은행 송금용 병합 옵션 (항목 11·12) — PDF 선택 전에도 항상 노출. */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
          은행 송금용 병합 옵션
        </div>
        <MergePdfRow
          label="Statement 맨 앞 페이지로 추가"
          checked={addStatement}
          onToggleChecked={setAddStatement}
          file={statementFile}
          onPickFile={handlePickStatement}
        />
        <MergePdfRow
          label="페덱스 운임 인보이스 병합 (제품 인보이스 뒤에 추가)"
          checked={mergeFreight}
          onToggleChecked={setMergeFreight}
          file={freightFile}
          onPickFile={handlePickFreight}
        />
      </div>

      {/* 미리보기 */}
      <div
        style={{
          padding: 16,
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          justifyContent: 'center',
          minHeight: 120,
        }}
      >
        {pageInfo ? (
          <canvas
            ref={previewCanvasRef}
            style={{
              maxWidth: '100%',
              border: '1px solid var(--line)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
              background: '#fff',
            }}
          />
        ) : (
          <span style={{ fontSize: 13, color: 'var(--ink-3)', alignSelf: 'center' }}>
            PDF 를 선택하면 1페이지 미리보기가 표시됩니다.
          </span>
        )}
      </div>
    </div>
  );
}

/** AmountInfo → 표시 문자열. 항목 17. */
function amountText(a: AmountInfo | null): string {
  if (!a) return '—';
  if (a.status === 'loading') return '계산 중…';
  if (a.status === 'fail') return '금액 확인 필요';
  return fmtUsd(a.value);
}

/** 금액 요약 한 줄. */
function AmountRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12.5,
      }}
    >
      <span style={{ color: 'var(--ink-2)' }}>{label}</span>
      <span
        style={{
          color: 'var(--ink)',
          fontWeight: strong ? 700 : 500,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** 항목 17: 금액 요약 카드 — 제품/운임 합계 + 소계, Statement 있으면 Amount Due 우선 강조. */
function AmountSummaryCard({
  productAmount,
  freightAmount,
  statementAmount,
  showFreight,
  showStatement,
}: {
  productAmount: AmountInfo | null;
  freightAmount: AmountInfo | null;
  statementAmount: AmountInfo | null;
  showFreight: boolean;
  showStatement: boolean;
}) {
  const okVals: number[] = [];
  if (productAmount?.status === 'ok' && productAmount.value != null) {
    okVals.push(productAmount.value);
  }
  if (
    showFreight &&
    freightAmount?.status === 'ok' &&
    freightAmount.value != null
  ) {
    okVals.push(freightAmount.value);
  }
  const subtotal = okVals.length
    ? okVals.reduce((s, v) => s + v, 0)
    : null;

  return (
    <div
      style={{
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
        금액 요약
      </div>
      <AmountRow label="제품 인보이스 합계" value={amountText(productAmount)} />
      {showFreight && (
        <AmountRow label="운임 인보이스 합계" value={amountText(freightAmount)} />
      )}
      <AmountRow
        label="소계 (제품 + 운임)"
        value={subtotal != null ? fmtUsd(subtotal) : '—'}
        strong
      />
      {showStatement && (
        <div
          style={{
            marginTop: 4,
            padding: '10px 12px',
            background: 'var(--accent-wash, var(--surface-2))',
            border: '1px solid var(--accent, #6b7cff)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}
            >
              실제 송금 금액 (Statement 기준)
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {amountText(statementAmount)}
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            Statement 기준 금액이 우선 적용됩니다. 개별 인보이스 합계와 차이가 있을
            수 있습니다.
          </span>
        </div>
      )}
    </div>
  );
}

/** 병합 옵션 한 줄 — 체크박스 + (체크 시)PDF 파일 선택. 항목 11·12 공용. */
function MergePdfRow({
  label,
  checked,
  onToggleChecked,
  file,
  onPickFile,
}: {
  label: string;
  checked: boolean;
  onToggleChecked: (v: boolean) => void;
  file: File | null;
  onPickFile: (f: File | null) => void;
}) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
    >
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12.5,
          color: 'var(--ink-2)',
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggleChecked(e.target.checked)}
        />
        {label}
      </label>
      {checked && (
        <>
          <label
            className="btn-base"
            style={{ cursor: 'pointer', height: 30, padding: '0 10px', fontSize: 12 }}
          >
            <FileText className="ico-sm" />
            <span>{file ? '파일 변경' : 'PDF 선택'}</span>
            <input
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = '';
                onPickFile(f);
              }}
            />
          </label>
          {file && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--ink-3)',
                maxWidth: 220,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={file.name}
            >
              {file.name}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  onInput,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onInput: () => void;
}) {
  return (
    <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onInput();
        }}
        placeholder={placeholder}
        style={{
          height: 32,
          width: 170,
          padding: '0 10px',
          borderRadius: 6,
          border: '1px solid var(--line-strong)',
          background: 'var(--surface)',
          color: 'var(--ink)',
          fontSize: 12.5,
          fontFamily: 'var(--font-kr)',
        }}
      />
    </label>
  );
}
