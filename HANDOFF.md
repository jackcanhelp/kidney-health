# 交接記錄 — 給接續工作的 Claude

**寫於**：2026-09-01（手機端 session）
**分支**：`claude/nephrology-website-improvement-2mck15`（所有工作都在這裡，**main 完全未變動**，GitHub Pages 線上網站尚未更新）
**最新 commit**：`8f2fe62`

醫師本人只用手機看過部分內容，**還沒在電腦上完整看過網站**。在他明確說「可以發布」之前，不要合併到 main、不要動 GitHub Pages。

---

## 一句話狀態

網站 SEO/GEO 地基已建好、6 篇衛教文章已寫完並串上首頁、18 則 FB 貼文素材已備好；**36 處臨床數值待醫師核對**是目前最大的阻塞點，其餘都是錦上添花。

---

## 背景：這個專案在做什麼

醫師本人（張竣傑，腎臟科專科醫師，桃庚診所）想推廣個人衛教網站
`jackcanhelp.github.io/kidney-health/`。起點是他把 Gemini 給的建議（GEO／
generative engine optimization，讓 AI 助理主動引用推薦）貼給我，我審過、
用網路搜尋逐條查證後，做成一份四階段計畫。目前完成到階段二尾聲＋階段四
（站外推廣）的一部分。

**重要環境限制**：這個雲端 session 的網路白名單擋掉了大部分醫學期刊網域
（kdigo.org、kidney-international.org、PubMed、照護線上官網等），只有
Google 搜尋可用。所以引用的指引「名稱、發表單位、年份」都經過搜尋查證，
但**無法讀取全文核對逐字數值**——這正是為什麼每篇文章都有 `data-review`
審閱模式。

---

## 已完成的工作（按 commit 順序）

### 1. `f4fad1e` — SEO/GEO 地基
- 首頁加入 `Physician` + `MedicalWebPage` JSON-LD（依醫師真實學經歷寫，
  **刻意不做 `MedicalClinic`**——他不是桃庚診所負責人，只用 `worksFor`
  宣告任職，不宣告擁有、不標地址與看診時間）
- 四個頁面補齊 description / OG / Twitter Card / canonical
- `og-image.jpg`（1200×630 分享預覽圖，用 `doctor-image.png` 合成）
- `sitemap.xml`、`robots.txt`
- `site.js`：GA4 載入器（**`GA_MEASUREMENT_ID` 目前是空字串，未填**）+
  事件追蹤（PDF 開啟／工具使用／聯絡點擊）
- `manifest.json` 補圖示、改 `standalone`
- 移除首頁 5 行 PDF `<link rel="prefetch">`（省下約 70MB 傳輸）
- 10 張漫畫卡片 emoji 封面 → 改用 `thumbs/*.webp`（PDF 首頁縮圖）
- `icons/` 目錄：32/180/192/512/512-maskable PNG

### 2. `3300f71` + `110f754` + `6c1f106` — 文章系統
- `articles/article.css`：全站文章共用樣式（沿用首頁色票）
- `articles/_template.html`：帶 `{{佔位符}}` 的骨架，之後每篇複製改寫
- **6 篇文章**（各自獨立 URL，含 MedicalWebPage + FAQPage JSON-LD）：
  | 檔案 | 標題 | 待確認數值 |
  |---|---|---|
  | `creatinine.html` | 肌酸酐偏高就是腎臟壞了嗎 | 11 |
  | `proteinuria.html` | 尿有泡泡多久不散要看醫生 | 4 |
  | `hyperkalemia.html` | 高血鉀有什麼症狀 | 10 |
  | `fruit.html` | 腎友的水果到底能不能吃 | 1 |
  | `ckd-stage-4.html` | eGFR 20 還有救嗎（第四期） | 7 |
  | `vascular-access.html` | 洗腎一定要做瘻管嗎 | 3 |
- `articles/index.html`：文章索引頁
- 首頁 `#articles` 區塊（hero 下方、衛教漫畫上方），導覽列與手機選單
  加入「衛教文章」
- 每篇文末有**經查證**的參考文獻清單（KDIGO 2024 CKD／2021 血壓／2022
  糖尿病／2020 鉀離子共識會議、KDOQI 2020 營養／2019 血管通路、台灣腎臟
  醫學會 2025 指引），連結指向官方網站（本 session 連不上，未讀全文）

### 3. `8f2fe62` — 標題還原 + FB 貼文
- 10 張漫畫卡片標題從網站原本的描述性檔名，換回 **PDF 封面上的原標題**
  （例：「認識慢性腎臟病五階段」→「張醫師的保腎大作戰：圖解慢性腎臟病
  五階段」），已驗證卡片高度一致、無文字溢出
