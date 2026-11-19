// 「今天吃甚麼？」規則的邊界測試：node what-to-eat-rules.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import(new URL('./what-to-eat-rules.js', import.meta.url));
const R = globalThis.WhatToEatRules;
const db = JSON.parse(await readFile(new URL('./food-nutrients.json', import.meta.url), 'utf8')).foods.map(R.fromNutrientRow);

let n = 0;
function t(name, fn) { fn(); n++; }

// 分級門檻：149 / 150 / 151，299 / 300 / 301
t('level boundaries', () => {
  assert.equal(R.levelOf(149), 'low');
  assert.equal(R.levelOf(149.9), 'low');
  assert.equal(R.levelOf(150), 'medium');
  assert.equal(R.levelOf(151), 'medium');
  assert.equal(R.levelOf(299), 'medium');
  assert.equal(R.levelOf(300), 'medium');
  assert.equal(R.levelOf(300.1), 'high');
  assert.equal(R.levelOf(301), 'high');
  assert.equal(R.levelOf(null), 'unknown');
  assert.equal(R.levelOf(NaN), 'unknown');
});

const food = (k) => R.verdict({ name: '測試菜', category: '蔬菜類', potassium: k }).code;
const seas = (k) => R.verdict({ name: '測試醬', category: '調味料及香辛料類', potassium: k }).code;

// 一般食材「不建議」門檻：499 / 500 / 501
t('food avoid boundary', () => {
  assert.equal(food(149), 'ok');
  assert.equal(food(300), 'ok');
  assert.equal(food(301), 'caution');
  assert.equal(food(499), 'caution');
  assert.equal(food(500), 'avoid');
  assert.equal(food(501), 'avoid');
  assert.equal(food(null), 'caution');
});

// 調味料「不建議」門檻：999 / 1000 / 1001；高鉀但未達門檻是「少量」
t('seasoning avoid boundary', () => {
  assert.equal(seas(300), 'ok');
  assert.equal(seas(301), 'caution');
  assert.equal(seas(999), 'caution');
  assert.equal(seas(1000), 'avoid');
  assert.equal(seas(1001), 'avoid');
});

// 代鹽與楊桃：不論數字一律不建議；名稱或比對到的資料庫名稱任一命中都算
t('potassium salts and star fruit', () => {
  assert.equal(R.verdict({ name: '低鈉鹽', potassium: null }).code, 'avoid');
  assert.equal(R.verdict({ name: '醬油', dbName: '薄鹽醬油(低鈉)', potassium: 372, category: '調味料及香辛料類' }).code, 'avoid');
  assert.equal(R.verdict({ name: '薄鹽醬油', dbName: '醬油', potassium: 390, category: '調味料及香辛料類' }).code, 'avoid');
  assert.equal(R.verdict({ name: '楊桃', potassium: 100, category: '水果類' }).code, 'avoid');
  assert.equal(R.verdict({ name: '醬油', potassium: 390, category: '調味料及香辛料類' }).code, 'caution');
  assert.equal(R.verdict({ name: '鹽', potassium: 0, category: '調味料及香辛料類' }).code, 'ok');
});

// 比對：俗名要找到生鮮那一筆，不能落到加工品
t('matching against TFDA data', () => {
  const pick = (...terms) => R.matchFood(terms, db).best?.name;
  assert.equal(pick('香蕉'), pick('北蕉'));
  assert.match(pick('香蕉'), /^北蕉/);
  assert.match(pick('高麗菜'), /^甘藍/);
  assert.equal(pick('菠菜'), '菠菜');
  assert.equal(pick('白飯'), '白飯');
  assert.equal(pick('大蒜'), '大蒜');
  assert.equal(pick('馬鈴薯'), '馬鈴薯');
  assert.doesNotMatch(pick('胡蘿蔔'), /冷凍/);
  assert.equal(pick('豆腐'), '傳統豆腐');
  assert.equal(pick('雞胸肉'), '去皮清肉平均值');
  assert.equal(pick('米飯'), '白飯');
  assert.equal(R.matchFood(['完全不存在的東西xyz'], db).best, null);
  assert.ok(R.matchFood(['豆腐'], db).candidates.length > 1);
});

