/**
 * Claude 직접 호출 테스트 — sample-fedex.pdf 로 완화된 프롬프트가 true 를 뱉는지 확인.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { FEDEX_IS_DECLARATION_PROMPT } from '../api/_shared/emailIngest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
loadDotenv({ path: path.join(REPO_ROOT, '.env.local') });
loadDotenv({ path: path.join(REPO_ROOT, '.env') });

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  const pdf = readFileSync(path.join(REPO_ROOT, 'samples', 'sample-fedex.pdf'));
  const b64 = pdf.toString('base64');
  console.log(`PDF size: ${pdf.length} bytes / base64 ${b64.length}`);
  console.log('Calling Claude…');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
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
                data: b64,
              },
            },
            { type: 'text', text: FEDEX_IS_DECLARATION_PROMPT },
          ],
        },
      ],
    }),
  });
  console.log('status:', res.status, res.statusText);
  const bodyText = await res.text();
  console.log('body:', bodyText);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
