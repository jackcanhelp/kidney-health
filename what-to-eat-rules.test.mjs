// 「今天吃甚麼？」規則的邊界測試：node what-to-eat-rules.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import(new URL('./what-to-eat-rules.js', import.meta.url));
const R = globalThis.WhatToEatRules;
const db = JSON.parse(await readFile(new URL('./potassium_data.json', import.meta.url), 'utf8'));

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

console.log(`what-to-eat rules: ${n} groups passed.`);
