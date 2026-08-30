/**
 * 憲法急診室 — 唯讀資料端點（schemaVersion 2）
 *
 * 只讀 Google Sheet，回傳 {schemaVersion, sourceUpdatedAt, updatedAt, cases}。
 * 本端點不寫入任何資料、不對外抓取，也不部署任何東西。
 *
 * `最後更新`（第 11 欄）是每一列的資料查核時間，必須是標準 RFC3339 UTC
 * （YYYY-MM-DDTHH:MM:SSZ）的**純文字**儲存格。任何一列格式不合就整體拋錯，
 * 絕不悄悄送出格式錯誤的時間戳給下游快照腳本。
 */

const SPREADSHEET_ID = '1deZt-vHQrfIi9ntw9tRrkqZHsUL4Ry_4BoXhVjP_GRc';
const SHEET_NAME = 'Sheet1';
const SCHEMA_VERSION = 2;

/** Sheet 標題 → 輸出欄位名稱。`最後更新` 為 v2 新增的第 11 欄。 */
const KEY_MAP = {
  'id': 'id',
  '案件名稱': 'title',
  '權益分類': 'rights',
  '受影響身份': 'identities',
  '受理日期': 'filedAt',
  '案件狀態': 'status',
  '法院': 'court',
  '摘要': 'summary',
  '來源名稱': 'sourceLabel',
  '來源網址': 'sourceUrl',
  '最後更新': 'lastUpdatedAt'
};

/** 多值欄位在 Sheet 內以全形直線分隔。 */
const MULTI_VALUE_SEPARATOR = '｜';

const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

/**
 * 驗證 `最後更新` 為標準 RFC3339 UTC 且是真實存在的時間。
 * 回傳毫秒 epoch，供 sourceUpdatedAt 取最大值使用。
 */
function parseRowTimestamp(value, rowLabel) {
  if (typeof value !== 'string') {
    throw new Error(rowLabel + '：最後更新必須為文字，實得 ' + typeof value);
  }
  const text = value.trim();
  const match = RFC3339_UTC.exec(text);
  if (!match) {
    throw new Error(
      rowLabel + '：最後更新必須為 RFC3339 UTC（YYYY-MM-DDTHH:MM:SSZ），實得 "' + text + '"'
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const stamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(stamp);
  // Date.UTC 會把 2026-02-30 之類的日期靜默進位，這裡以回寫比對攔下。
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new Error(rowLabel + '：最後更新非有效時間 "' + text + '"');
  }
  return { text: text, stamp: stamp };
}

function doGet() {
  const values = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_NAME)
    .getDataRange()
    .getDisplayValues();
  const headers = values[0];
  const rows = values.slice(1);

  if (headers.indexOf('最後更新') === -1) {
    throw new Error('Sheet 缺少「最後更新」欄位，無法產生 schemaVersion 2 回應');
  }

  let maxStamp = null;
  let sourceUpdatedAt = null;

  const cases = rows.filter(function (row) { return row[0]; }).map(function (row, index) {
    const rowLabel = '第 ' + (index + 2) + ' 列';
    const record = {};
    headers.forEach(function (header, columnIndex) {
      const key = KEY_MAP[header];
      if (!key) return;
      const value = row[columnIndex] || '';
      record[key] = key === 'rights' || key === 'identities'
        ? value.split(MULTI_VALUE_SEPARATOR).map(function (item) { return item.trim(); }).filter(Boolean)
        : value;
    });

    // 時間戳格式錯誤一律中止整份回應，不輸出半份可疑資料。
    const parsed = parseRowTimestamp(record.lastUpdatedAt, rowLabel);
    record.lastUpdatedAt = parsed.text;
    if (maxStamp === null || parsed.stamp > maxStamp) {
      maxStamp = parsed.stamp;
      sourceUpdatedAt = parsed.text;
    }

    return record;
  });

  if (cases.length === 0) {
    throw new Error('Sheet 沒有任何資料列，拒絕回傳空資料');
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      sourceUpdatedAt: sourceUpdatedAt,
      // 向後相容別名：舊版消費端讀 updatedAt，值與 sourceUpdatedAt 完全相同。
      updatedAt: sourceUpdatedAt,
      cases: cases
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