// 食譜材料檢查：只看材料名
t('recipe ingredient flags', () => {
  const f = R.flagRecipeIngredients([{ name: '低鈉鹽' }, { name: '鹽' }, { name: '楊桃片' }, { name: '高麗菜' }]);
  assert.deepEqual(f.map((x) => x.avoid), [true, false, true, false]);
});

// 使用者實際打字找不到的例子：梅粉（資料庫是梅子粉）、冷凍酪梨（資料庫只有生鮮酪梨）
t('typed search fallbacks', () => {
  const m = R.matchFood(['梅粉'], db);
  assert.equal(m.best, null); // 只是猜測，不自動選
  assert.ok(m.candidates.some((c) => c.name === '梅子粉'));
  assert.ok(R.matchFood(['冷凍酪梨'], db).best.name.startsWith('酪梨'));
  assert.equal(R.matchFood(['冷凍菠菜'], db).best.name, '冷凍菠菜'); // 有冷凍那筆就用它
  assert.equal(R.matchFood(['冷凍'], db).candidates.some((c) => c.name === '凍'), false);
  assert.deepEqual(R.matchFood(['完全不存在的東西xyz'], db).candidates, []);
});

// AI 的 not_used 不能列已放進材料的食材（實例：葡萄同時出現在材料與「沒有放進」）
t('not_used drops ingredients actually used', () => {
  const ing = [{ name: '鯛魚' }, { name: '葡萄' }, { name: '蔥' }, { name: '雞腿肉（去皮）' }];
  const out = R.filterNotUsed([
    { name: '葡萄', reason: '可適量食用' }, { name: ' 雞腿肉 ' }, { name: '洋蔥', reason: '不搭' }, { name: '高麗菜' }, { name: '' }, null,
  ], ing);
  assert.deepEqual(out.map((x) => x.name), ['洋蔥', '高麗菜']);
  assert.deepEqual(R.filterNotUsed(undefined, ing), []);
  assert.deepEqual(R.filterNotUsed([{ name: '葡萄' }], undefined).map((x) => x.name), ['葡萄']);
});

// 蛋白質食物門檻：4.9 / 5 / 5.1 g/100g；沒有數字時看類別
t('protein-rich boundary', () => {
  assert.equal(R.isProteinRich({ protein: 4.9, category: '肉類' }), false);
  assert.equal(R.isProteinRich({ protein: 5, category: '蔬菜類' }), true);
  assert.equal(R.isProteinRich({ protein: 5.1, category: '蔬菜類' }), true);
  assert.equal(R.isProteinRich({ protein: null, category: '魚貝類' }), true);
  assert.equal(R.isProteinRich({ protein: null, category: '蔬菜類' }), false);
});

// 未洗腎／洗腎中：蛋白質食物的建議方向相反；非蛋白質食物、不建議的食材不加這句
t('mode-specific protein advice', () => {
  const chicken = { name: '雞胸肉', category: '肉類', potassium: 314, protein: 23.3 };
  const pre = R.adviceFor(chicken, 'predialysis').join(' ');
  const dia = R.adviceFor(chicken, 'dialysis').join(' ');
  assert.match(pre, /未洗腎.*份量要控制/);
  assert.doesNotMatch(pre, /要吃夠/);
  assert.match(dia, /洗腎中.*要吃夠/);
  assert.doesNotMatch(dia, /份量要控制/);
  assert.doesNotMatch(R.adviceFor({ name: '甘藍', category: '蔬菜類', potassium: 187, protein: 1.3 }, 'dialysis').join(' '), /洗腎中/);
  assert.doesNotMatch(R.adviceFor({ name: '黃豆', category: '豆類', potassium: 1700, protein: 35 }, 'dialysis').join(' '), /要吃夠/);
  assert.match(R.recipeProteinRule('predialysis'), /低蛋白/);
  assert.match(R.recipeProteinRule('dialysis'), /要吃夠/);
  assert.equal(R.recipeProteinRule(undefined), R.recipeProteinRule('predialysis'));
});

// 資料庫俗名比對：高麗菜是甘藍的俗名
t('alias matching', () => {
  assert.equal(R.matchFood(['紅蘿蔔'], db).best.name.startsWith('胡蘿蔔'), true);
  assert.equal(R.matchFood(['板豆腐'], db).best.name, '傳統豆腐');
});

