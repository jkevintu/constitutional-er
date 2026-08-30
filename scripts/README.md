# 快照更新流程（手動）

本站是純靜態站，瀏覽器端**不發任何網路請求**：前端唯一資料來源是
`data/cases.js`（`window.CASES`）。要更新線上資料，操作者需手動跑下列三步。

## 0.（可選）從官方公開頁面抓取待審閱資料

```
node scripts/fetch-official-accepted-cases.mjs --checked-at 2026-08-30T09:00:00Z > /tmp/accepted.json
```

只讀取公開網頁並把結果印到 stdout。**不寫 Google Sheet、不寫入 repo、不部署。**
輸出的 `rows` 依 Sheet 的 11 欄契約排列，供人工複核後貼入 Sheet。詳見
`skills/refreshing-taiwan-constitutional-court-cases/SKILL.md`。

## 1. 產生新快照

```
node scripts/refresh-cases.mjs
```

從 Apps Script 端點取得 v2 封包 `{schemaVersion, sourceUpdatedAt, updatedAt, cases}`，
驗證與正規化後覆寫 `data/cases.js`。

- 逾時 15 秒（AbortController）。
- `schemaVersion` 必須為 `2`；回應非物件／`cases` 非陣列／`cases` 為空，一律拒絕。
- `sourceUpdatedAt` 必須為 RFC3339 UTC（`YYYY-MM-DDTHH:MM:SSZ`），且**恰好等於**各列
  `lastUpdatedAt` 的最大值；`updatedAt` 若存在必須與它完全相同（向後相容別名）。
- 逐筆驗證必填欄位（`filedAt` 需為有效 `YYYY-MM-DD`、`sourceUrl` 需為 `https`、
  `lastUpdatedAt` 需為 RFC3339 UTC、`id` 不可重複）。
- 官方狀態文字以**第一個**全形分號「；」切分：分號前為 `status`，分號後為 `review`（無分號時 `review` 為空字串）。
- **任何一項失敗都不會覆蓋既有快照**，並以 exit code 1 結束。

成功時會印出案件筆數與 `sourceUpdatedAt`。輸出含 `window.CASES`、
`window.CASES_SOURCE_UPDATED_AT`，以及相容別名 `window.CASES_UPDATED_AT`。
跑完可用 `node --check data/cases.js` 確認語法。

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
