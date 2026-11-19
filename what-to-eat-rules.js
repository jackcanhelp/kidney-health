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

  // 磷分級：沿用磷掃描器的定義（低 < 100、中 100–250、高 > 250 mg/100g）。只用來標示，不影響「不建議」判定。
  var P_LOW_MAX_EXCLUSIVE = 100;
  var P_MEDIUM_MAX_INCLUSIVE = 250;
  function pLevelOf(p) {
    if (typeof p !== 'number' || !isFinite(p)) return 'unknown';
    if (p < P_LOW_MAX_EXCLUSIVE) return 'low';
    if (p <= P_MEDIUM_MAX_INCLUSIVE) return 'medium';
    return 'high';
  }
  // 常加磷酸鹽的加工品與飲料：這種磷幾乎全部被吸收，資料庫的磷含量也不一定算得到，不論分級都提醒少吃。
  var PHOSPHATE_ADDITIVE_RE = /火腿|香腸|臘腸|培根|熱狗|貢丸|魚丸|肉丸|丸子|[肉魚]鬆|肉酥|肉乾|肉脯|午餐肉|可樂(?!餅)|汽水|碳酸飲料|起司片|加工起司|奶精/;
  // 只看名稱：「加工調理食品及其他類」整類有 316 筆，連米粉、包子、免煮飯都在內，不能整類當成加了磷酸鹽。
  // 有選定的資料列就只看它：搜尋「可樂」選到「冷凍可樂餅」時，搜尋詞不能讓它變成可樂
  function isPhosphateAdditive(item) {
    return PHOSPHATE_ADDITIVE_RE.test(item.dbName || item.name || '');
  }
  function pLevelLabel(level) {
    return { low: '低磷', medium: '中磷', high: '高磷', unknown: '磷未知' }[level];
  }

  function isSeasoning(item) {
    return item.category === SEASONING_CATEGORY || item.isSeasoning === true;
  }

  /* 回傳 { code: 'avoid' | 'caution' | 'ok', label, reason }。
   * name 與比對到的資料庫名稱都要檢查：使用者可能拍到「薄鹽醬油」但比對到「醬油」。 */
  // 標籤都帶「鉀」字（2026-11-19 使用者要求）：同一行還有磷分級，只寫「可吃」會被誤會成磷也沒問題。
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
        return { code: 'caution', label: '⚠ 高鉀少量', reason: '調味料含鉀偏高，用量以小匙計，不要淋湯汁拌飯。' };
      }
      if (level === 'unknown') return { code: 'caution', label: '? 鉀無資料，少量用', reason: '查不到鉀含量，用量以小匙計。' };
      return { code: 'ok', label: levelLabel(level) + '可用', reason: '' };
    }

    if (typeof k === 'number' && k >= AVOID_FOOD_MIN) {
      return { code: 'avoid', label: '✕ 不建議', reason: '含鉀很高，限鉀的腎友建議換成同類的低鉀食材。' };
    }
    if (level === 'high') {
      var cat = item.category || '';
      var why = /水果/.test(cat) ? '高鉀水果：烹調去不掉鉀，一次只吃少量。'
        : /肉|魚貝|蛋|豆/.test(cat) ? '高鉀：份量照營養師建議，可先汆燙，燉湯湯汁不喝。'
        : '高鉀：份量要少，切小塊先汆燙、湯汁不喝。';
      return { code: 'caution', label: '⚠ 高鉀限量', reason: why };
    }
    if (level === 'medium') {
      return { code: 'ok', label: '中鉀適量', reason: '' };
    }
    if (level === 'low') {
      return { code: 'ok', label: '低鉀可吃', reason: '' };
    }
    return { code: 'caution', label: '? 鉀無資料', reason: '查不到鉀含量，請詢問營養師。' };
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
    '牛肉': ['牛前胸肉', '去骨牛小排'],
    // 2026-11-13 補：原名會撞到別的品項（地瓜→豆薯、小黃瓜→醃漬、米粉→玉米粉）或查無
    '地瓜': ['白皮甘藷'],
    '番薯': ['白皮甘藷'],
    '小黃瓜': ['花胡瓜(有機)'],
    '米粉': ['細米粉'],
    '吐司': ['土司'],
    '雞腿肉': ['清腿平均值'],
    '雞腿': ['清腿平均值'],
    '綠花椰菜': ['青花菜(2021年取樣)'],
    '青花菜': ['青花菜(2021年取樣)'],
    '蝦仁': ['白對蝦平均值'],
    '蝦子': ['白對蝦平均值'],
    '蔥': ['青蔥平均值'],
    '豬里肌': ['豬大里肌'],
    '義大利麵': ['通心麵']
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

  var STATE_PREFIX_RE = /^(?:冷凍|冷藏|新鮮|生鮮|有機|進口|國產|台灣)+/;
  function inOrder(term, name) { // term 的每個字都依序出現在 name 裡
    var at = 0;
    for (var i = 0; i < term.length; i++) {
      at = name.indexOf(term.charAt(i), at);
      if (at < 0) return false;
      at++;
    }
    return true;
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
      // 「冷凍酪梨」「新鮮香菇」：資料庫沒有這種組合時，拿掉保存狀態的字再找一次（排在原詞後面，分數較低）
      var bare = t.replace(STATE_PREFIX_RE, '');
      if (bare !== t && bare.length >= 2) all.push(bare);
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
    // 完全沒有命中時退一步：字依序出現就算（「梅粉」→「梅子粉」），只當候選，不自動選（分數低於門檻）
    if (!ranked.length) {
      var raw = all.filter(function (t) { return t.length >= 2; });
      db.forEach(function (entry) {
        var names = [entry.name].concat(entry.aliases ? String(entry.aliases).split(/[,，、]/) : []);
        var hit = raw.some(function (t) { return names.some(function (n) { return inOrder(t, n); }); });
        if (hit && !seen[entry.name]) {
          seen[entry.name] = true;
          ranked.push({ entry: entry, score: Math.max(1, 30 - entry.name.length) });
        }
      });
    }
    ranked.sort(function (a, b) { return b.score - a.score || a.entry.name.length - b.entry.name.length; });
    var candidates = ranked.slice(0, limit || 8).map(function (r) { return r.entry; });
    var best = ranked.length && ranked[0].score >= 50 ? ranked[0].entry : null;
    return { best: best, candidates: candidates };
  }

  /* 食藥署 food-nutrients.json 的一筆 → 本工具使用的形狀。 */
  function fromNutrientRow(row) {
    return { name: row.n, aliases: row.a || '', category: row.c, potassium: row.k, phosphorus: row.p, protein: row.pr };
  }

  // 「蛋白質食物」＝肉、魚貝、蛋、豆類，以及豆腐、豆干這類豆製品（食藥署歸在加工調理類），且每 100 g 粗蛋白 ≥ 5 g（沒有數字就只看類別）。
  // 只看蛋白質克數會把乾麵條、小米、堅果算進來，洗腎中那句「要吃夠優質蛋白」就錯了（2026-11-20）。
  // 乳品不算：起司、奶粉磷高，給「含磷偏高，不要吃太多」比「蛋白質要吃夠」安全
  // 加工調理類混著餐點、麵條、肉製品：豆製品看品名；烤雞、熟鵝、叉燒、魚鬆這類肉魚製品要品名有肉魚字且蛋白質 ≥ 15 g
  // （乾麵條 11.6、水餃 9 左右都不到），堅果點心（蛋酥花生）排除。門檻是拿全食藥署資料比對後定的
  var PROTEIN_RICH_MIN = 5, PROCESSED_PROTEIN_MIN = 15;
  function isProteinRich(item) {
    var name = item.dbName || item.name || '';
    var hasP = typeof item.protein === 'number' && isFinite(item.protein);
    // 豆製品不看門檻（嫩豆腐 4.9 g 也是蛋白質食物）；壽司、阿給這類整道餐點不算（Codex 十二審）
    if (/豆腐|豆干|豆乾|豆包|豆皮/.test(name)) return !/壽司|粉絲|飯糰/.test(name);
    if (/肉|魚貝|蛋|豆類/.test(item.category || '')) return !hasP || item.protein >= PROTEIN_RICH_MIN;
    if (/加工調理/.test(item.category || '')) {
      return hasP && item.protein >= PROCESSED_PROTEIN_MIN &&
        // 魚字旁（鯡、鯖、鮭…）整段都算：鹹馧仔品名是「小鱗脂眼鯡」；醬肘子是豬（Codex 十二審）
        /雞|鴨|鵝|牛|豬|羊|[魚-鱿]|蝦|蟹|花枝|小卷|魷|肘|肉|麵筋|麵腸/.test(name) &&
        !/花生|瓜子|堅果|杏仁|核桃|腰果|松子/.test(name);
    }
    return false;
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
    var additive = isPhosphateAdditive(item);
    if (isProteinRich(item) && v.code !== 'avoid' && !additive) {
      tips.push(mode === 'dialysis'
        ? '洗腎中：這是蛋白質食物，要吃夠，每餐都要有一份優質蛋白，份量照營養師建議。'
        : '未洗腎：這是蛋白質食物，份量要控制，照醫師或營養師的低蛋白飲食份量吃，不要多吃。');
    }
    // 磷：天然食物裡的磷只標示；肉魚蛋豆是蛋白質來源，不因為磷就避開，要少吃的是加了磷酸鹽的加工品。
    var pl = pLevelOf(item.phosphorus);
    if (v.code !== 'avoid' && additive) {
      tips.push('加工食品和可樂、汽水常加磷酸鹽，這種磷幾乎全部會被吸收；腎友盡量少吃，偶爾吃也只吃一點。');
    } else if (v.code !== 'avoid' && (pl === 'medium' || pl === 'high')) {
      var pWord = '含磷' + (pl === 'high' ? '偏高' : '中等');
      // 上面有蛋白質份量提醒時不能再說「不要吃太多」（洗腎中那句是「要吃夠」）
      tips.push(!isProteinRich(item) ? pWord + '，不要吃太多。'
        : pWord + '，但這是蛋白質來源，照上面的份量吃就好；真正要少吃的是火腿、香腸、丸子、可樂這類加了磷酸鹽的加工食品。');
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

  // AI 的 not_used 有時會列出其實已放進材料的食材（例：材料有葡萄，not_used 又寫葡萄）。
  // 材料名含有該名稱就拿掉。只做單向比對（材料名包含 not_used 名），not_used「洋蔥」不會因為材料有「蔥」被誤刪。
  function filterNotUsed(notUsed, ingredients) {
    var names = (ingredients || []).map(function (ing) { return String(ing && ing.name || '').replace(/\s+/g, ''); });
    return (notUsed || []).filter(function (x) {
      var n = String(x && x.name || '').replace(/\s+/g, '');
      return n && !names.some(function (m) { return m.indexOf(n) >= 0; });
    });
  }

  /* AI 回的 JSON 文字 → 物件。先原樣解析；失敗才拿掉「包住整份回覆」的 ``` 圍欄（不動字串內容），
   * 再失敗就從每個 { 開始找完整物件，第一個解析得了的就用。
   * 2026-11-13 實測 flash-lite 偶爾在正確 JSON 後面多吐一段殘字，整段 JSON.parse 會失敗。 */
  function balancedFrom(t, start) {
    var depth = 0, inStr = false, esc = false;
    for (var i = start; i < t.length; i++) {
      var ch = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return t.slice(start, i + 1);
    }
    return null;
  }
  function parseAiJson(text) {
    var raw = String(text || '');
    try { return JSON.parse(raw); } catch (e) { /* 往下 */ }
    var t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    try { return JSON.parse(t); } catch (e) { /* 往下找完整物件 */ }
    for (var s = t.indexOf('{'); s >= 0; s = t.indexOf('{', s + 1)) {
      var cand = balancedFrom(t, s);
      if (!cand) continue;
      try { return JSON.parse(cand); } catch (e) { /* 試下一個 { */ }
    }
    throw new Error('AI 回覆的 JSON 不完整');
  }

  var api = {
    LOW_MAX_EXCLUSIVE: LOW_MAX_EXCLUSIVE,
    MEDIUM_MAX_INCLUSIVE: MEDIUM_MAX_INCLUSIVE,
    AVOID_FOOD_MIN: AVOID_FOOD_MIN,
    AVOID_SEASONING_MIN: AVOID_SEASONING_MIN,
    levelOf: levelOf,
    levelLabel: levelLabel,
    P_LOW_MAX_EXCLUSIVE: P_LOW_MAX_EXCLUSIVE,
    P_MEDIUM_MAX_INCLUSIVE: P_MEDIUM_MAX_INCLUSIVE,
    pLevelOf: pLevelOf,
    pLevelLabel: pLevelLabel,
    isPhosphateAdditive: isPhosphateAdditive,
    verdict: verdict,
    matchFood: matchFood,
    PROTEIN_RICH_MIN: PROTEIN_RICH_MIN,
    fromNutrientRow: fromNutrientRow,
    isProteinRich: isProteinRich,
    recipeProteinRule: recipeProteinRule,
    adviceFor: adviceFor,
    flagRecipeIngredients: flagRecipeIngredients,
    filterNotUsed: filterNotUsed,
    parseAiJson: parseAiJson
  };
  root.WhatToEatRules = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