- `promo/facebook-posts.md`：18 則可直接複製的貼文（6 篇文章 × 3 則：
  反直覺事實／重點整理／提問互動）

---

## 審閱模式：所有文章的核心機制

每篇文章 `<body data-review>`，臨床數值用 `<span class="tbc">數值</span>`
標記（橘色虛線）。頁面頂端有橫幅、右下角有 JS 自動計數。

**發布前必做**：醫師逐篇核對所有 `tbc` 數值後，把 `<body data-review>`
改回 `<body>`，所有審閱標記自動消失。**這是唯一的發布閘門**，其他都是
選配。

用這個指令可以列出所有待確認處（排除 `_template.html`，那是模板佔位符不是真的待確認項）：
```bash
grep -rn 'class="tbc"' articles/*.html --exclude=_template.html
```

或做一份核對清單（PC 端 Claude 可以主動問要不要做這個）。

---

## 明確不做 / 已放棄的事

1. **PDF 浮水印移除**：16 份 PDF 右下角都有 NotebookLM／Gemini Notebook
   浮水印。**偵測完全成功**（跨頁比對法，位置一致），但修補失敗——
   231 頁中 157 頁（68%）浮水印壓在有畫面細節處，任何 inpainting 參數
   都會留下明顯糊斑。**醫師已同意放棄，PDF 檔案完全未被修改過**（測試
   全程在 `/tmp` 暫存區，從未寫回 repo）。如果要重啟這件事，唯一乾淨的
   路是回 NotebookLM 原始 notebook 用付費方案重新輸出無浮水印版——不要
   再嘗試後製去浮水印。

2. **MedicalClinic schema**：見上方 SEO 段落，刻意不做。

3. **論壇口碑經營**（PTT／Dcard 等）：醫療法風險考量，明確建議不做。

4. **系列命名統一**（「腎利學堂 EP.1–EP.10」）：這是品牌決定，我只提了
   建議，**沒有動手**，需要醫師點頭才能做。

---

## 待醫師決定 / 下一步候選

依優先順序，PC 端 session 可以直接問或視情況主動做：

1. **36 處 `tbc` 數值核對**——唯一的發布阻塞點。可以主動生成一份核對清單。
2. **GA4 評估 ID 填入** `site.js` 第 12 行——醫師需自行去
   analytics.google.com 建立資源取得 ID。
3. **確認 GitHub Pages 網址**——目前假設是
   `https://jackcanhelp.github.io/kidney-health/`（repo 沒有 CNAME）。
   若要換自訂網域，牽動 canonical / OG / sitemap / JSON-LD 裡所有絕對
   URL，越早換越好。
4. **照護線上投稿**：已查證聯絡方式 `careonlinetw@gmail.com`，投稿信
   草稿在稍早對話中給過（未存檔於 repo，需要的話可以問醫師要不要補一份
   到 `promo/` 目錄）。**投稿前一定要先確認漫畫有沒有辦法去浮水印**，
   否則投稿會被拒。
5. **系列命名要不要統一成「腎利學堂」**——問醫師意願。
6. **首頁看過一輪**——醫師本人還沒在電腦上看過這次改動的網站，
   PC 端第一件事應該是等他看完給回饋，而不是預設繼續往下做。

---

## 技術細節備忘

- **本機測試**：`python3 -m http.server 8899` + Playwright
  (`/opt/pw-browsers/chromium`) 做視覺驗證，這個環境可用。
- **PDF 工具**：`pymupdf`（`import pymupdf`，非 `fitz`）+ `Pillow` +
  `opencv-python-headless`，這個環境都已安裝。PC 端可能要重新
  `pip install`。
- **中文檔名**：repo 裡大量檔案是中文檔名（`衛教漫畫/`、`專業領域/`
  等），Windows 上開發要注意編碼問題。
- **`.claude/skills/human-voice/SKILL.md`**：所有衛教文字內容的寫作規範
  （去 AI 腔、保留門診口吻、GEO 結構），繼續寫文章或社群文案前務必載入
  這個 skill。原本醫師提到的「去人味」skill 是另一個 session 參考 sepia
  做的，**本環境沒有**，這份 `human-voice` 是我依他的描述重新寫的替代版。

---

## 給 PC 端 Claude 的建議開場

先讀這份文件 + 跑一次 `git log --oneline -10` 確認沒有新變動，然後直接
問醫師：「網站看過了嗎？有沒有想先調整的地方，還是先幫你把 36 處待確認
數值列成清單？」不要預設要做什麼，這次交接的重點是**他要先看過電腦版**。
