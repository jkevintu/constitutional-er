/**
 * 憲法急診室 — 制度層快照（人工查證，與案件快照各自獨立）
 *
 * 本檔只描述「大法官席次」這一層的狀態，與 window.CASES 無任何耦合，
 * 也不受畫面上任何篩選條件影響。
 * - `shortageStartedOn` 為席次未補齊狀態的起算日；`shortageEndedOn` 為 null 表示截至快照日仍未補齊。
 * - `asOfDate` 為本快照的計算基準日；天數一律由這兩個日期推導，
 *   不讀取瀏覽器當下時間，任何時候開啟畫面都得到同一個數字。
 * - `verifiedAt` 為人工比對官方頁面的時間（Asia/Taipei，UTC+8）。
 * - 本檔為前端唯一的席次資料來源，瀏覽器端不發出任何網路請求。
 */
window.INSTITUTION = Object.freeze({
  authorizedSeats: 15,
  sittingJustices: 8,
  shortageStartedOn: '2024-11-01',
  shortageEndedOn: null,
  asOfDate: '2026-09-10',
  verifiedAt: '2026-09-10T09:00:00+08:00',
  sources: Object.freeze([
    Object.freeze({
      label: '司法院憲法法庭：現任大法官名單',
      url: 'https://cons.judicial.gov.tw/docdata.aspx?fid=8'
    }),
    Object.freeze({
      label: '司法院憲法法庭：114年憲判字第1號',
      url: 'https://cons.judicial.gov.tw/docdata.aspx?brid=LQAqJRjF42Chw2jOOxEL2A&fid=38&id=355485'
    })
  ])
});
