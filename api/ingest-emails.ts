/**
 * 문서관리 이메일 자동 수집 API — 사용자가 "지금 메일 확인" 버튼을 누를 때 호출.
 *
 * 감지 대상:
 *  - 발신자에 "fedex" 포함 → import_declaration (수입면장)
 *  - 발신자가 "@angelusshoepolish.com" 로 끝남 → angelus_invoice (엔젤러스 인보이스)
 *
 * IMAP 조회 조건:
 *  - 최근 30일 이내 전체 메일 (읽음/안읽음 무관)
 *  - 처리 결과와 상관없이 Seen 플래그는 절대 변경하지 않음
 *  - 중복 처리 방지는 email_ingest_log.message_id UNIQUE 제약으로만 판단
 *
 * 처리 흐름 (메일 1건):
 *  1) email_ingest_log INSERT (message_id UNIQUE → 이미 처리된 메일이면 스킵)
 *  2) PDF 첨부파일을 Storage `documents` 버킷에 업로드
 *  3) Claude API 로 메타데이터 추출 (실패해도 파일 자체는 저장)
 *  4) document_files INSERT (source='email_auto')
 *  5) email_ingest_log 상태 갱신 (processed / skipped / error)
 *
 * 환경변수:
 *  - GMAIL_USER, GMAIL_APP_PASSWORD (기존)
 *  - ANTHROPIC_API_KEY (기존)
 *  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (신규 — 서버 전용 write)
 *  - EMAIL_INGEST_COMPANY_ID (신규 — dogfooding 대상 회사 UUID)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImapFlow } from 'imapflow';
import { simpleParser, type Attachment as MailAttachment } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60,
};

type MatchedCategory = 'import_declaration' | 'angelus_invoice';

const IMAP_HOST = 'imap.gmail.com';
const IMAP_PORT = 993;
const MAX_MESSAGES_PER_RUN = 30;
const INGEST_WINDOW_DAYS = 30;
const STORAGE_BUCKET = 'documents';

const SENDER_FILTERS: Array<{
  category: MatchedCategory;
  imapFrom: string;
}> = [
  { category: 'import_declaration', imapFrom: 'fedex' },
  { category: 'angelus_invoice', imapFrom: '@angelusshoepolish.com' },
];

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

const FEDEX_PROMPT = `이 페덱스 수입 관련 PDF에서 아래 필드를 추출해 JSON 하나만 응답하세요.
{
  "doc_no": "수입신고번호 (없으면 null)",
  "doc_date": "신고일자 YYYY-MM-DD (없으면 null)",
  "transport_type": "air | sea | null",
  "mawb_hawb": "MAWB 또는 HAWB 번호 (없으면 null)"
}
찾을 수 없으면 null. 마크다운/설명 없이 { 로 시작 } 로 끝나는 JSON 만 출력.`;

const ANGELUS_PROMPT = `이 엔젤러스 인보이스 PDF에서 아래 필드를 추출해 JSON 하나만 응답하세요.
{
  "invoice_no": "인보이스 번호 (없으면 null)",
  "po_reference": "PO/주문 참조번호 (없으면 null)",
  "doc_subtype": "proforma | revised | final | unknown",
  "has_amount": true,
  "has_freight": false
}
분류 근거:
 - 문서 상단 제목("Proforma Invoice" → proforma, "Revised" 표시 → revised, "Commercial Invoice" 이면서 Freight 포함 → final).
 - 운송비(Freight/Shipping) 항목이 있으면 has_freight=true, 최종본일 가능성 높음.
 - 판단 불가 시 doc_subtype="unknown".
찾을 수 없으면 null. 마크다운/설명 없이 { 로 시작 } 로 끝나는 JSON 만 출력.`;

interface FedexMeta {
  doc_no: string | null;
  doc_date: string | null;
  transport_type: 'air' | 'sea' | null;
  mawb_hawb: string | null;
}

interface AngelusMeta {
  invoice_no: string | null;
  po_reference: string | null;
  doc_subtype: 'proforma' | 'revised' | 'final' | 'unknown' | null;
  has_amount: boolean | null;
  has_freight: boolean | null;
}

interface RunSummary {
  scanned: number;
  processed: number;
  skipped: number;
  errors: number;
  hasMore: boolean;
  details: Array<{ uid: number; status: string; note?: string }>;
}

function classifySender(from: string): MatchedCategory | null {
  const lower = from.toLowerCase();
  if (lower.includes('fedex')) return 'import_declaration';
  if (/@angelusshoepolish\.com>?/.test(lower)) return 'angelus_invoice';
  return null;
}

function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function pdfAttachments(atts: MailAttachment[] | undefined): MailAttachment[] {
  if (!atts) return [];
  return atts.filter((a) => {
    const ct = (a.contentType ?? '').toLowerCase();
    const name = (a.filename ?? '').toLowerCase();
    return ct === 'application/pdf' || name.endsWith('.pdf');
  });
}

async function callClaude(
  apiKey: string,
  pdfBase64: string,
  prompt: string,
): Promise<string | null> {
  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = json.content?.find((c) => c.type === 'text')?.text;
    return text ?? null;
  } catch {
    return null;
  }
}

function parseJsonLoose<T>(text: string | null): T | null {
  if (!text) return null;
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const companyId = process.env.EMAIL_INGEST_COMPANY_ID;

  const missing: string[] = [];
  if (!gmailUser) missing.push('GMAIL_USER');
  if (!gmailPass) missing.push('GMAIL_APP_PASSWORD');
  if (!anthropicKey) missing.push('ANTHROPIC_API_KEY');
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!companyId) missing.push('EMAIL_INGEST_COMPANY_ID');
  if (missing.length > 0) {
    res
      .status(500)
      .json({ error: `환경변수 누락: ${missing.join(', ')}` });
    return;
  }

  const supabase = createClient(supabaseUrl!, supabaseServiceKey!, {
    db: { schema: 'mochicraft_demo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary: RunSummary = {
    scanned: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    hasMore: false,
    details: [],
  };

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: gmailUser!, pass: gmailPass! },
    logger: false,
  });

  try {
    await client.connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[ingest-emails] IMAP 접속 실패:', message);
    res.status(502).json({ error: `IMAP 접속 실패: ${message}` });
    return;
  }

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(
        Date.now() - INGEST_WINDOW_DAYS * 24 * 3600 * 1000,
      );

      const matchedUids = new Map<number, MatchedCategory>();
      for (const f of SENDER_FILTERS) {
        const hits =
          (await client.search({ since, from: f.imapFrom })) || [];
        for (const uid of hits) {
          if (!matchedUids.has(uid)) matchedUids.set(uid, f.category);
        }
      }

      const sortedUids = Array.from(matchedUids.keys()).sort((a, b) => b - a);
      summary.scanned = sortedUids.length;
      const targetUids = sortedUids.slice(0, MAX_MESSAGES_PER_RUN);
      summary.hasMore = sortedUids.length > targetUids.length;

      for (const uid of targetUids) {
        try {
          const msg = await client.fetchOne(
            String(uid),
            { source: true, envelope: true, uid: true },
            { uid: true },
          );
          if (!msg || !msg.source) {
            summary.details.push({ uid, status: 'no-source' });
            continue;
          }

          const parsed = await simpleParser(msg.source);
          const fromText = parsed.from?.text ?? '';
          const category =
            classifySender(fromText) ?? matchedUids.get(uid) ?? null;
          if (!category) {
            summary.details.push({ uid, status: 'no-match' });
            continue;
          }

          const messageId =
            parsed.messageId ??
            `no-msgid-${uid}-${msg.envelope?.date?.toISOString() ?? Date.now()}`;
          const subject = parsed.subject ?? null;
          const receivedAt =
            parsed.date?.toISOString() ??
            msg.envelope?.date?.toISOString() ??
            null;

          const { data: logRow, error: logErr } = await supabase
            .from('email_ingest_log')
            .insert({
              company_id: companyId!,
              message_id: messageId,
              sender: fromText,
              subject,
              received_at: receivedAt,
              matched_category: category,
              status: 'processed',
            })
            .select('id')
            .single();

          if (logErr) {
            if (logErr.code === '23505') {
              summary.skipped++;
              summary.details.push({ uid, status: 'dup-message-id' });
              continue;
            }
            throw logErr;
          }
          const logId = logRow!.id as string;

          const pdfs = pdfAttachments(parsed.attachments);
          if (pdfs.length === 0) {
            await supabase
              .from('email_ingest_log')
              .update({
                status: 'skipped',
                error_message: 'no-pdf-attachment',
                processed_at: new Date().toISOString(),
              })
              .eq('id', logId);
            summary.skipped++;
            summary.details.push({ uid, status: 'no-pdf' });
            continue;
          }

          let firstDocFileId: string | null = null;
          for (let i = 0; i < pdfs.length; i++) {
            const att = pdfs[i];
            const rawName = att.filename ?? `attachment-${i + 1}.pdf`;
            const filename = safeFileName(rawName);
            const storagePath = `email-auto/${companyId}/${encodeURIComponent(
              messageId,
            )}/${i}-${filename}`;

            const { error: upErr } = await supabase.storage
              .from(STORAGE_BUCKET)
              .upload(storagePath, att.content, {
                contentType: 'application/pdf',
                upsert: true,
              });
            if (upErr) throw new Error(`Storage 업로드 실패: ${upErr.message}`);

            const pdfBase64 = att.content.toString('base64');
            const claudeText = await callClaude(
              anthropicKey!,
              pdfBase64,
              category === 'import_declaration' ? FEDEX_PROMPT : ANGELUS_PROMPT,
            );

            let extractedDocNo: string | null = null;
            let extractedDocDate: string | null = null;
            let docSubtype: string | null = null;
            let poRef: string | null = null;
            let extractedMetadata: Record<string, unknown> = {};

            if (category === 'import_declaration') {
              const meta = parseJsonLoose<FedexMeta>(claudeText);
              if (meta) {
                extractedDocNo = meta.doc_no;
                extractedDocDate = meta.doc_date;
                extractedMetadata = {
                  transport_type: meta.transport_type,
                  mawb_hawb: meta.mawb_hawb,
                };
              }
            } else {
              const meta = parseJsonLoose<AngelusMeta>(claudeText);
              if (meta) {
                extractedDocNo = meta.invoice_no;
                docSubtype = meta.doc_subtype ?? 'unknown';
                poRef = meta.po_reference;
                extractedMetadata = {
                  has_amount: meta.has_amount,
                  has_freight: meta.has_freight,
                };
              }
            }

            const uniqueEmailKey =
              pdfs.length === 1 ? messageId : `${messageId}#${i}`;

            const { data: docRow, error: docErr } = await supabase
              .from('document_files')
              .insert({
                company_id: companyId!,
                category,
                file_name: rawName,
                file_path: storagePath,
                file_size: att.size ?? null,
                mime_type: 'application/pdf',
                uploaded_at: new Date().toISOString(),
                source: 'email_auto',
                email_message_id: uniqueEmailKey,
                email_from: fromText,
                email_received_at: receivedAt,
                extracted_doc_no: extractedDocNo,
                extracted_doc_date: extractedDocDate,
                doc_subtype: docSubtype,
                subtype_confirmed: false,
                related_po_reference: poRef,
                extracted_metadata: extractedMetadata,
              })
              .select('id')
              .single();

            if (docErr) throw docErr;
            if (i === 0) firstDocFileId = docRow!.id as string;
          }

          await supabase
            .from('email_ingest_log')
            .update({
              status: 'processed',
              document_file_id: firstDocFileId,
              processed_at: new Date().toISOString(),
            })
            .eq('id', logId);

          summary.processed++;
          summary.details.push({ uid, status: 'processed' });
        } catch (perMsgErr) {
          const message =
            perMsgErr instanceof Error ? perMsgErr.message : String(perMsgErr);
          summary.errors++;
          summary.details.push({ uid, status: 'error', note: message });
          try {
            await supabase
              .from('email_ingest_log')
              .update({
                status: 'error',
                error_message: message,
                processed_at: new Date().toISOString(),
              })
              .eq('company_id', companyId!)
              .is('processed_at', null)
              .order('id', { ascending: false })
              .limit(1);
          } catch {
            // 로그 갱신 실패는 삼킴
          }
        }
      }

    } finally {
      lock.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[ingest-emails] 처리 중 오류:', message);
    try {
      await client.logout();
    } catch {
      /* noop */
    }
    res.status(500).json({ error: message, summary });
    return;
  }

  try {
    await client.logout();
  } catch {
    /* noop */
  }

  res.status(200).json({ ok: true, summary });
}
