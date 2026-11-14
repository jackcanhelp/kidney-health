/* 「今天吃甚麼？」挑食材目錄與常備食譜庫。
 * 純資料＋純函式，瀏覽器以 <script> 載入（掛在 globalThis.WhatToEatRecipes），node 測試直接 import。
 *
 * 常備食譜不經 AI：使用者挑的食材剛好湊得出其中一道時直接給，按「換一道」輪流推薦；
 * 湊不出來、或使用者想要用上全部食材時才請 AI 設計。AI 額度用完時也還有菜可以煮。
 *
 * 寫食譜的規則（測試會逐樣食材檢查）：
 * - 中鉀以上（≥150 mg/100 g）的蔬菜、菇類、豆製品，以及含鉀偏高的肉、魚、蝦：
 *   提到這樣食材的步驟裡要先汆燙或川燙，並倒掉燙水。汆燙時間全庫統一（蔬菜約 3 分鐘、肉約 1 分鐘），不寫例外。
 *   番茄要切小塊汆燙，不能只燙皮。不收汁濃縮、不做要喝湯的菜。
 * - 不用低鈉鹽、薄鹽醬油、代鹽、雞精、高湯塊、番茄醬、沙茶、蠔油、芝麻醬、豆瓣醬。
 * - 蛋、肉、海鮮要寫到「熟透」，不留半熟。
 * - 蛋白質份量 [未洗腎, 洗腎中]，2 人份合計。1 份 ≈ 7 g 蛋白質：瘦肉／魚 35 g、蝦仁 50 g、花枝 60 g、
 *   雞蛋 1 顆、傳統豆腐 80 g、豆干 40 g。未洗腎每人約 1 份，洗腎中每人約 2 份；兩種蛋白質同一道時合計。
 * - 材料或步驟中的 {0}、{1} 代表使用者實際挑的那一樣（needs 第 0、1 組）。
 * 2026-11-13 Codex 審查後依其意見修正（時間矛盾、燙皮不等於去鉀、熟度、豆腐種類、蛋白質份量）。
 */
