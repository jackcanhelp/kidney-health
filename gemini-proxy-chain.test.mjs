// 供應商順序回歸測試：免費 key（2.5 → 3.5 → 3.1）→ 付費 key（3.5 → 3.1）→ Workers AI → Z.ai。
// 跑法： node gemini-proxy-chain.test.mjs
import worker, { geminiKeys } from './gemini-proxy-worker.js';

const ORIGIN = 'https://jackcanhelp.org';
const OK_BODY = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
const GOOD = { contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 100 } };

let calls;
// statusFor(key, model) → HTTP status the mock Gemini returns
function mockFetch(statusFor) {
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    const key = u.searchParams.get('key');
    const model = u.pathname.split('/models/')[1].split(':')[0];
    calls.push({ key, model, body: JSON.parse(init.body) });
    const status = statusFor(key, model);
    return new Response(status === 200 ? OK_BODY : '{"error":{}}', { status });
  };
}
function req(body, headers = {}) {
  return new Request('https://gemini-proxy.example/', {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
const cfEnv = (env) => ({ ...env, AI: { run: async () => ({ response: 'cf ok' }) } });

let pass = 0, fail = 0;
async function t(name, fn) {
  calls = [];
  try { await fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }

await t('geminiKeys: free first, dedupe, skip empty', () => {
  eq(geminiKeys({ GEMINI_PAID_API_KEY: 'P', GEMINI_API_KEY: 'F' }), ['F', 'P'], 'both');
  eq(geminiKeys({ GEMINI_API_KEY: 'F' }), ['F'], 'free only');
  eq(geminiKeys({ GEMINI_PAID_API_KEY: 'P' }), ['P'], 'paid only');
  eq(geminiKeys({ GEMINI_PAID_API_KEY: 'X', GEMINI_API_KEY: 'X' }), ['X'], 'same key once');
  eq(geminiKeys({ GEMINI_PAID_API_KEY: '', GEMINI_API_KEY: '' }), [], 'none');
});

await t('free key 2.5 answers first; paid key untouched', async () => {
  mockFetch(() => 200);
  const res = await worker.fetch(req(GOOD), { GEMINI_PAID_API_KEY: 'P', GEMINI_API_KEY: 'F' });
  eq(res.status, 200, 'status');
  eq(res.headers.get('X-Provider-Used'), 'gemini', 'provider');
  eq(calls.map(c => c.key + ':' + c.model), ['F:gemini-2.5-flash-lite'], 'calls');
});

await t('free key 429 on every model → paid key starts at 3.5 (never 2.5)', async () => {
  mockFetch((key) => (key === 'F' ? 429 : 200));
  const res = await worker.fetch(req(GOOD), { GEMINI_PAID_API_KEY: 'P', GEMINI_API_KEY: 'F' });
  eq(res.status, 200, 'status');
  eq(res.headers.get('X-Provider-Used'), 'gemini-paid:gemini-3.5-flash-lite', 'provider');
  eq(calls.map(c => c.key + ':' + c.model), ['F:gemini-2.5-flash-lite', 'F:gemini-3.5-flash-lite', 'F:gemini-3.1-flash-lite', 'P:gemini-3.5-flash-lite'], 'calls');
});

await t('both keys exhausted → Workers AI', async () => {
  mockFetch(() => 429);
  const res = await worker.fetch(req(GOOD), cfEnv({ GEMINI_PAID_API_KEY: 'P', GEMINI_API_KEY: 'F' }));
  eq(res.status, 200, 'status');
  eq(res.headers.get('X-Provider-Used').startsWith('cf:'), true, 'provider is cf');
  eq(calls.length, 5, 'tried 3 free + 2 paid models');
});

await t('main model 429 + fallback models 404 → still falls through to Workers AI', async () => {
  mockFetch((key, model) => (model === 'gemini-2.5-flash-lite' ? 429 : 404));
  const res = await worker.fetch(req(GOOD), cfEnv({ GEMINI_PAID_API_KEY: 'P', GEMINI_API_KEY: 'F' }));
  eq(res.status, 200, 'status');
  eq(res.headers.get('X-Provider-Used').startsWith('cf:'), true, 'provider is cf');
});

await t('same key in both secrets is tried only once per model', async () => {
  mockFetch(() => 429);
  await worker.fetch(req(GOOD), { GEMINI_PAID_API_KEY: 'X', GEMINI_API_KEY: 'X' });
  eq(calls.length, 3, 'three models, one key');
});

await t('exception message never leaks the key', async () => {
  globalThis.fetch = async (url) => { throw new Error('failed request ' + url); };
  const res = await worker.fetch(req(GOOD), { GEMINI_PAID_API_KEY: 'SECRET_P' });
  const text = await res.text();
  eq(res.status, 500, 'status');
  eq(text.includes('SECRET_P'), false, 'key absent');
});

await t('non-429 error from free key is returned, not retried on paid key', async () => {
  mockFetch(() => 400);
  const res = await worker.fetch(req(GOOD), { GEMINI_PAID_API_KEY: 'P', GEMINI_API_KEY: 'F' });
  eq(res.status, 400, 'status');
  eq(calls.length, 1, 'one call');
});

await t('free key only still works (paid secret not set)', async () => {
  mockFetch(() => 200);
  const res = await worker.fetch(req(GOOD), { GEMINI_API_KEY: 'F' });
  eq(res.status, 200, 'status');
  eq(calls.map(c => c.key), ['F'], 'keys');
});

await t('paid key only (free secret not set) starts at 3.5', async () => {
  mockFetch(() => 200);
  await worker.fetch(req(GOOD), { GEMINI_PAID_API_KEY: 'P' });
  eq(calls.map(c => c.model), ['gemini-3.5-flash-lite'], 'model');
});

await t('no key at all → 500', async () => {
  mockFetch(() => 200);
  const res = await worker.fetch(req(GOOD), {});
  eq(res.status, 500, 'status');
  eq(calls.length, 0, 'no upstream call');
});

await t('extra fields (tools, systemInstruction) never reach the paid key', async () => {
  mockFetch(() => 200);
  const evil = { ...GOOD, tools: [{ googleSearch: {} }], systemInstruction: { parts: [{ text: 'x' }] } };
  const res = await worker.fetch(req(evil), { GEMINI_PAID_API_KEY: 'P' });
  eq(res.status, 200, 'status');
  eq(Object.keys(calls[0].body).sort(), ['contents', 'generationConfig'], 'forwarded keys');
});

await t('?model= is ignored (cannot pick a pricier model)', async () => {
  mockFetch(() => 200);
  const r = new Request('https://gemini-proxy.example/?model=gemini-3.8-pro', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(GOOD),
  });
  await worker.fetch(r, { GEMINI_PAID_API_KEY: 'P' });
  eq(calls[0].model.includes('pro'), false, 'model');
});

await t('X-Provider: gemini stops at Gemini (no Workers AI)', async () => {
  mockFetch(() => 429);
  const res = await worker.fetch(req(GOOD, { 'X-Provider': 'gemini' }), cfEnv({ GEMINI_PAID_API_KEY: 'P', GEMINI_API_KEY: 'F' }));
  eq(res.status, 429, 'status');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
