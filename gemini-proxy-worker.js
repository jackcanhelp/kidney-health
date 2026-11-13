// Cloudflare Worker: Gemini API Proxy
// 部署步驟：
// 1. 登入 Cloudflare Dashboard → Workers & Pages → Create Worker
// 2. 命名為 gemini-proxy → Deploy
// 3. 編輯程式碼，貼上此檔案內容 → Save and Deploy
// 4. Settings → Variables and Secrets → Add → Name: GEMINI_API_KEY, Type: Secret, Value: 你的 API key
// 5. 記下 Worker URL: https://gemini-proxy.{你的subdomain}.workers.dev
// 6. 將該 URL 填入 HTML 檔案中的 WORKER_ENDPOINT 變數

// 正式來源：必須「完全相同」才算數。
// 2026-09-09 網站搬到自訂網域 jackcanhelp.org，這份清單當時漏了跟著改，
// 兩支掃描器因此在新網域上一律拿到 403。舊的 github.io 保留，讓當時還開著的分頁不會斷。
const ALLOWED_ORIGINS = [
  'https://jackcanhelp.org',
  'https://www.jackcanhelp.org',
  'https://jackcanhelp.github.io',
];

// 本機開發：只允許 localhost / 127.0.0.1，port 可有可無。
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isOriginAllowed(origin) {
  if (!origin) return false;
  // 精確比對，不用 startsWith：前綴比對會把 https://jackcanhelp.org.evil.com
  // 之類的冒充網域一起放行，等於讓任何人拿這支 Worker 燒 Gemini 額度。
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
}

// 模型寫死：不再讀 ?model=。2026-11-13 實測帶偽造 Origin 加 ?model=gemini-2.5-pro
// 也會被轉送，等於任何人都能用這支 Worker 換成較貴的模型燒額度。
export const MODEL = 'gemini-2.5-flash-lite';

// 請求白名單（預設拒絕）：只放行鉀、磷掃描器與「今天吃甚麼？」實際用到的欄位，
// 其餘一律丟掉後重組，不把呼叫者的物件原樣轉給 Gemini。
export const LIMITS = {
  maxBodyBytes: 6 * 1024 * 1024,   // 一張手機照片 base64 後通常 < 1 MB，留餘裕
  maxTextChars: 12000,             // 單一文字段落（含候選清單的提示）
  maxImageBase64Chars: 5 * 1024 * 1024,
  maxParts: 2,                     // 一段文字 + 至多一張圖
  maxOutputTokens: 2048,           // 三個頁面目前最高用到 1600
};
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const RESPONSE_MIME = ['application/json', 'text/plain'];

export function sanitizeRequest(body) {
  const fail = (error) => ({ ok: false, error });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('bad body');
  const contents = body.contents;
  if (!Array.isArray(contents) || contents.length !== 1) return fail('contents must have exactly 1 entry');
  const parts = contents[0] && contents[0].parts;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > LIMITS.maxParts) return fail('bad parts');

  const cleanParts = [];
  let images = 0;
  let texts = 0;
  for (const p of parts) {
    if (!p || typeof p !== 'object') return fail('bad part');
    if (typeof p.text === 'string' && !p.inline_data) {
      if (!p.text || p.text.length > LIMITS.maxTextChars) return fail('text too long');
      texts++;
      cleanParts.push({ text: p.text });
    } else if (p.inline_data && p.text === undefined) {
      const d = p.inline_data;
      if (!IMAGE_MIME.includes(d.mime_type)) return fail('bad image type');
      if (typeof d.data !== 'string' || !d.data || d.data.length > LIMITS.maxImageBase64Chars) return fail('bad image');
      if (!/^[A-Za-z0-9+/=]+$/.test(d.data)) return fail('image not base64');
      images++;
      cleanParts.push({ inline_data: { mime_type: d.mime_type, data: d.data } });
    } else {
      return fail('unsupported part');
    }
  }
  if (texts !== 1 || images > 1) return fail('need 1 text and at most 1 image');

  const gc = body.generationConfig || {};
  if (typeof gc !== 'object') return fail('bad generationConfig');
  const cleanGc = {};
  if (gc.temperature !== undefined) {
    if (typeof gc.temperature !== 'number' || gc.temperature < 0 || gc.temperature > 1) return fail('bad temperature');
    cleanGc.temperature = gc.temperature;
  }
  const mot = gc.maxOutputTokens === undefined ? 1024 : gc.maxOutputTokens;
  if (!Number.isInteger(mot) || mot < 1 || mot > LIMITS.maxOutputTokens) return fail('bad maxOutputTokens');
  cleanGc.maxOutputTokens = mot;
  if (gc.responseMimeType !== undefined) {
    if (!RESPONSE_MIME.includes(gc.responseMimeType)) return fail('bad responseMimeType');
    cleanGc.responseMimeType = gc.responseMimeType;
  }
  return { ok: true, body: { contents: [{ parts: cleanParts }], generationConfig: cleanGc } };
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Provider',
    'Access-Control-Expose-Headers': 'X-Provider-Used',
    'Access-Control-Max-Age': '86400',
  };
}

