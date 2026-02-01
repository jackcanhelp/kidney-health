// Cloudflare Worker: Gemini API Proxy
// 部署步驟：
// 1. 登入 Cloudflare Dashboard → Workers & Pages → Create Worker
// 2. 命名為 gemini-proxy → Deploy
// 3. 編輯程式碼，貼上此檔案內容 → Save and Deploy
// 4. Settings → Variables and Secrets → Add → Name: GEMINI_API_KEY, Type: Secret, Value: 你的 API key
// 5. 記下 Worker URL: https://gemini-proxy.{你的subdomain}.workers.dev
// 6. 將該 URL 填入 HTML 檔案中的 WORKER_ENDPOINT 變數

const ALLOWED_ORIGINS = [
  'https://jackcanhelp.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

function isOriginAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
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
      const body = await request.json();

      // Determine model from request path or default
      const url = new URL(request.url);
      const model = url.searchParams.get('model') || 'gemini-2.5-flash-lite';

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
