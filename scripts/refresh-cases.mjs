#!/usr/bin/env node
/**
 * 憲法急診室 — 手動快照更新腳本
 *
 * 用途：向 Apps Script 端點取得 v2 封包 {schemaVersion, sourceUpdatedAt, updatedAt, cases}，
 *       驗證與正規化後，產生確定性（deterministic）的 data/cases.js 快照。
 *
 * 設計原則：
 * - 瀏覽器端維持零網路請求；此腳本是唯一的資料取得點，由操作者手動執行。
 * - 全部驗證通過才寫檔；任何失敗都不會覆蓋既有快照（先寫暫存檔再 rename）。
 * - 產出只含純資料字面值，所有值一律經 JSON 序列化，不產生可執行內容。
 * - 相同輸入必定產生位元組相同的輸出（欄位順序固定、不寫入本機時間）。
 *
 * 用法：node scripts/refresh-cases.mjs
 */

import { writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ENDPOINT =
  'https://script.google.com/macros/s/AKfycbxCB0Mrndbr9FCzS7XohSzKzMIf8plyBs3B9ZnySvDSUPliYC2kFMe64Fmd-SELaFnU/exec';

const TIMEOUT_MS = 15000;

/** 只接受的端點封包版本；v2 起每一列都必須帶 lastUpdatedAt。 */
const REQUIRED_SCHEMA_VERSION = 2;

/** 官方案件狀態以中文全形分號分隔「受理狀態」與「程序類別」。 */
const STATUS_SEPARATOR = '；';

/** 標準 RFC3339 UTC：YYYY-MM-DDTHH:MM:SSZ（不接受毫秒或位移時區）。 */
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

/** 產出的欄位順序固定，確保輸出具確定性。 */
const FIELD_ORDER = [
  'id',
  'title',
  'rights',
  'identities',
  'filedAt',
  'status',
  'review',
  'court',
  'summary',
  'sourceLabel',
  'sourceUrl',
  'lastUpdatedAt'
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = join(ROOT, 'data', 'cases.js');
const TEMP_PATH = `${OUTPUT_PATH}.tmp`;

/* ---------- 取得資料 ---------- */

/** 以 15 秒 AbortController 逾時取得端點 JSON。 */
async function fetchPayload() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`端點回應 HTTP ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`端點回應非合法 JSON（前 200 字元）：${text.slice(0, 200)}`);
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`端點於 ${TIMEOUT_MS / 1000} 秒內未回應，已中止`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 驗證與正規化 ---------- */

/** 去除首尾空白與 C0/C1 控制字元，並正規化 Unicode。 */
function clean(value) {
  return String(value)
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();
}

function requireText(record, field, errors, index) {
  const raw = record[field];
  if (typeof raw !== 'string') {
    errors.push(`第 ${index + 1} 筆：${field} 必須為字串，實得 ${typeof raw}`);
    return '';
  }
  const value = clean(raw);
  if (!value) {
    errors.push(`第 ${index + 1} 筆：${field} 不可為空`);
  }
  return value;
}

function requireStringArray(record, field, errors, index) {
  const raw = record[field];
  if (!Array.isArray(raw)) {
    errors.push(`第 ${index + 1} 筆：${field} 必須為陣列`);
    return [];
  }
  const values = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      errors.push(`第 ${index + 1} 筆：${field} 內含非字串項目`);
      continue;
    }
    const value = clean(item);
    // 去重但保留原始順序，維持輸出確定性。
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

/** 受理日期必須是實際存在的 YYYY-MM-DD，前端才能正確計算等待天數。 */
function requireIsoDate(record, field, errors, index) {
  const value = requireText(record, field, errors, index);
  if (!value) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    errors.push(`第 ${index + 1} 筆：${field} 必須為 YYYY-MM-DD，實得 ${JSON.stringify(value)}`);
    return value;
  }
  const [, y, m, d] = match;
  const stamp = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const date = new Date(stamp);
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    errors.push(`第 ${index + 1} 筆：${field} 非有效日期 ${JSON.stringify(value)}`);
  }
  return value;
}

/** 來源網址僅接受 https，與前端 safeHttpsUrl 的信任邊界一致。 */
function requireHttpsUrl(record, field, errors, index) {
  const value = requireText(record, field, errors, index);
  if (!value) return value;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    errors.push(`第 ${index + 1} 筆：${field} 非合法網址 ${JSON.stringify(value)}`);
    return value;
  }
  if (parsed.protocol !== 'https:') {
    errors.push(`第 ${index + 1} 筆：${field} 必須為 https，實得 ${parsed.protocol}`);
  }
  return value;
}

/**
 * 解析標準 RFC3339 UTC 時間戳，回傳毫秒 epoch；格式錯誤或日期不存在時回傳 null。
 * 不接受毫秒、位移時區或小寫 z，確保跨列比較與輸出都在同一種正規形式上。
 */
function parseRfc3339Utc(value) {
  if (typeof value !== 'string') return null;
  const match = RFC3339_UTC.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const stamp = Date.UTC(y, mo - 1, d, h, mi, s);
  const date = new Date(stamp);
  // Date.UTC 會把 2026-02-30 之類的日期靜默進位，這裡以回寫比對攔下。
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== mi ||
    date.getUTCSeconds() !== s
  ) {
    return null;
  }
  return stamp;
}

/** 每一列的 lastUpdatedAt 都必須是標準 RFC3339 UTC，否則整份拒收。 */
function requireRowTimestamp(record, field, errors, index) {
  const value = requireText(record, field, errors, index);
  if (!value) return { value, stamp: null };
  const stamp = parseRfc3339Utc(value);
  if (stamp === null) {
    errors.push(
      `第 ${index + 1} 筆：${field} 必須為 RFC3339 UTC（YYYY-MM-DDTHH:MM:SSZ），實得 ${JSON.stringify(value)}`
    );
  }
  return { value, stamp };
}

/**
 * 以第一個全形分號切開 API 的狀態文字：
 * 分號前為 status（受理狀態），分號後為 review（程序類別，無分號時為空字串）。
 */
function splitStatus(rawStatus) {
  const separatorIndex = rawStatus.indexOf(STATUS_SEPARATOR);
  if (separatorIndex === -1) {
    return { status: rawStatus, review: '' };
  }
  return {
    status: clean(rawStatus.slice(0, separatorIndex)),
    review: clean(rawStatus.slice(separatorIndex + STATUS_SEPARATOR.length))
  };
}

/** 驗證整份 payload，回傳正規化後的紀錄陣列；任何錯誤都會拋出。 */
function normalize(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('端點回應不是物件，預期 {schemaVersion, sourceUpdatedAt, updatedAt, cases}');
  }
  if (payload.schemaVersion !== REQUIRED_SCHEMA_VERSION) {
    throw new Error(
      `端點 schemaVersion 必須為 ${REQUIRED_SCHEMA_VERSION}，實得 ${JSON.stringify(payload.schemaVersion)}。` +
        '請先部署 apps-script/Code.gs 的 v2 版本。'
    );
  }
  if (!Array.isArray(payload.cases)) {
    throw new Error('端點回應的 cases 不是陣列');
  }
  if (payload.cases.length === 0) {
    throw new Error('端點回應的 cases 為空陣列，拒絕以空資料覆蓋既有快照');
  }

  const sourceUpdatedAt = typeof payload.sourceUpdatedAt === 'string'
    ? clean(payload.sourceUpdatedAt)
    : '';
  const sourceStamp = parseRfc3339Utc(sourceUpdatedAt);
  if (sourceStamp === null) {
    throw new Error(
      `端點的 sourceUpdatedAt 必須為 RFC3339 UTC（YYYY-MM-DDTHH:MM:SSZ），實得 ${JSON.stringify(payload.sourceUpdatedAt)}`
    );
  }
  // updatedAt 是 v1 的相容別名，若存在就必須與 sourceUpdatedAt 完全一致。
  if (payload.updatedAt !== undefined) {
    const alias = typeof payload.updatedAt === 'string' ? clean(payload.updatedAt) : '';
    if (alias !== sourceUpdatedAt) {
      throw new Error(
        `端點的 updatedAt 別名與 sourceUpdatedAt 不一致：${JSON.stringify(payload.updatedAt)} ≠ ${JSON.stringify(sourceUpdatedAt)}`
      );
    }
  }

  const errors = [];
  const seenIds = new Set();
  let maxRowStamp = null;
  const records = payload.cases.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(`第 ${index + 1} 筆：不是物件`);
      return null;
    }

    const id = requireText(raw, 'id', errors, index);
    if (id) {
      if (seenIds.has(id)) errors.push(`第 ${index + 1} 筆：id 重複 ${JSON.stringify(id)}`);
      else seenIds.add(id);
    }

    const rawStatus = requireText(raw, 'status', errors, index);
    const { status, review } = splitStatus(rawStatus);
    if (rawStatus && !status) {
      errors.push(`第 ${index + 1} 筆：status 於分號前為空`);
    }

    const lastUpdated = requireRowTimestamp(raw, 'lastUpdatedAt', errors, index);
    if (lastUpdated.stamp !== null && (maxRowStamp === null || lastUpdated.stamp > maxRowStamp)) {
      maxRowStamp = lastUpdated.stamp;
    }

    return {
      id,
      title: requireText(raw, 'title', errors, index),
      rights: requireStringArray(raw, 'rights', errors, index),
      identities: requireStringArray(raw, 'identities', errors, index),
      filedAt: requireIsoDate(raw, 'filedAt', errors, index),
      status,
      review,
      court: requireText(raw, 'court', errors, index),
      summary: requireText(raw, 'summary', errors, index),
      sourceLabel: requireText(raw, 'sourceLabel', errors, index),
      sourceUrl: requireHttpsUrl(raw, 'sourceUrl', errors, index),
      lastUpdatedAt: lastUpdated.value
    };
  });

  if (errors.length) {
    throw new Error(`資料驗證失敗，共 ${errors.length} 項：\n- ${errors.join('\n- ')}`);
  }

  // sourceUpdatedAt 必須恰好等於所有列時間戳的最大值，
  // 否則代表端點的彙總邏輯與列資料脫節，寧可拒收也不寫出誤導的查核時間。
  if (maxRowStamp === null) {
    throw new Error('沒有任何列提供有效的 lastUpdatedAt，拒絕產生快照');
  }
  if (sourceStamp !== maxRowStamp) {
    throw new Error(
      `sourceUpdatedAt（${sourceUpdatedAt}）不等於各列 lastUpdatedAt 的最大值` +
        `（${new Date(maxRowStamp).toISOString().slice(0, 19)}Z）`
    );
  }

  return { sourceUpdatedAt, records };
}

/* ---------- 產生快照 ---------- */

/**
 * 一律以 JSON.stringify 序列化字面值，另跳脫 U+2028/U+2029 與 `<`，
 * 確保輸出只有純資料，不會產生可執行內容。
 */
function literal(value) {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/</g, '\\u003C');
}

function renderRecord(record) {
  const lines = FIELD_ORDER.map((field) => {
    const value = record[field];
    const serialized = Array.isArray(value)
      ? `[${value.map(literal).join(', ')}]`
      : literal(value);
    return `    ${field}: ${serialized}`;
  });
  return `  {\n${lines.join(',\n')}\n  }`;
}

function renderSnapshot(sourceUpdatedAt, records) {
  return `/**
 * 憲法急診室 — 案件快照（自動產生，請勿手動編輯）
 *
 * 由 \`node scripts/refresh-cases.mjs\` 從 Apps Script 端點產生。
 * - \`status\` / \`review\` 由官方狀態文字以全形分號「；」切分而得，
 *   僅描述程序位置，不描述實體結果。
 * - \`filedAt\` 為官方所載之「受理日期」。
 * - \`lastUpdatedAt\` 為該筆資料的人工查核時間（RFC3339 UTC）。
 * - \`window.CASES_SOURCE_UPDATED_AT\` 為所有列查核時間的最大值。
 * - 本檔為前端唯一資料來源，瀏覽器端不發出任何網路請求。
 */
window.CASES = Object.freeze([
${records.map(renderRecord).join(',\n')}
]);
window.CASES_SOURCE_UPDATED_AT = ${literal(sourceUpdatedAt)};
// 向後相容別名，值與 CASES_SOURCE_UPDATED_AT 相同。
window.CASES_UPDATED_AT = window.CASES_SOURCE_UPDATED_AT;
`;
}

/* ---------- 主流程 ---------- */

async function main() {
  process.stdout.write(`取得端點資料中（逾時 ${TIMEOUT_MS / 1000} 秒）…\n`);
  const payload = await fetchPayload();
  const { sourceUpdatedAt, records } = normalize(payload);

  // 驗證全數通過後才落地：先寫暫存檔，再原子性 rename 覆蓋。
  const output = renderSnapshot(sourceUpdatedAt, records);
  try {
    await writeFile(TEMP_PATH, output, 'utf8');
    await rename(TEMP_PATH, OUTPUT_PATH);
  } catch (error) {
    await unlink(TEMP_PATH).catch(() => {});
    throw error;
  }

  process.stdout.write(
    `已更新 data/cases.js：${records.length} 筆案件，sourceUpdatedAt=${sourceUpdatedAt}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`\n更新失敗，既有快照未被覆蓋。\n${error.message}\n`);
  process.exitCode = 1;
});
