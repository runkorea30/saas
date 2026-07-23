// 항목 7 Phase 2 (실제 백필): _lineitems.json 을 읽어 제품 문서 60건의
// extracted_metadata 에 line_items 키만 병합(다른 키 보존)해 UPDATE.
import { readFile } from 'node:fs/promises';
import { config as loadDotenv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { db: { schema: 'mochicraft_demo' }, auth: { persistSession: false } });

const data = JSON.parse(await readFile('scripts/_phase7_temp/_lineitems.json', 'utf8'));
const targets = data.filter((d) => Array.isArray(d.line_items) && d.line_items.length > 0);
console.log(`백필 대상: ${targets.length}건`);

let ok = 0;
const errors = [];
for (const t of targets) {
  // 현재 metadata 재조회 → line_items 만 병합(다른 키 보존).
  const { data: cur, error: fErr } = await supabase
    .from('document_files')
    .select('extracted_metadata')
    .eq('id', t.id)
    .single();
  if (fErr || !cur) { errors.push({ doc: t.doc_no, e: fErr?.message ?? 'fetch fail' }); continue; }
  const merged = { ...(cur.extracted_metadata ?? {}), line_items: t.line_items };
  const { error: uErr } = await supabase
    .from('document_files')
    .update({ extracted_metadata: merged })
    .eq('id', t.id);
  if (uErr) { errors.push({ doc: t.doc_no, e: uErr.message }); continue; }
  ok++;
}
console.log(`UPDATE 성공: ${ok}/${targets.length}`);
if (errors.length) { console.log('에러:'); errors.forEach((e) => console.log('  ', JSON.stringify(e))); }
