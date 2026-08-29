const SPREADSHEET_ID = '1deZt-vHQrfIi9ntw9tRrkqZHsUL4Ry_4BoXhVjP_GRc';
const SHEET_NAME = 'Sheet1';

function doGet() {
  const values = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_NAME)
    .getDataRange()
    .getDisplayValues();
  const [headers, ...rows] = values;
  const keyMap = {
    'id': 'id', '案件名稱': 'title', '權益分類': 'rights', '受影響身份': 'identities',
    '受理日期': 'filedAt', '案件狀態': 'status', '法院': 'court', '摘要': 'summary',
    '來源名稱': 'sourceLabel', '來源網址': 'sourceUrl'
  };
  const cases = rows.filter(row => row[0]).map(row => {
    const record = {};
    headers.forEach((header, index) => {
      const key = keyMap[header];
      if (!key) return;
      const value = row[index] || '';
      record[key] = key === 'rights' || key === 'identities'
        ? value.split('｜').map(item => item.trim()).filter(Boolean)
        : value;
    });
    return record;
  });
  return ContentService
    .createTextOutput(JSON.stringify({ updatedAt: new Date().toISOString(), cases }))
    .setMimeType(ContentService.MimeType.JSON);
}
