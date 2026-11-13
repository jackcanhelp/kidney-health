/* 鉀離子／磷含量掃描器共用：食藥署食品營養成分資料庫的候選搜尋與分級。
 * 純函式，瀏覽器以 <script> 載入（掛在 globalThis.FoodLookup），
 * Node 端由 food-lookup.test.mjs 載入做邊界測試。
 *
 * 流程：AI 看照片給出食物名稱與可能的資料庫用名 → searchCandidates 從
 * food-nutrients.json 找出候選 → AI 只負責「從候選中挑一筆」→ 數值與分級
 * 一律取資料庫的值，由 classify 依固定門檻判定；查無相符才退回 AI 估算。
 */
(function (root) {
  'use strict';

  // 分級門檻（mg/100g 可食部分），與兩個掃描器頁面圖例一致。
  var NUTRIENTS = {
    k: { label: '鉀', lowBelow: 150, mediumMax: 300 },  // 低 <150、中 150–300、高 >300
    p: { label: '磷', lowBelow: 100, mediumMax: 250 }   // 低 <100、中 100–250、高 >250
  };

  // 病人狀態：鉀、磷的數值與分級兩者相同；差在蛋白質要「控制」還是要「吃夠」。
  var MODES = {
    predialysis: {
      label: '未洗腎',
      proteinAdvice: '未洗腎：蛋白質要控制，肉、魚、蛋、豆的份量照醫師或營養師的低蛋白飲食建議，不要額外補充蛋白粉。',
      aiContext: '病人是「未洗腎」的慢性腎臟病患者，需要低蛋白飲食（蛋白質份量要控制）。'
    },
    dialysis: {
      label: '洗腎中',
      proteinAdvice: '洗腎中：透析會流失蛋白質，蛋白質要吃夠，優先選蛋、魚、雞肉、黃豆製品等優質蛋白，份量照營養師建議。',
      aiContext: '病人是「洗腎中」（血液透析或腹膜透析）的患者，蛋白質要吃夠（高蛋白），同時要控制鉀與磷。'
    }
  };

  function modeOf(key) {
    return MODES[key] ? key : 'predialysis';
  }

  /* 每公克蛋白質含多少 mg 磷；蛋白質缺值或為 0 時回傳 null。 */
  function phosphorusPerProtein(food) {
    if (!food || typeof food.p !== 'number' || typeof food.pr !== 'number' || !(food.pr > 0)) return null;
    return Math.round(food.p / food.pr * 10) / 10;
  }

  function classify(nutrient, value) {
    var t = NUTRIENTS[nutrient];
    if (!t) throw new Error('unknown nutrient: ' + nutrient);
    if (typeof value !== 'number' || !isFinite(value)) return null;
    if (value < t.lowBelow) return 'low';
    if (value <= t.mediumMax) return 'medium';
    return 'high';
  }

  function levelLabel(nutrient, level) {
    var name = NUTRIENTS[nutrient].label;
    return { low: '低' + name, medium: '中' + name, high: '高' + name }[level] || '';
  }

  function normalize(s) {
    return String(s || '').replace(/\s+/g, '').trim();
  }

  function splitAliases(a) {
    return String(a || '').split(/[,，、]/).map(normalize).filter(Boolean);
  }

  function scoreText(text, term) {
    if (!text || !term) return 0;
    if (text === term) return 100;
    if (text.indexOf(term + '平均值') === 0) return 95;
    if (text.indexOf(term + '(') === 0) return 85;
    if (text.indexOf(term) === 0) return 75;
    if (text.indexOf(term) >= 0) return 60;
    if (term.length >= 2 && term.indexOf(text) >= 0 && text.length >= 2) return 45;
    return 0;
  }

  function scoreFood(food, term) {
    var name = normalize(food.n);
    var best = scoreText(name, term);
    // 名稱越長代表越特定（品種、部位、加工），扣分；「平均值」是資料庫的綜合代表值，不算在長度內。
    if (best) best -= Math.min(15, Math.max(0, name.replace('平均值', '').length - term.length));
    splitAliases(food.a).forEach(function (alias) {
      var s = scoreText(alias, term) - 10; // 俗名命中略低於正式名稱
      if (s > best) best = s;
    });
    return best;
  }

  /* terms：AI 給的名稱，越前面越優先。只回傳該營養素有數值的項目。 */
  function searchCandidates(terms, foods, nutrient, limit) {
    var list = [];
    var seen = {};
    (terms || []).forEach(function (t) {
      t = normalize(t);
      if (t && !seen[t]) { seen[t] = true; list.push(t); }
    });
    if (!list.length) return [];
    var ranked = [];
    (foods || []).forEach(function (food) {
      var v = food[nutrient];
      if (typeof v !== 'number' || !isFinite(v)) return;
      var best = 0;
      list.forEach(function (t, i) {
        var s = scoreFood(food, t);
        if (s > 0) s -= i * 2;
        if (s > best) best = s;
      });
      if (best > 0) ranked.push({ food: food, score: best });
    });
    ranked.sort(function (a, b) {
      return b.score - a.score || a.food.n.length - b.food.n.length;
    });
    return ranked.slice(0, limit || 12).map(function (r) { return r.food; });
  }

  /* 給 AI 挑選用的候選清單文字（編號從 1 開始）。 */
  function describeCandidates(candidates, nutrient) {
    return candidates.map(function (f, i) {
      var parts = [(i + 1) + '. ' + f.n];
      if (f.a) parts.push('俗名：' + f.a);
      if (f.s) parts.push('狀態：' + f.s);
      parts.push('分類：' + f.c);
      parts.push(NUTRIENTS[nutrient].label + ' ' + f[nutrient] + ' mg/100g（' + levelLabel(nutrient, classify(nutrient, f[nutrient])) + '）');
      return parts.join('｜');
    }).join('\n');
  }

  /* AI 回傳的編號 → 候選項目；不合法或 0 代表查無相符。 */
  function pickCandidate(candidates, index) {
    var n = Number(index);
    if (!Number.isInteger(n) || n < 1 || n > candidates.length) return null;
    return candidates[n - 1];
  }

  /* Gemini 免費額度用完（HTTP 429）時給使用者看的訊息；不是 429 回傳 null。
   * Google 的錯誤內容帶 retryDelay（例如 "12159s"），換算成本機時間告訴使用者大約幾點重置。 */
  function quotaMessage(status, bodyText, now) {
    if (status !== 429) return null;
    var msg = '目前額度用完，請等待重置';
    var m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(String(bodyText || ''));
    if (m) {
      var at = new Date((now instanceof Date ? now.getTime() : Date.now()) + Number(m[1]) * 1000);
      var hh = String(at.getHours()).padStart(2, '0');
      var mm = String(at.getMinutes()).padStart(2, '0');
      msg += '（約 ' + hh + ':' + mm + ' 後可再使用）';
    }
    return msg;
  }

  root.FoodLookup = Object.freeze({
    quotaMessage: quotaMessage,
    NUTRIENTS: NUTRIENTS,
    MODES: MODES,
    modeOf: modeOf,
    phosphorusPerProtein: phosphorusPerProtein,
    classify: classify,
    levelLabel: levelLabel,
    searchCandidates: searchCandidates,
    describeCandidates: describeCandidates,
    pickCandidate: pickCandidate
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
