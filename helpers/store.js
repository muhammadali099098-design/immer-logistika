// Google Sheets as the datastore (service account). Pure JS (googleapis).
// Each tab = a table; row 1 = headers; data rows follow.
//
// IMPORTANT: Google Sheets API has a hard read quota (300 reads/min/user).
// A page view previously read almost every table -> quota blows up -> 500s.
// Fix: an in-memory cache so Google is only read occasionally (not per page
// load), plus no retry on quota/permission errors (retrying a 429 makes it worse).
const { google } = require("googleapis");

const TABLES = {
  users: ["id", "username", "password_hash", "name", "role", "company_id", "active", "created_at"],
  factories: ["id", "name", "location", "contact_name", "contact_phone", "notes", "created_at"],
  logistics: ["id", "name", "city", "contact_name", "contact_phone", "notes", "created_at"],
  models: ["id", "model", "category", "cbm_per_pc", "notes", "created_at"],
  load_trucks: ["id", "logistics_id", "factory_id", "truck_no", "invoice_no", "order_no", "date", "lines", "notes", "created_at"],
  shipments: ["id", "logistics_id", "date", "arrival_date", "pi_number", "doc_number", "extra_fee", "truck_no", "volume_m3", "cost_amount", "cost_currency", "lines", "notes", "created_at", "payment_status", "payment_file", "payment_date", "receipt_status", "receipt_file", "damage_file", "damaged", "damage_amount", "demurrage_days", "demurrage_rate"],
  tashkent_out: ["id", "logistics_id", "date", "truck_no", "lines", "notes", "created_at"],
  payments: ["id", "doc_number", "amount", "currency", "file_name", "date", "created_at"],
};

let sheets = null;
let sheetId = null;
let writeQueue = Promise.resolve();

// ---- in-memory cache (per table) ----
const CACHE_TTL = 12000; // 12s — Google is re-read this often, not per request
let cache = new Map();
function cacheGet(table) { const c = cache.get(table); if (c && Date.now() - c.ts < CACHE_TTL) return c.data; return undefined; }
function cacheSet(table, data) { cache.set(table, { ts: Date.now(), data }); }
function cacheClear() { cache.clear(); }
// Invalidate ONE table (not the whole cache) — far fewer Google reads after writes.
function cacheDrop(table) { cache.delete(table); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry transient errors (network/5xx) and quota (429) with backoff; 403 stays fatal.
function isRetryable(e) {
  const status = e && (e.status || e.code);
  if (status === 403 || status === 401) return false;
  return true;
}
async function retryCall(fn) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e;
      const status = e && (e.status || e.code);
      // Лимит Google сбрасывается раз в минуту — ждём подольше, без штурма.
      await sleep(status === 429 ? 2000 * (i + 1) : 250 * (i + 1));
    }
  }
  throw lastErr;
}

function getSheets() {
  if (sheets) return sheets;
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT not configured");
  }
  const auth = new google.auth.JWT(sa.client_email, null, sa.private_key, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);
  sheets = google.sheets({ version: "v4", auth });
  sheetId = process.env.GOOGLE_SHEET_ID;
  return sheets;
}

// Serialize writes to avoid concurrent-append races.
function write(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

async function ensureHeadings(tabName) {
  const s = getSheets();
  await retryCall(() => s.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tabName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [TABLES[tabName]] },
  }));
}

async function ensureTables() {
  const s = getSheets();
  const meta = await retryCall(() => s.spreadsheets.get({ spreadsheetId: sheetId }));
  const existing = new Set((meta.data.sheets || []).map((sh) => sh.properties.title));
  const add = [];
  for (const t of Object.keys(TABLES)) {
    if (!existing.has(t)) add.push({ addSheet: { properties: { title: t } } });
  }
  if (add.length) {
    await retryCall(() => s.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: add } }));
  }
  for (const t of Object.keys(TABLES)) {
    await ensureHeadings(t);
  }
  cacheClear();
}

const isBlank = (c) => c === "" || c === undefined || c === null;