// AI 回覆解析：正常、圍欄、尾巴多殘字（2026-11-13 flash-lite 實際回傳）、字串內含大括號、整段壞掉
t('parseAiJson', () => {
  assert.deepEqual(R.parseAiJson('{"a":1}'), { a: 1 });
  assert.deepEqual(R.parseAiJson('```json\n{"a":1}\n```'), { a: 1 });
  const spinach = '{"items":[{"name":"莧菜","tfda_terms":["莧菜"],"category":"蔬菜類","est_potassium":230}]}\n}]}';
  assert.equal(R.parseAiJson(spinach).items[0].name, '莧菜');
  assert.deepEqual(R.parseAiJson('前言 {"s":"a}b{\\"c"} 後記'), { s: 'a}b{"c' });
  const star = '{"items":[{"name":"楊桃","est_potassium":11750":1170}]}\nassium":117200":100}]}';
  assert.throws(() => R.parseAiJson(star));
  assert.throws(() => R.parseAiJson('沒有 JSON'));
  assert.throws(() => R.parseAiJson('{"a":'));
  // Codex 審查反例：字串內含 ```json 不能被改寫；前言有 {範例} 時要找到後面的完整物件
  assert.equal(R.parseAiJson('{"s":"看 ```json 這段"}').s, '看 ```json 這段');
  assert.equal(R.parseAiJson('{"s":"看 ```json 這段"} 尾巴').s, '看 ```json 這段');
  assert.equal(R.parseAiJson('說明 {範例} {"items":[{"name":"雞蛋"}]}').items[0].name, '雞蛋');
});

// 磷分級（沿用磷掃描器）：99 / 100 / 101，249 / 250 / 251
t('phosphorus level boundaries', () => {
  assert.equal(R.pLevelOf(99), 'low');
  assert.equal(R.pLevelOf(99.9), 'low');
  assert.equal(R.pLevelOf(100), 'medium');
  assert.equal(R.pLevelOf(101), 'medium');
  assert.equal(R.pLevelOf(250), 'medium');
  assert.equal(R.pLevelOf(250.1), 'high');
  assert.equal(R.pLevelOf(251), 'high');
  assert.equal(R.pLevelOf(undefined), 'unknown');
  assert.equal(R.pLevelLabel('high'), '高磷');
  assert.equal(R.fromNutrientRow({ n: 'x', k: 1, p: 123, pr: 2 }).phosphorus, 123);
});

t('phosphorus advice', () => {
  const tips = (o) => R.adviceFor(Object.assign({ name: '測試' }, o), 'dialysis').join('');
  // 肉魚蛋豆：中磷也不叫人避開，指向加工品
  assert.match(tips({ category: '肉類', potassium: 300, phosphorus: 190, protein: 20 }), /蛋白質來源.*加工食品/);
  assert.match(tips({ category: '豆類', potassium: 45, phosphorus: 277, protein: 18 }), /含磷偏高，但這是蛋白質來源/);
  // 麵條類蛋白質雖 ≥ 5 g，不能說成「蛋白質來源」
  assert.doesNotMatch(tips({ category: '穀物類', potassium: 171, phosphorus: 136, protein: 13.8 }), /蛋白質來源/);
  // 上面已有「要吃夠」（洗腎中）的蛋白質提醒時，磷提醒不能再說「不要吃太多」（Codex 二審：小米 鉀 202、磷 164、蛋白質 11.3）
  const millet = tips({ name: '小米', category: '穀物類', potassium: 202, phosphorus: 164, protein: 11.3 });
  assert.match(millet, /要吃夠/);
  assert.doesNotMatch(millet, /不要吃太多/);
  assert.match(millet, /含磷中等，份量照上面的原則/);
  // 蛋白質低於門檻、沒有蛋白質提醒的才說「不要吃太多」
  assert.match(tips({ category: '穀物類', potassium: 100, phosphorus: 136, protein: 3 }), /含磷中等，不要吃太多/);
  // 低磷、查不到磷、已判不建議：不加磷提醒
  assert.doesNotMatch(tips({ category: '蔬菜類', potassium: 187, phosphorus: 30 }), /含磷/);
  assert.doesNotMatch(tips({ category: '蔬菜類', potassium: 187 }), /含磷/);
  assert.doesNotMatch(tips({ name: '楊桃', category: '水果類', potassium: 152, phosphorus: 300 }), /含磷/);
});

