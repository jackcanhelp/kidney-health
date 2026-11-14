// 挑食材目錄與常備食譜庫的守衛：node what-to-eat-recipes.test.mjs
// 食譜是寫死的衛教內容，這裡把「寫食譜的規則」逐道檢查，新增食譜時漏掉汆燙或用錯調味料會直接失敗。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import(new URL('./what-to-eat-rules.js', import.meta.url));
await import(new URL('./what-to-eat-recipes.js', import.meta.url));
const R = globalThis.WhatToEatRules, W = globalThis.WhatToEatRecipes;
const db = JSON.parse(await readFile(new URL('./food-nutrients.json', import.meta.url), 'utf8')).foods
  .filter((f) => typeof f.k === 'number').map(R.fromNutrientRow);

let n = 0;
const t = (name, fn) => { fn(); n++; };
const lookup = (key) => R.matchFood([key], db).best;

t('every catalog item resolves to a sensible TFDA row', () => {
  const expect = {
    地瓜: '白皮甘藷', 小黃瓜: '花胡瓜(有機)', 米粉: '細米粉', 吐司: '土司', 雞腿肉: '清腿平均值', 綠花椰菜: '青花菜(2021年取樣)',
    蝦仁: '白對蝦平均值', 義大利麵: '通心麵', 雞胸肉: '去皮清肉平均值', 豆腐: '傳統豆腐', 高麗菜: '甘藍平均值',
  };
  for (const c of W.CATALOG) {
    const b = lookup(c.key);
    assert.ok(b, `${c.key} 查不到食藥署資料`);
    if (expect[c.key]) assert.equal(b.name, expect[c.key], c.key);
    assert.ok(W.GROUPS.some((g) => g.id === c.group), c.key + ' group');
  }
  assert.equal(new Set(W.CATALOG.map((c) => c.key)).size, W.CATALOG.length, 'duplicate keys');
});

t('avoid verdicts in the picker', () => {
  const v = (k) => { const b = lookup(k); return R.verdict({ name: k, dbName: b.name, potassium: b.potassium, category: b.category }).code; };
  assert.equal(v('楊桃'), 'avoid');
  assert.equal(v('菠菜'), 'avoid');
  assert.equal(v('高麗菜'), 'ok');
  assert.equal(v('香蕉'), 'caution');
});

W.indexDb(db, R);

t('keyOf: exact names and TFDA row names only (no substring guessing)', () => {
  const k = (name, dbName) => W.keyOf({ name, dbName });
  assert.equal(k('雞胸肉'), '雞胸肉');
  assert.equal(k('雞肉', '去皮清肉平均值'), '雞胸肉');
  assert.equal(k('土雞胸', '去皮清肉(土雞)'), '雞胸肉');
  assert.equal(k('豬絞肉'), '豬絞肉');
  assert.equal(k('豬肉'), '豬肉');
  assert.equal(k('五花', '豬大里肌'), '豬肉');
  assert.equal(k('蛋'), '雞蛋');
  assert.equal(k('紅蘿蔔'), '胡蘿蔔');
  assert.equal(k('小番茄'), '番茄');
  assert.equal(k('番薯'), '地瓜');
  assert.equal(k('番薯葉'), '地瓜葉');
  assert.equal(k('綠花椰'), '綠花椰菜');
  assert.equal(k('花椰菜'), '花椰菜');
  assert.equal(k('紫甘藍', '甘藍平均值'), '高麗菜');
  assert.equal(k('火龍果'), null);
  // Codex 審查反例：子字串不能算數
  assert.equal(k('皮蛋', '皮蛋'), null);
  assert.equal(k('鹹蛋'), null);
  assert.equal(k('玉米粉', '玉米粉'), null);
  assert.equal(k('蝦米'), null);
  assert.equal(k('蛋餅'), null);
  assert.ok(!W.matchRecipes([k('皮蛋', '皮蛋'), '洋蔥'].filter(Boolean), 'default').some((x) => x.recipe.needs.flat().includes('雞蛋')));
});

// ---- 每道食譜都要守規則 ----
const BANNED = /低鈉鹽|薄鹽|代鹽|雞精|高湯塊|雞湯塊|番茄醬|沙茶|蠔油|芝麻醬|豆瓣醬|喝湯|味噌|韓式辣醬|豆豉|豆腐乳|咖哩塊|起司|牛奶|鮮奶油|堅果|乾香菇|蝦米|柴魚|海帶|紫菜|火腿|培根|香腸/;
const BLANCH = /汆燙|川燙/;
const PROTEIN_GROUPS = ['egg', 'meat', 'sea'];
const TUBERS = ['馬鈴薯', '地瓜'];
const keys = new Set(W.CATALOG.map((c) => c.key));
const namesOf = (key) => { const c = W.CATALOG.find((x) => x.key === key); return [c.key].concat(c.alias); };