// flash-lite 額度用完（429）或模型不存在（404）時，同一把 key 改試下一個免費模型。
// Gemini 額度依「專案 × 模型」計算（官方：Limits vary depending on the specific model being used），
// 所以這是同一個專案內換模型，不是多帳號輪替。清單只放定價頁標示免費、可看圖的 flash-lite。
export const GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

async function callGeminiModel(model, body, env) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text(), provider: model === MODEL ? 'gemini' : 'gemini:' + model };
}

async function callGemini(body, env) {
  // 模型清單寫死，忽略任何 ?model= 參數
  let result;
  for (const model of [MODEL, ...GEMINI_FALLBACK_MODELS]) {
    result = await callGeminiModel(model, body, env);
    if (result.status !== 429 && result.status !== 404) return result;
  }
  return result;
}

// ---- Cloudflare Workers AI 備援：Worker 綁定名稱 AI，不需金鑰；免費 10,000 neurons／日，不拿輸入訓練 ----
export const CF_MODELS = ['@cf/google/gemma-4-26b-a4b-it', '@cf/meta/llama-4-scout-17b-16e-instruct'];

export function toCfInput(geminiBody) {
  const z = toZaiRequest(geminiBody);
  const input = { messages: z.messages, max_tokens: z.max_tokens };
  if (z.temperature !== undefined) input.temperature = z.temperature;
  return input;
}

