# 快照更新流程（手動）

本站是純靜態站，瀏覽器端**不發任何網路請求**：前端唯一資料來源是
`data/cases.js`（`window.CASES`）。要更新線上資料，操作者需手動跑下列三步。

## 1. 產生新快照

```
node scripts/refresh-cases.mjs
```

從 Apps Script 端點取得 `{updatedAt, cases}`，驗證與正規化後覆寫 `data/cases.js`。

- 逾時 15 秒（AbortController）。
- 回應非物件／`cases` 非陣列／`cases` 為空，一律拒絕。
- 逐筆驗證必填欄位（`filedAt` 需為有效 `YYYY-MM-DD`、`sourceUrl` 需為 `https`、`id` 不可重複）。
- 官方狀態文字以**第一個**全形分號「；」切分：分號前為 `status`，分號後為 `review`（無分號時 `review` 為空字串）。
- **任何一項失敗都不會覆蓋既有快照**，並以 exit code 1 結束。

成功時會印出案件筆數與 `updatedAt`。跑完可用 `node --check data/cases.js` 確認語法。

## 2. 檢查並提交

先 `git diff data/cases.js` 確認變更合理（筆數、`status`／`review` 切分、日期），再：

```
git add data/cases.js && git commit -m "chore: refresh case snapshot"
```

## 3. 部署

```
npx --yes vercel --yes --force --scope kevin-tus-projects
```

> 部署一律由操作者手動執行，腳本本身不會自動部署。