/* 回傳一道（已套用模式與食材的）食譜違反的規則；空陣列＝守規則。 */
function problems(r, picked, mode) {
  const out = [];
  const m = W.materialize({ recipe: r, picked }, mode, []);
  const all = JSON.stringify(m);
  if (/\{\d\}/.test(all)) out.push('佔位符沒換掉');
  if (BANNED.test(JSON.stringify([m.ingredients, m.steps]))) out.push('材料或步驟用了不建議的調味料或湯品'); // 提醒裡寫「不要用」是允許的
  if (/\d\s*(mg|毫克)/i.test(all)) out.push('寫了鉀含量數字');
  if (/即可）|秒即可|\d+–\d+ 分鐘即可/.test(m.steps.join(''))) out.push('汆燙時間出現例外寫法');
  if (R.flagRecipeIngredients(m.ingredients).some((f) => f.avoid)) out.push('材料被標 ✕');
  for (const ing of m.ingredients) {
    const c = ing.key && W.CATALOG.find((x) => x.key === ing.key);
    // 穀類主食不查；薯類（馬鈴薯、地瓜）雖歸主食，含鉀和根莖菜一樣高，照樣要汆燙
    if (!c || (c.group === 'staple' && !TUBERS.includes(c.key)) || c.group === 'fruit' || c.key === '雞蛋') continue;
    const b = lookup(c.key);
    if (b.potassium < 150) continue;
    // 中鉀以上：「提到這樣食材的那一段」（以；。分段）要有汆燙或川燙，不能只靠同句別樣食材的汆燙蒙混過關
    const ok = segments(m.steps).some((sg) => namesOf(c.key).some((nm) => sg.includes(nm)) && BLANCH.test(sg));
    if (!ok) out.push(`${c.key}(${b.potassium}) 沒有汆燙步驟`);
  }
  // 每段汆燙都要照統一時間（蔬菜約 3 分、肉約 1 分；整塊雞肉燙熟寫「續煮」），而且水要倒掉
  for (const sg of segments(m.steps).filter((s) => BLANCH.test(s.replace(/(汆|川)燙過的/g, '')))) {
    if (!/約 [13] 分鐘|續煮約 \d+ 分鐘/.test(sg)) out.push('汆燙沒寫統一時間：' + sg);
    if (!/倒掉/.test(sg)) out.push('汆燙水沒倒掉：' + sg);
  }
  // 有蛋、肉、海鮮、豆製品就要寫到熟透；半熟一律不行
  const proteinIngs = m.ingredients.filter((i) => { const c = i.key && W.CATALOG.find((x) => x.key === i.key); return c && PROTEIN_GROUPS.includes(c.group); });
  if (proteinIngs.some((i) => i.key !== '豆腐' && i.key !== '豆干') && !/熟透|全熟/.test(m.steps.join(''))) out.push('蛋肉海鮮沒寫熟透');
  if (/半熟|溏心|七分熟|五分熟/.test(m.steps.join(''))) out.push('寫了半熟');
  return out;
}
const segments = (steps) => steps.flatMap((s) => s.split(/[；。]/)).filter(Boolean);

/* 蛋白質份量：洗腎中＝未洗腎的 2 倍；未洗腎 2 人合計不超過 2 顆蛋或 160 g（傳統豆腐 2 份）。 */
function proteinAmountProblem(amount) {
  if (!Array.isArray(amount) || amount.length !== 2) return '份量要分兩種模式';
  const num = (s) => { const x = String(s).match(/(\d+)\s*(顆|g|片)/); return x && { n: Number(x[1]), u: x[2] }; };
  const p = num(amount[0]), d = num(amount[1]);
  if (!p || !d || p.u !== d.u) return '份量格式看不懂：' + amount;
  if (d.n !== p.n * 2) return '洗腎中份量不是未洗腎的 2 倍：' + amount;
  if ((p.u === '顆' && p.n > 2) || (p.u === 'g' && p.n > 160)) return '未洗腎份量超過 2 人 2 份：' + amount;
  return null;
}

for (const r of W.RECIPES) {
  t('recipe ' + r.id, () => {
    assert.ok(['chinese', 'western'].includes(r.style));
    assert.ok(r.title && r.intro && r.time && r.steps.length >= 2 && r.tips.length >= 1);
    const groups = r.needs.map((g) => (Array.isArray(g) ? g : [g]));
    groups.flat().forEach((k) => assert.ok(keys.has(k), `${r.id}: ${k} 不在目錄`));
    const combos = groups.reduce((acc, g) => acc.flatMap((a) => g.map((x) => a.concat([x]))), [[]]);
    for (const picked of combos) {
      for (const mode of ['predialysis', 'dialysis']) {
        assert.deepEqual(problems(r, picked, mode), [], `${r.id}/${picked}/${mode}`);
      }
    }
    // 蛋白質食材的份量要分未洗腎／洗腎中
    for (const ing of r.ingredients) {
      const name = ing.name.replace(/\{(\d)\}/, (_, i) => groups[Number(i)][0]);
      const c = W.CATALOG.find((x) => x.key === name);
      if (c && PROTEIN_GROUPS.includes(c.group)) {
        assert.equal(proteinAmountProblem(ing.amount), null, `${r.id}: ${name}`);
      }
    }
  });
}

