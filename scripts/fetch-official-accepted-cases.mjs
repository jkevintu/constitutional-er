#!/usr/bin/env node
/**
 * 憲法急診室 — 官方「公開書狀之案件（已受理）」抓取腳本
 *
 * 用途：從司法院憲法法庭公開頁面（第 1～5 頁）抓取目前顯示的已受理案件，
 *       正規化為 Google Sheet 既有欄位契約的列，並輸出確定性 JSON 到 stdout。
 *
 * 安全與邊界（重要）：
 * - 本腳本**只讀取公開網頁**。它不寫 Google Sheet、不呼叫 Apps Script、
 *   不寫入本 repo 任何檔案、不部署。輸出一律走 stdout，由操作者自行導向檔案審閱。
 * - 本腳本**不做任何實體法律判斷**。所有輸出欄位都只是官方欄位的搬運與正規化：
 *   受理／併案狀態與程序類別僅描述程序位置，不代表違憲認定或勝敗結果。
 * - 「權益分類」只在官方案由**逐字出現**該憲法用語時才標註，屬於非官方的導覽標籤，
 *   供人工複核後再決定是否採用。「受影響身份」一律留給人工標註（見下方說明）。
 *
 * 用法：
 *   node scripts/fetch-official-accepted-cases.mjs > /tmp/accepted.json
 *   node scripts/fetch-official-accepted-cases.mjs --checked-at 2026-08-30T09:00:00Z
 *   node scripts/fetch-official-accepted-cases.mjs --expect 98   # 官方筆數變動時
 *
 * 需求：Node 18+（內建 fetch）。無任何第三方相依。
 */

/* ---------- 常數 ---------- */

const SOURCE_ORIGIN = 'https://cons.judicial.gov.tw';
const SOURCE_HOST = 'cons.judicial.gov.tw';
const LIST_URL = (page) => `${SOURCE_ORIGIN}/docdata.aspx?fid=52&type=1&page=${page}`;
const PAGES = [1, 2, 3, 4, 5];

/** 每次請求的逾時（毫秒）。 */
const TIMEOUT_MS = 15000;

/** 預期的總筆數；不符即失敗，避免以殘缺資料覆寫人工審閱流程。 */
const DEFAULT_EXPECTED_COUNT = 97;

/** Google Sheet 的欄位標題（順序即欄序，第 11 欄為新增的「最後更新」）。 */
const SHEET_HEADERS = [
  'id',
  '案件名稱',
  '權益分類',
  '受影響身份',
  '受理日期',
  '案件狀態',
  '法院',
  '摘要',
  '來源名稱',
  '來源網址',
  '最後更新'
];

/** 官方列表的欄位標題，用於驗證版面結構未變動。 */
const OFFICIAL_COLUMNS = ['項次', '受理日期', '聲請人', '案號', '主案／併案', '案由'];

/** 多值欄位在 Sheet 內的分隔符號（與 Apps Script 的 split 一致）。 */
const MULTI_VALUE_SEPARATOR = '｜';

/** 案件狀態內「受理狀態」與「程序類別」的分隔符號（全形分號）。 */
const STATUS_SEPARATOR = '；';

const COURT = '憲法法庭';
const SOURCE_LABEL = '憲法法庭公開書狀案件列表';

/** 官方案由未明示程序類別時使用的中性字串。 */
const FALLBACK_PROCEDURE = '公開書狀案件';

/** 權益分類無法由官方案由逐字判定時的佔位值。 */
const RIGHTS_PLACEHOLDER = '待人工分類';

/** 受影響身份一律由人工標註（本腳本不做任何身份推論）。 */
const IDENTITY_PLACEHOLDER = '待人工標註';

/** 摘要上限（以 Unicode 字元計）。 */
const SUMMARY_MAX_CHARS = 280;

/** 由官方案由開頭擷取標題失敗時，取用的中性前綴長度。 */
const TITLE_FALLBACK_CHARS = 40;

