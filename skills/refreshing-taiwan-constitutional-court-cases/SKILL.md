---
name: refreshing-taiwan-constitutional-court-cases
description: Refresh the Constitutional ER accepted-case dataset from the Taiwan Constitutional Court public docket. Use when updating case rows, the Google Sheet, data/cases.js, or when the site's 資料最後查核 timestamp is stale. Covers the fetch → review → Sheet → snapshot → deploy pipeline and its stop conditions.
---

# 更新憲法法庭已受理案件資料

本專案的資料流是**單向**的，每一段都由人工明示觸發：

```
司法院憲法法庭公開頁面（唯讀抓取）
      ↓  scripts/fetch-official-accepted-cases.mjs（只輸出 stdout）
待審閱 JSON
      ↓  人工複核後貼上（需授權，且僅此步驟會寫入）
Google Sheet
      ↓  apps-script/Code.gs（唯讀端點，doGet，不寫任何資料）
      ↓  scripts/refresh-cases.mjs（驗證後原子性覆寫）
data/cases.js 靜態快照
      ↓  git commit
      ↓  操作者手動執行 Vercel 部署
線上網站
```

**邊界規則**：抓取腳本永遠不寫 Sheet、不部署；Apps Script 永遠只讀；`refresh-cases.mjs`
只寫 `data/cases.js`；部署一律是獨立、明示的人工指令。瀏覽器端零網路請求。

## 措辭紀律（最重要）

資料只描述**程序位置**，不描述實體結果。

- ✅ 「已受理」「已受理（主案）」「已受理（併案）」「法規範憲法審查」
- ❌ 「違憲」「勝訴」「法院認同聲請人」「可望翻案」「重大突破」

受理僅代表案件通過程序門檻進入審理，**不代表**憲法法庭對爭點已有任何判斷。
任何摘要、標題、commit message、PR 描述都不得把受理寫成實體結論。

`權益分類` 的關鍵詞標籤是**非官方導覽標籤**，只在官方案由逐字出現該用語時才標註，
用途是讓前端可以分群瀏覽，不代表法院已認定該權利受侵害。

## Sheet 欄位（11 欄，順序與字面必須完全一致）

```
id | 案件名稱 | 權益分類 | 受影響身份 | 受理日期 | 案件狀態 | 法院 | 摘要 | 來源名稱 | 來源網址 | 最後更新
```

- `權益分類` / `受影響身份`：多值以全形直線 `｜` 分隔。
- `受理日期`：`YYYY-MM-DD`。
- `案件狀態`：`已受理` + 全形分號 `；` + 程序類別，例如 `已受理（主案）；法規範憲法審查`。
- `最後更新`：**純文字**格式的 RFC3339 UTC（`YYYY-MM-DDTHH:MM:SSZ`）。
  儲存格務必設為「純文字」，否則 Sheet 會自動轉成日期物件，`getDisplayValues()`
  會回傳本地化字串而導致端點整體拋錯。

未知值使用 `待人工分類`（權益）與 `待人工標註`（身份），不要留空、不要臆測。

## 抓取最新來源

官方列表分頁在 `https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1` 到 `page=5`。

```bash
node scripts/fetch-official-accepted-cases.mjs \
  --checked-at 2026-08-30T09:00:00Z \
  > /tmp/constitutional-er-accepted.json
```

- 省略 `--checked-at` 時使用當下的 UTC 時間。
- 腳本預設要求**恰好 97 筆**（2026-08-30 的官方顯示筆數）。官方筆數變動時，
  先人工確認官方頁面實際筆數，再以 `--expect <n>` 指定，並在 commit 說明變動。
- 頁數若不再是 5 頁，需修改腳本的 `PAGES` 常數，不要私下改用其他來源。

## 必要驗證與停止條件

抓取階段（任何一項不符即中止，且不會產生輸出）：

- 每頁請求逾時 15 秒。
- 每頁必須含 `applyruling` 列表標記；每列必須齊備 6 個官方欄位
  （項次／受理日期／聲請人／案號／主案／併案／案由）。
- 案號重複時，**只有正規化後每一欄完全相同**才合併；有任何差異即失敗，交人工判斷。
- 每筆詳情頁連結必須是 `https` 且網域為 `cons.judicial.gov.tw`。
- 受理日期必須是真實存在的 `YYYY-MM-DD`。
- 總筆數必須等於預期值。

快照階段（`node scripts/refresh-cases.mjs`，任何一項不符即中止，**既有快照不被覆蓋**）：

- 端點 `schemaVersion` 必須為 `2`。
- `sourceUpdatedAt` 必須是標準 RFC3339 UTC，且**恰好等於**所有列 `lastUpdatedAt` 的最大值。
- `updatedAt` 若存在，必須與 `sourceUpdatedAt` 完全相同（向後相容別名）。
- 每一列必須有合法的 `lastUpdatedAt`；`id` 不可重複；`sourceUrl` 必須為 `https`。
- `cases` 為空陣列一律拒收。

停止並回報人類的情況：官方頁面版面改變、筆數與預期不符、案號重複且內容不一致、
端點回傳非 JSON（Apps Script 拋錯會回 HTML 錯誤頁）。這些都**不要**自行放寬條件繞過。

## 人工更新 vs. 代理人更新

**人工**：複核 `/tmp/constitutional-er-accepted.json`，逐列比對官方案由；可把 `待人工分類` /
`待人工標註` 換成經人判斷的標籤。

**代理人（agent）**：可以執行抓取、產生 diff、跑 `refresh-cases.mjs`、備妥 commit。擁有
Sheet 寫入授權且獲得本次明示授權時，也可以以 `id` 為鍵更新或重建 Sheet；必須先輸出
筆數、added／removed IDs 與欄位 diff，並將同批異動列的 `最後更新` 設為同一個查核時間戳。
未取得該次寫入授權時，只能產生審閱 JSON。代理人不得自行編造分類或身份標籤，也不得在
未授權時部署。

## 憑證

本 repo **不含任何憑證**，也不需要憑證。抓取的是公開網頁；Apps Script 端點是公開唯讀 URL；
Sheet 的寫入權限與 Vercel 的部署權限都掛在操作者自己的帳號上。
不要在本 repo 內新增 token、API key、service account 或 `.env`。