t('the checker itself catches a recipe that blanches only one of two ingredients', () => {
  const good = W.RECIPES.find((x) => x.id === 'pork-onion');
  assert.deepEqual(problems(good, ['豬肉', '洋蔥'], 'predialysis'), []);
  const bad = { ...good, steps: ['豬肉切絲，直接下鍋。', '洋蔥切絲，切好後放進足量滾水汆燙約 3 分鐘，撈起瀝乾，燙菜水倒掉。', '炒到全熟。'] };
  assert.ok(problems(bad, ['豬肉', '洋蔥'], 'predialysis').some((x) => x.startsWith('豬肉')));
  const tooShort = { ...good, steps: good.steps.concat(['洋蔥（1–2 分鐘即可）']) };
  assert.ok(problems(tooShort, ['豬肉', '洋蔥'], 'predialysis').includes('汆燙時間出現例外寫法'));
  // 薯類不因為歸在主食就免汆燙
  const potato = W.RECIPES.find((x) => x.id === 'potato-omelette-w');
  assert.deepEqual(problems(potato, ['雞蛋', '馬鈴薯'], 'predialysis'), []);
  const rawPotato = { ...potato, steps: ['馬鈴薯去皮切薄片，直接下鍋煎軟。', '倒入蛋液煎到熟透。'] };
  assert.ok(problems(rawPotato, ['雞蛋', '馬鈴薯'], 'predialysis').some((x) => x.startsWith('馬鈴薯')));
  const sweet = W.RECIPES.find((x) => x.id === 'sweetpotato-pancake');
  const rawSweet = { ...sweet, steps: ['地瓜去皮蒸軟壓成泥。', '拌入蛋液，煎到中心熟透。'] };
  assert.ok(problems(rawSweet, ['雞蛋', '地瓜'], 'predialysis').some((x) => x.startsWith('地瓜')));
  // Codex 審查反例：同一句裡別樣食材的汆燙不能替這一樣過關
  const mixed = { ...potato, steps: ['馬鈴薯直接下鍋煎；洋蔥汆燙約 3 分鐘，燙水倒掉。', '倒入蛋液煎到熟透。'] };
  assert.ok(problems(mixed, ['雞蛋', '馬鈴薯'], 'predialysis').some((x) => x.startsWith('馬鈴薯')));
  // 汆燙 10 秒、保留燙水、蛋煎半熟、份量亂寫都要抓到
  const quick = { ...potato, steps: ['馬鈴薯切薄片，汆燙 10 秒，燙水留著。', '倒入蛋液煎到熟透。'] };
  const qp = problems(quick, ['雞蛋', '馬鈴薯'], 'predialysis');
  assert.ok(qp.some((x) => x.startsWith('汆燙沒寫統一時間')) && qp.some((x) => x.startsWith('汆燙水沒倒掉')));
  const runny = { ...potato, steps: [potato.steps[0], '倒入蛋液煎到半熟就起鍋。'] };
  const rp = problems(runny, ['雞蛋', '馬鈴薯'], 'predialysis');
  assert.ok(rp.includes('寫了半熟') && rp.includes('蛋肉海鮮沒寫熟透'));
  assert.equal(proteinAmountProblem(['2 顆', '4 顆']), null);
  assert.ok(proteinAmountProblem(['20 顆', '40 顆']));
  assert.ok(proteinAmountProblem(['70 g', '100 g']));
  assert.ok(proteinAmountProblem('70 g'));
});

t('matching: the user example 雞蛋＋豬肉 has several versions, rotating order is stable', () => {
  const m = W.matchRecipes(['雞蛋', '豬肉'], 'default');
  assert.ok(m.length >= 3, 'egg + pork should have ≥3 recipes, got ' + m.length);
  assert.ok(m.every((x) => x.picked.includes('雞蛋') && x.picked.includes('豬肉')));
  assert.deepEqual(W.matchRecipes(['豬肉', '雞蛋'], 'default').map((x) => x.recipe.id), m.map((x) => x.recipe.id), '順序不受挑選順序影響');
});

