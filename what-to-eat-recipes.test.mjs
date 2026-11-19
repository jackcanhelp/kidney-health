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
  // 從資料庫卡片直接挑的品名帶括號註記：去掉括號完全相同才算（Codex 二審）
  assert.equal(k('青江菜(土植)(4月取樣)', '青江菜(土植)(4月取樣)'), '青江菜');
  assert.equal(k('切片火腿(豬肉)', '切片火腿(豬肉)'), null);
  assert.equal(k('蕹菜(水耕)(4月取樣)', '蕹菜(水耕)(4月取樣)'), '空心菜');
  assert.equal(k('雞蛋(高DHA)', '雞蛋(高DHA)'), '雞蛋');
  // 括號寫了別種動物：「里肌肉」是豬肉的別名，但「里肌肉(土雞)」是雞
  assert.equal(k('里肌肉(土雞)', '里肌肉(土雞)'), null);
  assert.equal(k('里肌肉(肉雞)', '里肌肉(肉雞)'), null);
  // 修改食材：name 是搜尋詞、dbName 是選定的資料列（Codex 三審）
  assert.equal(k('里肌肉', '里肌肉(土雞)'), null);
  assert.equal(k('里肌肉'), '豬肉');
  // 紅、黃、橙皮甜椒不是青椒；青皮照舊
  for (const c of ['紅皮', '黃皮', '橙皮']) assert.equal(k(`甜椒(${c})`, `甜椒(${c})`), null, c);
  assert.equal(k('雞蛋(黃殼)', '雞蛋(黃殼)'), '雞蛋');
  // 修改食材改存選定的品名後，各種跨物種與加工品都要擋（Codex 四審）
  assert.equal(k('牛梅花肉火鍋片', '牛梅花肉火鍋片'), null);
  assert.equal(k('雞絞肉', '雞絞肉'), null);
  assert.equal(k('里肌肉平均值', '里肌肉平均值'), null);
  assert.equal(k('切片火腿(雞肉)', '切片火腿(雞肉)'), null);
  assert.equal(k('雞肉', '雞肉香腸(大)'), null, '拍照叫雞肉、資料庫對到香腸');
  assert.equal(k('雞蛋平均值', '雞蛋平均值'), '雞蛋');
  assert.equal(k('番茄', '牛番茄'), '番茄', '蔬菜不做動物檢查');
  // 修改流程 name 是搜尋詞、dbName 是選定列（Codex 四、五審）
  assert.equal(k('梅花肉', '牛梅花肉火鍋片'), null);
  assert.equal(k('絞肉', '雞絞肉'), null);
  assert.equal(k('甜椒', '甜椒(紅皮)'), null);
  assert.equal(k('雞肉', '切片火腿(雞肉)'), null);
  assert.equal(k('可樂', '冷凍可樂餅(奶汁)'), null);
  assert.equal(k('台灣鯛', '台灣鯛魚片(生)'), '鯛魚', '正確食材不能因修改而失去食譜');
  // 拍照：辨識名＋最佳資料列
  assert.equal(k('里肌肉', '里肌肉平均值'), null);
  assert.equal(k('紅甜椒', '甜椒(青皮)'), null);
  assert.equal(k('紅甜椒', '甜椒平均值(青皮)'), null);
  // 類別也要對：雞腿菇是菇、高湯塊是調味料、雞肉水餃是加工品（Codex 六審）
  const kc = (name, dbName, category) => W.keyOf({ name, dbName, category });
  assert.equal(kc('雞腿', '雞腿菇', '菇類'), null);
  // 海鮮只收魚貝類：冷凍蝦仁炒飯在加工調理類，不能當蝦仁（Codex 八審；冷凍魷魚圈因此改走 AI，寧缺勿錯）
  assert.equal(kc('蝦仁', '冷凍蝦仁炒飯', '加工調理食品及其他類'), null);
  assert.equal(kc('雞肉', '高湯塊(雞肉)', '調味料及香辛料類'), null);
  assert.equal(kc('雞肉', '冷凍香菇雞肉水餃', '加工調理食品及其他類'), null);
  assert.equal(kc('雞腿', '清腿(肉雞)', '肉類'), '雞腿肉');
  assert.equal(kc('豆腐', '傳統豆腐(2022年取樣)', '加工調理食品及其他類'), '豆腐');
  // 每個分組都查類別：搜「小黃瓜」選了「小黃魚(去皮)」不是小黃瓜（Codex 十審）
  assert.equal(kc('小黃瓜', '小黃魚(去皮)', '魚貝類'), null);
  assert.equal(kc('香菇', '冷凍香菇雞肉水餃', '加工調理食品及其他類'), null);
  assert.equal(kc('蘋果', '蘋果汁(100%)', '飲料類'), null);
  assert.equal(kc('白飯', '雙髻鯊', '魚貝類'), null);
  // 搜尋詞類別不符時改用選定的資料列再認：搜「甘藷」選「甘藷葉」是地瓜葉（Codex 十一審）
  assert.equal(kc('甘藷', '甘藷葉', '蔬菜類'), '地瓜葉');
  // 重試時辨識名的顏色仍算數：紅甜椒選到青皮甜椒不是青椒
  assert.equal(W.keyOf({ name: '紅甜椒', dbName: '甜椒(青皮)', category: '蔬菜類' }), null);
  // 正確資料列各分組仍對得到
  assert.equal(kc('小黃瓜', '胡瓜', '蔬菜類'), '小黃瓜');
  assert.equal(kc('香菇', '香菇(大)', '菇類'), '香菇');
  assert.equal(kc('芭樂', '土芭樂', '水果類'), '芭樂');
  for (const [nm, db, cat] of [['白飯', '白飯', '穀物類'], ['麵條', '乾麵條', '加工調理食品及其他類'], ['地瓜', '白皮甘藷', '澱粉類'], ['吐司', '土司', '糕餅點心類']])
    assert.equal(kc(nm, db, cat), nm);
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

