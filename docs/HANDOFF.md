# 交接快照（kidney-health 網站）

新 session 打「接續」時讀這一節。只寫事實與已做的決定；未驗證的標「未驗證」。不寫憑證。

## 現況快照（2026-11-16 傍晚）

- 發布 checkout：`worktrees/kidney-portal-cloudflare-entry`（main，已 push 到 a15d225；網站 v1.1.33，之後只改文件）。純靜態站，GitHub Pages；版本來源 `version.js`，`node scripts/check-version.mjs` 檢查；7 支 `*.test.mjs` 全過（新增 `gemini-proxy-chain.test.mjs` 14 項）。
- **今天吃甚麼？** v1.1.27–1.1.32 這兩天的改動：
  - 98 道常備食譜（Gemini 寫 40 道、Codex 審內容 19 項已修）；念／下載／分享固定一列，手機分享附食譜 PNG。
  - AI 食譜的「沒有放進這道菜的食材」會濾掉材料裡已有的（`R.filterNotUsed`）。
  - 搜尋：`R.matchFood` 找不到時去掉「冷凍／新鮮／有機…」再找，仍無則用字依序出現當候選（不自動選）；挑食材搜尋框直接列出「🔎 食藥署資料庫」卡片可勾選。打錯字、同音字仍找不到。
  - 煮菜動畫：掀蓋 → 每樣可用食材在左上方放大特寫、周圍一圈金光 → 往前拋物線落進鍋 → 蓋蓋（v1.1.33，時長不變）；不建議食材不下鍋；尊重減少動態。
  - AI 食譜等 >10 秒顯示「改用備用 AI，最久約 1 分鐘」。
- 審查留著沒做：兩組相近食譜（`rosemary-chicken-potato-w`／`potato-chicken-w`、`bokchoy-mushroom`／`shiitake-greens`）；`.recipe-actions` emoji 沒 aria-hidden；AI 曾把葡萄汆燙當配菜（提示沒管水果用法）。
- gemini-proxy Worker：**線上已部署 fa42912**（使用者 11-16 從 Dashboard 貼上，兩把 secret 已設）。順序：免費 `GEMINI_API_KEY`（2.5 → 3.5 → 3.1 flash-lite）→ 付費 `GEMINI_PAID_API_KEY`（AI Pro 每月 $10 抵用；新專案不能用 2.5，從 3.5 開始）→ Workers AI → Z.ai。實測兩次都是 `gemini:gemini-3.5-flash-lite`：免費 2.5 先失敗，使用者判斷是當日額度滿了。用 `?model=nope` 回白名單錯誤（不是 `Model not allowed`）可確認不是 Antigravity 舊版。Antigravity 在 `kidney-health/` 主目錄的未提交改動（每 IP 限流，用 Cache API 計數、各機房分開算）11-16 已備份成 `D:/Projects/Kidneyhealth/drafts/antigravity-gemini-proxy-ratelimit.patch` 後還原；以後以發布 worktree 為準。限流靠 Google 端：付費專案在 AI Studio 設 Monthly spend cap NT$300（Experimental，約 10 分鐘延遲可能小幅超支；11-16 截圖確認，已用 NT$0.09），`gemini-3.5-flash-lite` 與 `gemini-3.1-flash-lite` 都已手動設 RPM 15／RPD 1,000（使用者 11-16 設）；免費金鑰在 AI Studio 顯示 Free。Worker 在 workers.dev，Cloudflare WAF 限流規則管不到，不用再提。
- Workers AI 11-15（UTC 日）額度用光的原因：Claude／Codex／Antigravity 當天都沒呼叫，剩真實網站流量（Gemini 429 才會落到它）或手動跑 Mixmodel `cf_image.py`；要看 Dashboard → AI → Workers AI 的分模型用量才能定案（flux 開頭＝生圖，gemma／llama＝這支 Worker）。
- 多代理協作：11-16 Antigravity 改了過期的 `kidney-health/` 主目錄、沒 commit 就部署，Claude 看不到。已在 Kidneyhealth repo 的 `AGENTS.md` 加「Multi-agent coordination」五條（只在本 worktree 改、commit 寫清楚、架構／金鑰／部署改動記一行在本檔、只部署已 commit 的程式、只 add 明確檔名），bdce6a7 已 push；使用者也直接把同樣內容貼給 Gemini。Antigravity 會不會自動讀 `AGENTS.md` 未驗證。
- 真手機上的分享、下載、朗讀、相機、新動畫、挑食材資料庫列**都未驗證**。

## 已做的決定

- 原則不花錢：不儲值 OpenRouter；額度全用完時畫面顯示「目前額度用完，請等待重置」。11-16 使用者改用 Google AI Pro 每月 $10 Gemini API 抵用額度，排在免費 key 之後、Workers AI 之前（會計費專案；已設 AI Studio 每月 NT$300 支出上限，到了停用）。
- 不做「多個 Google 帳號的 API key 輪流打」（違反 Google APIs 條款 §2(d)，額度依專案計算）。同一把 key 換不同模型是合規的。
- 不爬 Google Lens／Gemini 網頁版（沒有 API、條款禁止自動存取）。
- 使用者打「C&P」＝ commit＋push；共用工作區，只 add 明確檔名。
- 實質程式或衛教內容在請使用者 C&P 前，先背景交 Codex 唯讀審查（2026-11-13 起）。
- 豆腐 ⬜、豆干 🟫、雞胸 🐔、冬瓜 🥒（使用者指定）。食譜要多用 Gemini 擴充，不要主線自己想（11-14）。

## 待辦

1. 使用者用真手機跑一次相機、分享、下載、朗讀。
2. 迷宮飯聯名：已給建議（授權門檻高；先累積 GA4 數據、一頁企劃、致敬食譜樣稿不上線）；使用者還沒決定要不要查授權窗口或擬企劃。
3. 11-17 額度重置後再測一次：`X-Provider-Used` 應是 `gemini`（免費 2.5）。仍失敗就把 2.5 從免費清單拿掉；常常一早就滿則代表流量大，留意付費額度用量。
4. 看 Dashboard 的 Workers AI 分模型用量，定案 11-15 是誰用光（全專案只有這支 Worker 與 Mixmodel `cf_image.py` 會呼叫）。
