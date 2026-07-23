/**
 * 송금용 PDF 편집 — 인보이스 PDF 1페이지에 "ETD : {출발지} // ETA : {도착지}" 문구 삽입.
 *
 * 🟠 은행 송금 요청으로 삽입하는 1회성 산출물. 원본은 건드리지 않고 새 PDF 로 다운로드만.
 * 🟠 완전 클라이언트 처리 — pdfjs(좌표추출/미리보기) + pdf-lib(텍스트 삽입). 서버 왕복 없음.
 * 🟠 위치: 1페이지 "BILL TO" 위(자동 탐지), 못 찾으면 수동 슬라이더(위에서 %)로 폴백.
 *    가로는 항상 페이지 중앙 정렬.
 */
import { useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

export function EtdEtaStampTab() {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
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
          onPickFile={setStatementFile}
        />
        <MergePdfRow
          label="페덱스 운임 인보이스 병합 (제품 인보이스 뒤에 추가)"
          checked={mergeFreight}
          onToggleChecked={setMergeFreight}
          file={freightFile}
          onPickFile={setFreightFile}
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