t('matching: more ingredients used ranks first; style filter; nothing matches → empty', () => {
  const m = W.matchRecipes(['雞蛋', '豬絞肉', '冬粉'], 'default');
  assert.equal(m[0].picked.length, 2);
  assert.ok(m.some((x) => x.recipe.id === 'ants-tree'));
  assert.ok(W.matchRecipes(['雞蛋', '洋蔥'], 'western').every((x) => x.recipe.style === 'western'));
  assert.ok(W.matchRecipes(['雞蛋', '洋蔥'], 'chinese').every((x) => x.recipe.style === 'chinese'));
  assert.deepEqual(W.matchRecipes(['蘋果', '香蕉'], 'default'), []);
  assert.deepEqual(W.matchRecipes([], 'default'), []);
  // 同一組 needs 不能用同一樣食材湊兩次
  assert.ok(!W.matchRecipes(['豬肉'], 'default').some((x) => x.recipe.needs.length > 1));
});

t('materialize: mode changes protein amount, not_used lists the rest, placeholders filled', () => {
  const match = W.matchRecipes(['雞蛋', '豬肉'], 'default').find((x) => x.recipe.id === 'pork-egg-slide');
  const usable = [{ key: '雞蛋', name: '雞蛋' }, { key: '豬肉', name: '豬肉' }, { key: '蘋果', name: '蘋果' }];
  const p = W.materialize(match, 'predialysis', usable), d = W.materialize(match, 'dialysis', usable);
  assert.equal(p.ingredients.find((i) => i.name === '雞蛋').amount, '1 顆');
  assert.equal(d.ingredients.find((i) => i.name === '雞蛋').amount, '2 顆');
  assert.equal(p.ingredients[1].name, '豬肉');
  assert.deepEqual(p.not_used.map((x) => x.name), ['蘋果']);
  assert.match(p.kidney_tips.at(-1), /未洗腎/);
  assert.match(d.kidney_tips.at(-1), /洗腎中/);
  const mushu = W.materialize(W.matchRecipes(['雞蛋', '豬肉'], 'default').find((x) => x.recipe.id === 'mu-shu-pork'), 'predialysis', usable);
  assert.ok(mushu.ingredients.some((i) => i.name === '高麗菜（有的話再加）'), '沒挑的配菜要註明可省略');
  const withCabbage = W.materialize(W.matchRecipes(['雞蛋', '豬肉'], 'default').find((x) => x.recipe.id === 'mu-shu-pork'), 'predialysis', usable.concat([{ key: '高麗菜', name: '高麗菜' }]));
  assert.ok(withCabbage.ingredients.some((i) => i.name === '高麗菜'), '有挑的就不加註');
  const noodle = W.materialize(W.matchRecipes(['雞胸肉', '小黃瓜'], 'default')[0], 'predialysis', []);
  assert.ok(noodle.ingredients.some((i) => i.name === '麵條（需另外準備）'));
  const greens = W.materialize(W.matchRecipes(['空心菜'], 'default')[0], 'predialysis', []);
  assert.equal(greens.title, '蒜炒空心菜');
  // 沒有肉、魚、蛋、豆的菜，模式提醒不能說「已加到每人約 2 份」
  const pumpkinD = W.materialize(W.matchRecipes(['南瓜', '米粉'], 'default')[0], 'dialysis', []);
  assert.doesNotMatch(pumpkinD.kidney_tips.at(-1), /已加到/);
  assert.match(pumpkinD.kidney_tips.at(-1), /洗腎中.*另外配/);
  assert.match(W.materialize(W.matchRecipes(['空心菜'], 'default')[0], 'predialysis', []).kidney_tips.at(-1), /未洗腎.*沒有肉/);
  assert.match(d.kidney_tips.at(-1), /已加到每人約 2 份/, '有肉蛋的照舊');
  for (const r of W.RECIPES) {
    const hasP = r.ingredients.some((i) => { const c = W.CATALOG.find((x) => x.key === i.name.replace(/\{(\d)\}/, (_, k) => [].concat(r.needs[k])[0])); return c && PROTEIN_GROUPS.includes(c.group); });
    const tip = W.materialize({ recipe: r, picked: r.needs.map((g) => [].concat(g)[0]) }, 'dialysis', []).kidney_tips.at(-1);
    assert.equal(/已加到/.test(tip), hasP, r.id + ' 模式提醒和有沒有蛋白質不一致');
  }
});

// 覆蓋率（資訊用，不擋）：哪些非水果食材沒有任何常備食譜
const uncovered = W.CATALOG.filter((c) => c.group !== 'fruit' && !W.RECIPES.some((r) => r.needs.flat().includes(c.key)));
console.log('沒有常備食譜的食材（會改用 AI）：' + uncovered.map((c) => c.key).join('、'));
console.log(`what-to-eat recipes: ${n} groups passed (${W.RECIPES.length} recipes, ${W.CATALOG.length} catalog items).`);