t('verdict labels name potassium (row also shows phosphorus)', () => {
  const lab = (k, c) => R.verdict({ name: '測試', category: c || '蔬菜類', potassium: k }).label;
  assert.equal(lab(8, '穀物類'), '低鉀可吃');
  assert.equal(lab(200), '中鉀適量');
  assert.equal(lab(350), '⚠ 高鉀限量');
  assert.equal(lab(null), '? 鉀無資料');
  // 鉀未知的調味料不能只寫「可用」（Codex 二審）
  assert.equal(lab(null, '調味料及香辛料類'), '? 鉀無資料，少量用');
  // 香油（資料裡唯一缺鉀的調味料）：要是 caution，挑選卡片與 AI 提示才會帶「少量」（Codex 三審）
  assert.equal(R.verdict({ name: '香油', category: '調味料及香辛料類', potassium: null }).code, 'caution');
  assert.equal(lab(100, '調味料及香辛料類'), '低鉀可用');
  assert.equal(lab(400, '調味料及香辛料類'), '⚠ 高鉀少量');
  assert.equal(lab(600), '✕ 不建議');
});

t('phosphate additives: processed foods and cola get the additive warning, not "eat enough protein"', () => {
  const tips = (o, mode) => R.adviceFor(Object.assign({ name: '測試' }, o), mode || 'dialysis').join('');
  // 食藥署：切片火腿(豬肉) 加工調理食品及其他類，鉀 281、磷 344、蛋白質 16.5
  const ham = tips({ name: '切片火腿(豬肉)', category: '加工調理食品及其他類', potassium: 281, phosphorus: 344, protein: 16.5 });
  assert.match(ham, /磷酸鹽.*盡量少吃/);
  assert.doesNotMatch(ham, /要吃夠|不要吃太多|照上面的份量/);
  // 可樂磷只有 16，仍要提醒磷酸鹽
  assert.match(tips({ name: '可樂', category: '飲料類', potassium: 0, phosphorus: 16 }), /磷酸鹽/);
  // 肉類名稱帶加工字樣（香腸）也算
  assert.match(tips({ name: '香腸', category: '肉類', potassium: 300, phosphorus: 200, protein: 15 }), /磷酸鹽.*盡量少吃/);
  // 市售蒸蛋：蛋白質 3.6 g，沒有份量提醒，磷提醒不能說「照上面的份量」
  const egg = tips({ name: '蒸蛋(市售)', category: '蛋類', potassium: 34, phosphorus: 111, protein: 3.6 });
  assert.doesNotMatch(egg, /照上面的份量|蛋白質食物/);
  assert.match(egg, /含磷中等，不要吃太多/);
  assert.equal(R.isPhosphateAdditive({ name: '雞胸肉', category: '肉類' }), false);
  // 可樂餅不是可樂（Codex 三審）
  assert.equal(R.isPhosphateAdditive({ name: '冷凍可樂餅(奶汁)', category: '加工調理食品及其他類' }), false);
  assert.equal(R.isPhosphateAdditive({ name: '可樂' }), true);
  // 修改流程：搜尋「可樂」選「冷凍可樂餅」→ 看選定列（Codex 四審）
  assert.equal(R.isPhosphateAdditive({ name: '可樂', dbName: '冷凍可樂餅(奶汁)' }), false);
  assert.equal(R.isPhosphateAdditive({ name: '雞肉', dbName: '切片火腿(雞肉)' }), true);
  // 傳統豆腐(2022年取樣) 在資料庫分到加工調理類，仍是蛋白質來源
  assert.match(tips({ name: '傳統豆腐(2022年取樣)', dbName: '傳統豆腐(2022年取樣)', category: '加工調理食品及其他類', potassium: 120, phosphorus: 117, protein: 9.6 }), /含磷中等，但這是蛋白質來源/);
  // 加工調理類整類不算：米粉、免煮飯沒有磷酸鹽依據（Codex 二審）
  for (const name of ['埔里米粉', '免煮飯']) {
    assert.equal(R.isPhosphateAdditive({ name, dbName: name, category: '加工調理食品及其他類' }), false, name);
    assert.doesNotMatch(tips({ name, dbName: name, category: '加工調理食品及其他類', potassium: 20, phosphorus: 34, protein: 2 }), /磷酸鹽/, name);
  }
});

console.log(`what-to-eat rules: ${n} groups passed.`);
