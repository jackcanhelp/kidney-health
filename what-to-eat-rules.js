/* 「今天吃甚麼？」的分級、比對與建議規則。
 * 純函式，瀏覽器以 <script> 載入（掛在 globalThis.WhatToEatRules），
 * Node 端由 what-to-eat-rules.test.mjs 以 import 載入做邊界測試。
 *
 * 鉀含量一律以「每 100 g 可食部分」計，數字來源優先用食藥署食品營養成分資料庫
 * （站內 potassium_data.json）；比對不到才用 AI 估計值，並標示「估計」。
 */
(function (root) {
  'use strict';

  // 分級門檻：沿用鉀離子掃描器的定義（低 < 150、中 150–300、高 > 300 mg/100g）。
  var LOW_MAX_EXCLUSIVE = 150;   // < 150 為低鉀
  var MEDIUM_MAX_INCLUSIVE = 300; // 150–300 為中鉀，> 300 為高鉀
  // 「✕ 不建議」門檻（2026-11-13 定）：一般食材 ≥ 500、調味料／香辛料 ≥ 1000 mg/100g。
  var AVOID_FOOD_MIN = 500;
  var AVOID_SEASONING_MIN = 1000;

  var SEASONING_CATEGORY = '調味料及香辛料類';

  // 以氯化鉀取代氯化鈉的代鹽類調味料：不論查到多少，一律不建議。
  var POTASSIUM_SALT_RE = /低鈉|代鹽|薄鹽|減鈉|低鹽|健康美味鹽|鉀鹽/;
  var STAR_FRUIT_RE = /楊桃/;

  function levelOf(k) {
    if (typeof k !== 'number' || !isFinite(k)) return 'unknown';
    if (k < LOW_MAX_EXCLUSIVE) return 'low';
    if (k <= MEDIUM_MAX_INCLUSIVE) return 'medium';
    return 'high';
  }

  function levelLabel(level) {
    return { low: '低鉀', medium: '中鉀', high: '高鉀', unknown: '未知' }[level];
  }

  function isSeasoning(item) {
    return item.category === SEASONING_CATEGORY || item.isSeasoning === true;
  }

  /* 回傳 { code: 'avoid' | 'caution' | 'ok', label, reason }。
   * name 與比對到的資料庫名稱都要檢查：使用者可能拍到「薄鹽醬油」但比對到「醬油」。 */
  function verdict(item) {
    var names = [item.name || '', item.dbName || ''].join(' ');
    var k = item.potassium;

    if (STAR_FRUIT_RE.test(names)) {
      return { code: 'avoid', label: '✕ 不建議', reason: '楊桃含神經毒素，腎功能不好時排不掉，腎友不要吃。' };
    }
    if (POTASSIUM_SALT_RE.test(names)) {
      return { code: 'avoid', label: '✕ 不建議', reason: '低鈉／薄鹽類調味料多用「鉀」取代「鈉」，腎友吃反而容易高血鉀。' };
    }

    var level = levelOf(k);
    if (isSeasoning(item)) {
      if (typeof k === 'number' && k >= AVOID_SEASONING_MIN) {
        return { code: 'avoid', label: '✕ 不建議', reason: '這項調味料含鉀很高，建議改用蔥、薑、蒜、白醋等少量提味。' };
      }
      if (level === 'high') {
        return { code: 'caution', label: '⚠ 少量', reason: '調味料含鉀偏高，用量以小匙計，不要淋湯汁拌飯。' };
      }
      return { code: 'ok', label: '可用', reason: '' };
    }

    if (typeof k === 'number' && k >= AVOID_FOOD_MIN) {
      return { code: 'avoid', label: '✕ 不建議', reason: '含鉀很高，限鉀的腎友建議換成同類的低鉀食材。' };
    }
    if (level === 'high') {
      var cat = item.category || '';
      var why = /水果/.test(cat) ? '高鉀水果：烹調去不掉鉀，一次只吃少量。'
        : /肉|魚貝|蛋|豆/.test(cat) ? '高鉀：份量照營養師建議，可先汆燙，燉湯湯汁不喝。'
        : '高鉀：份量要少，切小塊先汆燙、湯汁不喝。';
      return { code: 'caution', label: '⚠ 限量', reason: why };
    }
    if (level === 'medium') {
      return { code: 'ok', label: '適量', reason: '' };
    }
    if (level === 'low') {
      return { code: 'ok', label: '可吃', reason: '' };
    }
    return { code: 'caution', label: '? 無資料', reason: '查不到鉀含量，請詢問營養師。' };
  }

  // 常見俗名 → 食藥署資料庫用名。AI 也會給 tfda_terms，這張表只補它常漏的。
  var ALIASES = {
    '香蕉': ['北蕉'],
    '高麗菜': ['甘藍'],
    '包心菜': ['甘藍'],
    '大白菜': ['包心白菜'],
    '番茄': ['大番茄平均值'],
    '蕃茄': ['大番茄平均值'],
    '豬肉': ['豬後腿肉', '豬大里肌'],
    '雞蛋': ['雞蛋(白殼)'],
    '蛋': ['雞蛋(白殼)'],
    '鮭魚': ['大西洋鮭魚平均值(去皮)'],
    '紅蘿蔔': ['胡蘿蔔平均值', '胡蘿蔔'],
    '蒜頭': ['大蒜'],
    '洋蔥': ['黃洋蔥', '白洋蔥'],
    '薑': ['老薑', '嫩薑'],
    '豆腐': ['傳統豆腐', '嫩豆腐'],
    '雞胸肉': ['去皮清肉平均值'],
    '雞胸': ['去皮清肉平均值'],
    '米飯': ['白飯'],
    '飯': ['白飯'],
    '鯛魚': ['台灣鯛魚片(水煮)'],
    '牛肉': ['牛前胸肉', '去骨牛小排']
  };

  // 加工品字樣：使用者拍的是生鮮食材時，這些不該被選中。
  var PROCESSED_RE = /冷凍|粉|乾|醬|罐|汁|酥|包子|餃|麵|糕|餅|條|丸|捲|湯|茶|糖|酒|飲|飯糰|炒飯|乳酪|蛋糕/;

  function scoreEntry(entryName, term, aliases) {
    if (!term) return 0;
    var score;
    if (entryName === term) score = 100;
    else if (aliases && aliases.indexOf(term) >= 0) score = 92; // 資料庫俗名完全相同，例如「高麗菜」是甘藍的俗名
    else if (entryName.indexOf(term + '平均值') === 0) score = 98;
    else if (entryName.indexOf(term + '(') === 0) score = 85;
    else if (entryName.indexOf(term) === 0) score = 75;
    else if (entryName.indexOf(term) >= 0) score = 60;
    else return 0;
    if (/平均值/.test(entryName)) score += 5;
    if (PROCESSED_RE.test(entryName) && !PROCESSED_RE.test(term)) score -= 40;
    score -= Math.min(15, Math.max(0, entryName.length - term.length));
    return score;
  }

  /* 在資料庫裡找最像的一筆。terms 依優先順序排（第一個是 AI 給的名稱）。
   * 回傳 { best, candidates }；best 分數未達門檻時為 null。 */
  function matchFood(terms, db, limit) {
    var all = [];
    (terms || []).forEach(function (t) {
      if (!t) return;
      t = String(t).trim();
      if (!t) return;
      // 有別名時別名優先：「豆腐」原名會先撞到「豆腐皮」，別名才指得到生鮮那一筆。
      (ALIASES[t] || []).forEach(function (a) { all.push(a); });
      all.push(t);
    });
    var seen = {};
    var ranked = [];
    db.forEach(function (entry) {
      var best = 0;
      var aliases = entry.aliases ? String(entry.aliases).split(/[,，、]/) : null;
      all.forEach(function (t, i) {
        var s = scoreEntry(entry.name, t, aliases) - i; // 越前面的詞越優先
        if (s > best) best = s;
      });
      if (best > 0 && !seen[entry.name]) {
        seen[entry.name] = true;
        ranked.push({ entry: entry, score: best });
      }
    });
    ranked.sort(function (a, b) { return b.score - a.score || a.entry.name.length - b.entry.name.length; });
    var candidates = ranked.slice(0, limit || 8).map(function (r) { return r.entry; });
    var best = ranked.length && ranked[0].score >= 50 ? ranked[0].entry : null;
    return { best: best, candidates: candidates };
  }

  /* 食藥署 food-nutrients.json 的一筆 → 本工具使用的形狀。 */
  function fromNutrientRow(row) {
    return { name: row.n, aliases: row.a || '', category: row.c, potassium: row.k, protein: row.pr };
  }

  // 「蛋白質食物」：每 100 g 粗蛋白 ≥ 5 g；沒有蛋白質數字時退回看類別。
  var PROTEIN_RICH_MIN = 5;
  function isProteinRich(item) {
    if (typeof item.protein === 'number' && isFinite(item.protein)) return item.protein >= PROTEIN_RICH_MIN;
    return /肉|魚貝|蛋|豆|乳品/.test(item.category || '');
  }

  // 食譜裡蛋白質份量的規則，依未洗腎／洗腎中而不同（給 AI 的指示）。
  var RECIPE_PROTEIN_RULE = {
    predialysis: '病人未洗腎，需要低蛋白飲食：肉、魚、蛋、豆類每人份量少（約 1 份，例如肉類 35 公克或雞蛋 1 顆），以蔬菜和低蛋白澱粉（白飯、冬粉、米粉）撐起份量；不要額外加蛋、豆腐或肉。',
    dialysis: '病人洗腎中，蛋白質要吃夠：每人要有足量的優質蛋白（蛋、魚、雞肉、瘦肉、豆腐）當主角；若可用食材裡沒有蛋白質食物，可建議加入 1 樣（例如雞蛋或雞胸肉），並在材料名稱後註明「（建議添加）」。'
  };
  function recipeProteinRule(mode) {
    return RECIPE_PROTEIN_RULE[mode === 'dialysis' ? 'dialysis' : 'predialysis'];
  }

  // 依分級與類別產生衛教建議（不經 AI，固定文字）。
  // mode 為 'predialysis' 或 'dialysis'；蛋白質食物的份量原則兩者相反。
  function adviceFor(item, mode) {
    var v = verdict(item);
    var level = levelOf(item.potassium);
    var cat = item.category || '';
    var tips = [];
    if (v.reason) tips.push(v.reason);

    if (/蔬菜|菇|藻/.test(cat)) {
      if (level === 'high' || level === 'medium') tips.push('切小塊或切絲，滾水汆燙約 3 分鐘、撈起瀝乾再炒，可去掉部分鉀；燙菜水倒掉。');
      tips.push('菜湯、滷汁不要拌飯，鉀會溶在湯裡。');
    } else if (/水果/.test(cat)) {
      tips.push('水果無法靠烹調去鉀，重點在份量：一次約一個拳頭大小，一天不超過兩份（依醫囑調整）。');
      tips.push('果汁、果乾含鉀更濃縮，盡量避免。');
    } else if (/肉|魚貝|蛋|豆/.test(cat)) {
      tips.push('燉湯、滷肉的湯汁含鉀與磷，吃料不喝湯。');
    } else if (/穀物|澱粉/.test(cat)) {
      if (level === 'high') tips.push('全穀、雜糧含鉀磷較高，限鉀期間可改白米飯、白麵條。');
      else tips.push('精緻澱粉含鉀較低，可當主食的熱量來源。');
    } else if (cat === SEASONING_CATEGORY) {
      tips.push('用天然辛香料（蔥、薑、蒜、白醋、檸檬汁少量）提味，比依賴醬料安全。');
    }
    if (isProteinRich(item) && v.code !== 'avoid') {
      tips.push(mode === 'dialysis'
        ? '洗腎中：這是蛋白質食物，要吃夠，每餐都要有一份優質蛋白，份量照營養師建議。'
        : '未洗腎：這是蛋白質食物，份量要控制，照醫師或營養師的低蛋白飲食份量吃，不要多吃。');
    }
    return tips;
  }

  // 食譜材料裡出現的不建議項目（只檢查材料名，不檢查步驟，避免「勿用低鈉鹽」被誤判）。
  function flagRecipeIngredients(ingredients) {
    return (ingredients || []).map(function (ing) {
      var name = String(ing && ing.name || '');
      var v = verdict({ name: name, potassium: null, category: '' });
      return { name: name, avoid: v.code === 'avoid', reason: v.code === 'avoid' ? v.reason : '' };
    });
  }

  var api = {
    LOW_MAX_EXCLUSIVE: LOW_MAX_EXCLUSIVE,
    MEDIUM_MAX_INCLUSIVE: MEDIUM_MAX_INCLUSIVE,
    AVOID_FOOD_MIN: AVOID_FOOD_MIN,
    AVOID_SEASONING_MIN: AVOID_SEASONING_MIN,
    levelOf: levelOf,
    levelLabel: levelLabel,
    verdict: verdict,
    matchFood: matchFood,
    PROTEIN_RICH_MIN: PROTEIN_RICH_MIN,
    fromNutrientRow: fromNutrientRow,
    isProteinRich: isProteinRich,
    recipeProteinRule: recipeProteinRule,
    adviceFor: adviceFor,
    flagRecipeIngredients: flagRecipeIngredients
  };
  root.WhatToEatRules = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
