# 交接快照（kidney-health 網站）

新 session 打「接續」時讀這一節。只寫事實與已做的決定；未驗證的標「未驗證」。不寫憑證。

## 現況快照（2026-11-14 19:10）

- 發布 checkout：`worktrees/kidney-portal-cloudflare-entry`（main，v1.1.27）。純靜態站，GitHub Pages；版本來源 `version.js`，`node scripts/check-version.mjs` 檢查。
- **今天吃甚麼？** v1.1.27：98 道常備食譜（Gemini 新寫 40 道，Claude 逐道讀過、Codex 審內容，19 項已修；測試 BANNED 補了 17 個禁用詞）。食譜下方固定一列 `.recipe-tools`「🔊 念食譜／📥 下載食譜／💁‍♀️ 分享食譜」（Gemini 審程式，畫圖與 canShare 例外已包 try）；手機分享帶食譜 PNG＋文字連結，不能附檔只送文字。
- 審查留著沒做：`rosemary-chicken-potato-w` 與 `potato-chicken-w` 相近、`bokchoy-mushroom` 香菇版與 `shiitake-greens` 相近（保留當變化）；`.recipe-actions` 按鈕 emoji 沒 aria-hidden（改動前就有）。
- Gemini worktree `kidney-portal-cloudflare-entry-gemini-20261114-183959-905` 內容已合入，可 `git worktree remove`。
- 真手機上的分享、下載、朗讀、相機流程都**未驗證**。
- gemini-proxy Worker（3299cec）：Gemini flash-lite → 其他 flash-lite → Workers AI → Z.ai，全部免費；三支工具（鉀、磷掃描、今天吃甚麼）共用同一支 Worker 與額度。使用者確認沒有 Workers Paid，不會扣費。

## 已做的決定

- 完全不花錢：不開 Gemini 計費、不儲值 OpenRouter；額度全用完時畫面顯示「目前額度用完，請等待重置」。
- 不做「多個 Google 帳號的 API key 輪流打」（違反 Google APIs 條款 §2(d)，額度依專案計算）。同一把 key 換不同模型是合規的。
- 不爬 Google Lens／Gemini 網頁版（沒有 API、條款禁止自動存取）。
- 使用者打「C&P」＝ commit＋push；共用工作區，只 add 明確檔名。
- 實質程式或衛教內容在請使用者 C&P 前，先背景交 Codex 唯讀審查（2026-11-13 起）。
- 豆腐 ⬜、豆干 🟫、雞胸 🐔、冬瓜 🥒（使用者指定）。食譜要多用 Gemini 擴充，不要主線自己想（11-14）。

## 待辦

1. ~~合併 Gemini 新食譜、升 1.1.27、C&P~~（11-14 完成）。
2. 11-14 測 Workers AI 品質（辨識 ≥10/12 且食譜全過 → 留在備援鏈；否則拿掉）。
3. 使用者用真手機跑一次相機、分享、下載、朗讀。
4. 迷宮飯聯名：已給建議（授權門檻高；先累積 GA4 數據、一頁企劃、致敬食譜樣稿不上線）；使用者還沒決定要不要查授權窗口或擬企劃。
