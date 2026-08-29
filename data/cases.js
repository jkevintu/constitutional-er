/**
 * 憲法急診室 — 案件快照（自動產生，請勿手動編輯）
 *
 * 由 `node scripts/refresh-cases.mjs` 從 Apps Script 端點產生。
 * - `status` / `review` 由官方狀態文字以全形分號「；」切分而得，
 *   僅描述程序位置，不描述實體結果。
 * - `filedAt` 為官方所載之「受理日期」。
 * - 本檔為前端唯一資料來源，瀏覽器端不發出任何網路請求。
 */
window.CASES = Object.freeze([
  {
    id: "114憲民1689",
    title: "民法損害賠償時效案",
    rights: ["財產權", "請求權／司法救濟"],
    identities: ["民事求償人", "侵權被害人"],
    filedAt: "2026-04-08",
    status: "已受理（主案）",
    review: "裁判及法規範憲法審查",
    court: "憲法法庭",
    summary: "民法損害賠償時效相關憲法審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1"
  },
  {
    id: "113憲民324",
    title: "告訴人閱覽偵查卷證救濟案",
    rights: ["訴訟權", "有效司法救濟", "資訊近用"],
    identities: ["犯罪被害人", "告訴人", "告訴代理律師"],
    filedAt: "2024-07-17",
    status: "已受理",
    review: "法規範及裁判憲法審查",
    court: "憲法法庭",
    summary: "告訴人閱覽偵查卷證救濟相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1"
  },
  {
    id: "112憲民1071",
    title: "犯罪所得沒收上訴限制案",
    rights: ["訴訟權", "財產權", "刑事程序保障"],
    identities: ["刑事被告", "遭沒收犯罪所得者"],
    filedAt: "2024-06-26",
    status: "已受理",
    review: "法規範及裁判憲法審查",
    court: "憲法法庭",
    summary: "犯罪所得沒收上訴限制相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1"
  },
  {
    id: "112憲審10",
    title: "未成年子女收養資格案",
    rights: ["平等權", "家庭權", "兒少權益"],
    identities: ["未成年子女", "收養聲請人", "家庭"],
    filedAt: "2024-06-05",
    status: "已受理",
    review: "法院聲請法規範憲法審查",
    court: "憲法法庭",
    summary: "未成年子女收養資格相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1"
  },
  {
    id: "112憲審6",
    title: "槍砲罪法定刑與不自證己罪案",
    rights: ["人身自由", "罪刑相當", "不自證己罪", "正當法律程序"],
    identities: ["刑事被告", "槍砲案件被告"],
    filedAt: "2024-04-17",
    status: "已受理",
    review: "法院聲請法規範憲法審查",
    court: "憲法法庭",
    summary: "槍砲罪法定刑與不自證己罪相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1"
  },
  {
    id: "112憲審21",
    title: "移民法廣告限制與言論自由案",
    rights: ["言論自由", "比例原則", "營業自由"],
    identities: ["移民顧問業者", "受入出國及移民法規範者"],
    filedAt: "2024-03-28",
    status: "已受理（主案）",
    review: "法院聲請法規範憲法審查",
    court: "憲法法庭",
    summary: "移民法廣告限制與言論自由相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1"
  },
  {
    id: "112憲審19",
    title: "跟蹤騷擾書面告誡案",
    rights: ["一般行為自由", "個人資料自主決定權", "訴訟權"],
    identities: ["受書面告誡者", "跟蹤騷擾案件當事人"],
    filedAt: "2024-03-21",
    status: "已受理（主案）",
    review: "法院聲請法規範憲法審查",
    court: "憲法法庭",
    summary: "跟蹤騷擾書面告誡相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1"
  },
  {
    id: "112憲民245",
    title: "貪污治罪刑事審判案",
    rights: ["人身自由", "財產權", "刑事正當程序"],
    identities: ["刑事被告", "貪污案件被告"],
    filedAt: "2024-02-21",
    status: "已受理",
    review: "法規範及裁判憲法審查",
    court: "憲法法庭",
    summary: "貪污治罪刑事審判相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1"
  },
  {
    id: "112憲民489",
    title: "勞基法延長工時案",
    rights: ["工作權", "勞動權益", "營業自由", "平等權"],
    identities: ["勞工", "雇主", "輪班與加班工作者"],
    filedAt: "2023-11-29",
    status: "已受理（主案）",
    review: "法規範及裁判憲法審查",
    court: "憲法法庭",
    summary: "勞基法延長工時相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=1"
  },
  {
    id: "112憲民886",
    title: "假釋門檻與受刑人平等案",
    rights: ["人身自由", "平等權", "比例原則"],
    identities: ["受刑人", "假釋申請人", "累犯"],
    filedAt: "2023-11-08",
    status: "已受理（主案）",
    review: "法規範及裁判憲法審查",
    court: "憲法法庭",
    summary: "假釋門檻與受刑人平等相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=2"
  },
  {
    id: "112憲民828",
    title: "槍砲案件裁判憲法審查案",
    rights: ["人身自由", "訴訟權", "刑事正當程序"],
    identities: ["刑事被告", "槍砲案件被告"],
    filedAt: "2023-10-25",
    status: "已受理",
    review: "裁判憲法審查",
    court: "憲法法庭",
    summary: "槍砲案件裁判憲法審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=3"
  },
  {
    id: "111憲民3704",
    title: "未成年子女權利義務酌定案",
    rights: ["家庭權", "親權", "未成年子女權益", "訴訟權"],
    identities: ["未成年子女", "父母", "家庭事件當事人"],
    filedAt: "2023-09-28",
    status: "已受理",
    review: "裁判憲法審查",
    court: "憲法法庭",
    summary: "未成年子女權利義務酌定相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=3"
  },
  {
    id: "會台13747",
    title: "偽造有價證券平等與訴訟權案",
    rights: ["平等權", "訴訟權", "刑事正當程序"],
    identities: ["刑事被告"],
    filedAt: "2023-07-26",
    status: "已受理",
    review: "聲請解釋案",
    court: "憲法法庭",
    summary: "偽造有價證券平等與訴訟權相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=3"
  },
  {
    id: "109憲二508",
    title: "監獄受刑人工作與財產權案",
    rights: ["工作權", "財產權", "勞動權益", "法律明確性", "比例原則"],
    identities: ["受刑人", "監獄勞作者"],
    filedAt: "2023-03-22",
    status: "已受理（主案）",
    review: "聲請解釋案",
    court: "憲法法庭",
    summary: "監獄受刑人工作與財產權相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=3"
  },
  {
    id: "111憲民4196",
    title: "選舉罷免宣傳限制案",
    rights: ["言論自由", "政治參與", "選舉權相關保障"],
    identities: ["候選人", "選民", "競選宣傳者"],
    filedAt: "2023-02-15",
    status: "已受理（主案）",
    review: "法規範及裁判憲法審查",
    court: "憲法法庭",
    summary: "選舉罷免宣傳限制相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=3"
  },
  {
    id: "會台10106",
    title: "妨害秩序與言論自由案",
    rights: ["言論自由", "表意自由", "刑事正當程序"],
    identities: ["刑事被告", "抗議與公共表意者"],
    filedAt: "2022-02-23",
    status: "已受理（主案）",
    review: "聲請解釋案",
    court: "憲法法庭",
    summary: "妨害秩序與言論自由相關審查。",
    sourceLabel: "憲法法庭公開書狀案件列表",
    sourceUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=52&type=1&page=3"
  }
]);
window.CASES_UPDATED_AT = "2026-08-29T20:17:16.509Z";