(function (root) {
  'use strict';

  var GROUPS = [
    { id: 'veg', label: '蔬菜', emoji: '🥬' },
    { id: 'mush', label: '菇類', emoji: '🍄' },
    { id: 'egg', label: '蛋・豆', emoji: '🥚' },
    { id: 'meat', label: '肉類', emoji: '🍖' },
    { id: 'sea', label: '海鮮', emoji: '🐟' },
    { id: 'staple', label: '主食', emoji: '🍚' },
    { id: 'fruit', label: '水果', emoji: '🍎' }
  ];

  // key：顯示名稱，也是 matchFood 的查詢詞（別名表在 what-to-eat-rules.js）。
  // alias：名稱「完全相同」才算同一樣（不做子字串比對：「皮蛋」不是雞蛋、「玉米粉」不是米粉）。
  // db：對到這些食藥署品名的也算同一樣（拍照辨識的名稱五花八門，靠品名收斂）。
  var CATALOG = [
    { key: '高麗菜', emoji: '🥬', group: 'veg', alias: ['甘藍', '包心菜', '紫高麗菜', '紫甘藍'], db: ['甘藍(圓球形)', '甘藍(扁圓形)', '紫色甘藍'] },
    { key: '大白菜', emoji: '🥬', group: 'veg', alias: ['包心白菜', '山東白菜'] },
    { key: '小白菜', emoji: '🥬', group: 'veg', alias: [] },
    { key: '青江菜', emoji: '🥬', group: 'veg', alias: ['湯匙菜'] },
    { key: '空心菜', emoji: '🥬', group: 'veg', alias: ['蕹菜'] },
    { key: '綠豆芽', emoji: '🌱', group: 'veg', alias: ['豆芽', '豆芽菜'] },
    { key: '冬瓜', emoji: '🥒', group: 'veg', alias: [] },
    { key: '絲瓜', emoji: '🥒', group: 'veg', alias: [] },
    { key: '小黃瓜', emoji: '🥒', group: 'veg', alias: ['花胡瓜', '小胡瓜', '黃瓜'] },
    { key: '洋蔥', emoji: '🧅', group: 'veg', alias: ['黃洋蔥', '白洋蔥', '紫洋蔥'] },
    { key: '青椒', emoji: '🫑', group: 'veg', alias: ['甜椒'] },
    { key: '番茄', emoji: '🍅', group: 'veg', alias: ['蕃茄', '大番茄', '小番茄', '牛番茄', '聖女番茄'], db: ['大番茄平均值(綠色系)', '小番茄平均值(紅色系)'] },
    { key: '茄子', emoji: '🍆', group: 'veg', alias: ['長茄子'] },
    { key: '胡蘿蔔', emoji: '🥕', group: 'veg', alias: ['紅蘿蔔'] },
    { key: '花椰菜', emoji: '🥦', group: 'veg', alias: ['白花椰', '白花椰菜', '花菜'] },
    { key: '綠花椰菜', emoji: '🥦', group: 'veg', alias: ['青花菜', '綠花椰', '青花椰', '西蘭花'] },
    { key: '玉米筍', emoji: '🌽', group: 'veg', alias: [] },
    { key: '菠菜', emoji: '🥬', group: 'veg', alias: [] },
    { key: '地瓜葉', emoji: '🍃', group: 'veg', alias: ['甘藷葉', '番薯葉'] },
    { key: '南瓜', emoji: '🎃', group: 'veg', alias: [] },
    { key: '杏鮑菇', emoji: '🍄', group: 'mush', alias: [] },
    { key: '香菇', emoji: '🍄', group: 'mush', alias: ['鮮香菇'] },
    { key: '金針菇', emoji: '🍄', group: 'mush', alias: [] },
    { key: '雞蛋', emoji: '🥚', group: 'egg', alias: ['蛋', '土雞蛋', '白殼蛋', '紅殼蛋'] },
    { key: '豆腐', emoji: '⬜', group: 'egg', alias: ['傳統豆腐', '板豆腐', '嫩豆腐'], db: ['嫩豆腐', '傳統豆腐(2022年取樣)'] },
    { key: '豆干', emoji: '🟫', group: 'egg', alias: ['豆乾', '小方豆干', '五香豆干'] },
    { key: '豬肉', emoji: '🥩', group: 'meat', alias: ['豬里肌', '豬後腿肉', '豬肉片', '肉絲', '豬肉絲', '梅花肉', '里肌肉'], db: ['豬大里肌', '豬後腿肉', '豬上肩肉', '豬小里肌'] },
    { key: '豬絞肉', emoji: '🥩', group: 'meat', alias: ['絞肉', '肉末', '豬肉末'] },
    { key: '雞胸肉', emoji: '🐔', group: 'meat', alias: ['雞胸', '雞肉'], db: ['去皮清肉(肉雞)', '去皮清肉(土雞)'] },
    { key: '雞腿肉', emoji: '🍗', group: 'meat', alias: ['雞腿', '去骨雞腿'], db: ['清腿(肉雞)', '清腿(土雞)'] },
    { key: '牛肉', emoji: '🥩', group: 'meat', alias: ['牛肉片', '牛肉絲'] },
    { key: '鮭魚', emoji: '🐟', group: 'sea', alias: ['鮭魚片'] },
    { key: '鯛魚', emoji: '🐟', group: 'sea', alias: ['台灣鯛', '鯛魚片', '吳郭魚'] },
    { key: '蝦仁', emoji: '🦐', group: 'sea', alias: ['蝦', '蝦子', '白蝦', '草蝦'] },
    { key: '花枝', emoji: '🦑', group: 'sea', alias: ['烏賊', '透抽', '小卷', '魷魚'] },
    { key: '白飯', emoji: '🍚', group: 'staple', alias: ['米飯', '飯'] },
    { key: '麵條', emoji: '🍜', group: 'staple', alias: ['麵', '乾麵條', '陽春麵', '拉麵'] },
    { key: '冬粉', emoji: '🍜', group: 'staple', alias: ['粉絲'] },
    { key: '米粉', emoji: '🍜', group: 'staple', alias: ['細米粉', '炊粉'] },
    { key: '義大利麵', emoji: '🍝', group: 'staple', alias: ['通心麵', '直麵'] },
    { key: '吐司', emoji: '🍞', group: 'staple', alias: ['土司', '白吐司'] },
    { key: '馬鈴薯', emoji: '🥔', group: 'staple', alias: ['洋芋'] },
    { key: '地瓜', emoji: '🍠', group: 'staple', alias: ['甘藷', '番薯'] },
    { key: '蘋果', emoji: '🍎', group: 'fruit', alias: [] },
    { key: '鳳梨', emoji: '🍍', group: 'fruit', alias: [] },
    { key: '葡萄', emoji: '🍇', group: 'fruit', alias: [] },
    { key: '芭樂', emoji: '🍐', group: 'fruit', alias: [] },
    { key: '西瓜', emoji: '🍉', group: 'fruit', alias: [] },
    { key: '香蕉', emoji: '🍌', group: 'fruit', alias: [] },
    { key: '楊桃', emoji: '⭐', group: 'fruit', alias: [] }
  ];

  var BY_NAME = {};   // 名稱（key 或 alias）→ key，完全相同才算
  CATALOG.forEach(function (c) {
    [c.key].concat(c.alias).forEach(function (a) { if (!BY_NAME[a]) BY_NAME[a] = c.key; });
  });
  var BY_DB = {};     // 食藥署品名 → key；indexDb() 載入資料庫後補上各 key 自己對到的那一筆

  /* 載入食藥署資料後呼叫一次：每樣目錄食材「本身」對到的品名，加上 db 清單，都登記成同一樣。 */
  function indexDb(db, rules) {
    BY_DB = {};
    CATALOG.forEach(function (c) {
      (c.db || []).forEach(function (n) { if (!BY_DB[n]) BY_DB[n] = c.key; });
      var best = rules.matchFood([c.key], db).best;
      if (best && !BY_DB[best.name]) BY_DB[best.name] = c.key;
    });
  }

  /* 一樣食材（拍照、打字或挑選加入的）屬於目錄的哪一樣；認不出來回 null（交給 AI，不硬套食譜）。 */
  function keyOf(item) {
    if (!item) return null;
    var name = String(item.name || '').trim();
    if (BY_NAME[name]) return BY_NAME[name];
    var dbName = String(item.dbName || '');
    return BY_DB[dbName] || null;
  }

  function entryOf(key) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].key === key) return CATALOG[i];
    return null;
  }

  // ---------- 常備食譜 ----------
  // 份量 [未洗腎, 洗腎中]，2 人份合計（每人 1 份／2 份；兩種蛋白質時各半）
  var EGG2 = ['2 顆', '4 顆'];
  var EGG1 = ['1 顆', '2 顆'];
  var MEAT2 = ['70 g（每人約 35 g）', '140 g（每人約 70 g）'];
  var MEAT1 = ['35 g', '70 g'];
  var SHRIMP2 = ['100 g（每人約 50 g）', '200 g（每人約 100 g）'];
  var SHRIMP1 = ['50 g', '100 g'];
  var SQUID2 = ['120 g（每人約 60 g）', '240 g（每人約 120 g）'];
  var TOFU2 = ['傳統豆腐 160 g（約半盒）', '傳統豆腐 320 g（約 1 盒）'];
  var TOFU1 = ['傳統豆腐 80 g', '傳統豆腐 160 g'];
  var DOUGAN1 = ['40 g（約 1 片）', '80 g（約 2 片）'];
  var DOUGAN2 = ['80 g（約 2 片）', '160 g（約 4 片）'];
  var BLANCH_VEG = '切好後放進足量滾水汆燙約 3 分鐘，撈起瀝乾，燙菜水倒掉';
  var BLANCH_MEAT = '放進滾水川燙約 1 分鐘，撈起瀝乾，燙肉水倒掉';
  var BLANCH_FISH = '放進滾水川燙約 1 分鐘，撈起瀝乾，燙魚水倒掉';
  var OIL = { name: '食用油', amount: '1 大匙' };
  var SALT = { name: '鹽', amount: '少許' };
  var GARLIC = { name: '蒜', amount: '2 瓣' };
  var SCALLION = { name: '蔥', amount: '1 支' };
  var GINGER = { name: '薑', amount: '3 片' };
  var SOY = { name: '一般醬油', amount: '1 小匙' };
  var SUGAR = { name: '糖', amount: '少許' };
  var TWO_PROTEIN = '蛋和肉合起來就是這一餐的蛋白質份量，不用再另外加肉或蛋。';

  var RECIPES = [
    // ---- 雞蛋 ----
    { id: 'tomato-egg', style: 'chinese', needs: ['雞蛋', '番茄'], title: '番茄炒蛋', time: '約 15 分鐘',
      intro: '酸甜下飯的家常菜，番茄切小塊先汆燙。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '番茄', amount: '1 顆（中型）' }, SCALLION, OIL, SUGAR, SALT],
      steps: ['番茄切小塊，' + BLANCH_VEG + '。', '雞蛋打散加少許鹽；熱鍋下油，倒入蛋液炒到熟透成塊，先盛起。', '原鍋炒番茄到軟，加少許糖，倒回炒蛋拌勻，撒蔥花起鍋。'],
      tips: ['番茄是中鉀，一道菜用 1 顆就好，盤底湯汁不要拌飯。'] },
    { id: 'onion-egg', style: 'chinese', needs: ['雞蛋', '洋蔥'], title: '洋蔥炒蛋', time: '約 15 分鐘',
      intro: '洋蔥炒出甜味，簡單又下飯。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '洋蔥', amount: '半顆' }, OIL, SALT],
      steps: ['洋蔥切絲，' + BLANCH_VEG + '。', '雞蛋打散加少許鹽。', '熱鍋下油，炒洋蔥到出香氣，倒入蛋液，翻炒到蛋完全凝固熟透。'],
      tips: ['洋蔥汆燙後甜味還在，不必再加糖。'] },
    { id: 'omelette-onion', style: 'western', needs: ['雞蛋', '洋蔥'], title: '洋蔥歐姆蛋', time: '約 15 分鐘',
      intro: '西式蛋捲，配吐司或白飯都可以。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '洋蔥', amount: '1/4 顆' }, { name: '無鹽奶油或食用油', amount: '1 小塊' }, SALT, { name: '白胡椒', amount: '少許' }],
      steps: ['洋蔥切丁，' + BLANCH_VEG + '。', '雞蛋打散，加少許鹽與白胡椒；平底鍋小火融化奶油，炒香洋蔥丁後盛起。', '倒入蛋液，半凝固時放上洋蔥丁、對折，蓋上鍋蓋小火再煎 1–2 分鐘，到中心完全熟透。'],
      tips: ['奶油用量少就好；不要淋番茄醬，番茄醬含鉀與鈉都偏高。'] },
    { id: 'cabbage-egg', style: 'chinese', needs: ['雞蛋', '高麗菜'], title: '高麗菜炒蛋', time: '約 15 分鐘',
      intro: '高麗菜的清甜配上炒蛋，最常見的家常配菜。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '高麗菜', amount: '1/4 顆' }, GARLIC, OIL, SALT],
      steps: ['高麗菜切小片，' + BLANCH_VEG + '。', '雞蛋打散；熱鍋下油，把蛋炒到熟透成塊，先盛起。', '原鍋爆香蒜末，下高麗菜拌炒，倒回炒蛋、加少許鹽拌勻。'],
      tips: ['高麗菜汆燙後再炒，可以減少部分鉀，份量仍照建議。'] },
    { id: 'cabbage-pancake', style: 'chinese', needs: ['雞蛋', '高麗菜'], title: '高麗菜煎蛋餅', time: '約 20 分鐘',
      intro: '把菜和蛋煎成一片，切塊就能上桌。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '高麗菜', amount: '3 片葉子' }, { name: '中筋麵粉', amount: '2 大匙' }, SCALLION, OIL, SALT],
      steps: ['高麗菜切細絲，' + BLANCH_VEG + '，擠乾水分。', '雞蛋打散，拌入高麗菜絲、蔥花、麵粉和少許鹽。', '平底鍋下油，倒入麵糊攤平，小火兩面各煎 3 分鐘到金黃、中心熟透，切塊。'],
      tips: ['麵粉讓蛋餅更有飽足感，不必另外加肉。'] },
    { id: 'luffa-egg', style: 'chinese', needs: ['雞蛋', '絲瓜'], title: '絲瓜炒蛋', time: '約 15 分鐘',
      intro: '清甜絲瓜配嫩蛋，滑口清爽又好消化。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '絲瓜', amount: '半條' }, GINGER, OIL, SALT],
      steps: ['絲瓜去皮切小塊；雞蛋打散，炒到熟透成塊先盛起。', '原鍋爆香薑絲，下絲瓜炒到變軟（會出水，不用加水）。', '倒回炒蛋，加少許鹽拌勻。'],
      tips: ['絲瓜出的湯汁留在盤裡，不要拌飯喝掉。'] },
    { id: 'carrot-egg', style: 'chinese', needs: ['雞蛋', '胡蘿蔔'], title: '胡蘿蔔炒蛋', time: '約 15 分鐘',
      intro: '橘黃配色很開胃，胡蘿蔔切細絲比較快熟。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '胡蘿蔔', amount: '半條' }, SCALLION, OIL, SALT],
      steps: ['胡蘿蔔刨細絲，' + BLANCH_VEG + '。', '雞蛋打散加少許鹽；熱鍋下油炒胡蘿蔔絲到軟。', '倒入蛋液，翻炒到蛋完全凝固熟透，撒蔥花。'],
      tips: ['胡蘿蔔是中鉀蔬菜，切細絲再汆燙，接觸水的面積較大。'] },
    { id: 'fried-rice', style: 'chinese', needs: ['雞蛋', '白飯'], title: '黃金蛋炒飯', time: '約 15 分鐘',
      intro: '用隔夜飯最好炒，粒粒分明。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '白飯', amount: '2 碗' }, SCALLION, OIL, SALT],
      steps: ['雞蛋打散；熱鍋下油，倒入蛋液，馬上下白飯一起翻炒，讓蛋液包住米粒。', '炒到蛋液全熟、飯粒鬆散有香氣，加少許鹽。', '起鍋前撒蔥花。'],
      tips: ['想加青菜的話，切碎、汆燙、倒掉燙水後再拌入，份量少一點。'] },
    { id: 'egg-noodle', style: 'chinese', needs: ['雞蛋', '麵條'], title: '蔥油拌麵加荷包蛋', time: '約 15 分鐘',
      intro: '蔥段煸出焦香拌麵，配上全熟荷包蛋超滿足。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '麵條', amount: '乾麵條 2 小把（約 100 g）' }, { name: '蔥', amount: '3 支' }, OIL, SOY, SUGAR],
      steps: ['麵條煮熟撈起，煮麵水倒掉。', '小火用油把蔥段煸到焦香，加少許醬油和糖拌成蔥油醬。', '另煎荷包蛋到蛋黃全熟；麵拌上蔥油醬，放上荷包蛋。'],
      tips: ['蔥油醬拌麵就好，不要另外加湯。'] },
    { id: 'egg-toast', style: 'western', needs: ['雞蛋', '吐司'], title: '法式蛋吐司', time: '約 10 分鐘',
      intro: '蛋香奶油煎到金黃微酥，早餐點心都對味。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '吐司', amount: '2 片' }, { name: '無鹽奶油', amount: '1 小塊' }, SUGAR],
      steps: ['雞蛋打散加少許糖；吐司切半，兩面沾滿蛋液。', '平底鍋小火融化奶油，吐司兩面各煎 2 分鐘到金黃、蛋液熟透。', '沒沾完的蛋液倒進鍋裡炒熟，一起分著吃。'],
      tips: ['不要用牛奶泡吐司：牛奶含磷與鉀都不低。'] },
    { id: 'shrimp-egg', style: 'chinese', needs: ['雞蛋', '蝦仁'], title: '蝦仁炒蛋', time: '約 15 分鐘',
      intro: '炒蛋包著蝦仁，鮮甜不用多調味。',
      ingredients: [{ name: '雞蛋', amount: EGG1 }, { name: '蝦仁', amount: SHRIMP1 }, SCALLION, OIL, SALT],
      steps: ['蝦仁挑去腸泥，' + BLANCH_MEAT + '。', '雞蛋打散加少許鹽，拌入蝦仁。', '熱鍋下油，倒入蛋液翻炒到蛋和蝦都熟透，撒蔥花起鍋。'],
      tips: ['蛋和蝦合起來就是這一餐的蛋白質份量。'] },
    { id: 'tofu-egg', style: 'chinese', needs: ['雞蛋', '豆腐'], title: '豆腐蒸蛋', time: '約 20 分鐘',
      intro: '口感滑嫩，牙口不好的長輩也容易入口。',
      ingredients: [{ name: '雞蛋', amount: EGG1 }, { name: '豆腐', amount: TOFU1 }, { name: '開水', amount: '蛋液的 1.5 倍' }, SCALLION, SOY],
      steps: ['豆腐切小丁，' + BLANCH_VEG.replace('燙菜水', '燙豆腐的水') + '。', '雞蛋打散，加開水拌勻、過篩，倒在豆腐丁上。', '電鍋外鍋半杯水蒸到跳起，確認中心凝固熟透，淋少許醬油、撒蔥花。'],
      tips: ['用開水，不要用雞高湯或高湯塊。'] },

    // ---- 豬肉 ----
    { id: 'pork-egg-slide', style: 'chinese', needs: ['雞蛋', ['豬肉', '豬絞肉']], title: '肉片炒蛋', time: '約 15 分鐘',
      intro: '肉先燙過再炒，軟嫩不油。',
      ingredients: [{ name: '雞蛋', amount: EGG1 }, { name: '{1}', amount: MEAT1 }, SCALLION, OIL, SALT],
      steps: ['{1}切薄片（絞肉直接撥散），' + BLANCH_MEAT + '。', '熱鍋下油，先把肉炒到全熟。', '倒入加了少許鹽的蛋液，翻炒到蛋完全凝固熟透，撒蔥花起鍋。'],
      tips: ['肉先川燙可以去掉部分鉀和磷，也比較不油。', TWO_PROTEIN] },
    { id: 'mu-shu-pork', style: 'chinese', needs: ['雞蛋', '豬肉'], title: '木須炒肉', time: '約 20 分鐘',
      intro: '北方家常菜，蛋和肉炒得香香的配飯。',
      ingredients: [{ name: '雞蛋', amount: EGG1 }, { name: '豬肉', amount: MEAT1 }, { name: '高麗菜', amount: '2 片葉子' }, SCALLION, OIL, SOY],
      steps: ['豬肉切絲，' + BLANCH_MEAT + '；高麗菜切絲，' + BLANCH_VEG + '。', '雞蛋打散，炒到熟透成小塊先盛起。', '原鍋爆香蔥段，下肉絲炒到全熟，加高麗菜拌炒，倒回炒蛋，加少許醬油拌勻。'],
      tips: ['傳統做法會加木耳、金針，乾貨含鉀高，這裡改用汆燙過的高麗菜。', TWO_PROTEIN] },
    { id: 'pork-omelette', style: 'chinese', needs: ['雞蛋', ['豬絞肉', '豬肉']], title: '肉末煎蛋', time: '約 15 分鐘',
      intro: '肉末煎進蛋裡，便當菜也很適合。',
      ingredients: [{ name: '雞蛋', amount: EGG1 }, { name: '{1}', amount: MEAT1 }, SCALLION, OIL, SALT],
      steps: ['{1}剁成碎末，' + BLANCH_MEAT + '。', '雞蛋打散，拌入肉末、蔥花和少許鹽。', '平底鍋下油，倒入蛋液攤平，小火兩面煎到金黃、中心熟透，切塊。'],
      tips: [TWO_PROTEIN, '旁邊多配一盤汆燙過的青菜。'] },
    { id: 'steamed-egg-pork', style: 'chinese', needs: ['雞蛋', '豬絞肉'], title: '肉末蒸蛋', time: '約 20 分鐘',
      intro: '電鍋就能做，軟嫩好入口。',
      ingredients: [{ name: '雞蛋', amount: EGG1 }, { name: '豬絞肉', amount: MEAT1 }, { name: '開水', amount: '蛋液的 1.5 倍' }, SCALLION, SOY],
      steps: ['豬絞肉撥散，' + BLANCH_MEAT + '，鋪在碗底。', '雞蛋打散加開水拌勻、過篩，倒入碗中。', '電鍋外鍋 1 杯水蒸到跳起，確認肉末和蛋都熟透，淋少許醬油、撒蔥花。'],
      tips: ['用開水，不要用高湯；醬油淋一點點就好。', TWO_PROTEIN] },
    { id: 'pork-cabbage', style: 'chinese', needs: ['豬肉', '高麗菜'], title: '高麗菜炒肉片', time: '約 15 分鐘',
      intro: '蒜香肉片配脆甜高麗菜，家常最耐吃。',
      ingredients: [{ name: '豬肉', amount: MEAT2 }, { name: '高麗菜', amount: '1/4 顆' }, GARLIC, OIL, SOY],
      steps: ['豬肉切片，' + BLANCH_MEAT + '；高麗菜切小片，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜片，下肉片炒到全熟。', '加入高麗菜拌炒，淋少許醬油炒勻即可。'],
      tips: ['高麗菜汆燙後再炒，可以減少部分鉀，甜味還在。'] },
    { id: 'pork-chop-cabbage', style: 'western', needs: ['豬肉', '高麗菜'], title: '香煎豬排佐蒜炒高麗菜', time: '約 25 分鐘',
      intro: '西式煎豬排，配一份清炒高麗菜。',
      ingredients: [{ name: '豬肉', amount: MEAT2 }, { name: '高麗菜', amount: '1/4 顆' }, GARLIC, OIL, SALT, { name: '白胡椒', amount: '少許' }],
      steps: ['豬肉切成薄排，' + BLANCH_MEAT + '，用紙巾擦乾，抹少許鹽與白胡椒。', '平底鍋下油，豬排兩面各煎 2–3 分鐘到中心全熟。', '高麗菜切片，' + BLANCH_VEG + '；用煎豬排的鍋爆香蒜片，炒高麗菜配在旁邊。'],
      tips: ['肉先川燙再煎，記得用紙巾擦乾才不會噴油。'] },
    { id: 'pork-onion', style: 'chinese', needs: ['豬肉', '洋蔥'], title: '洋蔥炒肉絲', time: '約 15 分鐘',
      intro: '洋蔥釋放自然甘甜，肉絲軟嫩好下飯。',
      ingredients: [{ name: '豬肉', amount: MEAT2 }, { name: '洋蔥', amount: '半顆' }, OIL, SOY, SUGAR],
      steps: ['豬肉切絲，' + BLANCH_MEAT + '；洋蔥切絲，' + BLANCH_VEG + '。', '熱鍋下油，炒洋蔥到微軟。', '下肉絲炒到全熟，加少許醬油和糖炒勻。'],
      tips: ['盛盤時把湯汁留在鍋裡，不要拌飯。'] },
    { id: 'pork-pepper', style: 'chinese', needs: ['豬肉', '青椒'], title: '青椒炒肉絲', time: '約 15 分鐘',
      intro: '蒜香快炒青椒肉絲，爽脆開胃不膩口。',
      ingredients: [{ name: '豬肉', amount: MEAT2 }, { name: '青椒', amount: '1 顆' }, GARLIC, OIL, SOY],
      steps: ['豬肉切絲，' + BLANCH_MEAT + '；青椒去籽切絲，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末，下肉絲炒到全熟。', '加入青椒絲快炒，淋少許醬油炒勻。'],
      tips: ['醬汁留在鍋裡，不要拌飯。'] },
    { id: 'dougan-pork', style: 'chinese', needs: ['豆干', '豬肉'], title: '豆干炒肉絲', time: '約 15 分鐘',
      intro: '便當常見的家常菜，豆干香 Q 有嚼勁。',
      ingredients: [{ name: '豆干', amount: DOUGAN1 }, { name: '豬肉', amount: MEAT1 }, { name: '青椒', amount: '半顆' }, GARLIC, OIL, SOY],
      steps: ['豆干切條，' + BLANCH_VEG.replace('燙菜水', '燙豆干的水') + '。', '豬肉切絲，' + BLANCH_MEAT + '；青椒切絲，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末，下豆干煎到微焦，加入肉絲炒到全熟，再加青椒拌炒，淋少許醬油。'],
      tips: ['豆干和肉合起來就是這一餐的蛋白質份量；豆干選原味的，滷味豆干較鹹。'] },
    { id: 'wintermelon-pork', style: 'chinese', needs: ['冬瓜', ['豬絞肉', '豬肉']], title: '冬瓜燴肉末', time: '約 25 分鐘',
      intro: '冬瓜燴得軟軟的很下飯。',
      ingredients: [{ name: '冬瓜', amount: '300 g' }, { name: '{1}', amount: MEAT2 }, GINGER, OIL, SOY],
      steps: ['{1}剁碎，' + BLANCH_MEAT + '。', '冬瓜去皮切小塊；熱鍋下油爆香薑絲，下冬瓜和肉末拌炒，加 3 大匙開水蓋鍋燜 8 分鐘到冬瓜透明、肉末全熟。', '加少許醬油拌勻即可。'],
      tips: ['冬瓜會出水，盤底湯汁不要喝、不要拌飯。'] },
    { id: 'ants-tree', style: 'chinese', needs: ['冬粉', ['豬絞肉', '豬肉']], title: '螞蟻上樹（肉末炒冬粉）', time: '約 20 分鐘',
      intro: '冬粉是低蛋白、低鉀的主食，很適合腎友。',
      ingredients: [{ name: '冬粉', amount: '2 把' }, { name: '{1}', amount: MEAT2 }, SCALLION, GARLIC, OIL, SOY],
      steps: ['冬粉用溫水泡軟、剪短；{1}剁碎，' + BLANCH_MEAT + '。', '熱鍋下油爆香蒜末，下肉末炒到全熟，加醬油和 4 大匙開水。', '放入冬粉拌炒到吸乾水分，撒蔥花。'],
      tips: ['傳統做法用辣豆瓣醬，醬料含鉀偏高，這裡只用一般醬油。'] },
    { id: 'eggplant-pork', style: 'chinese', needs: ['茄子', ['豬絞肉', '豬肉']], title: '肉末燒茄子', time: '約 20 分鐘',
      intro: '茄子先燙過，不用炸也很軟嫩。',
      ingredients: [{ name: '茄子', amount: '1 條' }, { name: '{1}', amount: MEAT2 }, GARLIC, OIL, SOY, SUGAR],
      steps: ['茄子切段，' + BLANCH_VEG + '；{1}剁碎，' + BLANCH_MEAT + '。', '熱鍋下油爆香蒜末，下肉末炒到全熟。', '加入茄子、少許醬油和糖拌炒 2 分鐘入味。'],
      tips: ['茄子汆燙取代油炸，少油又能去掉部分鉀。'] },
    { id: 'tofu-pork', style: 'chinese', needs: ['豆腐', ['豬絞肉', '豬肉']], title: '肉末燒豆腐', time: '約 20 分鐘',
      intro: '不辣版的家常豆腐，用傳統豆腐比較不易碎。',
      ingredients: [{ name: '豆腐', amount: TOFU1 }, { name: '{1}', amount: MEAT1 }, SCALLION, GARLIC, OIL, SOY],
      steps: ['豆腐切小塊，' + BLANCH_VEG.replace('燙菜水', '燙豆腐的水') + '。', '{1}剁碎，' + BLANCH_MEAT + '。', '熱鍋下油爆香蒜末，下肉末炒到全熟，加醬油和 3 大匙開水，放入豆腐輕輕翻動燒 3 分鐘，撒蔥花。'],
      tips: ['豆腐和肉合起來就是這一餐的蛋白質份量。'] },

    // ---- 雞肉 ----
    { id: 'chicken-mushroom', style: 'chinese', needs: [['雞胸肉', '雞腿肉'], '杏鮑菇'], title: '杏鮑菇炒雞丁', time: '約 20 分鐘',
      intro: '杏鮑菇口感像肉，讓份量看起來更多。',
      ingredients: [{ name: '{0}', amount: MEAT2 }, { name: '杏鮑菇', amount: '1 根' }, GARLIC, OIL, SOY],
      steps: ['{0}切丁，' + BLANCH_MEAT + '；杏鮑菇切丁，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末，下雞丁炒到全熟、表面微焦。', '加入杏鮑菇拌炒，淋少許醬油炒勻。'],
      tips: ['菇類含鉀不低，一定要先汆燙。'] },
    { id: 'chicken-mushroom-w', style: 'western', needs: [['雞腿肉', '雞胸肉'], '杏鮑菇'], title: '香煎雞腿佐杏鮑菇', time: '約 25 分鐘',
      intro: '西式煎雞，杏鮑菇煎得焦香。',
      ingredients: [{ name: '{0}', amount: MEAT2 }, { name: '杏鮑菇', amount: '1 根' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, SALT, { name: '迷迭香（乾燥）', amount: '少許' }],
      steps: ['{0}切成 2 片，' + BLANCH_MEAT + '，擦乾後抹少許鹽和迷迭香。', '杏鮑菇切片，' + BLANCH_VEG + '，擦乾。', '平底鍋下橄欖油，雞肉兩面各煎 3–4 分鐘到中心全熟，同鍋煎杏鮑菇和蒜片。'],
      tips: ['用香草提味可以少用鹽。'] },
    { id: 'chicken-onion', style: 'chinese', needs: [['雞胸肉', '雞腿肉'], '洋蔥'], title: '洋蔥炒雞柳', time: '約 15 分鐘',
      intro: '洋蔥炒出甜香，襯著嫩雞柳很下飯。',
      ingredients: [{ name: '{0}', amount: MEAT2 }, { name: '洋蔥', amount: '半顆' }, OIL, SOY, { name: '白胡椒', amount: '少許' }],
      steps: ['{0}切條，' + BLANCH_MEAT + '；洋蔥切絲，' + BLANCH_VEG + '。', '熱鍋下油，炒洋蔥到微軟。', '下雞柳炒到全熟，加少許醬油和白胡椒炒勻。'],
      tips: ['醬汁留在鍋裡，不要拌飯。'] },
    { id: 'chicken-noodle', style: 'chinese', needs: [['雞胸肉', '雞腿肉'], '小黃瓜'], title: '雞絲涼麵', time: '約 20 分鐘',
      intro: '蒜香醋汁拌出開胃涼麵，夏天吃酸香清爽。',
      ingredients: [{ name: '{0}', amount: MEAT2 }, { name: '小黃瓜', amount: '1 條' }, { name: '麵條', amount: '乾麵條 2 小把（約 100 g）' }, GARLIC, { name: '白醋', amount: '1 小匙' }, SOY, { name: '香油', amount: '少許' }],
      steps: ['{0}放進滾水川燙後續煮約 8 分鐘到全熟，撈起放涼撕成絲，煮肉的水倒掉。', '小黃瓜切絲，' + BLANCH_VEG + '，泡冷開水後瀝乾。', '麵條煮熟、沖冷開水瀝乾，鋪上雞絲和小黃瓜，淋上蒜末、醬油、白醋、香油調的醬汁。'],
      tips: ['市售涼麵醬多用芝麻醬，芝麻醬含鉀磷都高，這裡改用醬油醋汁。', '麵條本身也有蛋白質，未洗腎的腎友麵量照營養師建議。'] },
    { id: 'chicken-tomato-w', style: 'western', needs: [['雞胸肉', '雞腿肉'], '番茄'], title: '番茄燴雞丁', time: '約 25 分鐘',
      intro: '用新鮮番茄做的西式燴雞，配吐司或白飯。',
      ingredients: [{ name: '{0}', amount: MEAT2 }, { name: '番茄', amount: '1 顆' }, { name: '洋蔥', amount: '1/4 顆' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, SALT],
      steps: ['{0}切丁，' + BLANCH_MEAT + '。', '番茄切小塊、洋蔥切丁，一起' + BLANCH_VEG + '。', '鍋中下橄欖油爆香蒜末，放入雞丁炒到全熟，加番茄、洋蔥拌炒 3 分鐘，加少許鹽。'],
      tips: ['不要用番茄糊或罐頭番茄醬汁，濃縮過含鉀很高；盤底湯汁不要拌飯。'] },
    { id: 'chicken-broccoli-pasta', style: 'western', needs: [['雞胸肉', '雞腿肉'], ['花椰菜', '綠花椰菜']], title: '雞肉花椰菜義大利麵', time: '約 25 分鐘',
      intro: '清炒口味，不用奶油白醬也很香。',
      ingredients: [{ name: '{0}', amount: MEAT2 }, { name: '{1}', amount: '6 小朵' }, { name: '義大利麵', amount: '乾麵 120 g' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, SALT],
      steps: ['{0}切丁，' + BLANCH_MEAT + '；{1}切小朵，' + BLANCH_VEG + '。', '義大利麵照包裝時間煮熟，煮麵水倒掉。', '鍋中下橄欖油爆香蒜片，下雞丁炒到全熟，再加{1}和麵拌炒，加少許鹽。'],
      tips: ['白醬用牛奶和起司，含磷高，清炒比較適合腎友。', '義大利麵本身也有蛋白質，未洗腎的腎友麵量照營養師建議。'] },
    { id: 'chicken-broccoli', style: 'chinese', needs: [['雞胸肉', '雞腿肉'], ['花椰菜', '綠花椰菜']], title: '花椰菜炒雞片', time: '約 15 分鐘',
      intro: '蒜片爆香快炒，脆口花椰菜配嫩雞片剛剛好。',
      ingredients: [{ name: '{0}', amount: MEAT2 }, { name: '{1}', amount: '6 小朵' }, GARLIC, OIL, SALT],
      steps: ['{0}切片，' + BLANCH_MEAT + '；{1}切小朵，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜片，下雞片炒到全熟。', '加入{1}拌炒，加少許鹽。'],
      tips: ['綠花椰菜含鉀比白花椰菜高，一定要汆燙、份量少一點。'] },

    // ---- 牛肉 ----
    { id: 'beef-onion', style: 'chinese', needs: ['牛肉', '洋蔥'], title: '洋蔥炒牛肉', time: '約 15 分鐘',
      intro: '牛肉嫩滑帶醬香，搭配甜軟洋蔥最下飯。',
      ingredients: [{ name: '牛肉', amount: MEAT2 }, { name: '洋蔥', amount: '半顆' }, OIL, SOY, SUGAR],
      steps: ['牛肉切薄片，' + BLANCH_MEAT + '；洋蔥切絲，' + BLANCH_VEG + '。', '熱鍋下油，炒洋蔥到微軟。', '下牛肉片炒到全熟，加少許醬油和糖炒勻。'],
      tips: ['市售沙茶醬、蠔油含鉀或鈉都高，用一般醬油就好。'] },
    { id: 'beef-pepper', style: 'chinese', needs: ['牛肉', '青椒'], title: '青椒牛肉', time: '約 15 分鐘',
      intro: '青椒爽脆清香，襯托牛肉片鮮嫩夠味。',
      ingredients: [{ name: '牛肉', amount: MEAT2 }, { name: '青椒', amount: '1 顆' }, GARLIC, OIL, SOY],
      steps: ['牛肉切條，' + BLANCH_MEAT + '；青椒去籽切條，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末，下牛肉炒到全熟。', '加入青椒拌炒，淋少許醬油。'],
      tips: ['牛肉切薄一點，川燙後再炒比較不會老。'] },

    // ---- 海鮮 ----
    { id: 'salmon-onion-w', style: 'western', needs: ['鮭魚', '洋蔥'], title: '香煎鮭魚佐洋蔥', time: '約 20 分鐘',
      intro: '鮭魚煎到外皮微酥，配上甜甜的炒洋蔥。',
      ingredients: [{ name: '鮭魚', amount: MEAT2 }, { name: '洋蔥', amount: '半顆' }, { name: '橄欖油', amount: '1 大匙' }, SALT, { name: '檸檬', amount: '1 片（擠汁用）' }],
      steps: ['鮭魚' + BLANCH_FISH + '，擦乾後抹少許鹽。', '洋蔥切絲，' + BLANCH_VEG + '。', '平底鍋下橄欖油，鮭魚兩面各煎 3 分鐘到中心熟透，同鍋炒洋蔥，起鍋前擠少許檸檬汁。'],
      tips: ['檸檬汁少量提味就好，不要喝檸檬水代替。'] },
    { id: 'salmon-plain', style: 'chinese', needs: ['鮭魚'], title: '乾煎鮭魚', time: '約 15 分鐘',
      intro: '乾煎到外酥內嫩，一點鹽就能帶出鮭魚脂香。',
      ingredients: [{ name: '鮭魚', amount: MEAT2 }, SCALLION, OIL, SALT],
      steps: ['鮭魚' + BLANCH_FISH + '，用紙巾擦乾，兩面抹少許鹽。', '平底鍋下少許油，中小火每面煎 3 分鐘到中心熟透。', '撒蔥花，旁邊配一盤汆燙過的青菜。'],
      tips: ['鮭魚含鉀偏高，份量照上面的克數，不要多吃。'] },
    { id: 'tilapia-steam', style: 'chinese', needs: ['鯛魚'], title: '清蒸鯛魚片', time: '約 20 分鐘',
      intro: '蔥絲薑絲熱油熗香，魚肉細嫩鮮甜好入口。',
      ingredients: [{ name: '鯛魚', amount: MEAT2 }, SCALLION, GINGER, SOY, { name: '食用油', amount: '1 小匙' }],
      steps: ['鯛魚片' + BLANCH_FISH + '，放進盤中，鋪上薑絲。', '電鍋外鍋半杯水蒸到跳起，確認魚肉熟透，倒掉盤中蒸出的湯汁。', '鋪上蔥絲，淋少許醬油和燒熱的油。'],
      tips: ['蒸出來的魚湯含鉀，倒掉不要喝。'] },
    { id: 'tilapia-tomato', style: 'chinese', needs: ['鯛魚', '番茄'], title: '番茄燒魚片', time: '約 20 分鐘',
      intro: '新鮮番茄煮出自然酸甜，魚片嫩口又開胃。',
      ingredients: [{ name: '鯛魚', amount: MEAT2 }, { name: '番茄', amount: '1 顆' }, SCALLION, OIL, SUGAR, SALT],
      steps: ['鯛魚切片，' + BLANCH_FISH + '。', '番茄切小塊，' + BLANCH_VEG + '。', '熱鍋下油炒番茄到軟，加少許糖、鹽和 3 大匙開水，放入魚片燒 3 分鐘到熟透，撒蔥花。'],
      tips: ['盤底湯汁不要拌飯。'] },
    { id: 'shrimp-broccoli', style: 'chinese', needs: ['蝦仁', ['花椰菜', '綠花椰菜']], title: '{1}炒蝦仁', time: '約 15 分鐘',
      intro: '蒜香快炒脆口花椰菜與鮮蝦，色香味俱全。',
      ingredients: [{ name: '蝦仁', amount: SHRIMP2 }, { name: '{1}', amount: '6 小朵' }, GARLIC, OIL, SALT],
      steps: ['蝦仁挑去腸泥，' + BLANCH_MEAT + '；{1}切小朵，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜片，下蝦仁炒到捲曲熟透。', '加入{1}拌炒，加少許鹽。'],
      tips: ['冷凍蝦仁常泡過保水劑（含磷），買新鮮的蝦自己剝比較好。'] },
    { id: 'squid-pepper', style: 'chinese', needs: ['花枝', '青椒'], title: '青椒炒花枝', time: '約 15 分鐘',
      intro: '花枝口感 Q 彈，快炒就好吃。',
      ingredients: [{ name: '花枝', amount: SQUID2 }, { name: '青椒', amount: '1 顆' }, GINGER, OIL, SALT],
      steps: ['花枝切圈或切片，' + BLANCH_FISH.replace('燙魚水', '燙花枝的水') + '。', '青椒去籽切塊，' + BLANCH_VEG + '。', '熱鍋下油爆香薑絲，下花枝和青椒快炒到熟透，加少許鹽。'],
      tips: ['花枝膽固醇較高，吃的頻率照醫師或營養師建議。'] },

    // ---- 豆腐、主食、青菜 ----
    { id: 'napa-tofu', style: 'chinese', needs: ['大白菜', '豆腐'], title: '白菜燴豆腐', time: '約 20 分鐘',
      intro: '薑片爆香燜煮，白菜清甜滲進豆腐裡暖胃。',
      ingredients: [{ name: '大白菜', amount: '1/4 顆' }, { name: '豆腐', amount: TOFU2 }, GINGER, OIL, SOY],
      steps: ['大白菜切段，' + BLANCH_VEG + '。', '豆腐切塊，另用滾水汆燙約 3 分鐘，撈起瀝乾，燙豆腐的水倒掉。', '熱鍋下油爆香薑片，下白菜和豆腐，加 3 大匙開水和少許醬油，蓋鍋燜 5 分鐘。'],
      tips: ['大白菜會出水，盤底湯汁不要喝、不要拌飯。'] },
    { id: 'tofu-scallion', style: 'chinese', needs: ['豆腐'], title: '蔥燒豆腐', time: '約 15 分鐘',
      intro: '煎得金黃的豆腐，配蔥香醬汁。',
      ingredients: [{ name: '豆腐', amount: TOFU2 }, { name: '蔥', amount: '2 支' }, OIL, SOY, SUGAR],
      steps: ['豆腐切厚片，' + BLANCH_VEG.replace('燙菜水', '燙豆腐的水') + '，擦乾。', '平底鍋下油，豆腐兩面煎到金黃。', '加入蔥段、1 小匙醬油、少許糖和 2 大匙開水，翻面讓兩面沾到醬汁即可。'],
      tips: ['用傳統豆腐比較好煎；醬油照份量用，不要多加。'] },
    { id: 'cabbage-vermicelli', style: 'chinese', needs: ['高麗菜', '冬粉'], title: '高麗菜炒冬粉', time: '約 20 分鐘',
      intro: '冬粉吸飽菜的甜味，當主食剛好。',
      ingredients: [{ name: '高麗菜', amount: '1/4 顆' }, { name: '冬粉', amount: '2 把' }, { name: '胡蘿蔔', amount: '1 小段' }, GARLIC, OIL, SOY],
      steps: ['冬粉泡軟剪短；高麗菜和胡蘿蔔切絲，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末，下高麗菜和胡蘿蔔絲拌炒。', '加入冬粉、少許醬油和 3 大匙開水，炒到冬粉吸乾水分。'],
      tips: ['冬粉低蛋白又低鉀，未洗腎的腎友可以用它增加飽足感。'] },
    { id: 'rice-noodle', style: 'chinese', needs: ['米粉', '高麗菜'], title: '台式炒米粉', time: '約 25 分鐘',
      intro: '家常炒米粉，不放乾香菇蝦米。',
      ingredients: [{ name: '米粉', amount: '1 片（約 100 g）' }, { name: '高麗菜', amount: '1/4 顆' }, { name: '胡蘿蔔', amount: '1 小段' }, { name: '蔥', amount: '1 支' }, OIL, SOY],
      steps: ['米粉用溫水泡軟；高麗菜和胡蘿蔔切絲，' + BLANCH_VEG + '。', '熱鍋下油爆香蔥段，下高麗菜和胡蘿蔔拌炒。', '加入米粉、少許醬油和 4 大匙開水，用筷子翻炒到米粉吸乾水分。'],
      tips: ['傳統做法的乾香菇、蝦米含鉀很高，這裡省略。'] },
    { id: 'garlic-greens', style: 'chinese', needs: [['青江菜', '小白菜', '空心菜', '大白菜', '高麗菜', '綠豆芽']], title: '蒜炒{0}', time: '約 10 分鐘',
      intro: '汆燙後用蒜末快炒提香，簡單卻比水煮好吃。',
      ingredients: [{ name: '{0}', amount: '1 把（約 300 g）' }, GARLIC, OIL, SALT],
      steps: ['{0}洗淨切段，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末。', '下{0}快炒 30 秒，加少許鹽起鍋。'],
      tips: ['蔬菜切小、用足量水汆燙並倒掉燙水，可以減少部分鉀，份量仍要控制。'] },

    // ---- 玉米筍、菇類、南瓜、薯類、義大利麵（2026-11-13 補）----
    { id: 'babycorn-pork', style: 'chinese', needs: ['玉米筍', ['豬肉', '雞胸肉']], title: '玉米筍炒肉片', time: '約 15 分鐘',
      intro: '玉米筍脆甜，配肉片快炒很下飯。',
      ingredients: [{ name: '玉米筍', amount: '8 根' }, { name: '{1}', amount: MEAT2 }, { name: '胡蘿蔔', amount: '1 小段' }, GARLIC, OIL, SALT],
      steps: ['{1}切薄片，' + BLANCH_MEAT + '。', '玉米筍斜切小段、胡蘿蔔切片，一起' + BLANCH_VEG + '。', '熱鍋下油爆香蒜片，下肉片炒到全熟，加入玉米筍和胡蘿蔔拌炒，加少許鹽。'],
      tips: ['玉米筍是中鉀蔬菜，汆燙後再炒；它是蔬菜不是主食，飯量照平常。'] },
    { id: 'babycorn-egg', style: 'chinese', needs: ['雞蛋', '玉米筍'], title: '玉米筍炒蛋', time: '約 15 分鐘',
      intro: '黃色的蛋配上玉米筍，顏色討喜。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '玉米筍', amount: '8 根' }, SCALLION, OIL, SALT],
      steps: ['玉米筍斜切小段，' + BLANCH_VEG + '。', '雞蛋打散加少許鹽；熱鍋下油，把蛋炒到熟透成塊，先盛起。', '原鍋炒玉米筍 1 分鐘，倒回炒蛋拌勻，撒蔥花起鍋。'],
      tips: ['想加點顏色可以放少量汆燙過的胡蘿蔔絲。'] },
    { id: 'shiitake-chicken', style: 'chinese', needs: [['雞腿肉', '雞胸肉'], '香菇'], title: '香菇蒸雞', time: '約 30 分鐘',
      intro: '電鍋就能做，雞肉吸了香菇的香氣。',
      ingredients: [{ name: '{0}', amount: MEAT2 }, { name: '香菇', amount: '4 朵（鮮香菇）' }, GINGER, SCALLION, SOY, { name: '食用油', amount: '1 小匙' }],
      steps: ['{0}切塊，' + BLANCH_MEAT + '；香菇切片，' + BLANCH_VEG + '。', '雞肉和香菇放進盤中，鋪上薑絲，淋少許醬油和油拌勻。', '電鍋外鍋 1 杯水蒸到跳起，確認雞肉中心全熟，倒掉盤中蒸出的湯汁，撒蔥花。'],
      tips: ['用鮮香菇，不要用乾香菇：乾香菇含鉀很高。', '蒸出來的湯汁含鉀，倒掉不要拌飯。'] },
    { id: 'shiitake-greens', style: 'chinese', needs: ['香菇', ['青江菜', '小白菜']], title: '香菇炒{1}', time: '約 15 分鐘',
      intro: '鮮菇炒出濃郁菇香，讓清淡青菜瞬間變下飯。',
      ingredients: [{ name: '香菇', amount: '4 朵（鮮香菇）' }, { name: '{1}', amount: '1 把（約 300 g）' }, GARLIC, OIL, SALT],
      steps: ['香菇切片、{1}切段，分別' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末，下香菇炒出香氣。', '加入{1}快炒 30 秒，加少許鹽起鍋。'],
      tips: ['這道沒有肉蛋，旁邊配一份蛋白質菜。', '菇類和青菜都含鉀，汆燙後份量仍照建議。'] },
    { id: 'enoki-beef', style: 'chinese', needs: ['牛肉', '金針菇'], title: '金針菇炒牛肉', time: '約 15 分鐘',
      intro: '金針菇滑順，和牛肉片一起炒很對味。',
      ingredients: [{ name: '牛肉', amount: MEAT2 }, { name: '金針菇', amount: '去根後約 100 g（2 人合計，約半包）' }, SCALLION, GARLIC, OIL, SOY],
      steps: ['牛肉切薄片，' + BLANCH_MEAT + '。', '金針菇切掉根部、切成兩段，' + BLANCH_VEG + '，擠乾水分。', '熱鍋下油爆香蒜末，下牛肉炒到全熟，加入金針菇和蔥段拌炒，淋少許醬油。'],
      tips: ['金針菇含鉀偏高，用半包就好，一定要汆燙。'] },
    { id: 'enoki-egg', style: 'chinese', needs: ['雞蛋', '金針菇'], title: '金針菇煎蛋', time: '約 15 分鐘',
      intro: '金針菇煎進蛋裡，口感軟中帶脆。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '金針菇', amount: '去根後約 100 g（2 人合計，約半包）' }, SCALLION, OIL, SALT],
      steps: ['金針菇切掉根部、切成小段，' + BLANCH_VEG + '，擠乾水分。', '雞蛋打散，拌入金針菇、蔥花和少許鹽。', '平底鍋下油，倒入蛋液攤平，小火兩面煎到金黃、中心熟透，切塊。'],
      tips: ['金針菇含鉀偏高，用半包就好。'] },
    { id: 'pumpkin-rice-noodle', style: 'chinese', needs: ['南瓜', '米粉'], title: '南瓜炒米粉', time: '約 25 分鐘',
      intro: '南瓜炒到微微化開，米粉吸滿南瓜的甜味。',
      ingredients: [{ name: '南瓜', amount: '去皮後約 100 g（2 人合計，拳頭大小一塊）' }, { name: '細米粉', amount: '乾重約 100 g' }, { name: '蔥', amount: '1 支' }, OIL, SOY],
      steps: ['米粉照包裝用溫水泡軟或燙軟，瀝乾；南瓜去皮切細絲，' + BLANCH_VEG + '。', '熱鍋下油爆香蔥段，下南瓜絲炒到軟。', '加入米粉、少許醬油和 4 大匙開水，翻炒到米粉吸乾水分、沒有硬芯，均勻沾上南瓜。'],
      tips: ['南瓜也算主食，和米粉一起就是這一餐的澱粉，不用再另外配飯。', '南瓜含鉀偏高，用量照上面的份量就好。', '傳統做法的乾香菇、蝦米含鉀很高，這裡省略；這道沒有肉蛋，旁邊配一份蛋白質菜。'] },
    { id: 'pumpkin-egg', style: 'chinese', needs: ['雞蛋', '南瓜'], title: '南瓜炒蛋', time: '約 20 分鐘',
      intro: '南瓜的甜加上炒蛋，小朋友和長輩都喜歡。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '南瓜', amount: '去皮後約 100 g（2 人合計，拳頭大小一塊）' }, SCALLION, OIL, SALT],
      steps: ['南瓜去皮切薄片，' + BLANCH_VEG + '。', '雞蛋打散加少許鹽；熱鍋下油，把蛋炒到熟透成塊，先盛起。', '原鍋炒南瓜片，加 2 大匙開水蓋鍋燜 2 分鐘到軟，倒回炒蛋拌勻，撒蔥花。'],
      tips: ['南瓜也算主食，配這道菜時飯要少一點。', '南瓜含鉀偏高，用量照上面的份量就好。'] },
    { id: 'potato-chicken-w', style: 'western', needs: [['雞腿肉', '雞胸肉'], '馬鈴薯'], title: '香煎雞肉佐馬鈴薯', time: '約 30 分鐘',
      intro: '西式煎雞配煎馬鈴薯丁，一盤就有主食。',
      ingredients: [{ name: '{0}', amount: MEAT2 }, { name: '馬鈴薯', amount: '去皮後約 100 g（2 人合計，1 小顆）' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, SALT, { name: '黑胡椒', amount: '少許' }],
      steps: ['{0}片成約 1 公分厚的 2 片，' + BLANCH_MEAT + '，擦乾後抹少許鹽和黑胡椒。', '馬鈴薯去皮切 1 公分小丁，' + BLANCH_VEG + '，擦乾。', '平底鍋下橄欖油，中火把雞肉兩面各煎 3–4 分鐘到中心全熟，盛起；同鍋轉中小火煎馬鈴薯丁約 6–8 分鐘，到表面金黃、用筷子能輕鬆穿透，最後 1 分鐘再下蒜片，免得燒焦變苦。'],
      tips: ['馬鈴薯算主食，這一餐的飯或麵要少一點。', '馬鈴薯含鉀偏高，一定要切小丁汆燙，不要整顆烤或炸。'] },
    { id: 'potato-omelette-w', style: 'western', needs: ['雞蛋', '馬鈴薯'], title: '馬鈴薯烘蛋', time: '約 25 分鐘',
      intro: '西班牙風味的厚烘蛋，切塊當早午餐。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '馬鈴薯', amount: '去皮後約 100 g（2 人合計，1 小顆）' }, { name: '洋蔥', amount: '1/4 顆' }, { name: '橄欖油', amount: '1 大匙' }, SALT],
      steps: ['馬鈴薯去皮切約 0.3 公分薄片、洋蔥切絲，一起' + BLANCH_VEG + '，擦乾。', '用約 20 公分的平底鍋，下橄欖油，小火把馬鈴薯和洋蔥煎到軟、用筷子能穿透。', '雞蛋打散加少許鹽，倒進鍋中蓋過馬鈴薯，蓋上鍋蓋小火煎約 5 分鐘，翻面再煎約 3 分鐘；蛋多（洗腎版）會比較厚，時間只當參考，切開中心沒有流動的蛋液才算熟透，再切塊。'],
      tips: ['馬鈴薯算主食，這一餐的飯或麵要少一點。', '不要淋番茄醬，番茄醬含鉀與鈉都偏高。'] },
    { id: 'sweetpotato-pancake', style: 'chinese', needs: ['雞蛋', '地瓜'], title: '地瓜蛋煎餅', time: '約 30 分鐘',
      intro: '地瓜泥加蛋煎成小圓餅，當早餐或點心。',
      ingredients: [{ name: '雞蛋', amount: EGG2 }, { name: '地瓜', amount: '去皮後約 100 g（2 人合計，約半條）' }, { name: '中筋麵粉', amount: '2 大匙' }, OIL],
      steps: ['地瓜去皮切小塊，' + BLANCH_VEG + '；再放進電鍋蒸到軟（外鍋半杯水），壓成泥。', '雞蛋打散，拌入地瓜泥和麵粉，調成稠糊。', '平底鍋下少許油，舀一大匙麵糊壓成小圓餅，小火兩面各煎 3 分鐘到金黃、中心熟透；麵糊太稀舀不成形時（洗腎版蛋比較多），就整鍋攤成一大片薄餅，蓋鍋小火煎到表面凝固再翻面，煎到熟透切塊，不要為了變稠加很多麵粉。'],
      tips: ['地瓜算主食，這一餐的飯或麵要少一點。', '地瓜含鉀偏高，用量照上面的份量就好；地瓜甜，不用另外加糖。'] },
    { id: 'pasta-garlic-shrimp', style: 'western', needs: ['義大利麵', '蝦仁'], title: '蒜香蝦仁義大利麵', time: '約 25 分鐘',
      intro: '橄欖油煸香蒜片拌鮮蝦，清爽不膩的義式風味。',
      ingredients: [{ name: '義大利麵', amount: '乾麵 120 g' }, { name: '蝦仁', amount: SHRIMP2 }, { name: '蒜', amount: '4 瓣' }, { name: '橄欖油', amount: '2 大匙' }, SALT, { name: '乾燥巴西里', amount: '少許' }],
      steps: ['蝦仁挑去腸泥，' + BLANCH_MEAT + '。', '義大利麵照包裝時間煮熟，煮麵水倒掉。', '小火用橄欖油把蒜片煸到微黃，下蝦仁炒到捲曲熟透，加麵拌炒，加少許鹽，撒巴西里。'],
      tips: ['煮麵水不要加鹽，也不要拿煮麵水拌醬。', '冷凍蝦仁常泡過保水劑（含磷）或鹽水，選成分只有蝦的，或買新鮮的蝦自己剝；汆燙不能取代挑選。', '義大利麵本身也有蛋白質，未洗腎的腎友麵量照營養師建議。'] },
    { id: 'pasta-pepper-meat', style: 'western', needs: ['義大利麵', ['豬肉', '牛肉']], title: '黑胡椒{1}義大利麵', time: '約 25 分鐘',
      intro: '用現磨黑胡椒提味，不用市售黑胡椒醬。',
      ingredients: [{ name: '義大利麵', amount: '乾麵 120 g' }, { name: '{1}', amount: MEAT2 }, { name: '洋蔥', amount: '1/4 顆' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, SALT, { name: '現磨黑胡椒', amount: '適量' }],
      steps: ['{1}切薄片，' + BLANCH_MEAT + '；洋蔥切絲，' + BLANCH_VEG + '。', '義大利麵照包裝時間煮熟，煮麵水倒掉。', '鍋中下橄欖油爆香蒜末，下肉片炒到全熟，加洋蔥和麵拌炒，加少許鹽，起鍋前磨上黑胡椒。'],
      tips: ['市售黑胡椒醬含鈉偏高，用現磨黑胡椒就好。', '義大利麵本身也有蛋白質，未洗腎的腎友麵量照營養師建議。'] },

    // ---- 2026-11-14 擴充（Gemini 撰寫）----
    // 西式（12 道）
    { id: 'lemon-garlic-tilapia-w', style: 'western', needs: ['鯛魚', '綠花椰菜'], title: '蒜香檸檬鯛魚', time: '約 20 分鐘',
      intro: '金黃煎魚配翠綠花椰菜，擠點檸檬汁特別清爽。',
      ingredients: [{ name: '鯛魚', amount: MEAT2 }, { name: '綠花椰菜', amount: '6 小朵' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '檸檬', amount: '1 片（擠汁用）' }, SALT, { name: '黑胡椒', amount: '少許' }],
      steps: ['鯛魚片' + BLANCH_FISH + '，用紙巾擦乾，抹少許鹽和黑胡椒。', '綠花椰菜切小朵，' + BLANCH_VEG + '。', '平底鍋下橄欖油爆香蒜片，鯛魚兩面各煎 3 分鐘到中心熟透，旁放綠花椰菜拌一下，起鍋前擠少許檸檬汁。'],
      tips: ['綠花椰菜是中鉀蔬菜，切小朵再汆燙能去掉較多鉀。', '檸檬汁少量提味就好，不要喝檸檬水。'] },
    { id: 'rosemary-chicken-potato-w', style: 'western', needs: ['雞腿肉', '馬鈴薯'], title: '迷迭香煎雞腿佐馬鈴薯', time: '約 30 分鐘',
      intro: '迷迭香把雞腿煎出焦香，搭金黃馬鈴薯丁超滿足。',
      ingredients: [{ name: '雞腿肉', amount: MEAT2 }, { name: '馬鈴薯', amount: '去皮後約 100 g（2 人合計，1 小顆）' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '迷迭香（乾燥）', amount: '少許' }, SALT, { name: '黑胡椒', amount: '少許' }],
      steps: ['雞腿肉切塊，' + BLANCH_MEAT + '，擦乾後抹少許鹽、黑胡椒和迷迭香。', '馬鈴薯去皮切 1 公分小丁，' + BLANCH_VEG + '，擦乾。', '平底鍋下橄欖油，中火將雞腿肉煎到表面金黃、中心全熟後盛起；同鍋中小火煎馬鈴薯丁約 6 分鐘到金黃鬆軟，最後下蒜片拌香。'],
      tips: ['馬鈴薯也算主食，這一餐的飯或麵要少一點。', '用迷迭香和蒜片提味，鹽只要一點點就夠。'] },
    { id: 'garlic-butter-salmon-w', style: 'western', needs: ['鮭魚', '玉米筍'], title: '奶油蒜香煎鮭魚', time: '約 20 分鐘',
      intro: '無鹽奶油煎出鮭魚酥香，配脆甜玉米筍剛剛好。',
      ingredients: [{ name: '鮭魚', amount: MEAT2 }, { name: '玉米筍', amount: '8 根' }, GARLIC, { name: '無鹽奶油', amount: '約 5 g（全菜合計）' }, { name: '乾燥巴西里', amount: '少許' }, { name: '檸檬', amount: '1 片（擠汁用）' }, SALT],
      steps: ['鮭魚' + BLANCH_FISH + '，用紙巾擦乾，抹少許鹽。', '玉米筍斜切段，' + BLANCH_VEG + '。', '平底鍋小火融化奶油，下蒜末和鮭魚每面煎 3 分鐘到中心熟透，旁放玉米筍拌熱，撒巴西里並擠少許檸檬汁。'],
      tips: ['奶油選無鹽的且只用一小塊，避免油脂和鈉過高。'] },
    { id: 'herb-squid-tomato-w', style: 'western', needs: ['花枝', '番茄'], title: '義式香草番茄燴花枝', time: '約 20 分鐘',
      intro: '新鮮番茄酸甜配 Q 彈花枝，百里香香氣迷人。',
      ingredients: [{ name: '花枝', amount: SQUID2 }, { name: '番茄', amount: '1 顆（中型）' }, { name: '洋蔥', amount: '1/4 顆' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '乾燥百里香', amount: '少許' }, SALT, { name: '黑胡椒', amount: '少許' }],
      steps: ['花枝切圈，' + BLANCH_FISH.replace('燙魚水', '燙花枝的水') + '。', '番茄切小塊、洋蔥切丁，一起' + BLANCH_VEG + '。', '鍋中下橄欖油爆香蒜末，下番茄、洋蔥和百里香炒軟，加入花枝快炒到全熟，加少許鹽和黑胡椒。'],
      tips: ['用新鮮番茄不要用番茄糊或番茄醬，盤底湯汁不要拌飯。'] },
    { id: 'beef-pepper-toast-w', style: 'western', needs: ['牛肉', '吐司'], title: '黑胡椒洋蔥牛肉吐司捲', time: '約 20 分鐘',
      intro: '烤得微酥的吐司包進黑胡椒牛肉，當早午餐很讚。',
      ingredients: [{ name: '牛肉', amount: MEAT2 }, { name: '吐司', amount: '2 片（每片約 40 g）' }, { name: '洋蔥', amount: '1/4 顆' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '現磨黑胡椒', amount: '少許' }, SALT],
      steps: ['牛肉切細絲，' + BLANCH_MEAT + '；洋蔥切絲，' + BLANCH_VEG + '。', '熱鍋下橄欖油爆香蒜末，下洋蔥和牛肉炒到全熟，加少許鹽和黑胡椒拌勻。', '吐司用平底鍋乾烙到微酥，把牛肉洋蔥鋪在吐司上，對切成開放式吐司。'],
      tips: ['吐司本身含鈉與蛋白質，未洗腎的腎友份量照營養師建議，不要再抹美乃滋或起司片。'] },
    { id: 'garlic-shrimp-toast-w', style: 'western', needs: ['蝦仁', '吐司'], title: '蒜香蝦仁烤吐司', time: '約 15 分鐘',
      intro: '酥脆吐司放上蒜香彈牙蝦仁，簡單又有西式早午餐感。',
      ingredients: [{ name: '蝦仁', amount: SHRIMP2 }, { name: '吐司', amount: '2 片' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '乾燥巴西里', amount: '少許' }, SALT],
      steps: ['蝦仁挑去腸泥，' + BLANCH_MEAT + '。', '平底鍋下橄欖油小火煸香蒜末，下蝦仁炒到捲曲熟透，加少許鹽和巴西里。', '吐司切半乾烙或烤到微酥，放上蒜香蝦仁即可。'],
      tips: ['買新鮮蝦仁自己剝最好，冷凍蝦仁常泡過含磷保水劑。'] },
    { id: 'pumpkin-chicken-w', style: 'western', needs: ['南瓜', ['雞胸肉', '雞腿肉']], title: '義式迷迭香南瓜煎雞', time: '約 25 分鐘',
      intro: '香草煎雞配綿甜南瓜片，色澤金黃又開胃。',
      ingredients: [{ name: '{1}', amount: MEAT2 }, { name: '南瓜', amount: '去皮後約 100 g（2 人合計，拳頭大小一塊）' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '迷迭香（乾燥）', amount: '少許' }, SALT],
      steps: ['{1}切片，' + BLANCH_MEAT + '，擦乾後抹少許鹽和迷迭香。', '南瓜去皮切薄片，' + BLANCH_VEG + '。', '平底鍋下橄欖油爆香蒜片，雞肉兩面煎到金黃全熟，旁放南瓜片煎軟拌勻即可。'],
      tips: ['南瓜也算主食，飯要少一點。', '南瓜含鉀偏高，一定要切薄片汆燙並照份量吃。'] },
    { id: 'cauliflower-pork-pasta-w', style: 'western', needs: ['義大利麵', ['豬絞肉', '豬肉']], title: '蒜香花椰菜肉末義大利麵', time: '約 25 分鐘',
      intro: '肉末炒出蒜香拌入義麵與花椰菜，清爽不油膩。',
      ingredients: [{ name: '義大利麵', amount: '乾麵 120 g' }, { name: '{1}', amount: MEAT2 }, { name: '花椰菜', amount: '6 小朵' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '現磨黑胡椒', amount: '少許' }, SALT],
      steps: ['{1}剁成碎末，' + BLANCH_MEAT + '；花椰菜切小朵，' + BLANCH_VEG + '。', '義大利麵照包裝時間煮熟，煮麵水倒掉。', '鍋中下橄欖油爆香蒜末，下肉末炒到全熟，加入花椰菜和麵拌炒，加少許鹽和黑胡椒。'],
      tips: ['義大利麵本身也有蛋白質，未洗腎的腎友麵量照營養師建議。', '不要加起司粉或白醬，含磷與鈉都偏高。'] },
    { id: 'sweetpotato-chicken-salad-w', style: 'western', needs: ['地瓜', ['雞胸肉', '雞腿肉']], title: '地瓜嫩雞溫沙拉', time: '約 25 分鐘',
      intro: '微酸油醋拌進鬆甜地瓜和嫩雞塊，爽口又有飽足感。',
      ingredients: [{ name: '地瓜', amount: '去皮後約 100 g（2 人合計，約半條）' }, { name: '{1}', amount: MEAT2 }, { name: '小黃瓜', amount: '半條' }, { name: '橄欖油', amount: '1 大匙（煎雞 1 小匙、油醋 2 小匙）' }, { name: '白醋', amount: '1 小匙' }, SUGAR, SALT],
      steps: ['地瓜去皮切小塊，' + BLANCH_VEG + '，再蒸軟；小黃瓜切厚片，' + BLANCH_VEG + '。', '{1}切小塊，' + BLANCH_MEAT + '，擦乾後下 1 小匙橄欖油煎到全熟。', '把地瓜、雞肉和小黃瓜放進盤中，淋上其餘 2 小匙橄欖油、白醋、少許糖和鹽拌勻。'],
      tips: ['地瓜也算主食，這一餐的飯要少一點。', '用自調油醋取代市售凱薩醬或千島醬，鈉和磷少很多。'] },
    { id: 'salmon-carrot-rice-w', style: 'western', needs: ['鮭魚', '白飯'], title: '香煎鮭魚胡蘿蔔奶油飯', time: '約 25 分鐘',
      intro: '奶油拌炒甜潤胡蘿蔔丁和白飯，搭酥香鮭魚超好入口。',
      ingredients: [{ name: '鮭魚', amount: MEAT2 }, { name: '白飯', amount: '2 碗' }, { name: '胡蘿蔔', amount: '1 小段' }, { name: '洋蔥', amount: '1/4 顆' }, { name: '無鹽奶油', amount: '約 5 g（全菜合計）' }, { name: '乾燥巴西里', amount: '少許' }, SALT],
      steps: ['胡蘿蔔切小丁、洋蔥切丁，一起' + BLANCH_VEG + '。', '鮭魚' + BLANCH_FISH + '，擦乾後抹少許鹽；平底鍋煎到兩面金黃、中心熟透，撥成大塊先盛起。', '同鍋小火融化奶油，炒香胡蘿蔔和洋蔥，下白飯拌炒均勻，加少許鹽和巴西里，鋪上鮭魚塊。'],
      tips: ['奶油用無鹽且少量就好，不要加鮮奶油或起司做成燉飯。'] },
    { id: 'eggplant-beef-w', style: 'western', needs: ['牛肉', '茄子'], title: '迷迭香蒜煎牛肉佐茄子', time: '約 20 分鐘',
      intro: '香草嫩牛肉配煎軟茄子，一口牛肉一口菜很搭。',
      ingredients: [{ name: '牛肉', amount: MEAT2 }, { name: '茄子', amount: '1 條' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '迷迭香（乾燥）', amount: '少許' }, { name: '現磨黑胡椒', amount: '少許' }, SALT],
      steps: ['牛肉切厚片，' + BLANCH_MEAT + '，擦乾後抹少許鹽、黑胡椒和迷迭香。', '茄子切斜片，' + BLANCH_VEG + '，擦乾。', '平底鍋下橄欖油爆香蒜片，先把牛肉煎到全熟盛起，同鍋把茄子兩面煎到微焦軟嫩，一起擺盤。'],
      tips: ['茄子先汆燙再去煎，不會吸進太多油，也能去掉部分鉀。'] },
    { id: 'onion-chicken-w', style: 'western', needs: ['雞腿肉', '洋蔥'], title: '義式洋蔥香草雞腿', time: '約 25 分鐘',
      intro: '洋蔥小火炒出甜味鋪底，配煎得焦香的香草雞腿塊。',
      ingredients: [{ name: '雞腿肉', amount: MEAT2 }, { name: '洋蔥', amount: '半顆' }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '乾燥百里香', amount: '少許' }, { name: '黑胡椒', amount: '少許' }, SALT],
      steps: ['雞腿肉切塊，' + BLANCH_MEAT + '，擦乾後抹少許鹽、黑胡椒和百里香。', '洋蔥切絲，' + BLANCH_VEG + '。', '平底鍋下橄欖油爆香蒜片，雞腿肉煎到金黃全熟盛起，原鍋炒軟洋蔥絲鋪盤底。'],
      tips: ['用乾燥香草和洋蔥甜味提鮮，鹽用一點點就夠。'] },

    // 中式（28 道）
    { id: 'garlic-sweetpotato-leaves', style: 'chinese', needs: ['地瓜葉'], title: '蒜香拌地瓜葉', time: '約 10 分鐘',
      intro: '燙得翠綠的地瓜葉拌蒜末與香油，滑順又古早味。',
      ingredients: [{ name: '地瓜葉', amount: '去粗梗後約 200 g（2 人合計）' }, GARLIC, OIL, { name: '香油', amount: '少許' }, SALT],
      steps: ['地瓜葉挑去粗梗，' + BLANCH_VEG + '。', '熱鍋下油小火把蒜末煸到微黃有香氣。', '把蒜油淋在瀝乾的地瓜葉上，加少許香油和鹽拌勻。'],
      tips: ['這道沒有肉蛋，旁邊配一份蛋白質菜。', '地瓜葉是高鉀蔬菜，切段汆燙並倒掉燙菜水，只能去掉一部分鉀，份量照上面的克數吃。'] },
    { id: 'pork-sweetpotato-leaves', style: 'chinese', needs: ['地瓜葉', ['豬肉', '豬絞肉']], title: '肉絲炒地瓜葉', time: '約 15 分鐘',
      intro: '嫩綠地瓜葉配炒香肉絲，有菜有肉一盤搞定。',
      ingredients: [{ name: '地瓜葉', amount: '去粗梗後約 200 g（2 人合計）' }, { name: '{1}', amount: MEAT2 }, GARLIC, OIL, SOY],
      steps: ['地瓜葉切段，' + BLANCH_VEG + '。', '{1}切絲（絞肉撥散），' + BLANCH_MEAT + '。', '熱鍋下油爆香蒜末，下{1}炒到全熟，再下地瓜葉快炒 30 秒，淋少許醬油拌勻。'],
      tips: ['地瓜葉和肉都先燙過再合炒，份量照建議吃就好。'] },
    { id: 'ginger-luffa-shrimp', style: 'chinese', needs: ['絲瓜', '蝦仁'], title: '薑絲鮮蝦燴絲瓜', time: '約 15 分鐘',
      intro: '鮮蝦甜味滲進滑嫩絲瓜，薑絲提香最清甜。',
      ingredients: [{ name: '絲瓜', amount: '半條' }, { name: '蝦仁', amount: SHRIMP2 }, GINGER, OIL, SALT],
      steps: ['蝦仁挑去腸泥，' + BLANCH_MEAT + '。', '絲瓜去皮切塊；熱鍋下油爆香薑絲，下絲瓜炒軟（會自然出水）。', '放入蝦仁拌炒到捲曲熟透，加少許鹽起鍋。'],
      tips: ['絲瓜煮出的湯汁含鉀，留在盤底不要拌飯或喝掉。'] },
    { id: 'luffa-vermicelli', style: 'chinese', needs: ['絲瓜', '冬粉'], title: '絲瓜燜冬粉', time: '約 20 分鐘',
      intro: '冬粉吸滿絲瓜的清甜，滑溜順口又低蛋白。',
      ingredients: [{ name: '絲瓜', amount: '半條' }, { name: '冬粉', amount: '2 把（乾重約 40 g）' }, GINGER, OIL, SALT],
      steps: ['冬粉照包裝用溫水泡軟剪短；絲瓜去皮切塊。', '熱鍋下油爆香薑絲，下絲瓜炒到出水變軟，加 3 大匙開水。', '放入冬粉小火燜 3 分鐘到冬粉透明、沒有硬芯（太乾就補 1 大匙開水），加少許鹽拌勻。'],
      tips: ['這道沒有肉蛋，旁邊配一份蛋白質菜。', '冬粉是低蛋白澱粉，很適合未洗腎腎友增加飽足感。'] },
    { id: 'wintermelon-chicken', style: 'chinese', needs: ['冬瓜', ['雞腿肉', '雞胸肉']], title: '冬瓜薑絲燜雞丁', time: '約 25 分鐘',
      intro: '冬瓜燜到透明入味，配嫩雞丁清爽不油膩。',
      ingredients: [{ name: '冬瓜', amount: '300 g' }, { name: '{1}', amount: MEAT2 }, GINGER, SCALLION, OIL, SOY, SUGAR],
      steps: ['{1}切丁，' + BLANCH_MEAT + '。', '冬瓜去皮切小塊；熱鍋下油爆香薑絲，下{1}炒到表面微黃。', '加入冬瓜、少許醬油、糖和 3 大匙開水，蓋鍋燜 8 分鐘到冬瓜透明、雞肉全熟，撒蔥花。'],
      tips: ['盤底湯汁不要拌飯或當湯喝。'] },
    { id: 'wintermelon-tofu', style: 'chinese', needs: ['冬瓜', '豆腐'], title: '冬瓜蔥燒豆腐', time: '約 20 分鐘',
      intro: '軟嫩豆腐和清甜冬瓜一起燒，長輩牙口好入口。',
      ingredients: [{ name: '冬瓜', amount: '300 g' }, { name: '豆腐', amount: TOFU2 }, SCALLION, GINGER, OIL, SOY],
      steps: ['豆腐切厚塊，' + BLANCH_VEG.replace('燙菜水', '燙豆腐的水') + '。', '冬瓜去皮切片；熱鍋下油爆香蔥段和薑絲，下冬瓜和 3 大匙開水蓋鍋燜 6 分鐘到軟。', '輕輕放入豆腐和少許醬油，再燒 3 分鐘入味即可。'],
      tips: ['選傳統豆腐比較不易碎，盤底湯汁留在盤裡不要喝。'] },
    { id: 'scallion-beef', style: 'chinese', needs: ['牛肉'], title: '蔥爆牛肉', time: '約 15 分鐘',
      intro: '大火快炒出蔥段焦香，牛肉滑嫩超下飯。',
      ingredients: [{ name: '牛肉', amount: MEAT2 }, { name: '蔥', amount: '3 支' }, GARLIC, { name: '辣椒', amount: '半根（去籽，可省）' }, OIL, SOY, { name: '米酒', amount: '1 小匙' }, SUGAR],
      steps: ['牛肉切薄片，' + BLANCH_MEAT + '。', '熱鍋下油爆香蔥白、蒜片和辣椒，下牛肉快炒到全熟。', '熗入米酒、少許醬油和糖，下蔥綠快炒 10 秒起鍋。'],
      tips: ['不要用沙茶醬或蠔油，蔥蒜爆香就很有味道。'] },
    { id: 'bokchoy-tofu', style: 'chinese', needs: ['青江菜', '豆腐'], title: '青江菜燒豆腐', time: '約 15 分鐘',
      intro: '金黃豆腐配翠綠青江菜，清爽又有家常醬香。',
      ingredients: [{ name: '青江菜', amount: '1 把（約 300 g）' }, { name: '豆腐', amount: TOFU2 }, GARLIC, OIL, SOY],
      steps: ['青江菜切段，' + BLANCH_VEG + '；豆腐切塊，另用滾水汆燙約 3 分鐘，撈起瀝乾，燙豆腐的水倒掉。', '熱鍋下油爆香蒜末，下豆腐煎到兩面微黃。', '加入青江菜、少許醬油和 2 大匙開水拌勻起鍋。'],
      tips: ['青江菜和豆腐都先汆燙，能減少部分鉀。'] },
    { id: 'bokchoy-mushroom', style: 'chinese', needs: ['青江菜', ['香菇', '杏鮑菇']], title: '鮮菇炒青江菜', time: '約 15 分鐘',
      intro: '鮮菇切厚片炒出香氣，襯出青江菜的脆甜。',
      ingredients: [{ name: '青江菜', amount: '1 把（約 300 g）' }, { name: '{1}', amount: '2 人合計約 100 g（香菇約 4 朵，杏鮑菇約 1 根）' }, GARLIC, OIL, SALT],
      steps: ['青江菜切段、{1}切片，分別' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末，下{1}炒到表面微黃出香氣。', '加入青江菜快炒 30 秒，加少許鹽起鍋。'],
      tips: ['這道沒有肉蛋，旁邊配一份蛋白質菜。', '要用新鮮菇類，不要用乾香菇。'] },
    { id: 'napa-shrimp', style: 'chinese', needs: ['大白菜', '蝦仁'], title: '蝦仁燴大白菜', time: '約 20 分鐘',
      intro: '大白菜煮得軟甜，和鮮蝦一起燴煮鮮味十足。',
      ingredients: [{ name: '大白菜', amount: '1/4 顆' }, { name: '蝦仁', amount: SHRIMP2 }, GINGER, OIL, SALT],
      steps: ['大白菜切塊，' + BLANCH_VEG + '；蝦仁挑去腸泥，' + BLANCH_MEAT + '。', '熱鍋下油爆香薑絲，下大白菜拌炒，加 2 大匙開水燜 2 分鐘。', '加入蝦仁翻炒到捲曲熟透，加少許鹽拌勻。'],
      tips: ['大白菜會出水，盤底湯汁不要拌飯。'] },
    { id: 'three-cup-king-oyster', style: 'chinese', needs: ['杏鮑菇'], title: '三杯風杏鮑菇', time: '約 15 分鐘',
      intro: '九層塔與麻油老薑煸香，杏鮑菇吃起來像肉一樣 Q。',
      ingredients: [{ name: '杏鮑菇', amount: '2 人合計約 150 g（約 2 根）' }, GINGER, GARLIC, { name: '九層塔', amount: '1 小把' }, { name: '香油', amount: '1 小匙' }, OIL, SOY, { name: '米酒', amount: '1 小匙' }, SUGAR],
      steps: ['杏鮑菇切滾刀塊，' + BLANCH_VEG + '，擦乾。', '熱鍋下油和香油，小火把薑片和蒜粒煸香，下杏鮑菇煎到微焦。', '淋入米酒、1 小匙醬油和少許糖炒勻，起鍋前放九層塔拌香。'],
      tips: ['這道沒有肉蛋，旁邊配一份蛋白質菜。', '傳統三杯醬汁重，這裡減油減醬油且不放冰糖漿，一樣很香。'] },
    { id: 'dougan-greens', style: 'chinese', needs: ['豆干', ['小白菜', '青江菜']], title: '豆干炒{1}', time: '約 15 分鐘',
      intro: '豆干煎到微焦帶豆香，配脆綠青菜很下飯。',
      ingredients: [{ name: '豆干', amount: DOUGAN2 }, { name: '{1}', amount: '1 把（約 300 g）' }, GARLIC, OIL, SOY],
      steps: ['豆干切片，' + BLANCH_VEG.replace('燙菜水', '燙豆干的水') + '；{1}切段，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末，下豆干煎到兩面微黃。', '加入{1}和少許醬油快炒 30 秒拌勻起鍋。'],
      tips: ['買原味白豆干，看成分表沒有磷酸鹽類添加物；五香豆干、滷好的豆干含鈉較高，少用。'] },
    { id: 'dougan-basil-egg', style: 'chinese', needs: ['豆干', '雞蛋'], title: '九層塔豆干炒蛋', time: '約 15 分鐘',
      intro: '九層塔香配上微焦豆干和滑蛋，很有台式熱炒味。',
      ingredients: [{ name: '豆干', amount: DOUGAN1 }, { name: '雞蛋', amount: EGG1 }, { name: '九層塔', amount: '1 小把' }, GARLIC, OIL, SOY],
      steps: ['豆干切丁，' + BLANCH_VEG.replace('燙菜水', '燙豆干的水') + '。', '熱鍋下油爆香蒜末，下豆干炒到微黃，倒入打散的蛋液炒到蛋熟透。', '淋少許醬油，放九層塔快速拌勻起鍋。'],
      tips: ['豆干和雞蛋合起來就是這一餐的蛋白質份量。'] },
    { id: 'three-cup-squid', style: 'chinese', needs: ['花枝'], title: '九層塔三杯風花枝', time: '約 15 分鐘',
      intro: '薑蒜九層塔爆出三杯香氣，花枝 Q 彈不韌。',
      ingredients: [{ name: '花枝', amount: SQUID2 }, GINGER, GARLIC, { name: '九層塔', amount: '1 小把' }, { name: '香油', amount: '1 小匙' }, OIL, SOY, { name: '米酒', amount: '1 小匙' }, SUGAR],
      steps: ['花枝切條或切圈，' + BLANCH_FISH.replace('燙魚水', '燙花枝的水') + '。', '熱鍋下油和香油，小火煸香薑片和蒜粒，下花枝快炒到全熟。', '淋米酒、1 小匙醬油和少許糖炒勻，起鍋前下九層塔拌香。'],
      tips: ['花枝膽固醇較高，吃的頻率照醫師或營養師建議。'] },
    { id: 'garlic-squid-cucumber', style: 'chinese', needs: ['花枝', '小黃瓜'], title: '蒜香花枝炒小黃瓜', time: '約 15 分鐘',
      intro: '脆口小黃瓜搭彈牙花枝，雙脆口感很開胃。',
      ingredients: [{ name: '花枝', amount: SQUID2 }, { name: '小黃瓜', amount: '1 條' }, GARLIC, { name: '辣椒', amount: '半根（去籽，可省）' }, OIL, SALT],
      steps: ['花枝切圈，' + BLANCH_FISH.replace('燙魚水', '燙花枝的水') + '；小黃瓜切斜片，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜片和辣椒，下花枝炒到熟透。', '加入小黃瓜片和少許鹽快炒 20 秒起鍋。'],
      tips: ['小黃瓜汆燙後不要炒太久，就能保住脆度。'] },
    { id: 'ginger-tilapia-rice', style: 'chinese', needs: ['鯛魚', '白飯'], title: '薑絲醬香鯛魚飯', time: '約 20 分鐘',
      intro: '煎香鯛魚鋪在熱白飯上，撒上蔥薑絲簡單又滿足。',
      ingredients: [{ name: '鯛魚', amount: MEAT2 }, { name: '白飯', amount: '2 碗' }, GINGER, SCALLION, OIL, SOY, { name: '米酒', amount: '1 小匙' }],
      steps: ['鯛魚切片，' + BLANCH_FISH + '，用紙巾擦乾。', '平底鍋下油爆香薑絲，鯛魚兩面煎到金黃熟透，淋少許醬油和米酒熗香（不留多餘湯汁）。', '盛起鋪在白飯上，撒蔥花配著吃。'],
      tips: ['旁邊配一盤汆燙過的青菜，營養更均衡。'] },
    { id: 'salmon-fried-rice', style: 'chinese', needs: ['鮭魚', '白飯'], title: '鮭魚蔥花炒飯', time: '約 20 分鐘',
      intro: '煎香鮭魚撥碎和白飯同炒，每口都有魚油與蔥香。',
      ingredients: [{ name: '鮭魚', amount: MEAT2 }, { name: '白飯', amount: '2 碗' }, { name: '蔥', amount: '2 支' }, GARLIC, OIL, SALT, { name: '白胡椒', amount: '少許' }],
      steps: ['鮭魚' + BLANCH_FISH + '，擦乾後下鍋煎到兩面金黃熟透，用鍋鏟撥成小塊先盛起。', '原鍋爆香蒜末和蔥白，下白飯炒散炒香。', '倒回鮭魚碎，加少許鹽、白胡椒和蔥綠拌炒均勻。'],
      tips: ['鮭魚本身油脂豐富，炒飯的油放少一點即可。'] },
    { id: 'chicken-leg-scallion', style: 'chinese', needs: ['雞腿肉'], title: '蔥油香煎雞腿排', time: '約 20 分鐘',
      intro: '雞腿排煎到表皮酥香，淋上現煸蔥油香氣逼人。',
      ingredients: [{ name: '雞腿肉', amount: MEAT2 }, { name: '蔥', amount: '2 支' }, GINGER, OIL, SALT, { name: '白胡椒', amount: '少許' }],
      steps: ['去骨雞腿肉厚的地方用刀劃開攤平，' + BLANCH_MEAT + '，用紙巾擦乾，抹少許鹽和白胡椒。', '平底鍋下少許油，雞腿肉中小火兩面各煎約 4 分鐘到表皮金黃；切開最厚處確認中心全熟、沒有粉紅肉汁，不夠就再煎，再切塊盛盤。', '利用鍋中餘油小火煸香蔥花和薑末，加少許鹽拌成蔥油淋在雞腿上。'],
      tips: ['去皮或少吃雞皮可以減少飽和脂肪；旁邊配一盤汆燙青菜。'] },
    { id: 'waterspinach-beef', style: 'chinese', needs: ['空心菜', '牛肉'], title: '蒜香空心菜炒牛肉', time: '約 15 分鐘',
      intro: '台式熱炒經典組合，不用沙茶醬也蒜香十足。',
      ingredients: [{ name: '空心菜', amount: '1 把（約 300 g）' }, { name: '牛肉', amount: MEAT2 }, GARLIC, { name: '辣椒', amount: '半根（去籽，可省）' }, OIL, SOY],
      steps: ['空心菜切段，' + BLANCH_VEG + '；牛肉切薄片，' + BLANCH_MEAT + '。', '熱鍋下油爆香蒜末和辣椒，下牛肉炒到全熟。', '加入空心菜和少許醬油快炒 20 秒起鍋。'],
      tips: ['外食常加大量沙茶醬，自己在家改用蒜末和一般醬油最安心。'] },
    { id: 'beansprout-pork', style: 'chinese', needs: ['綠豆芽', ['豬肉', '豬絞肉']], title: '銀芽炒肉絲', time: '約 15 分鐘',
      intro: '清脆豆芽配滑嫩肉絲，白胡椒提味清爽開胃。',
      ingredients: [{ name: '綠豆芽', amount: '1 盒（約 250 g）' }, { name: '{1}', amount: MEAT2 }, SCALLION, OIL, SALT, { name: '白胡椒', amount: '少許' }],
      steps: ['綠豆芽洗淨，' + BLANCH_VEG + '；{1}切絲（絞肉撥散），' + BLANCH_MEAT + '。', '熱鍋下油爆香蔥段，下{1}炒到全熟。', '加入綠豆芽、少許鹽和白胡椒快炒 20 秒起鍋。'],
      tips: ['綠豆芽汆燙後馬上撈起瀝乾，炒起來一樣脆口。'] },
    { id: 'enoki-tofu-braise', style: 'chinese', needs: ['金針菇', '豆腐'], title: '金針菇蔥燒豆腐', time: '約 20 分鐘',
      intro: '金針菇的鮮味融進嫩豆腐裡，溫潤下飯。',
      ingredients: [{ name: '金針菇', amount: '去根後約 100 g（2 人合計，約半包）' }, { name: '豆腐', amount: TOFU2 }, SCALLION, GARLIC, OIL, SOY],
      steps: ['金針菇切去根部切段，' + BLANCH_VEG + '；豆腐切塊，另用滾水汆燙約 3 分鐘，撈起瀝乾，燙豆腐的水倒掉。', '熱鍋下油爆香蒜末，下豆腐煎到兩面微黃。', '加入金針菇、少許醬油和 2 大匙開水燒 2 分鐘，撒蔥花起鍋。'],
      tips: ['金針菇含鉀偏高，汆燙只能去掉一部分鉀，份量照上面的 100 g；盤底湯汁不要拌飯。'] },
    { id: 'tilapia-noodle', style: 'chinese', needs: ['鯛魚', '麵條'], title: '香煎鯛魚蔥香拌麵', time: '約 20 分鐘',
      intro: '油蔥拌麵配外酥內嫩的鯛魚片，一盤就飽足。',
      ingredients: [{ name: '鯛魚', amount: MEAT2 }, { name: '麵條', amount: '乾麵條 2 小把（約 100 g）' }, { name: '蔥', amount: '2 支' }, OIL, SOY, { name: '白醋', amount: '1 小匙' }],
      steps: ['鯛魚切片，' + BLANCH_FISH + '，擦乾；麵條煮熟撈起，煮麵水倒掉。', '平底鍋下油，鯛魚煎到兩面金黃熟透先盛起。', '原鍋小火煸香蔥段，加少許醬油和白醋拌成醬汁，倒進麵條拌勻，放上鯛魚片。'],
      tips: ['麵條本身也有蛋白質，未洗腎的腎友麵量照營養師建議；拌麵不要加湯。'] },
    { id: 'pork-rice-noodle', style: 'chinese', needs: ['米粉', ['豬絞肉', '豬肉']], title: '肉末蒜香炒米粉', time: '約 25 分鐘',
      intro: '蒜香肉末配爽口米粉與高麗菜，古早味不油膩。',
      ingredients: [{ name: '米粉', amount: '乾重約 100 g' }, { name: '{1}', amount: MEAT2 }, { name: '高麗菜', amount: '2 片葉子' }, GARLIC, SCALLION, OIL, SOY],
      steps: ['米粉照包裝用溫水泡軟或燙軟，瀝乾；{1}剁碎，' + BLANCH_MEAT + '；高麗菜切絲，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末和蔥段，下{1}炒到全熟。', '加入高麗菜、米粉、少許醬油和 4 大匙開水，翻炒到米粉吸乾水分、沒有硬芯（太乾就補少許開水）。'],
      tips: ['傳統炒米粉常加乾香菇和蝦米，含鉀很高，這裡省略。'] },
    { id: 'pepper-chicken-leg', style: 'chinese', needs: ['雞腿肉', '青椒'], title: '青椒醬燒雞腿丁', time: '約 20 分鐘',
      intro: '雞腿丁煎香後帶微甜醬色，搭脆青椒最開胃。',
      ingredients: [{ name: '雞腿肉', amount: MEAT2 }, { name: '青椒', amount: '1 顆' }, GARLIC, OIL, SOY, { name: '米酒', amount: '1 小匙' }, SUGAR],
      steps: ['雞腿肉切丁，' + BLANCH_MEAT + '；青椒去籽切塊，' + BLANCH_VEG + '。', '熱鍋下油爆香蒜末，下雞腿丁煎炒到表面金黃、中心全熟。', '加入青椒、少許醬油、米酒和糖拌炒勻即可。'],
      tips: ['青椒汆燙後最後才下鍋，吃起來依然清脆。'] },
    { id: 'cabbage-dougan', style: 'chinese', needs: ['高麗菜', '豆干'], title: '高麗菜炒豆干絲', time: '約 15 分鐘',
      intro: '豆干切絲煎香，跟清甜高麗菜一起炒非常對味。',
      ingredients: [{ name: '高麗菜', amount: '1/4 顆' }, { name: '豆干', amount: DOUGAN2 }, GARLIC, OIL, SOY],
      steps: ['高麗菜切絲，' + BLANCH_VEG + '；豆干切絲，' + BLANCH_VEG.replace('燙菜水', '燙豆干的水') + '。', '熱鍋下油爆香蒜末，下豆干絲炒到微焦。', '加入高麗菜絲和少許醬油快炒拌勻起鍋。'],
      tips: ['豆干是植物性蛋白質，份量照上面的克數吃就好。'] },
    { id: 'carrot-dougan', style: 'chinese', needs: ['胡蘿蔔', '豆干'], title: '胡蘿蔔絲炒豆干', time: '約 15 分鐘',
      intro: '橘黃胡蘿蔔配醬香豆干絲，便當常備好菜。',
      ingredients: [{ name: '胡蘿蔔', amount: '半條' }, { name: '豆干', amount: DOUGAN2 }, SCALLION, OIL, SOY, { name: '香油', amount: '少許' }],
      steps: ['胡蘿蔔刨細絲，' + BLANCH_VEG + '；豆干切絲，' + BLANCH_VEG.replace('燙菜水', '燙豆干的水') + '。', '熱鍋下油爆香蔥段，下豆干絲炒香。', '加入胡蘿蔔絲和少許醬油炒勻，起鍋前點少許香油。'],
      tips: ['胡蘿蔔切細絲再汆燙，能去掉比較多鉀。'] },
    { id: 'cauliflower-chicken-w', style: 'western', needs: ['花椰菜', ['雞胸肉', '雞腿肉']], title: '蒜香花椰菜嫩煎雞', time: '約 20 分鐘',
      intro: '白花椰菜煎出微焦香氣，配嫩雞塊清爽有層次。',
      ingredients: [{ name: '花椰菜', amount: '半顆' }, { name: '{1}', amount: MEAT2 }, GARLIC, { name: '橄欖油', amount: '1 大匙' }, { name: '黑胡椒', amount: '少許' }, SALT],
      steps: ['花椰菜切小朵，' + BLANCH_VEG + '，擦乾；{1}切塊，' + BLANCH_MEAT + '，擦乾。', '平底鍋下橄欖油爆香蒜片，下{1}煎到金黃全熟先盛起。', '同鍋把花椰菜煎到邊緣微焦，倒回雞肉，加少許鹽和黑胡椒拌勻。'],
      tips: ['白花椰菜含鉀比綠花椰菜低，但一樣先汆燙更安心。'] },
    { id: 'egg-tofu-tomato', style: 'chinese', needs: ['番茄', '豆腐'], title: '番茄燒豆腐', time: '約 20 分鐘',
      intro: '酸甜番茄拌著熱豆腐，不加肉也很下飯。',
      ingredients: [{ name: '番茄', amount: '1 顆（中型）' }, { name: '豆腐', amount: TOFU2 }, SCALLION, OIL, SUGAR, SALT],
      steps: ['番茄切小塊，' + BLANCH_VEG + '；豆腐切塊，另用滾水汆燙約 3 分鐘，撈起瀝乾，燙豆腐的水倒掉。', '熱鍋下油把番茄炒軟，加少許糖、鹽和 2 大匙開水。', '放入豆腐輕輕拌燒 3 分鐘入味，撒蔥花起鍋。'],
      tips: ['不要用番茄醬，新鮮番茄炒軟就有自然酸甜；盤底湯汁不要拌飯。'] }
  ];

  var STYLE_OK = { default: null, chinese: 'chinese', western: 'western' };

  function fill(s, picked) {
    return String(s).replace(/\{(\d)\}/g, function (_, i) { return picked[Number(i)] || ''; });
  }

  /* 依使用者的食材挑食譜。keys：可用食材在目錄裡的 key（不含 ✕ 不建議的）。
   * 回傳 [{ recipe, picked }]，用到越多樣食材的排越前面；同分照食譜庫順序。 */
  function matchRecipes(keys, style) {
    var have = {};
    (keys || []).forEach(function (k) { if (k) have[k] = true; });
    var want = STYLE_OK[style] || null;
    var out = [];
    RECIPES.forEach(function (r, order) {
      if (want && r.style !== want) return;
      var picked = [];
      for (var i = 0; i < r.needs.length; i++) {
        var opts = Array.isArray(r.needs[i]) ? r.needs[i] : [r.needs[i]];
        var hit = null;
        for (var j = 0; j < opts.length; j++) if (have[opts[j]] && picked.indexOf(opts[j]) < 0) { hit = opts[j]; break; }
        if (!hit) return;
        picked.push(hit);
      }
      out.push({ recipe: r, picked: picked, score: picked.length, order: order });
    });
    out.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    return out.map(function (m) { return { recipe: m.recipe, picked: m.picked }; });
  }

  var MODE_TIP = {
    predialysis: '未洗腎：這份食譜的肉、魚、蛋、豆約每人 1 份；麵條、吐司本身也有蛋白質，主食量照營養師建議，想更飽可以多用冬粉、米粉這類低蛋白澱粉。',
    dialysis: '洗腎中：肉、魚、蛋、豆已加到每人約 2 份；如果營養師給你的份量不同，照營養師的建議。',
    // 食譜本身沒有肉、魚、蛋、豆時（炒青菜、南瓜炒米粉），不能說「已加到幾份」
    predialysis_none: '未洗腎：這道沒有肉、魚、蛋、豆；這一餐的蛋白質另外配，份量照醫師或營養師的低蛋白飲食建議。',
    dialysis_none: '洗腎中：這道沒有肉、魚、蛋、豆，洗腎的人蛋白質要吃夠，這一餐要另外配一道蛋白質菜（每人約 2 份）；份量照營養師的建議。'
  };
  var PROTEIN_GROUPS = { egg: true, meat: true, sea: true };

  /* 把一道常備食譜套上模式與使用者的食材，變成跟 AI 回傳一樣的形狀，畫面共用同一個 renderRecipe。 */
  function materialize(match, mode, usableNames) {
    var r = match.recipe, picked = match.picked;
    var m = mode === 'dialysis' ? 1 : 0;
    var used = {}, have = {};
    picked.forEach(function (k) { used[k] = true; have[k] = true; });
    (usableNames || []).forEach(function (n) { if (n.key) have[n.key] = true; });
    r.ingredients.forEach(function (ing) { used[fill(ing.name, picked)] = true; });
    var hasProtein = r.ingredients.some(function (ing) { var c = entryOf(fill(ing.name, picked)); return c && PROTEIN_GROUPS[c.group]; });
    var tipKey = (m ? 'dialysis' : 'predialysis') + (hasProtein ? '' : '_none');
    return {
      id: r.id,
      title: fill(r.title, picked),
      intro: r.intro,
      servings: '2 人份',
      time: r.time,
      ingredients: r.ingredients.map(function (ing) {
        var name = fill(ing.name, picked);
        var c = entryOf(name);
        // 食譜用到、但使用者清單裡沒有的食材要講清楚：配菜可省略，主食得另外準備
        if (c && !have[name]) name += (c.group === 'veg' || c.group === 'mush') ? '（有的話再加）' : '（需另外準備）';
        return { name: name, key: c ? c.key : null, amount: Array.isArray(ing.amount) ? ing.amount[m] : ing.amount };
      }),
      steps: r.steps.map(function (s) { return fill(s, picked); }),
      kidney_tips: r.tips.concat([MODE_TIP[tipKey]]),
      not_used: (usableNames || []).filter(function (n) { return !used[n.key]; })
        .map(function (n) { return { name: n.name, reason: '這道菜沒用到，可以按「換一道」或「讓 AI 設計」。' }; })
    };
  }

  var api = {
    GROUPS: GROUPS,
    CATALOG: CATALOG,
    RECIPES: RECIPES,
    indexDb: indexDb,
    keyOf: keyOf,
    entryOf: entryOf,
    matchRecipes: matchRecipes,
    materialize: materialize
  };
  root.WhatToEatRecipes = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
