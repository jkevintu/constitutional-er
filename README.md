# 憲法急診室

一個以「等待中的權利」為核心的靜態視覺化 POC。網站將憲法法庭公開書狀案件的受理日期、權益分類與受影響身份，呈現在可搜尋、可篩選的案件清單與權利星圖中。

## 線上預覽

<https://constitutional-er.vercel.app>

## 資料與更新方式

前端只讀取 `data/cases.js` 的靜態 snapshot，因此不在使用者瀏覽器呼叫外部資料 API。

資料流是單向的，每一段都由操作者明示觸發：

```
官方公開頁面 →（唯讀抓取）→ 待審閱 JSON →（人工複核後貼上）→ Google Sheet
             →（唯讀 Apps Script）→ data/cases.js →（手動部署）→ 線上網站
```

### 更新目前的資料

```bash
# 1. 從官方公開列表抓取，輸出待審閱 JSON（只寫 stdout）
node scripts/fetch-official-accepted-cases.mjs \
  --checked-at 2026-08-30T09:00:00Z \
  > /tmp/constitutional-er-accepted.json

# 2. 檢查筆數，並與上一次的審閱檔比對差異
node -e "const p=require('/tmp/constitutional-er-accepted.json');console.log(p.counts)"
diff <(jq -S '.rows' /tmp/constitutional-er-accepted.prev.json) \
     <(jq -S '.rows' /tmp/constitutional-er-accepted.json)

# 3. 人工複核後，經授權才把 rows 寫入 Google Sheet（本 repo 無任何腳本會做這件事）

# 4. 從唯讀 Apps Script 端點重建靜態快照
node scripts/refresh-cases.mjs

# 5. 確認 diff 後提交
git add data/cases.js && git commit -m "chore: refresh case snapshot"

# 6. 由操作者手動部署
npx --yes vercel --yes --force --scope kevin-tus-projects
```

> `scripts/fetch-official-accepted-cases.mjs` **只讀取公開網頁**：它不寫 Google Sheet、
> 不寫入本 repo 任何檔案、也不部署。寫入 Sheet 與部署一律是獨立、需授權的人工步驟。

`scripts/refresh-cases.mjs` 從唯讀 Apps Script 端點取得 v2 封包，驗證每一列的
`lastUpdatedAt`（RFC3339 UTC）與 `sourceUpdatedAt`（須等於各列時間戳最大值）後，
才原子性覆寫 snapshot；任何驗證失敗都不會覆蓋既有資料。

完整的欄位契約、驗證規則與停止條件見
[`skills/refreshing-taiwan-constitutional-court-cases/SKILL.md`](skills/refreshing-taiwan-constitutional-court-cases/SKILL.md)。

## 資料聲明

資料來源為司法院憲法法庭公開書狀案件列表。受理／程序資訊不代表實體判斷、違憲認定或任何案件勝敗結果；本專案不構成法律意見。

## 授權

POC；公開資料來源與使用條件請以原始資料提供者公告為準。
