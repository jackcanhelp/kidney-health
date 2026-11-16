# 交接快照（kidney-health 網站）

新 session 打「接續」時讀這一節。只寫事實與已做的決定；未驗證的標「未驗證」。不寫憑證。

## 現況快照（2026-11-16 08:40）

- 發布 checkout：`worktrees/kidney-portal-cloudflare-entry`（main，已 push 到 2da3042 = v1.1.32）。純靜態站，GitHub Pages；版本來源 `version.js`，`node scripts/check-version.mjs` 檢查；6 支 `*.test.mjs` 全過。
- **今天吃甚麼？** v1.1.27–1.1.32 這兩天的改動：
  - 98 道常備食譜（Gemini 寫 40 道、Codex 審內容 19 項已修）；念／下載／分享固定一列，手機分享附食譜 PNG。
  - AI 食譜的「沒有放進這道菜的食材」會濾掉材料裡已有的（`R.filterNotUsed`）。
  - 搜尋：`R.matchFood` 找不到時去掉「冷凍／新鮮／有機…」再找，仍無則用字依序出現當候選（不自動選）；挑食材搜尋框直接列出「🔎 食藥署資料庫」卡片可勾選。打錯字、同音字仍找不到。
  - 煮菜動畫：掀蓋 → 每樣可用食材放大特寫 → 直直掉進鍋 → 蓋蓋；不建議食材不下鍋；尊重減少動態。
  - AI 食譜等 >10 秒顯示「改用備用 AI，最久約 1 分鐘」。
- 審查留著沒做：兩組相近食譜（`rosemary-chicken-potato-w`／`potato-chicken-w`、`bokchoy-mushroom`／`shiitake-greens`）；`.recipe-actions` emoji 沒 aria-hidden；AI 曾把葡萄汆燙當配菜（提示沒管水果用法）。
- gemini-proxy Worker（3299cec）：Gemini flash-lite → 其他 flash-lite → Workers AI → Z.ai，全部免費。Workers AI 11-16 實測辨識 10/12、食譜五項全過，留在鏈上；但慢（辨識 8–19 秒、食譜約 52 秒）。11-16 07:34 當天 10,000 neurons 已用完，誰用的未查。
- Gemini worktree `kidney-portal-cloudflare-entry-gemini-20261114-183959-905` 已合入，可 `git worktree remove`（未做）。
- 真手機上的分享、下載、朗讀、相機、新動畫、挑食材資料庫列**都未驗證**。

## 已做的決定

- 完全不花錢：不開 Gemini 計費、不儲值 OpenRouter；額度全用完時畫面顯示「目前額度用完，請等待重置」。
- 不做「多個 Google 帳號的 API key 輪流打」（違反 Google APIs 條款 §2(d)，額度依專案計算）。同一把 key 換不同模型是合規的。
- 不爬 Google Lens／Gemini 網頁版（沒有 API、條款禁止自動存取）。
- 使用者打「C&P」＝ commit＋push；共用工作區，只 add 明確檔名。
- 實質程式或衛教內容在請使用者 C&P 前，先背景交 Codex 唯讀審查（2026-11-13 起）。
- 豆腐 ⬜、豆干 🟫、雞胸 🐔、冬瓜 🥒（使用者指定）。食譜要多用 Gemini 擴充，不要主線自己想（11-14）。

## 待辦

1. 使用者用真手機跑一次相機、分享、下載、朗讀。
2. 迷宮飯聯名：已給建議（授權門檻高；先累積 GA4 數據、一頁企劃、致敬食譜樣稿不上線）；使用者還沒決定要不要查授權窗口或擬企劃。
3. 查 Workers AI 免費額度一早就用完的原因（同帳號 Mixmodel 生圖？），常發生就考慮拿掉或排序往後。
4. 移除已合入的 Gemini worktree。