/** 標題擷取的最大長度；超過即視為擷取失敗，改用中性前綴。 */
const TITLE_MAX_CHARS = 60;

/**
 * 憲法訴訟法所定的程序類別用語。長字串必須排在前面，
 * 才不會讓「法規範憲法審查」先命中「法規範及裁判憲法審查」的子字串。
 */
const PROCEDURE_TERMS = [
  '法規範及裁判憲法審查',
  '裁判及法規範憲法審查',
  '統一解釋法律及命令',
  '總統副總統彈劾',
  '法規範憲法審查',
  '政黨違憲解散',
  '地方自治保障',
  '裁判憲法審查',
  '機關爭議'
];

/**
 * 權益分類的關鍵詞白名單：只有官方案由逐字出現該用語時才標註。
 * 這些是**非官方的導覽標籤**，僅為了讓前端可以分群瀏覽，
 * 不代表憲法法庭已就該權利做出任何認定，人工複核時可自由增刪。
 */
const RIGHTS_TERMS = [
  '人身自由',
  '平等權',
  '言論自由',
  '表現自由',
  '思想自由',
  '宗教自由',
  '集會自由',
  '結社自由',
  '秘密通訊自由',
  '居住自由',
  '遷徙自由',
  '財產權',
  '工作權',
  '生存權',
  '訴訟權',
  '參政權',
  '服公職權',
  '受教育權',
  '健康權',
  '生命權',
  '隱私權',
  '人格權',
  '正當法律程序',
  '罪刑相當',
  '比例原則',
  '法律明確性',
  '法律保留'
];

/* ---------- 參數解析 ---------- */

/** 標準 RFC3339 UTC：YYYY-MM-DDTHH:MM:SSZ（允許輸入帶毫秒，輸出一律去除）。 */
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;

/** 將 Date 轉為 `YYYY-MM-DDTHH:MM:SSZ`（不含毫秒）。 */
function toCanonicalUtc(date) {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/**
 * 驗證並正規化 `--checked-at`。必須是 RFC3339 UTC，且是真實存在的時間；
 * 例如 2026-02-30 會被 Date 靜默進位，這裡以回寫比對攔下。
 */
function parseCheckedAt(raw) {
  const match = RFC3339_UTC.exec(raw);
  if (!match) {
    throw new Error(
      `--checked-at 必須為 RFC3339 UTC（YYYY-MM-DDTHH:MM:SSZ），實得 ${JSON.stringify(raw)}`
    );
  }
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const stamp = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(stamp)) {
    throw new Error(`--checked-at 非有效時間 ${JSON.stringify(raw)}`);
  }
  const canonical = toCanonicalUtc(new Date(stamp));
  const normalized = `${raw.slice(0, 19)}Z`;
  if (canonical !== normalized) {
    throw new Error(`--checked-at 非有效時間（日期不存在）${JSON.stringify(raw)}`);
  }
  return canonical;
}

function parseArgs(argv) {
  const options = { checkedAt: null, expected: DEFAULT_EXPECTED_COUNT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--checked-at') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error('--checked-at 缺少值');
      options.checkedAt = parseCheckedAt(value);
      i += 1;
    } else if (arg === '--expect') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`--expect 必須為正整數，實得 ${JSON.stringify(argv[i + 1])}`);
      }
      options.expected = value;
      i += 1;
    } else {
      throw new Error(`未知參數 ${JSON.stringify(arg)}`);
    }
  }
  if (!options.checkedAt) options.checkedAt = toCanonicalUtc(new Date());
  return options;
}

/* ---------- 取得頁面 ---------- */

