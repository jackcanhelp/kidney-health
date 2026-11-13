# 交接快照（kidney-health 網站）

新 session 打「接續」時讀這一節。只寫事實與已做的決定；未驗證的標「未驗證」。不寫憑證。

## 現況快照（2026-11-13 16:50）

- 發布 checkout：`worktrees/kidney-portal-cloudflare-entry`（main）。純靜態站，GitHub Pages；版本來源 `version.js`，`node scripts/check-version.mjs` 檢查。
- **今天吃甚麼？** v1.1.22 已上線（c5aeb91）：拍照辨識＋「📋 挑食材」面板、45 道常備食譜（`what-to-eat-recipes.js`，不經 AI、輪流推薦），湊不出才用 AI。未洗腎／洗腎中兩種蛋白質份量（1 份 ≈ 7 g 蛋白質）。
  - 測試：`what-to-eat-rules.test.mjs`、`what-to-eat-recipes.test.mjs`（逐樣食材查汆燙、禁用調味料、時間一致、熟透）。
  - 食譜 2026-11-13 經 Codex 審查（程式 5 項、食譜 28 道）後修正，使用者同意上線；尚未經醫師逐道臨床審閱。
  - 尚無常備食譜、會交給 AI 的食材：玉米筍、香菇、金針菇、南瓜、馬鈴薯、地瓜、義大利麵。
  - 真手機相機流程**未驗證**（只在電腦瀏覽器測過）。
- **gemini-proxy Worker**（3299cec，使用者手貼 Cloudflare Dashboard 部署，Claude 無法自己部署）：全部免費、依序備援
  Gemini `gemini-2.5-flash-lite` → 同 key `gemini-3.5-flash-lite`、`gemini-3.1-flash-lite`（429/404 才換）→ Workers AI（綁定 `AI`）→ Z.ai（Secret `ZAI_API_KEY`）。
  `X-Provider: gemini|cf|zai` 強制單一家，回應標頭 `X-Provider-Used` 標出實際模型。對比腳本：`node scripts/compare-ai-providers.mjs <照片夾> <gemini|zai|cf> out.json`。
- 品質實測（同 12 張照片）：2.5 flash-lite 10/12、3.5 flash-lite 11/12、Z.ai 看圖幾乎全過載；食譜三家五項檢查都過。Workers AI 11-13 當日額度已被用光（疑同帳號其他專案生圖，未確認），預定 11-14 台灣 08:00 後測。

## 已做的決定

- 完全不花錢：不開 Gemini 計費、不儲值 OpenRouter；額度全用完時畫面顯示「目前額度用完，請等待重置」。
- 不做「多個 Google 帳號的 API key 輪流打」（違反 Google APIs 條款 §2(d)，額度依專案計算）。同一把 key 換不同模型是合規的。
- 不爬 Google Lens／Gemini 網頁版（沒有 API、條款禁止自動存取）。
- 使用者打「C&P」＝ commit＋push；共用工作區，只 add 明確檔名。
- 實質程式或衛教內容在請使用者 C&P 前，先背景交 Codex 唯讀審查（2026-11-13 起）。

## 待辦

1. 11-14 測 Workers AI 品質（辨識 ≥10/12 且食譜全過 → 留在備援鏈；否則拿掉）。
2. 使用者用真手機跑一次相機流程。
3. 視需要補上述沒有常備食譜的食材。
