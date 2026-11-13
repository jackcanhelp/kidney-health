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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
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

      // 模型固定，忽略任何 ?model= 參數
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clean.body),
      });

      const responseBody = await geminiResponse.text();

      return new Response(responseBody, {
        status: geminiResponse.status,
        headers: {
          'Content-Type': 'application/json',
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