/** 以 AbortController 逾時取回單一頁面的 HTML。 */
async function fetchPage(page) {
  const url = LIST_URL(page);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'text/html' }
    });
    if (!response.ok) {
      throw new Error(`第 ${page} 頁回應 HTTP ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    if (!html.includes('applyruling')) {
      throw new Error(`第 ${page} 頁未包含預期的列表標記 applyruling，版面可能已變更`);
    }
    return html;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`第 ${page} 頁於 ${TIMEOUT_MS / 1000} 秒內未回應，已中止`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- HTML 文字處理 ---------- */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

function decodeEntities(input) {
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      // 只還原可安全表示的字元，其餘保留原樣，不猜測。
      if (!Number.isInteger(code) || code < 0x20 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/**
 * 將 HTML 片段轉為純文字：去標籤 → 還原實體 → 去控制字元 → NFC → 壓縮空白。
 * 注意順序：先去標籤再還原實體，`&lt;script&gt;` 才不會被還原成可解析的標記。
 */
function htmlToText(fragment) {
  return decodeEntities(String(fragment).replace(/<[^>]*>/g, ' '))
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- 解析官方列表 ---------- */

const ROW_RE = /<ul\b[^>]*class=["'][^"']*\btcont\b[^"']*\bapplyruling\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/g;
const CELL_RE = /<li\b[^>]*>([\s\S]*?)<\/li>/g;
const LABEL_RE = /<span\b[^>]*>([\s\S]*?)<\/span>/;
const CONT_RE = /<div\b[^>]*class=["'][^"']*\bcont\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/;
const ANCHOR_RE = /<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>/i;

/**
 * 解析單頁 HTML，回傳以官方欄位標題為鍵的原始列。
 * 以 `<span>` 標籤文字對應欄位（而非欄位位置），版面改欄序也不會錯位。
 */
function parsePage(html, page) {
  const rows = [];
  ROW_RE.lastIndex = 0;
  let rowMatch;
  while ((rowMatch = ROW_RE.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = {};
    CELL_RE.lastIndex = 0;
    let cellMatch;
    while ((cellMatch = CELL_RE.exec(rowHtml)) !== null) {
      const cellHtml = cellMatch[1];
      const label = LABEL_RE.exec(cellHtml);
      const cont = CONT_RE.exec(cellHtml);
      if (!label || !cont) continue;
      const name = htmlToText(label[1]);
      if (!name) continue;
      cells[name] = { html: cont[1], text: htmlToText(cont[1]) };
    }

    const missing = OFFICIAL_COLUMNS.filter((name) => !(name in cells));
    if (missing.length) {
      throw new Error(
        `第 ${page} 頁第 ${rows.length + 1} 列缺少官方欄位：${missing.join('、')}（版面可能已變更）`
      );
    }
    rows.push({ page, cells });
  }
  return rows;
}

/* ---------- 正規化 ---------- */

/**
 * 由案號產生穩定 id，例如
 * `114年度憲民字第1689號` → `114憲民1689`、`會台字第13747號` → `會台13747`。
 */
function makeId(caseNumber) {
  const match = /^(?:(\d+)年度)?(.+?)字第(\d+)號$/.exec(caseNumber);
  if (!match) {
    throw new Error(`案號格式無法解析：${JSON.stringify(caseNumber)}`);
  }
  const [, year, kind, serial] = match;
  return `${year ?? ''}${kind}${serial}`;
}

/** 以 Unicode 字元（非 UTF-16 code unit）截斷，避免切碎代理對或組合字。 */
function truncateChars(text, max) {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join('')}…`;
}

/**
 * 由官方案由開頭擷取中性顯示標題：取「為…事件／案件」的主旨片段。
 * 擷取不到（或過長）時退回官方案由的中性前綴，不自行改寫或詮釋文字。
 */
function makeTitle(reason) {
  // 少數案由以「一、」等條列序號開頭，先去除再比對主旨。
  const body = reason.replace(/^[一二三四五六七八九十百]+、\s*/, '');
  const match = /^為(.{1,40}?)((?:等)?(?:事件|案件))(?=[，,、])/.exec(body);
  if (match) {
    const title = `${match[1]}${match[2]}`;
    if (Array.from(title).length <= TITLE_MAX_CHARS) return title;
  }
  return truncateChars(body, TITLE_FALLBACK_CHARS);
}

/**
 * 由官方案由結尾取程序類別：只認官方明示的程序用語，
 * 且只在最後一個「聲請」之後的尾段比對，避免命中案由前段的引述文字。
 * 沒有明示時回傳中性的 `公開書狀案件`，不做推論。
 */
function makeProcedure(reason) {
  const anchor = reason.lastIndexOf('聲請');
  const tail = anchor === -1 ? reason : reason.slice(anchor);
  for (const term of PROCEDURE_TERMS) {
    if (tail.includes(term)) return term;
  }
  return FALLBACK_PROCEDURE;
}

/**
 * 受理狀態：官方明載主案／併案時才加註，其餘一律只寫「已受理」。
 * 併上全形分號與程序類別，與既有 Sheet／前端的切分契約一致。
 */
function makeStatus(role, procedure) {
  let accepted = '已受理';
  if (role === '主案') accepted = '已受理（主案）';
  else if (role === '併案') accepted = '已受理（併案）';
  return `${accepted}${STATUS_SEPARATOR}${procedure}`;
}

/** 權益分類：官方案由逐字出現才標註；一項都沒有時給人工分類佔位值。 */
function makeRights(reason) {
  const hits = RIGHTS_TERMS.filter((term) => reason.includes(term));
  return hits.length ? hits : [RIGHTS_PLACEHOLDER];
}

/** 由官方案號欄的連結取出詳情頁網址，並限制為官方網域的 https 連結。 */
function makeDetailUrl(cellHtml, caseNumber) {
  const anchor = ANCHOR_RE.exec(cellHtml);
  if (!anchor) {
    throw new Error(`案號 ${caseNumber} 缺少詳情頁連結`);
  }
  const href = decodeEntities(anchor[1]).trim();
  let url;
  try {
    url = new URL(href, `${SOURCE_ORIGIN}/`);
  } catch {
    throw new Error(`案號 ${caseNumber} 的連結非合法網址：${JSON.stringify(href)}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`案號 ${caseNumber} 的連結協定必須為 https，實得 ${url.protocol}`);
  }
  if (url.hostname !== SOURCE_HOST) {
    throw new Error(`案號 ${caseNumber} 的連結網域非 ${SOURCE_HOST}：${url.hostname}`);
  }
  return url.toString();
}

/** 受理日期必須是真實存在的 YYYY-MM-DD，前端才能正確計算等待天數。 */
function checkFiledAt(value, caseNumber) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`案號 ${caseNumber} 的受理日期非 YYYY-MM-DD：${JSON.stringify(value)}`);
  }
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`案號 ${caseNumber} 的受理日期不存在：${JSON.stringify(value)}`);
  }
  return value;
}

/** 將一列官方資料轉為 Sheet 欄位契約的列。 */
function normalizeRow(row, checkedAt) {
  const { cells, page } = row;
  const caseNumber = cells['案號'].text;
  if (!caseNumber) throw new Error(`第 ${page} 頁有一列缺少案號`);

  const reason = cells['案由'].text;
  if (!reason) throw new Error(`案號 ${caseNumber} 缺少案由`);

  const role = cells['主案／併案'].text;
  if (role && role !== '主案' && role !== '併案') {
    throw new Error(`案號 ${caseNumber} 的主案／併案值非預期：${JSON.stringify(role)}`);
  }

  const procedure = makeProcedure(reason);

  return {
    id: makeId(caseNumber),
    案件名稱: makeTitle(reason),
    權益分類: makeRights(reason).join(MULTI_VALUE_SEPARATOR),
    受影響身份: IDENTITY_PLACEHOLDER,
    受理日期: checkFiledAt(cells['受理日期'].text, caseNumber),
    案件狀態: makeStatus(role, procedure),
    法院: COURT,
    摘要: truncateChars(reason, SUMMARY_MAX_CHARS),
    來源名稱: SOURCE_LABEL,
    來源網址: makeDetailUrl(cells['案號'].html, caseNumber),
    最後更新: checkedAt,
    // 以下為審閱用的官方原文，不屬於 Sheet 欄位（見 rows/reviewNotes 的分離）。
    _official: {
      caseNumber,
      page,
      itemNumber: cells['項次'].text,
      applicant: cells['聲請人'].text,
      role,
      reason,
      procedure
    }
  };
}

/**
 * 只合併「案號相同且正規化後每一欄都完全相同」的重複列；
 * 案號相同但內容有差異時一律失敗，交由人工判斷，絕不自動挑一筆。
 */
function dedupe(rows) {
  const byCaseNumber = new Map();
  const output = [];
  let duplicates = 0;

  for (const row of rows) {
    const key = row._official.caseNumber;
    const existing = byCaseNumber.get(key);
    if (!existing) {
      byCaseNumber.set(key, row);
      output.push(row);
      continue;
    }
    const a = JSON.stringify(SHEET_HEADERS.map((h) => existing[h]));
    const b = JSON.stringify(SHEET_HEADERS.map((h) => row[h]));
    if (a !== b) {
      throw new Error(
        `案號 ${key} 重複出現且內容不一致，拒絕自動取捨：\n  A（第 ${existing._official.page} 頁）${a}\n  B（第 ${row._official.page} 頁）${b}`
      );
    }
    duplicates += 1;
  }

  return { rows: output, duplicates };
}

/* ---------- 主流程 ---------- */

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const pages = [];
  for (const page of PAGES) {
    // 逐頁循序抓取，對公開站台維持單一連線，不併發加壓。
    pages.push({ page, html: await fetchPage(page) });
  }

  const rawRows = pages.flatMap(({ page, html }) => parsePage(html, page));
  if (rawRows.length === 0) {
    throw new Error('未解析到任何案件列，拒絕輸出空資料');
  }

  const normalized = rawRows.map((row) => normalizeRow(row, options.checkedAt));
  const { rows, duplicates } = dedupe(normalized);

  if (rows.length !== options.expected) {
    throw new Error(
      `解析結果為 ${rows.length} 筆（原始 ${rawRows.length} 筆、合併重複 ${duplicates} 筆），` +
        `與預期的 ${options.expected} 筆不符。請人工確認官方頁面筆數後，以 --expect 指定新的筆數。`
    );
  }

  const payload = {
    schemaVersion: 1,
    generator: 'scripts/fetch-official-accepted-cases.mjs',
    checkedAt: options.checkedAt,
    source: {
      label: SOURCE_LABEL,
      listUrls: PAGES.map(LIST_URL)
    },
    counts: {
      parsed: rawRows.length,
      duplicatesMerged: duplicates,
      rows: rows.length
    },
    sheetHeaders: SHEET_HEADERS,
    notes: [
      '本檔為唯讀抓取結果，尚未寫入任何 Google Sheet。',
      '「權益分類」僅在官方案由逐字出現該用語時標註，屬非官方導覽標籤，須人工複核。',
      `「受影響身份」一律為 ${IDENTITY_PLACEHOLDER}：官方列表未提供身份欄位，本腳本不做身份推論。`,
      '案件狀態的受理／程序資訊僅描述程序位置，不代表違憲認定或任何實體結果。'
    ],
    // rows 為可直接貼入 Sheet 的欄位；official 為對照用的官方原文。
    rows: rows.map((row) => {
      const sheetRow = {};
      for (const header of SHEET_HEADERS) sheetRow[header] = row[header];
      return sheetRow;
    }),
    official: rows.map((row) => ({ id: row.id, ...row._official }))
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`\n抓取失敗，未產生任何輸出。\n${error.message}\n`);
  process.exitCode = 1;
});
