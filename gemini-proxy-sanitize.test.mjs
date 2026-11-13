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

// ---- Z.ai 備援 ----
import { toZaiRequest, fromZaiResponse, ZAI_VISION_MODELS, ZAI_TEXT_MODELS } from './gemini-proxy-worker.js';

// 格式轉換：有圖用看圖模型、圖片轉 data URL；純文字用文字模型；JSON 模式只給文字模型
{
  const v = toZaiRequest(sanitizeRequest({ contents: [{ parts: [{ text: 'p' }, { inline_data: { mime_type: 'image/jpeg', data: IMG } }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 400, responseMimeType: 'application/json' } }).body);
  assert.equal(v.model, ZAI_VISION_MODELS[0]);
  assert.equal(v.messages[0].content[0].image_url.url, 'data:image/jpeg;base64,' + IMG);
  assert.equal(v.messages[0].content[1].text, 'p');
  assert.equal(v.max_tokens, 400);
  assert.equal(v.temperature, 0.3);
  assert.equal(v.response_format, undefined);
  const t2 = toZaiRequest(sanitizeRequest({ contents: [{ parts: [{ text: 'q' }] }], generationConfig: { maxOutputTokens: 1600, responseMimeType: 'application/json' } }).body);
  assert.equal(t2.model, ZAI_TEXT_MODELS[0]);
  assert.equal(t2.messages[0].content, 'q');
  assert.deepEqual(t2.response_format, { type: 'json_object' });
  assert.deepEqual(fromZaiResponse({ choices: [{ message: { content: '{"a":1}' } }] }), { candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] });
  assert.equal(fromZaiResponse({ choices: [] }), null);
  assert.equal(fromZaiResponse(null), null);
  n++;
}

// 路由：Gemini 429 → 改打 Z.ai；沒設 ZAI 金鑰就照回 429；X-Provider 可強制任一家
{
  let geminiStatus = 429;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('generativelanguage')) {
      calls.push('gemini');
      return new Response(geminiStatus === 200 ? '{"candidates":[{"content":{"parts":[{"text":"G"}]}}]}' : '{"error":{"code":429}}', { status: geminiStatus });
    }
    calls.push('zai');
    assert.equal(init.headers.Authorization, 'Bearer zai_test');
    return new Response('{"choices":[{"message":{"content":"Z"}}]}', { status: 200 });
  };
  const env2 = { GEMINI_API_KEY: 'g', ZAI_API_KEY: 'zai_test' };
  const body = { contents: [{ parts: [{ text: 'p' }] }] };
  const mk = (h = {}) => new Request('https://w.example/', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://jackcanhelp.org', ...h }, body: JSON.stringify(body) });
  const textOf = async (r) => (await r.json()).candidates[0].content.parts[0].text;

  const G3 = ['gemini', 'gemini', 'gemini']; // flash-lite + 兩個同 key 的免費備援模型
  let r = await worker.fetch(mk(), env2);
  assert.equal(r.status, 200); assert.equal(await textOf(r), 'Z'); assert.equal(r.headers.get('X-Provider-Used'), 'zai:' + ZAI_TEXT_MODELS[0]);
  assert.deepEqual(calls.splice(0), [...G3, 'zai']);

  geminiStatus = 200;
  r = await worker.fetch(mk(), env2);
  assert.equal(await textOf(r), 'G'); assert.deepEqual(calls.splice(0), ['gemini'], 'Gemini 正常時不打 Z.ai');

  geminiStatus = 500;
  r = await worker.fetch(mk(), env2);
  assert.equal(r.status, 500); assert.deepEqual(calls.splice(0), ['gemini'], '只有 429 才備援');

  geminiStatus = 429;
  r = await worker.fetch(mk(), { GEMINI_API_KEY: 'g' });
  assert.equal(r.status, 429); assert.deepEqual(calls.splice(0), G3, '沒設 ZAI 金鑰不備援');

  r = await worker.fetch(mk({ 'X-Provider': 'gemini' }), env2);
  assert.equal(r.status, 429); assert.deepEqual(calls.splice(0), G3, '強制 gemini 不跨家備援');

  r = await worker.fetch(mk({ 'X-Provider': 'zai' }), env2);
  assert.equal(await textOf(r), 'Z'); assert.deepEqual(calls.splice(0), ['zai']);

  r = await worker.fetch(new Request('https://w.example/', { method: 'OPTIONS', headers: { Origin: 'https://jackcanhelp.org' } }), env2);
  assert.match(r.headers.get('Access-Control-Allow-Headers'), /X-Provider/);
  n++;
}

// Z.ai 模型輪替：第一個 1305 過載就換下一個；全部失敗回最後的錯誤
{
  const tried = [];
  let okModel = ZAI_TEXT_MODELS[1];
  globalThis.fetch = async (url, init) => {
    const m = JSON.parse(init.body).model; tried.push(m);
    if (m === okModel) return new Response('{"choices":[{"message":{"content":"Z2"}}]}', { status: 200 });
    return new Response('{"error":{"code":"1305"}}', { status: 429 });
  };
  const env3 = { GEMINI_API_KEY: 'g', ZAI_API_KEY: 'k' };
  const mk = () => new Request('https://w.example/', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://jackcanhelp.org', 'X-Provider': 'zai' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'p' }] }] }) });
  let r = await worker.fetch(mk(), env3);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('X-Provider-Used'), 'zai:' + okModel);
  assert.deepEqual(tried.splice(0), ZAI_TEXT_MODELS.slice(0, 2));
  okModel = 'none';
  r = await worker.fetch(mk(), env3);
  assert.equal(r.status, 429);
  assert.deepEqual(tried.splice(0), ZAI_TEXT_MODELS);
  n++;
}

