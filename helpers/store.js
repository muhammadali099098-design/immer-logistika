// Google Sheets as the datastore (service account). Pure JS (googleapis).
// Each tab = a table; row 1 = headers; data rows follow.
// All Google calls go through a retry wrapper to survive transient failures
// (free-tier traffic, slow API, occasional 403/429/5xx).
const { google } = require("googleapis");

const TABLES = {
  users: ["id", "username", "password_hash", "name", "role", "company_id", "active", "created_at"],
  factories: ["id", "name", "location", "contact_name", "contact_phone", "notes", "created_at"],
  logistics: ["id", "name", "city", "contact_name", "contact_phone", "notes", "created_at"],
  models: ["id", "model", "category", "notes", "created_at"],
  receipts: ["id", "logistics_id", "factory_id", "date", "truck_no", "volume_m3", "lines", "created_by", "created_at"],
  shipments: ["id", "logistics_id", "date", "truck_no", "volume_m3", "cost_amount", "cost_currency", "lines", "created_by", "created_at"],
};

let sheets = null;
let sheetId = null;
let writeQueue = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry a Google API call up to 4 times with backoff.
async function retryCall(fn) {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await sleep(250 * (i + 1));
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
    if (!existing.has(t)) {
      add.push({ addSheet: { properties: { title: t } } });
    }
  }
  if (add.length) {
    await retryCall(() => s.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: add } }));
  }
  for (const t of Object.keys(TABLES)) {
    await ensureHeadings(t);
  }
}

async function readSheet(tabName) {
  const s = getSheets();
  const res = await retryCall(() => s.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A1:ZZ100000`,
  }));
  const rows = res.data.values || [];
  if (rows.length === 0) return [];
  const headers = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === "" || c === undefined || c === null)) continue;
    const obj = {};
    headers.forEach((h, ci) => {
      obj[h] = row[ci] !== undefined ? row[ci] : "";
    });
    obj.__row = i + 1; // 1-based sheet row
    out.push(obj);
  }
  return out;
}

async function nextId(tabName) {
  const rows = await readSheet(tabName);
  let max = 0;
  for (const r of rows) {
    const n = Number(r.id);
    if (Number.isFinite(n) && n > max) max = n;
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
    return true;
  });
}

async function remove(table, id) {
  return write(async () => {
    const rows = await readSheet(table);
    const target = rows.find((r) => Number(r.id) === Number(id));
    if (!target) return false;
    const s = getSheets();
    await retryCall(() => s.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${table}!A${target.__row}:${String.fromCharCode(64 + TABLES[table].length)}${target.__row}`,
      valueInputOption: "RAW",
      requestBody: { values: [TABLES[table].map(() => "")] },
    }));
    return true;
  });
}

module.exports = { ensureTables, list, get: list, insert, update, remove, TABLE_HEADERS: TABLES };