/* Workers AI 回應有兩種形狀：{response} 或 OpenAI 的 {choices}；response 在 JSON 模式可能已是物件。 */
export function fromCfResponse(out) {
  if (!out) return null;
  let text = out.response;
  if (text && typeof text === 'object') text = JSON.stringify(text);
  if (typeof text !== 'string' || !text) return fromZaiResponse(out);
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

async function callCf(geminiBody, env) {
  if (!env.AI) return { status: 500, body: JSON.stringify({ error: 'Workers AI not bound' }), provider: 'cf' };
  const input = toCfInput(geminiBody);
  let last;
  for (const model of CF_MODELS) {
    try {
      const shaped = fromCfResponse(await env.AI.run(model, input));
      if (shaped) return { status: 200, body: JSON.stringify(shaped), provider: 'cf:' + model };
      last = { status: 502, body: JSON.stringify({ error: 'Workers AI returned no text' }), provider: 'cf:' + model };
    } catch (e) {
      // 每日 neurons 用完也會拋錯；只回錯誤訊息，不含任何憑證
      last = { status: 429, body: JSON.stringify({ error: 'Workers AI: ' + String(e && e.message || e).slice(0, 200) }), provider: 'cf:' + model };
    }
  }
  return last;
}

// ---- Z.ai（智譜 GLM）備援：只用免費方案的模型 ----
export const ZAI_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
// 都是價格表上標 Free 的模型。依序嘗試：前一個過載（1305）或失敗就換下一個。
// 2026-11-13 13:20 實測 glm-4.7-flash、glm-4.6v-flash 連 5 次 1305，所以文字改以 glm-4.5-flash 優先。
export const ZAI_VISION_MODELS = ['glm-4.6v-flash'];
export const ZAI_TEXT_MODELS = ['glm-4.5-flash', 'glm-4.7-flash'];

export function hasImage(geminiBody) {
  return geminiBody.contents[0].parts.some((p) => p.inline_data);
}

/* 已清理過的 Gemini 格式請求 → Z.ai（OpenAI 相容）格式。 */
export function toZaiRequest(geminiBody, model) {
  const parts = geminiBody.contents[0].parts;
  const text = parts.find((p) => p.text !== undefined).text;
  const img = parts.find((p) => p.inline_data);
  const gc = geminiBody.generationConfig || {};
  const req = {
    model: model || (img ? ZAI_VISION_MODELS[0] : ZAI_TEXT_MODELS[0]),
    messages: [{
      role: 'user',
      content: img
        ? [
            { type: 'image_url', image_url: { url: `data:${img.inline_data.mime_type};base64,${img.inline_data.data}` } },
            { type: 'text', text },
          ]
        : text,
    }],
    max_tokens: gc.maxOutputTokens,
    thinking: { type: 'disabled' }, // 不要先「思考」：會吃掉 max_tokens 又變慢
  };
  if (gc.temperature !== undefined) req.temperature = gc.temperature;
  // 文件寫明只有文字模型支援 response_format
  if (!img && gc.responseMimeType === 'application/json') req.response_format = { type: 'json_object' };
  return req;
}

/* Z.ai 回應 → 前端認得的 Gemini 形狀；取不到文字回 null。 */
export function fromZaiResponse(data) {
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof text !== 'string' || !text) return null;
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

async function callZai(geminiBody, env) {
  if (!env.ZAI_API_KEY) return { status: 500, body: JSON.stringify({ error: 'Backup provider not configured' }), provider: 'zai' };
  const models = hasImage(geminiBody) ? ZAI_VISION_MODELS : ZAI_TEXT_MODELS;
  let last;
  for (const model of models) {
    const res = await fetch(ZAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ZAI_API_KEY}` },
      body: JSON.stringify(toZaiRequest(geminiBody, model)),
    });
    const raw = await res.text();
    if (res.status === 401) return { status: 500, body: JSON.stringify({ error: 'Backup provider auth failed' }), provider: 'zai:' + model };
    if (!res.ok) {
      // 錯誤內容原樣保留（不含金鑰），換下一個模型；全部失敗才回傳最後一個錯誤
      last = { status: res.status, body: raw, provider: 'zai:' + model };
      continue;
    }
    let data;
    try { data = JSON.parse(raw); } catch (e) { data = null; }
    const shaped = fromZaiResponse(data);
    if (!shaped) { last = { status: 502, body: JSON.stringify({ error: 'Backup provider returned no text' }), provider: 'zai:' + model }; continue; }
    return { status: 200, body: JSON.stringify(shaped), provider: 'zai:' + model };
  }
  return last;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      if (isOriginAllowed(origin)) {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      return new Response('Forbidden', { status: 403 });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Verify origin
    if (!isOriginAllowed(origin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check API key is configured
    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    try {
      const declared = Number(request.headers.get('Content-Length') || 0);
      if (declared > LIMITS.maxBodyBytes) {
        return new Response(JSON.stringify({ error: 'Request too large' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }
      const raw = await request.text();
      if (raw.length > LIMITS.maxBodyBytes) {
        return new Response(JSON.stringify({ error: 'Request too large' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }
      let parsed;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      const clean = sanitizeRequest(parsed);
      if (!clean.ok) {
        return new Response(JSON.stringify({ error: 'Request not allowed: ' + clean.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }

      // 供應商：預設 Gemini（flash-lite → 其他免費 flash-lite）→ 仍 429 才依序改打 Workers AI、Z.ai。
      // X-Provider 只能指定這三家免費模型之一（品質對比測試用），換不到較貴的模型。
      const want = (request.headers.get('X-Provider') || '').toLowerCase();
      let result;
      if (want === 'zai') {
        result = await callZai(clean.body, env);
      } else if (want === 'cf') {
        result = await callCf(clean.body, env);
      } else {
        result = await callGemini(clean.body, env);
        if (want !== 'gemini' && result.status === 429 && env.AI) result = await callCf(clean.body, env);
        if (want !== 'gemini' && result.status === 429 && env.ZAI_API_KEY) result = await callZai(clean.body, env);
      }

      return new Response(result.body, {
        status: result.status,
        headers: {
          'Content-Type': 'application/json',
          'X-Provider-Used': result.provider,
          ...corsHeaders(origin),
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }
  },
};