// ---- Gemini 同 key 換模型、Workers AI 備援 ----
import { GEMINI_FALLBACK_MODELS, CF_MODELS, toCfInput, fromCfResponse } from './gemini-proxy-worker.js';
{
  // Gemini：429 / 404 換下一個模型；其他錯誤（如 400、500）不換；URL 只會是清單內的模型
  const urls = [];
  let statusOf = () => 429;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    const m = /models\/([^:]+):/.exec(String(url))[1];
    const st = statusOf(m);
    return new Response(st === 200 ? '{"candidates":[{"content":{"parts":[{"text":"' + m + '"}]}}]}' : '{}', { status: st });
  };
  const mk = (h = {}) => new Request('https://w.example/', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://jackcanhelp.org', ...h }, body: JSON.stringify({ contents: [{ parts: [{ text: 'p' }] }] }) });
  statusOf = (m) => (m === GEMINI_FALLBACK_MODELS[0] ? 200 : 429);
  let r = await worker.fetch(mk(), { GEMINI_API_KEY: 'g' });
  assert.equal(r.status, 200); assert.equal(r.headers.get('X-Provider-Used'), 'gemini:' + GEMINI_FALLBACK_MODELS[0]);
  assert.equal(urls.splice(0).length, 2);
  statusOf = (m) => (m === MODEL ? 404 : m === GEMINI_FALLBACK_MODELS[0] ? 404 : 200);
  r = await worker.fetch(mk(), { GEMINI_API_KEY: 'g' });
  assert.equal(r.headers.get('X-Provider-Used'), 'gemini:' + GEMINI_FALLBACK_MODELS[1]);
  urls.splice(0);
  statusOf = () => 500;
  r = await worker.fetch(mk(), { GEMINI_API_KEY: 'g' });
  assert.equal(r.status, 500); assert.equal(urls.splice(0).length, 1, '500 不換模型');
  statusOf = () => 200;
  r = await worker.fetch(mk(), { GEMINI_API_KEY: 'g' });
  assert.equal(r.headers.get('X-Provider-Used'), 'gemini', '正常時只打 flash-lite');
  assert.equal(urls.splice(0).length, 1);

  // Workers AI：Gemini 全部 429 → cf；cf 回兩種形狀都認得；cf 拋錯換下一個模型；全部失敗才輪到 Z.ai
  statusOf = () => 429;
  const ran = [];
  let cfBehavior = () => ({ response: 'C' });
  const AI = { run: async (model, input) => { ran.push(model); return cfBehavior(model, input); } };
  r = await worker.fetch(mk(), { GEMINI_API_KEY: 'g', AI });
  assert.equal(r.status, 200); assert.equal(r.headers.get('X-Provider-Used'), 'cf:' + CF_MODELS[0]);
  assert.equal((await r.json()).candidates[0].content.parts[0].text, 'C');
  assert.deepEqual(ran.splice(0), [CF_MODELS[0]]); urls.splice(0);

  cfBehavior = (m) => { if (m === CF_MODELS[0]) throw new Error('daily neurons exceeded'); return { choices: [{ message: { content: 'C2' } }] }; };
  r = await worker.fetch(mk({ 'X-Provider': 'cf' }), { GEMINI_API_KEY: 'g', AI });
  assert.equal(r.headers.get('X-Provider-Used'), 'cf:' + CF_MODELS[1]);
  assert.equal(urls.length, 0, '強制 cf 不打 Gemini');
  ran.splice(0);

  cfBehavior = () => { throw new Error('daily neurons exceeded'); };
  globalThis.fetch = async (url) => {
    if (String(url).includes('generativelanguage')) return new Response('{}', { status: 429 });
    return new Response('{"choices":[{"message":{"content":"Z"}}]}', { status: 200 });
  };
  r = await worker.fetch(mk(), { GEMINI_API_KEY: 'g', AI, ZAI_API_KEY: 'k' });
  assert.match(r.headers.get('X-Provider-Used'), /^zai:/, 'cf 用完才輪到 Z.ai');
  r = await worker.fetch(mk(), { GEMINI_API_KEY: 'g', AI });
  assert.equal(r.status, 429, 'cf 用完又沒 Z.ai → 照回 429 讓前端顯示額度用完');

  // 格式
  const img = toCfInput(sanitizeRequest({ contents: [{ parts: [{ text: 'p' }, { inline_data: { mime_type: 'image/jpeg', data: IMG } }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 400 } }).body);
  assert.equal(img.messages[0].content[0].image_url.url, 'data:image/jpeg;base64,' + IMG);
  assert.equal(img.max_tokens, 400); assert.equal(img.temperature, 0.3); assert.equal(img.model, undefined); assert.equal(img.thinking, undefined);
  assert.deepEqual(fromCfResponse({ response: { a: 1 } }), { candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] });
  assert.equal(fromCfResponse({ response: '' }), null);
  assert.equal(fromCfResponse(null), null);
  n++;
}

console.log(`gemini-proxy sanitize: ${n} groups passed.`);