t('templates: tier matches TFDA, signature dishes win, high tier halves the amount', () => {
  const tpl = W.RECIPES.filter((r) => r.template);
  assert.ok(tpl.length >= 60, 'template count');
  for (const r of tpl) {
    const veg = r.needs.at(-1);
    assert.equal(R.levelOf(lookup(veg).potassium), r.tier, `${r.id}: 鉀分級和食藥署資料不一致`);
    assert.ok(lookup(veg).potassium < R.AVOID_FOOD_MIN, `${r.id}: 不建議的食材不能做範本`);
    const amt = r.ingredients.find((i) => i.name === veg).amount;
    const grams = Number(amt.match(/約 (\d+) g/)[1]);
    const normal = W.TEMPLATE_VEG[veg][2];
    assert.equal(grams, r.tier === 'high' ? Math.round(normal / 2) : normal, r.id + ' 份量克數');
    assert.equal(/平常的一半/.test(amt), r.tier === 'high', r.id + ' 份量說明');
  }
  assert.ok(!tpl.some((r) => r.needs.includes('菠菜')));
  // 已有招牌菜的組合不出範本；沒有招牌菜的組合由範本補上
  const cabbageEgg = W.matchRecipes(['雞蛋', '高麗菜'], 'default');
  assert.ok(cabbageEgg.length >= 1 && cabbageEgg.every((m) => !m.recipe.template));
  // 用到兩樣的範本排在只用一樣的招牌菜（蒜炒青菜）前面：沿用「用到越多樣越前面」
  const ce = W.matchRecipes(['雞蛋', '青江菜'], 'default');
  assert.equal(W.materialize(ce[0], 'predialysis', []).title, '青江菜炒蛋');
  assert.ok(W.materialize(ce[0], 'predialysis', []).template);
  assert.ok(ce.slice(1).every((m) => !m.recipe.template && m.picked.length === 1));
  // 用到一樣多食材時，招牌菜排在範本前面
  const mix = W.matchRecipes(['雞蛋', '番茄', '小白菜'], 'default');
  for (let i = 1; i < mix.length; i++) {
    const a = mix[i - 1], b = mix[i];
    if (a.picked.length === b.picked.length) assert.ok(!(a.recipe.template && !b.recipe.template), `${a.recipe.id} 排在 ${b.recipe.id} 前面`);
  }
  assert.ok(mix.findIndex((m) => m.recipe.id === 'tomato-egg') < mix.findIndex((m) => m.recipe.id === 'tpl-egg-小白菜'));
  // 肉片範本：四種肉都能套，標題換成實際的肉
  assert.ok(!W.matchRecipes(['雞腿肉', '南瓜'], 'default').some((m) => m.recipe.template), '已有南瓜雞腿招牌菜');
  // 多種肉：豬肉＋高麗菜有招牌菜，但雞胸肉＋高麗菜的萬用菜單不能跟著被擋掉
  const multi = W.matchRecipes(['豬肉', '雞胸肉', '高麗菜'], 'default').map((m) => m.recipe.id);
  assert.ok(multi.includes('tpl-meat-雞胸肉-高麗菜'));
  assert.ok(!multi.includes('tpl-meat-豬肉-高麗菜'));
  // 使用者那一筆的鉀比目錄高（水耕青江菜 377）：不出低鉀萬用菜單；分級相同或更低照出
  const hydro = lookup('青江菜(水耕)(7月取樣)');
  assert.equal(R.levelOf(hydro.potassium), 'high');
  assert.ok(!W.matchRecipes(['雞蛋', '青江菜'], 'default', { 青江菜: 'high' }).some((m) => m.recipe.template));
  assert.ok(W.matchRecipes(['雞蛋', '青江菜'], 'default', { 青江菜: 'low' }).some((m) => m.recipe.template));
  assert.ok(W.matchRecipes(['雞蛋', '高麗菜', '小白菜'], 'default', { 小白菜: 'low' }).some((m) => m.recipe.id === 'tpl-egg-小白菜'));
  // 有傳 levels 時：鉀未知、或沒給那樣菜的分級，都不出萬用菜單（Codex 二審：手動只填「青江菜」照低鉀做法出菜）
  assert.ok(!W.matchRecipes(['雞蛋', '青江菜'], 'default', { 青江菜: 'unknown' }).some((m) => m.recipe.template));
  assert.ok(!W.matchRecipes(['雞蛋', '青江菜'], 'default', {}).some((m) => m.recipe.template));
  // 高麗菜是中鉀菜單：實際那筆是低鉀也照出（分級比菜單低）
  assert.ok(W.matchRecipes(['雞胸肉', '高麗菜'], 'default', { 高麗菜: 'low' }).some((m) => m.recipe.id === 'tpl-meat-雞胸肉-高麗菜'));
  // 同級替代清單要提醒以清單標示為準（水耕蕹菜 440 是高鉀，Codex 三審）
  assert.ok(W.RECIPES.find((r) => r.id === 'tpl-egg-青江菜').tips.some((x) => /以食材清單標的鉀分級為準/.test(x)));
  // 常備食譜也看實際那一筆：水耕青江菜（高鉀）＋豆腐照出，但青江菜標「用量減半」並多一條提醒（使用者 11-19 決定）
  const tofuHigh = W.matchRecipes(['豆腐', '青江菜'], 'default', { 豆腐: 'low', 青江菜: 'high' });
  const withVeg = tofuHigh.find((m) => !m.recipe.template && m.picked.includes('青江菜'));
  assert.ok(withVeg, '高鉀那一筆仍出常備食譜');
  const mHigh = W.materialize(withVeg, 'dialysis', []);
  assert.match(mHigh.ingredients.find((i) => i.key === '青江菜').amount, /鉀較高，用量減半/);
  assert.doesNotMatch(mHigh.ingredients.find((i) => i.key === '豆腐').amount, /減半/);
  assert.match(mHigh.kidney_tips[0], /你選的這筆青江菜鉀比一般的高：用量減半，下鍋前先汆燙/);
  // 分級相同、鉀未知、沒傳 levels：都不標
  for (const lv of [{ 豆腐: 'low', 青江菜: 'low' }, { 豆腐: 'low', 青江菜: 'unknown' }, undefined]) {
    const ms = W.matchRecipes(['豆腐', '青江菜'], 'default', lv);
    const one = ms.find((m) => !m.recipe.template && m.picked.includes('青江菜'));
    assert.ok(one, JSON.stringify(lv));
    const x = W.materialize(one, 'dialysis', []);
    assert.ok(x.ingredients.every((i) => !/減半/.test(i.amount)) && !x.kidney_tips.some((t) => /你選的這筆/.test(t)), JSON.stringify(lv));
  }
  // Codex 六審：同名未知那筆不能蓋掉已知高鉀（levels 擋範本用、known 判斷減半用）
  {
    const ms = W.matchRecipes(['豆腐', '青江菜'], 'default', { 豆腐: 'low', 青江菜: 'unknown' }, { 豆腐: 'low', 青江菜: 'high' });
    const one = ms.find((m) => !m.recipe.template && m.picked.includes('青江菜'));
    assert.match(W.materialize(one, 'dialysis', []).ingredients.find((i) => i.key === '青江菜').amount, /減半/);
    assert.ok(!ms.some((m) => m.recipe.template), '有未知那筆仍不出範本');
  }
  // 配菜也算：玉米筍炒肉片用到胡蘿蔔，黃胡蘿蔔 338 比目錄胡蘿蔔 267 高一級
  {
    const ms = W.matchRecipes(['玉米筍', '豬肉', '胡蘿蔔'], 'default', null, { 玉米筍: 'medium', 豬肉: 'medium', 胡蘿蔔: 'high' });
    const one = ms.find((m) => m.recipe.id === 'babycorn-pork');
    assert.ok(one);
    const x = W.materialize(one, 'dialysis', []);
    const carrot = x.ingredients.find((i) => i.key === '胡蘿蔔');
    if (carrot) assert.match(carrot.amount, /減半/);
    else assert.fail('babycorn-pork 沒有胡蘿蔔，測試前提不成立');
  }
  // 減半時移除原食譜談同一樣份量的提醒；肉魚蛋豆不減半
  {
    const ms = W.matchRecipes(['雞蛋', '番茄'], 'default', null, { 雞蛋: 'high', 番茄: 'high' });
    const x = W.materialize(ms.find((m) => m.recipe.id === 'tomato-egg'), 'dialysis', []);
    assert.match(x.kidney_tips[0], /你選的這筆番茄/);
    assert.ok(!x.kidney_tips.some((t) => /番茄是中鉀/.test(t)), x.kidney_tips.join('|'));
    assert.doesNotMatch(x.ingredients.find((i) => i.key === '雞蛋').amount, /減半/);
    const dg = W.matchRecipes(['豆干', '豬肉'], 'default', null, { 豆干: 'high', 豬肉: 'high' });
    const y = W.materialize(dg.find((m) => m.recipe.id === 'dougan-pork'), 'dialysis', []);
    assert.ok(y.ingredients.every((i) => !/減半/.test(i.amount)), '蛋白質食物不減半');
  }
  // Codex 七審：冬瓜減半 → 補汆燙步驟、保留「湯汁不要喝」
  {
    const ms = W.matchRecipes(['冬瓜', '豬絞肉'], 'default', null, { 冬瓜: 'medium', 豬絞肉: 'medium' });
    const x = W.materialize(ms.find((m) => m.recipe.id === 'wintermelon-pork'), 'dialysis', []);
    // 汆燙接在原步驟「冬瓜去皮切小塊」後面，不另起一步（Codex 八、九審）
    assert.equal(x.steps.length, 3, x.steps.join('|'));
    assert.match(x.steps[1], /^冬瓜去皮切小塊，切好後放進足量滾水汆燙.*比平常多這一步）；熱鍋/);
    assert.ok(x.kidney_tips.some((t) => /盤底湯汁不要喝/.test(t)), x.kidney_tips.join('|'));
    const plain = W.materialize(W.matchRecipes(['冬瓜', '豬絞肉'], 'default').find((m) => m.recipe.id === 'wintermelon-pork'), 'dialysis', []);
    assert.ok(!plain.steps.some((t) => /比平常多這一步/.test(t)));
  }
  // 南瓜萬用菜單帶上「南瓜也算主食」
  assert.ok(W.RECIPES.find((r) => r.id === 'tpl-meat-豬肉-南瓜').tips.some((x) => /也算主食/.test(x)));
  const pm = W.materialize(W.matchRecipes(['豬肉', '金針菇'], 'default')[0], 'dialysis', []);
  assert.equal(pm.title, '金針菇炒豬肉片');
  assert.match(pm.ingredients.find((i) => i.name === '金針菇').amount, /約 50 g（高鉀/);
  assert.equal(pm.ingredients.find((i) => i.name === '豬肉').amount, '140 g（每人約 70 g）');
  assert.equal(W.matchRecipes(['雞蛋', '青江菜'], 'western').length, 0, '西式模式不出中式範本');
});

// 覆蓋率（資訊用，不擋）：哪些非水果食材沒有任何常備食譜
const uncovered = W.CATALOG.filter((c) => c.group !== 'fruit' && !W.RECIPES.some((r) => r.needs.flat().includes(c.key)));
console.log('沒有常備食譜的食材（會改用 AI）：' + uncovered.map((c) => c.key).join('、'));
console.log(`what-to-eat recipes: ${n} groups passed (${W.RECIPES.length} recipes, ${W.CATALOG.length} catalog items).`);
