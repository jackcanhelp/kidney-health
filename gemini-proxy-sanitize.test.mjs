// Worker 請求白名單的回歸守衛：node gemini-proxy-sanitize.test.mjs
// 正向對照：三個頁面實際送出的請求形狀都要放行；反向：多餘欄位、超量、換模型都要擋或剝掉。
import assert from 'node:assert/strict';
import worker, { sanitizeRequest, LIMITS, MODEL } from './gemini-proxy-worker.js';

const IMG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ok = (b) => sanitizeRequest(b).ok;
let n = 0;
const t = (name, fn) => { fn(); n++; };

t('positive: shapes the three pages send', () => {
  // 鉀／磷掃描器：照片辨識
  assert.ok(ok({ contents: [{ parts: [{ text: 'p' }, { inline_data: { mime_type: 'image/jpeg', data: IMG } }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 800 } }));
  // 掃描器：從候選挑一筆（純文字）
  assert.ok(ok({ contents: [{ parts: [{ text: 'p' }] }], generationConfig: { temperature: 0, maxOutputTokens: 400 } }));
  // 今天吃甚麼：辨識與食譜（JSON 模式）
  assert.ok(ok({ contents: [{ parts: [{ text: 'p' }, { inline_data: { mime_type: 'image/jpeg', data: IMG } }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 400, responseMimeType: 'application/json' } }));
  assert.ok(ok({ contents: [{ parts: [{ text: 'p' }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1600, responseMimeType: 'application/json' } }));
});

t('extra fields are stripped, not forwarded', () => {
  const r = sanitizeRequest({
    contents: [{ role: 'user', parts: [{ text: 'p', thought: true }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 10, candidateCount: 8 },
    tools: [{ googleSearch: {} }], systemInstruction: { parts: [{ text: 'x' }] }, cachedContent: 'x',
  });
  assert.ok(r.ok);
  assert.deepEqual(r.body, { contents: [{ parts: [{ text: 'p' }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 10 } });
});

t('maxOutputTokens boundary', () => {
  const b = (m) => ({ contents: [{ parts: [{ text: 'p' }] }], generationConfig: { maxOutputTokens: m } });
  assert.ok(ok(b(LIMITS.maxOutputTokens - 1)));
  assert.ok(ok(b(LIMITS.maxOutputTokens)));
  assert.equal(ok(b(LIMITS.maxOutputTokens + 1)), false);
  assert.equal(ok(b(0)), false);
  assert.equal(ok(b(1.5)), false);
});

t('text length boundary', () => {
  const b = (len) => ({ contents: [{ parts: [{ text: 'a'.repeat(len) }] }] });
  assert.ok(ok(b(LIMITS.maxTextChars)));
  assert.equal(ok(b(LIMITS.maxTextChars + 1)), false);
  assert.equal(ok(b(0)), false);
});

t('shape limits', () => {
  const txt = { text: 'p' }, img = { inline_data: { mime_type: 'image/jpeg', data: IMG } };
  assert.equal(ok({ contents: [{ parts: [txt] }, { parts: [txt] }] }), false, 'multi-turn');
  assert.equal(ok({ contents: [{ parts: [txt, img, img] }] }), false, 'too many parts');
  assert.equal(ok({ contents: [{ parts: [img] }] }), false, 'image without text');
  assert.equal(ok({ contents: [{ parts: [txt, txt] }] }), false, 'two texts');
  assert.equal(ok({ contents: [{ parts: [txt, { inline_data: { mime_type: 'application/pdf', data: IMG } }] }] }), false, 'pdf');
  assert.equal(ok({ contents: [{ parts: [txt, { file_data: { file_uri: 'gs://x' } }] }] }), false, 'file_data');
  assert.equal(ok({ contents: [{ parts: [txt, { inline_data: { mime_type: 'image/jpeg', data: 'not base64!' } }] }] }), false, 'bad base64');
  assert.equal(ok({ contents: [{ parts: [txt] }], generationConfig: { temperature: 2 } }), false, 'temperature');
  assert.equal(ok({ contents: [{ parts: [txt] }], generationConfig: { responseMimeType: 'text/x.enum' } }), false, 'mime');
  assert.equal(ok(null), false);
  assert.equal(ok([]), false);
});

// 整支 handler：模型寫死（無視 ?model=）、轉送的是清理後的 body、來源白名單照舊
const sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response('{"candidates":[]}', { status: 200 }); };
const env = { GEMINI_API_KEY: 'test_key' };
const req = (origin, body, qs = '') => new Request('https://w.example/' + qs, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
});
const good = { contents: [{ parts: [{ text: 'p' }] }], generationConfig: { maxOutputTokens: 100 }, tools: [{ googleSearch: {} }] };

let r = await worker.fetch(req('https://jackcanhelp.org', good, '?model=gemini-2.5-pro'), env);
assert.equal(r.status, 200);
assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://jackcanhelp.org');
assert.match(sent[0].url, new RegExp(`/models/${MODEL}:generateContent`));
assert.doesNotMatch(sent[0].url, /pro/);
assert.equal(sent[0].body.tools, undefined);
n++;

r = await worker.fetch(req('https://jackcanhelp.org', { contents: [{ parts: [{ text: 'p' }] }], generationConfig: { maxOutputTokens: 99999 } }), env);
assert.equal(r.status, 400);
r = await worker.fetch(req('https://evil.example.com', good), env);
assert.equal(r.status, 403);
assert.equal(sent.length, 1, 'rejected requests must not reach Gemini');
n++;

console.log(`gemini-proxy sanitize: ${n} groups passed.`);