function parseSheet(rows) {
  if (!rows || rows.length === 0) return [];
  const headers = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(isBlank)) continue;
    // BUG-002: a "tombstone" row keeps only its id (column A) and is otherwise blank.
    // We skip it here (so deleted records don't show up), but nextId() still counts
    // its id from the raw sheet, so ids are never reused.
    if (!isBlank(row[0]) && row.slice(1).every(isBlank)) continue;
    const obj = {};
    headers.forEach((h, ci) => { obj[h] = row[ci] !== undefined ? row[ci] : ""; });
    obj.__row = i + 1;
    out.push(obj);
  }
  return out;
}

async function readSheet(tabName) {
  const entry = cache.get(tabName);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  const s = getSheets();
  try {
    // Чтение — без долгих повторов: при лимите/сбое сразу отдаём последние данные из кэша.
    const res = await s.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A1:ZZ100000`,
    });
    const data = parseSheet(res.data.values);
    cacheSet(tabName, data);
    return data;
  } catch (e) {
    // Лимит Google/сеть: отдаём последние известные данные, а не роняем сессию.
    if (entry) return entry.data;
    throw e;
  }
}

async function nextId(tabName) {
  // BUG-002: compute max over the RAW id column (column A), including tombstone rows
  // whose other cells were blanked on delete. Using the parsed/live list here would
  // drop deleted ids and let the highest id be reused -> silent reference corruption.
  const s = getSheets();
  let max = 0;
  try {
    const res = await retryCall(() => s.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A2:A100000`,
    }));
    for (const row of (res.data.values || [])) {
      const n = Number(row && row[0]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  } catch (_) {
    // Fallback: derive from live rows if the raw read fails.
    const rows = await readSheet(tabName);
    for (const r of rows) { const n = Number(r.id); if (Number.isFinite(n) && n > max) max = n; }
  }
  return max + 1;
}

async function list(table) {
  const rows = await readSheet(table);
  return rows.map((r) => {
    const { __row, ...rest } = r;
    return rest;
  });
}

async function insert(table, obj) {
  return write(async () => {
    const id = await nextId(table);
    const record = { ...obj, id };
    const s = getSheets();
    await retryCall(() => s.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${table}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [TABLES[table].map((h) => (record[h] !== undefined ? record[h] : ""))] },
    }));
    cacheDrop(table);
    return id;
  });
}

async function update(table, id, obj) {
  return write(async () => {
    const rows = await readSheet(table);
    const target = rows.find((r) => Number(r.id) === Number(id));
    if (!target) return false;
    const merged = { ...target, ...obj, id };
    const s = getSheets();
    await retryCall(() => s.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${table}!A${target.__row}`,
      valueInputOption: "RAW",
      requestBody: { values: [TABLES[table].map((h) => (merged[h] !== undefined ? merged[h] : ""))] },
    }));
    cacheDrop(table);
    return true;
  });
}

async function remove(table, id) {
  return write(async () => {
    const rows = await readSheet(table);
    const target = rows.find((r) => Number(r.id) === Number(id));
    if (!target) return false;
    const s = getSheets();
    // BUG-002: keep the id cell (tombstone), blank everything else. This hides the
    // record from reads (parseSheet skips id-only rows) while preserving the id so it
    // is never handed out again by nextId().
    const values = [TABLES[table].map((h, i) => (i === 0 ? target.id : ""))];
    await retryCall(() => s.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${table}!A${target.__row}:${String.fromCharCode(64 + TABLES[table].length)}${target.__row}`,
      valueInputOption: "RAW",
      requestBody: { values },
    }));
    cacheDrop(table);
    return true;
  });
}

async function clear(table) {
  return write(async () => {
    const rows = await readSheet(table);
    if (rows.length === 0) return;
    const lastRow = rows[rows.length - 1].__row;
    const s = getSheets();
    await retryCall(() => s.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${table}!A2:${String.fromCharCode(64 + TABLES[table].length)}${lastRow}`,
      valueInputOption: "RAW",
      requestBody: { values: Array.from({ length: lastRow - 1 }, () => TABLES[table].map(() => "")) },
    }));
    cacheDrop(table);
  });
}

module.exports = { ensureTables, list, get: list, insert, update, remove, clear, TABLE_HEADERS: TABLES };