import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import(new URL('./food-lookup.js', import.meta.url));
const L = globalThis.FoodLookup;
const db = JSON.parse(await readFile(new URL('./food-nutrients.json', import.meta.url), 'utf8'));

// 門檻邊界：鉀 低 <150、中 150–300、高 >300
assert.equal(L.classify('k', 149.9), 'low');
assert.equal(L.classify('k', 150), 'medium');
assert.equal(L.classify('k', 300), 'medium');
assert.equal(L.classify('k', 300.1), 'high');
assert.equal(L.classify('k', 301), 'high');
// 磷 低 <100、中 100–250、高 >250
assert.equal(L.classify('p', 99.9), 'low');
assert.equal(L.classify('p', 100), 'medium');
assert.equal(L.classify('p', 250), 'medium');
assert.equal(L.classify('p', 250.1), 'high');
assert.equal(L.classify('k', null), null);
assert.equal(L.classify('p', NaN), null);
assert.equal(L.levelLabel('k', 'high'), '高鉀');
assert.equal(L.levelLabel('p', 'low'), '低磷');

// 資料檔完整性
assert.ok(db.foods.length > 2000, 'food count');
for (const f of db.foods) {
  assert.ok(f.n && f.c, 'name/category ' + f.id);
  for (const key of ['k', 'p']) {
    assert.ok(f[key] === null || (typeof f[key] === 'number' && f[key] >= 0), key + ' ' + f.id);
  }
}

// 候選搜尋：正式名稱、俗名都找得到，且只列有數值的項目
const banana = L.searchCandidates(['香蕉'], db.foods, 'k');
assert.ok(banana.length > 0 && banana.every((f) => /蕉/.test(f.n + f.a)), 'banana candidates');
// 俗名與 AI 給的資料庫用名同時出現時，綜合代表值「平均值」排第一
assert.equal(L.searchCandidates(['香蕉', '北蕉'], db.foods, 'k')[0].n, '北蕉平均值');
const rice = L.searchCandidates(['白飯'], db.foods, 'p');
assert.equal(rice[0].n, '白飯');
for (const nutrient of ['k', 'p']) {
  const all = L.searchCandidates(['雞'], db.foods, nutrient, 50);
  assert.ok(all.length > 0 && all.every((f) => typeof f[nutrient] === 'number'));
}
assert.deepEqual(L.searchCandidates([], db.foods, 'k'), []);
assert.deepEqual(L.searchCandidates(['不存在的食物名稱xyz'], db.foods, 'k'), []);
assert.ok(L.searchCandidates(['香蕉'], db.foods, 'k', 3).length <= 3);

// AI 挑選編號：1-based，越界或 0 視為查無
const c = banana.slice(0, 3);
assert.equal(c.length, 3);
assert.equal(L.pickCandidate(c, 1), c[0]);
assert.equal(L.pickCandidate(c, '2'), c[1]);
assert.equal(L.pickCandidate(c, 0), null);
assert.equal(L.pickCandidate(c, 4), null);
assert.equal(L.pickCandidate(c, 1.5), null);
assert.equal(L.pickCandidate(c, undefined), null);

const text = L.describeCandidates(rice.slice(0, 2), 'p');
assert.match(text, /^1\. 白飯/);
assert.match(text, /磷 \d+(\.\d+)? mg\/100g（(低|中|高)磷）/);

// 病人狀態：只有兩種，未知值退回未洗腎
assert.deepEqual(Object.keys(L.MODES).sort(), ['dialysis', 'predialysis']);
assert.equal(L.modeOf('dialysis'), 'dialysis');
assert.equal(L.modeOf('predialysis'), 'predialysis');
assert.equal(L.modeOf('x'), 'predialysis');
assert.equal(L.modeOf(undefined), 'predialysis');
assert.match(L.MODES.predialysis.proteinAdvice, /控制/);
assert.match(L.MODES.dialysis.proteinAdvice, /吃夠/);

// 磷／蛋白質比
assert.equal(L.phosphorusPerProtein({ p: 39, pr: 3.1 }), 12.6);
assert.equal(L.phosphorusPerProtein({ p: 39, pr: 0 }), null);
assert.equal(L.phosphorusPerProtein({ p: 39, pr: null }), null);
assert.equal(L.phosphorusPerProtein({ p: null, pr: 3 }), null);
assert.ok(db.foods.every((f) => f.pr === null || (typeof f.pr === 'number' && f.pr >= 0)), 'protein values');

console.log(`food-lookup checks passed (${db.foods.length} foods).`);
