import { createClient } from '@supabase/supabase-js'

// 🔴 신규 secret key(sb_secret_...) 를 서버 전용 환경변수로 사용.
//    레거시 service_role JWT (V1_SERVICE_KEY / OPS_SERVICE_KEY) 는 disable 예정.
const v1 = createClient(process.env.V1_SUPABASE_URL, process.env.V1_SECRET_KEY)
const OPS_URL = process.env.OPS_SUPABASE_URL
const OPS_KEY = process.env.OPS_SECRET_KEY

// OPS REST 직접 호출 (스키마 헤더 포함)
async function opsGet(table, params = '') {
  const res = await fetch(`${OPS_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: OPS_KEY,
      Authorization: `Bearer ${OPS_KEY}`,
      'Accept-Profile': 'mochicraft_demo',
    }
  })
  return res.json()
}

async function opsUpdate(table, body, filter) {
  const res = await fetch(`${OPS_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: OPS_KEY,
      Authorization: `Bearer ${OPS_KEY}`,
      'Content-Profile': 'mochicraft_demo',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body)
  })
  return res.ok ? null : await res.json()
}

const { data: v1Products, error: e1 } = await v1.from('products').select('코드, A, B, C, D, E')
if (e1) { console.error('v1 fetch 실패:', JSON.stringify(e1)); process.exit(1) }
console.log('v1 count:', v1Products.length)

const opsList = await opsGet('products', 'select=id,code')
if (!Array.isArray(opsList)) { console.error('OPS fetch 실패:', JSON.stringify(opsList)); process.exit(1) }
console.log('OPS count:', opsList.length)

const opsMap = new Map(opsList.map(p => [p.code.trim(), p.id]))

let updated = 0, notFound = 0
for (const p of v1Products) {
  const code = p['코드']?.toString().trim()
  if (!code) { notFound++; continue }
  const opsId = opsMap.get(code)
  if (!opsId) { notFound++; continue }
  const err = await opsUpdate('products', {
    grade_a: parseFloat(p['A']) || 0,
    grade_b: parseFloat(p['B']) || 0,
    grade_c: parseFloat(p['C']) || 0,
    grade_d: parseFloat(p['D']) || 0,
    grade_e: parseFloat(p['E']) || 0,
  }, `id=eq.${opsId}`)
  if (err) console.error('업데이트 실패', code, JSON.stringify(err))
  else updated++
}
console.log('완료: 업데이트', updated, '건, 미매칭', notFound, '건')