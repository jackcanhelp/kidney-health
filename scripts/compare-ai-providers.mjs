// 「今天吃甚麼？」AI 供應商品質對比：同一批照片、同一份提示，分別強制走 Gemini 與 Z.ai。
// 提示直接從 what-to-eat.html 抽出來執行，避免測試用的提示和線上不一致。
//
// 用法：node scripts/compare-ai-providers.mjs <照片資料夾> <gemini|zai|cf> <輸出.json>
//   照片檔名就是正確答案，例如 高麗菜.jpg。會打線上 Worker，每張照片用掉 1 次額度，食譜再 2 次。
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [dir, provider, outFile] = process.argv.slice(2);
if (!dir || !['gemini', 'zai', 'cf'].includes(provider) || !outFile) {
  console.error('usage: node scripts/compare-ai-providers.mjs <photo-dir> <gemini|zai|cf> <out.json>');
  process.exit(2);
}
const ROOT = new URL('..', import.meta.url);
const WORKER = 'https://gemini-proxy.a5170159.workers.dev';

await import(new URL('food-lookup.js', ROOT));
await import(new URL('what-to-eat-rules.js', ROOT));
const FoodLookup = globalThis.FoodLookup, R = globalThis.WhatToEatRules;
const db = JSON.parse(await readFile(new URL('food-nutrients.json', ROOT), 'utf8')).foods
  .filter((f) => typeof f.k === 'number').map(R.fromNutrientRow);

// ---- 從頁面抽出提示 ----
const html = await readFile(new URL('what-to-eat.html', ROOT), 'utf8');
const grab = (re, what) => { const m = re.exec(html); if (!m) throw new Error('cannot extract ' + what); return m[1]; };
const STYLE_TEXT = new Function('return ' + grab(/var STYLE_TEXT = (\{[^;]+\});/, 'STYLE_TEXT'))();
const TFDA_CATEGORIES = new Function('return ' + grab(/var TFDA_CATEGORIES = (\[[^;]+\]);/, 'TFDA_CATEGORIES'))();
const identifyPrompt = new Function('TFDA_CATEGORIES', 'return ' + grab(/function identify\(base64\) \{\s*var prompt = ([\s\S]+?);\s*return callGemini/, 'identify prompt'))(TFDA_CATEGORIES);
const recipeSrc = grab(/(function recipePrompt\(usable, avoided\) \{[\s\S]+?\n    \})/, 'recipePrompt');
const makeRecipePrompt = (mode, style) => new Function('R', 'FoodLookup', 'STYLE_TEXT', 'mode', 'style', recipeSrc + '\nreturn recipePrompt;')(R, FoodLookup, STYLE_TEXT, mode, style);

async function call(parts, maxTokens) {
  const t0 = Date.now();
  const res = await fetch(WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://jackcanhelp.org', 'X-Provider': provider },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens, responseMimeType: 'application/json' } }),
  });
  const ms = Date.now() - t0;
  const used = res.headers.get('X-Provider-Used');
  const raw = await res.text();
  if (!res.ok) return { ok: false, status: res.status, used, ms, error: raw.slice(0, 300) };
  let text;
  try { text = JSON.parse(raw).candidates[0].content.parts[0].text; } catch (e) { return { ok: false, status: res.status, used, ms, error: 'no text: ' + raw.slice(0, 200) }; }
  try { return { ok: true, used, ms, json: JSON.parse(text.replace(/```json\s*|```/g, '').trim()), text }; }
  catch (e) { return { ok: false, status: 200, used, ms, error: 'bad JSON', text: text.slice(0, 300) }; }
}

function resolve(ai) {
  const m = R.matchFood([ai.name].concat(ai.tfda_terms || []), db);
  const item = m.best
    ? { name: ai.name, dbName: m.best.name, potassium: m.best.potassium, protein: m.best.protein, category: m.best.category, estimated: false }
    : { name: ai.name, dbName: '', potassium: typeof ai.est_potassium === 'number' ? ai.est_potassium : null, category: ai.category || '', estimated: true };
  return { ...item, verdict: R.verdict(item).label };
}

const results = { provider, at: new Date().toISOString(), identify: [], recipes: [] };
const photos = (await readdir(dir)).filter((f) => /\.jpe?g$/i.test(f)).sort();
for (const f of photos) {
  const answer = path.parse(f).name;
  const b64 = (await readFile(path.join(dir, f))).toString('base64');
  const r = await call([{ text: identifyPrompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }], 400);
  const row = { answer, ok: r.ok, used: r.used, ms: r.ms };
  if (r.ok) {
    const items = (r.json.items || []).map(resolve);
    Object.assign(row, { items, aiNames: (r.json.items || []).map((x) => x.name) });
  } else Object.assign(row, { status: r.status, error: r.error, text: r.text });
  results.identify.push(row);
  console.log(`${answer}\t${r.ok ? row.items.map((x) => `${x.name}→${x.dbName || '(估計)'} ${x.potassium}mg ${x.verdict}`).join(' / ') : 'FAIL ' + r.status + ' ' + (r.error || '').slice(0, 80)}\t${r.ms}ms ${r.used}`);
}

// 兩道固定食譜情境（不依賴辨識結果，兩家可直接比）
const mk = (name) => resolve({ name, tfda_terms: [] });
const SCENARIOS = [
  { mode: 'predialysis', style: 'chinese', usable: ['高麗菜', '雞胸肉', '白飯', '胡蘿蔔'], avoided: ['菠菜'] },
  { mode: 'dialysis', style: 'western', usable: ['馬鈴薯', '鮭魚', '番茄', '洋蔥'], avoided: ['楊桃'] },
];
for (const s of SCENARIOS) {
  const usable = s.usable.map(mk), avoided = s.avoided.map(mk);
  const r = await call([{ text: makeRecipePrompt(s.mode, s.style)(usable, avoided) }], 1600);
  const row = { scenario: `${s.mode}/${s.style}`, ok: r.ok, used: r.used, ms: r.ms };
  if (r.ok) {
    const rc = r.json;
    const ingNames = (rc.ingredients || []).map((x) => x.name).join('、');
    const stepsText = (rc.steps || []).join(' ');
    Object.assign(row, {
      recipe: rc,
      checks: {
        hasFields: !!(rc.title && Array.isArray(rc.ingredients) && rc.ingredients.length && Array.isArray(rc.steps) && rc.steps.length),
        blanchStep: /汆燙|川燙|焯/.test(stepsText),
        noAvoidedInIngredients: !s.avoided.some((a) => ingNames.includes(a)),
        noFlaggedSeasoning: !R.flagRecipeIngredients(rc.ingredients).some((x) => x.avoid),
        noPotassiumNumbers: !/\d+\s*(mg|毫克)/i.test(JSON.stringify(rc)),
      },
    });
  } else Object.assign(row, { status: r.status, error: r.error, text: r.text });
  results.recipes.push(row);
  console.log(`食譜 ${row.scenario}\t${r.ok ? row.recipe.title + ' ' + JSON.stringify(row.checks) : 'FAIL ' + r.status + ' ' + (r.error || '').slice(0, 120)}\t${r.ms}ms ${r.used}`);
}

await writeFile(outFile, JSON.stringify(results, null, 1), 'utf8');
console.log('saved', outFile);
