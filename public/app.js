/* IMMER Logistika — сводка-таблица, загрузка фур, отгрузки. */
"use strict";

const ROLES = { admin: "Администратор", logistic: "Логист" };
const CURRENCIES = ["USD", "UZS", "CNY", "RUB", "EUR"];
const TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
const ICON_PAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>';
const ICON_RECV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><path d="M21 8l-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>';
const ICON_DOC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>';
const PAPERCLIP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

const state = {
  user: null,
  view: "login",
  setup: false,
  toast: null,
  loading: false,
  stock: [],
  tashkent: [],
  outgoing: [],
  trucks: [],
  shipments: [],
  models: [],
  factories: [],
  logistics: [],
  users: [],
  stats: null,
  sumFilter: "", // logistics id filter for the summary table
  sumQ: "",      // model search
  sumDraft: "",
  sumFilters: {}, // per-column filters
  summaryTab: "summary",
  sumLogId: "",
  shipTab: "shipments",
  finance: [],
  navCollapsed: false,
  finLogId: "",
  shipFilters: {},
  finCol: {},
  bulkSel: new Set(),
  bootFail: false, // сбой соединения при старте (не выход из аккаунта)
  sumView: "all", // Вкладки: all=всё, active=остатки, sent=отправленные
};

const app = document.getElementById("app");

async function api(path, opts = {}) {
  const isRead = !opts.method || opts.method === "GET";
  const maxAttempts = isRead ? 3 : 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(path, {
        headers: { "content-type": "application/json" },
        credentials: "include",
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      if (attempt < maxAttempts - 1) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      return { status: 0, data: { ok: false, error: "Сервер не ответил: бесплатный хостинг «засыпает» и просыпается до минуты. Если ошибка осталась — нажмите «↻ Обновить»." } };
    }
    try {
      const data = await res.json();
      if (isRead && attempt < maxAttempts - 1 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      return { status: res.status, data };
    } catch {
      return { status: res.status, data: { ok: false, error: "Нет данных от сервера, попробуйте ещё раз" } };
    }
  }
  return { status: 0, data: { ok: false, error: "Сервер не ответил, попробуйте ещё раз" } };
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtDate(s) { if (!s) return ""; return new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
function fmtNum(n) { return Number(n || 0).toLocaleString("ru-RU"); }
function fileLink(name, label) {
  if (!name) return "";
  return `<a class="btn link sm" href="/api/files/${encodeURIComponent(name)}" target="_blank" rel="noopener">${PAPERCLIP} ${label || "Открыть"}</a> <span style="color:var(--muted);font-size:12px">${esc(name)}</span>`;
}
function hasExtraFee(s) { return !!(s && Number(String(s.extra_fee == null ? "" : s.extra_fee).replace(",", ".")) > 0); }
function finSel(col, gid, rows) {
  const finF = state.finCol || {};
  const cur = finF[col] || "";
  let opts = [];
  if (col === "inv") {
    const uniq = [];
    (rows || []).forEach((r) => invoiceCodes(gid, r.lines).forEach((v) => { if (v && !uniq.includes(v)) uniq.push(v); }));
    opts = uniq;
  } else {
    opts = [...new Set((rows || []).map((r) => String(col === "doc" ? r.doc_number || "" : r.truck_no || "").trim()).filter(Boolean))];
  }
  return '<select class="f-input" data-fin-col="' + col + '" style="min-width:80px"><option value="">—</option>' + opts.map((o) => '<option value="' + esc(o) + '"' + (cur === o ? " selected" : "") + '>' + esc(o) + '</option>').join("") + '</select>';
}
function invoiceCodes(logId, lines) {
  const out = [];
  (lines || []).forEach((li) => {
    const t = (state.trucks || []).find((x) => Number(x.logistics_id) === Number(logId) && String(x.order_no || "") === String(li.order_no || ""));
    const v = t ? String(t.invoice_no || "") : "";
    if (v && !out.includes(v)) out.push(v);
  });
  return out;
}
function chipInv(list) { return (list || []).map((v) => '<span style="background:var(--surface-2);border-radius:6px;padding:2px 7px;font-size:12px;color:var(--fg);display:inline-block;margin:2px 4px 2px 0">' + esc(v) + '</span>').join(""); }
function openShipInvoices(id) {
  const s = state.shipments.find((x) => Number(x.id) === Number(id));
  if (!s) return;
  const iv = invoiceCodes(s.logistics_id, s.lines);
  const ov = openModal('<h3>Инвойсы (завод): фура ' + esc(s.truck_no || "") + '</h3><div style="margin-top:12px">' + (iv.length ? iv.map((v) => '<div style="padding:7px 0;border-bottom:1px solid var(--border)">' + esc(v) + '</div>').join("") : '<div class="emptystate" style="padding:10px 0">Инвойсы не найдены.</div>') + '</div><div class="actions" style="margin-top:12px"><button type="button" class="btn ghost" data-close>Закрыть</button></div>');
  [...ov.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => ov.remove()));
}
function exportFinancesXlsx() {
  const groups = (state.finance || []).filter((g) => !state.finLogId || Number(g.logistics_id) === Number(state.finLogId));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const head = ["Логист", "Номер документа", "Фура", "Дата прибытия", "Срок оплаты", "Дней до оплаты", "Инвойс (завод)", "Товар", "Валюта", "Итого", "Оплачено", "Долг", "Статус"];
  const rows = [head];
  const goodsDetail = [["Логист", "Номер документа", "Фура", "Order №", "Модель", "Кол-во", "Куб, м³", "CBM/шт"]];
  let tt = 0, tp = 0, td = 0;
  groups.forEach((g) => (g.rows || []).forEach((r) => {
    const iv = invoiceCodes(g.logistics_id, r.lines);
    const d = daysToDue(r.arrival_date);
    const tot = num(r.total), paid = num(r.paid), debt = num(r.debt) || 0;
    tt += tot || 0; tp += paid || 0; td += debt;
    rows.push([
      g.logistics_name, r.doc_number, r.truck_no,
      xlDate(r.arrival_date), xlDate(dueDate(r.arrival_date)), d,
      iv.join(", "),
      (r.lines || []).map((l) => ((l.model_name || "") + " × " + l.qty)).join(", "),
      r.currency || "", tot, paid, debt,
      debt <= 0 ? "оплачено" : "долг",
    ]);
    (r.lines || []).forEach((l) => {
      const m = state.models.find((x) => Number(x.id) === Number(l.model_id));
      const cbm = m ? num(m.cbm_per_pc) : null;
      const q = num(l.qty) || 0;
      goodsDetail.push([g.logistics_name, r.doc_number, r.truck_no, l.order_no || "", l.model_name || "", q, cbm == null ? null : +((q * cbm).toFixed(3)), cbm]);
    });
  }));
  rows.push(["ИТОГО", "", "", "", "", "", "", "", "", tt, tp, td, ""]);
  const summ = [["Логист", "Фур", "Оплачено", "Долг", "Оплачено, %"]].concat(
    groups.map((g) => {
      const paid = (g.rows || []).reduce((a, r) => a + (num(r.paid) || 0), 0);
      const debt = (g.rows || []).reduce((a, r) => a + (num(r.debt) || 0), 0);
      const pct = (paid + debt) > 0 ? Math.round((paid / (paid + debt)) * 100) : 100;
      return [g.logistics_name, (g.rows || []).length, paid, debt, pct];
    })
  );
  downloadXlsx("finansy_po_logistam", [
    { name: "Финансы", rows, widths: [14, 16, 12, 12, 12, 10, 22, 20, 8, 10, 10, 10, 10] },
    { name: "Сводка по логистам", rows: summ, widths: [16, 8, 12, 12, 12] },
    { name: "Товары", rows: goodsDetail, widths: [14, 16, 12, 10, 16, 10, 10, 10] },
  ]);
}
function linesCbm(lines) {
  return (lines || []).reduce((a, li) => {
    const m = state.models.find((x) => Number(x.id) === Number(li.model_id));
    return a + ((Number(li.qty) || 0) * (m ? (Number(m.cbm_per_pc) || 0) : 0));
  }, 0);
}
function fmtCbm(v) { const n = Number(v || 0); return n ? fmtNum(n.toFixed(2)) : "-"; }
function downloadXlsx(fileName, sheets) {
  if (typeof XLSX === "undefined") { toast("Библиотека Excel не загрузилась — обновите страницу (Ctrl+R).", false); return; }
  try {
    const wb = XLSX.utils.book_new();
    (sheets || []).forEach(({ name, rows, widths }) => {
      const ws = XLSX.utils.aoa_to_sheet(rows || []);
      if (Array.isArray(widths) && widths.length) ws["!cols"] = widths.map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, String(name || "Лист1").slice(0, 31));
    });
    XLSX.writeFile(wb, fileName + ".xlsx");
  } catch (e) {
    toast("Не удалось создать файл Excel: " + (e && e.message ? e.message : "ошибка"), false);
  }
}
// Parse a YYYY-MM-DD string into parts (no timezone math involved).
function dateParts(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}
// Date cell for Excel: Date at local noon keeps the calendar day correct in any timezone.
function xlDate(s) {
  const p = dateParts(s);
  return p ? new Date(p.y, p.m - 1, p.d, 12, 0, 0) : null;
}
// Срок оплаты = дата приёмки + 30 дней (calendar math, no UTC shifts).
function dueDate(arrivalDate) {
  const p = dateParts(arrivalDate);
  if (!p) return "";
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + 30));
  return dt.toISOString().slice(0, 10);
}
// Целые календарные дни до срока (отрицательное = просрочено).
function daysToDue(arrivalDate) {
  const p = dateParts(arrivalDate);
  if (!p) return null;
  const due = Date.UTC(p.y, p.m - 1, p.d + 30);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86400000);
}
function dueCell(r) {
  if (r.debt <= 0) return '<span style="color:var(--muted)">оплачено</span>';
  const d = daysToDue(r.arrival_date);
  if (d == null) return '<span style="color:var(--muted)">-</span>';
  if (d <= 0) return '<b style="color:var(--danger)">' + Math.abs(d) + ' дн. просрочено</b>';
  return '<b style="color:' + (d <= 7 ? "#d97706" : "#0f766e") + '">' + d + " дн.</b>";
}
  function linesLabel(lines) {
  return (lines || []).map((li) => {
    const t = `${li.model_name} × ${fmtNum(li.qty)}`;
    return li.order_no ? `[Order ${esc(li.order_no)}] ${t}` : t;
  }).join(", ") || "—";
}
function toast(msg, ok = true) { state.toast = { msg, ok }; render(); setTimeout(() => { state.toast = null; render(); }, 3000); }
function confirmBox(msg) { return window.confirm(msg); }
let __errTs = 0;
window.addEventListener("error", (e) => {
  const t = Date.now();
  if (t - __errTs < 5000) return;
  __errTs = t;
  try { if (state.user) toast("Ошибка: " + (e.message || "сбой"), false); } catch (_) {}
});
window.addEventListener("unhandledrejection", () => {
  const t = Date.now();
  if (t - __errTs < 5000) return;
  __errTs = t;
  try { if (state.user) toast("Ошибка данных — нажмите «↻ Обновить»", false); } catch (_) {}
});

async function loadStock() { const r = await api("/api/stock"); if (r.data.ok) state.stock = r.data.rows || []; }
async function loadTashkent() { const r = await api("/api/tashkent"); if (r.data.ok) state.tashkent = r.data.rows || []; }
async function loadOutgoing() { const r = await api("/api/tashkent/out"); if (r.data.ok) state.outgoing = r.data.outgoing || []; }
async function loadRefs() {
  const [f, l, m] = await Promise.all([api("/api/factories"), api("/api/logistics"), api("/api/models")]);
  if (f.data.ok) state.factories = f.data.factories;
  if (l.data.ok) state.logistics = l.data.logistics;
  if (m.data.ok) state.models = m.data.models;
}
async function loadTrucks() { const r = await api("/api/trucks"); if (r.data.ok) state.trucks = r.data.trucks; }
async function loadShipments() { const r = await api("/api/shipments"); if (r.data.ok) state.shipments = r.data.shipments; }
async function loadFinance() { const r = await api("/api/finance"); if (r.data.ok) state.finance = r.data.groups || []; }
async function loadUsers() { const r = await api("/api/users"); if (r.data.ok) state.users = r.data.users; }
async function loadStats() { const r = await api("/api/stats"); if (r.data.ok) state.stats = r.data.stats; }
async function loadAll() { await Promise.all([loadStock(), loadTashkent(), loadOutgoing(), loadRefs(), loadTrucks(), loadShipments()]); }
function landingView() { return "report"; } // по умолчанию открываются «Общие отчёты»

async function boot() {
  state.view = "login";
  state.bootFail = false;
  render();
  const r = await api("/api/me");
  if (r.data.ok && r.data.user) {
    state.user = r.data.user;
    state.bootFail = false;
    state.view = landingView();
    render();
    await loadAll();
    render();
    return;
  }
  // 401 = сессии действительно нет → обычная форма входа.
  if (r.status === 401) return;
  // Сервер занят/просыпается/лимит Google — сессия цела, показываем ожидание и пробуем снова.
  state.bootFail = true;
  render();
  setTimeout(boot, 7000);
}

function render() {
  if (state.view === "login" || !state.user) { app.innerHTML = renderLogin(); wire(); return; }
  const isAdmin = state.user.role === "admin";
  const navMain = [
    { v: "report", l: "Общие отчёты" },
    { v: "summary", l: "Сводка: Завод-Граница" },
    { v: "shipments", l: "Сводка: Граница → Ташкент" },
    { v: "finance", l: "Финансы" },
  ];
  const navRef = [
    { v: "models", l: "Модели" },
    { v: "factories", l: "Заводы" },
    { v: "logistics", l: "Логисты", admin: true },
    { v: "users", l: "Пользователи", admin: true },
  ].filter((n) => !n.admin || isAdmin);
  const navItem = (n) => `<a href="#" data-action="nav" data-view="${n.v}" class="${state.view === n.v ? "active" : ""}">${n.l}</a>`;
  const refHtml = navRef.length ? `<div class="nav-label">Справочники</div>${navRef.map(navItem).join("")}` : "";

  app.innerHTML = `
  <div class="shell ${state.navCollapsed ? "nav-collapsed" : ""}">
    <aside class="sidebar">
      <div class="brand"><a class="logo" href="#" data-action="nav" data-view="summary"><img src="/logo.png" class="brand-img" alt="IMMER" /><span class="brand-text">IMMER</span></a></div>
      <nav>${navMain.map(navItem).join("")}${refHtml}</nav>
      <div class="foot">Склад логистов по моделям<br/><b>IMMER Logistika</b></div>
    </aside>
    <div class="main">
      <div class="topbar">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn ghost sm" data-action="toggle-nav" title="Свернуть / развернуть панель">${state.navCollapsed ? "☰" : "«"}</button>
          <div class="role">Роль: <b>${esc(ROLES[state.user.role] || state.user.role)}</b>${state.user.company_name ? ` · <b style="color:var(--accent-fg)">${esc(state.user.company_name)}</b>` : ""}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          ${state.loading ? `<span style="color:var(--muted);font-size:12px">Обновление…</span>` : ""}
          <span style="font-weight:600">${esc(state.user.name)}</span>
          <button class="btn ghost sm" data-action="refresh" title="Обновить данные">↻ Обновить</button>
          <button class="btn ghost sm" data-action="logout">Выйти</button>
        </div>
      </div>
      <div class="content"><div class="wrap">${renderView()}</div></div>
    </div>
  </div>
  ${state.toast ? `<div style="position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:${state.toast.ok ? "var(--fg)" : "var(--danger)"};color:#fff;padding:10px 18px;border-radius:8px;z-index:99;font-size:14px">${esc(state.toast.msg)}</div>` : ""}`;
  wire();
}

function renderView() {
  try {
    switch (state.view) {
      case "report": return viewReport();
      case "summary": return viewSummary();
      case "tashkent": return viewTashkent();
      case "trucks": return viewTrucks();
      case "shipments": return viewShipments();
      case "finance": return viewFinance();
      case "models": return viewModels();
      case "factories": return viewFactories();
      case "logistics": return viewLogistics();
      case "users": return viewUsers();
      default: return "";
    }
  } catch (e) {
    console.error("view render error:", e);
    return `<div class="emptystate">Не удалось показать раздел. Обновите страницу (Ctrl+R).</div>`;
  }
}

function renderLogin() {
  const setup = state.setup;
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="logo"><img src="/logo.png" class="brand-img" alt="IMMER" /><span class="brand-text">IMMER</span></div>
      ${state.bootFail ? `<div style="background:var(--accent);border:1px solid #f0c9c6;color:var(--accent-fg);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px">Сервер временно недоступен (бесплатный хостинг «просыпается» или лимит Google-таблицы). Ваш аккаунт не потерян — пробуем подключиться автоматически… <button type="button" class="btn link sm" data-action="boot-retry">Проверить сейчас</button></div>` : ""}
      <h1>${setup ? "Создание аккаунта" : "Вход в систему"}</h1>
      <p class="sub">${setup ? "Первый вход. Создайте аккаунт администратора." : "Введите логин и пароль."}</p>
      <form id="loginForm" class="form">
        ${setup ? `<div><label>Имя</label><input id="f_name" autocomplete="name" /></div>` : ""}
        <div><label>Логин</label><input id="f_username" autocomplete="username" /></div>
        <div><label>Пароль</label><input id="f_password" type="password" autocomplete="current-password" /></div>
        <div id="loginError" class="formerror"></div>
        <button type="submit">${setup ? "Создать и войти" : "Войти"}</button>
      </form>
      <button class="toggle" data-action="toggle-setup">${setup ? "У меня уже есть аккаунт" : "Первый вход? Создать администратора"}</button>
    </div>
  </div>`;
}

// ---------- reports (общие отчёты) ----------
function viewReport() {
  const stock = state.stock || [];
  const fin = state.finance || [];
  const ships = state.shipments || [];
  const tQty = stock.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  const tCbm = stock.reduce((a, r) => a + ((Number(r.qty) || 0) * (Number(r.cbm_per_pc) || 0)), 0);
  const tRecv = stock.reduce((a, r) => a + (Number(r.received) || 0), 0);
  const tSent = stock.reduce((a, r) => a + (Number(r.shipped) || 0), 0);
  const paidAll = fin.reduce((a, g) => a + (g.total_paid || 0), 0);
  const debtAll = fin.reduce((a, g) => a + (g.rows || []).reduce((b, r) => b + (r.debt || 0), 0), 0);
  const finRows = fin.flatMap((g) => (g.rows || []));
  const arrived = ships.filter((s) => s.receipt_status === "received");
  const overdueRows = finRows.filter((r) => r.debt > 0 && daysToDue(r.arrival_date) != null && daysToDue(r.arrival_date) <= 0);
  const paidRows = finRows.filter((r) => r.debt <= 0);
  const overdueSum = overdueRows.reduce((a, r) => a + (Number(r.debt) || 0), 0);
  const unpaidRows = finRows.filter((r) => (Number(r.debt) || 0) > 0);
  const upcoming = unpaidRows.map((r) => ({ r, d: daysToDue(r.arrival_date) })).filter((x) => x.d != null && x.d > 0).sort((a, b) => a.d - b.d);
  const nextPay = upcoming[0] || null;
  const soonRows = unpaidRows.filter((r) => { const d = daysToDue(r.arrival_date); return d != null && d > 0 && d <= 7; });
  const soonSum = soonRows.reduce((a, r) => a + (Number(r.debt) || 0), 0);
  const bands = [
    { key: "over", label: "Просрочено", color: "#dc2626" },
    { key: "w1", label: "1–7 дней", color: "#ea580c" },
    { key: "w2", label: "8–14 дней", color: "#d97706" },
    { key: "w3", label: "15–30 дней", color: "#16a34a" },
    { key: "w4", label: "более 30 дней", color: "#0f766e" },
  ];
  const bandOf = (d) => d == null ? "" : d <= 0 ? "over" : d <= 7 ? "w1" : d <= 14 ? "w2" : d <= 30 ? "w3" : "w4";
  const bandData = bands.map((b) => {
    const list = unpaidRows.filter((r) => bandOf(daysToDue(r.arrival_date)) === b.key);
    return { ...b, count: list.length, sum: list.reduce((a, r) => a + (Number(r.debt) || 0), 0) };
  });
  const unpaidSum = bandData.reduce((a, b) => a + b.sum, 0) || 1;
  const overdueByLog = fin.map((g) => ({
    name: g.logistics_name,
    sum: (g.rows || []).filter((r) => { const d = daysToDue(r.arrival_date); return (Number(r.debt) || 0) > 0 && d != null && d <= 0; }).reduce((a, r) => a + (Number(r.debt) || 0), 0),
  })).filter((x) => x.sum > 0).sort((a, b) => b.sum - a.sum).slice(0, 6);
  const kpi = (label, value, sub, color) => `<div class="card" style="padding:16px 18px;min-width:150px;flex:1">
    <div style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em">${label}</div>
    <div style="font-size:24px;font-weight:700;margin-top:6px;color:${color || "var(--fg)"}">${value}</div>
    ${sub ? `<div style="color:var(--muted);font-size:12px;margin-top:4px">${sub}</div>` : ""}</div>`;
  const finByLog = fin.map((g) => {
    const debt = (g.rows || []).reduce((a, r) => a + (r.debt || 0), 0);
    const paid = g.total_paid || 0;
    const pct = (paid + debt) > 0 ? Math.round((paid / (paid + debt)) * 100) : 100;
    return { name: g.logistics_name, paid, debt, pct };
  });
  const byModel = {};
  stock.forEach((r) => {
    const k = r.model_name;
    byModel[k] = byModel[k] || { qty: 0, cub: 0 };
    byModel[k].qty += Number(r.qty) || 0;
    byModel[k].cub += (Number(r.qty) || 0) * (Number(r.cbm_per_pc) || 0);
  });
  const topModels = Object.entries(byModel).sort((a, b) => b[1].qty - a[1].qty).slice(0, 8);
  const maxQ = Math.max(1, ...topModels.map(([, v]) => v.qty));
  const byLog = {};
  stock.forEach((r) => { byLog[r.logistics_name] = (byLog[r.logistics_name] || 0) + ((Number(r.qty) || 0) * (Number(r.cbm_per_pc) || 0)); });
  const maxLogCub = Math.max(1, ...Object.values(byLog));
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), label: d.toLocaleString("ru-RU", { month: "short" }) });
  }
  const monthCnt = months.map((m) => ({ ...m, cnt: arrived.filter((s) => String(s.arrival_date || "").startsWith(m.key)).length }));
  const maxM = Math.max(1, ...monthCnt.map((m) => m.cnt));
  const damaged = arrived.filter((s) => s.damaged).length;
  const hbar = (label, val, max, color, right) => `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${label}</span><b>${right || fmtNum(val)}</b></div>
      <div style="background:var(--surface-2);height:10px;border-radius:6px;overflow:hidden"><div style="width:${max > 0 ? Math.max(2, Math.round((val / max) * 100)) : 0}%;height:100%;border-radius:6px;background:${color}"></div></div>
    </div>`;
  return `
    <div class="toolbar"><div><h1>Общие отчёты</h1><p class="sub" style="margin:0">Сводные показатели всех разделов: склад, отгрузки, финансы.</p></div></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      ${kpi("Остаток на складе", fmtNum(tQty) + " шт", "по моделям из Завод-Граница")}
      ${kpi("Объём на складе", fmtCbm(tCbm) + " м³", "количество × CBM")}
      ${kpi("Поступило / отгружено", fmtNum(tRecv) + " / " + tSent, "по всем фурам")}
      ${kpi("Оплачено", fmtNum(paidAll), "в Финансах", "var(--brand)")}
      ${kpi("Долг", fmtNum(debtAll), "по всем логистам", debtAll > 0 ? "var(--danger)" : "var(--fg)")}
      ${kpi("Просроченных оплат", fmtNum(overdueRows.length), "долг +30 дней истёк", overdueRows.length > 0 ? "var(--danger)" : "var(--fg)")}
      ${kpi("Фур прибыло", fmtNum(arrived.length), finRows.length ? "из " + finRows.length + " в Финансах" : "")}
      ${kpi("Ближайший платёж", nextPay ? fmtDate(nextPay.r.arrival_date) : "—", nextPay ? "через " + nextPay.d + " дн · фура " + esc(nextPay.r.truck_no || "—") : (overdueSum > 0 ? "всё просрочено" : "долгов нет."))}
      ${kpi("Просрочено долга", fmtNum(overdueSum), "к оплате сейчас", overdueSum > 0 ? "var(--danger)" : "var(--fg)")}
      ${kpi("К оплате за 7 дней", fmtNum(soonRows.length) + " фур", "долг " + fmtNum(soonSum), soonRows.length ? "#ea580c" : "var(--fg)")}
      ${kpi("Оплачено фур", fmtNum(paidRows.length) + " / " + finRows.length, "в Финансах")}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:20px">
      <div class="card" style="padding:16px 18px">
        <h2 style="margin:0 0 12px">Оплата по логистам</h2>
        ${finByLog.length === 0 ? `<div class="emptystate" style="padding:10px 0">Нет данных.</div>` : finByLog.map((f) => `
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><b>${esc(f.name)}</b><span style="color:var(--muted)">оплачено <b style="color:var(--brand)">${fmtNum(f.paid)}</b> · долг <b style="color:var(--danger)">${fmtNum(f.debt)}</b></span></div>
            <div style="background:var(--surface-2);height:12px;border-radius:6px;overflow:hidden;display:flex">
              <div style="width:${f.pct}%;background:linear-gradient(90deg,#15803d,#22c55e)"></div>
              ${f.pct < 100 ? `<div style="flex:1;background:#ef4444"></div>` : ""}
            </div>
            <div style="color:var(--muted);font-size:11px;margin-top:4px">оплачено ${f.pct}%</div>
          </div>`).join("")}
      </div>
      <div class="card" style="padding:16px 18px">
        <h2 style="margin:0 0 12px">Прибытие фур по месяцам</h2>
        <div style="display:flex;align-items:flex-end;gap:8px;height:140px">
          ${monthCnt.map((m) => `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;height:100%">
            <b style="font-size:13px">${m.cnt}</b>
            <div style="width:100%;max-width:46px;background:var(--brand);border-radius:6px 6px 0 0;height:${Math.max(m.cnt > 0 ? 10 : 2, Math.round((m.cnt / maxM) * 100))}px"></div>
            <span style="color:var(--muted);font-size:12px">${m.label}</span>
          </div>`).join("")}
        </div>
      </div>
      <div class="card" style="padding:16px 18px">
        <h2 style="margin:0 0 12px">Топ моделей на складе</h2>
        ${topModels.length === 0 ? `<div class="emptystate" style="padding:10px 0">Нет остатков.</div>` : topModels.map(([name, v]) => hbar(esc(name), v.qty, maxQ, "linear-gradient(90deg,#1d4ed8,#3b82f6)", `${fmtNum(v.qty)} шт · ${fmtCbm(v.cub)} м³`)).join("")}
      </div>
      <div class="card" style="padding:16px 18px">
        <h2 style="margin:0 0 12px">Объём (куб) по логистам</h2>
        ${Object.keys(byLog).length === 0 ? `<div class="emptystate" style="padding:10px 0">Нет данных.</div>` : Object.entries(byLog).sort((a, b) => b[1] - a[1]).map(([name, v]) => hbar(esc(name), v, maxLogCub, "linear-gradient(90deg,#0f766e,#14b8a6)", fmtCbm(v) + " м³")).join("")}
      </div>
      <div class="card" style="padding:16px 18px">
        <h2 style="margin:0 0 12px">Статусы фур</h2>
        ${[
          ["Прибыли", arrived.length, "#16a34a"],
          ["Не прибыли", ships.length - arrived.length, "#d97706"],
          ["Прибыли с повреждением", damaged, "#dc2626"],
          ["Оплачено полностью", paidRows.length, "#0f766e"],
          ["Есть долг", finRows.length - paidRows.length, "#dc2626"],
          ["Просрочено оплат", overdueRows.length, "#b91c1c"],
        ].map(([label, val, col]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)"><span>${label}</span><b style="color:${col}">${fmtNum(val)}</b></div>`).join("")}
        <div style="color:var(--muted);font-size:11px;margin-top:8px">Срок оплаты — 30 дней с даты приёмки («Финансы»).</div>
      </div>
      <div class="card" style="padding:16px 18px">
        <h2 style="margin:0 0 12px">Дни до оплаты (долг по срокам)</h2>
        ${unpaidRows.length === 0 ? `<div class="emptystate" style="padding:10px 0">Долгов нет — всё оплачено.</div>` : `
          <div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--surface-2);margin-bottom:12px">
            ${bandData.map((b) => b.sum > 0 ? `<div style="width:${Math.max(1, Math.round((b.sum / unpaidSum) * 100))}%;background:${b.color}" title="${esc(b.label)}"></div>` : "").join("")}
          </div>
          ${bandData.filter((b) => b.sum > 0).map((b) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
              <span style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:3px;background:${b.color};display:inline-block"></span>${b.label}</span>
              <span><b>${fmtNum(b.sum)}</b> · ${fmtNum(b.count)} фур</span>
            </div>`).join("")}
        `}
        <div style="color:var(--muted);font-size:11px;margin-top:8px">Доли считаются по сумме долга. «За 7 дней» — срок вот-вот наступит.</div>
      </div>
      <div class="card" style="padding:16px 18px">
        <h2 style="margin:0 0 12px">Просрочки по логистам</h2>
        ${overdueByLog.length === 0 ? `<div class="emptystate" style="padding:10px 0">Просроченных долгов нет.</div>` : overdueByLog.map((o) => hbar(esc(o.name), o.sum, overdueByLog[0].sum, "#dc2626", fmtNum(o.sum))).join("")}
      </div>
    </div>`;
}

// ---------- summary (Завод → Граница, с фильтрами и загрузками) ----------
function viewSummary() {
  const isAdmin = state.user.role === "admin";
  const q = state.sumQ.trim().toLowerCase();
  const F = state.sumFilters;
  let rows = state.stock;
  if (state.sumLogId) rows = rows.filter((r) => Number(r.logistics_id) === Number(state.sumLogId));
  if (q) rows = rows.filter((r) => String(r.model_name).toLowerCase().includes(q));
  if (F.model && F.model.length) rows = rows.filter((r) => F.model.includes(r.model_name));
  if (F.category && F.category.length) rows = rows.filter((r) => F.category.includes(r.category));
  if (F.logistics && F.logistics.length) rows = rows.filter((r) => F.logistics.includes(r.logistics_name));
  if (F.factory && F.factory.length) rows = rows.filter((r) => F.factory.includes(r.factory_name));
  if (F.truck && F.truck.length) rows = rows.filter((r) => (r.load_trucks || []).some((t) => F.truck.includes(t.truck_no)));
  if (F.invoice && F.invoice.length) rows = rows.filter((r) => F.invoice.includes(String(r.invoice_no)));
  if (F.order && F.order.length) rows = rows.filter((r) => F.order.includes(String(r.order_no)));
  if (F.status && F.status.length) rows = rows.filter((r) => F.status.includes(r.shipment_status));
  if (F.days) rows = rows.filter((r) => F.days === "lt7" ? r.days_sitting < 7 : F.days === "7-13" ? r.days_sitting >= 7 && r.days_sitting <= 13 : F.days === "gt13" ? r.days_sitting > 13 : true);
  const sentCnt = state.stock.filter((r) => Number(r.qty) <= 0).length;
  const activeCnt = state.stock.length - sentCnt;
  const allCount = state.stock.length;
  const sentCount2 = state.stock.filter((r) => Number(r.qty) <= 0).length;
  const activeCount = state.stock.length - sentCount2;
  // Вкладка «Все» показывает остатки и отправленные; «Остатки»/«Отправленные» фильтруют.
  if (state.sumView === "active") rows = rows.filter((r) => Number(r.qty) > 0);
  else if (state.sumView === "sent") rows = rows.filter((r) => Number(r.qty) <= 0);
  // When filtering by Order №, sort Заводы alphabetically so they show in order.
  if (F.order && F.order.length) rows = [...rows].sort((a, b) => (a.factory_name || "").localeCompare(b.factory_name || "", "ru"));
  state.sumRows = rows;
  const tQty = rows.reduce((a, r) => a + r.qty, 0);
  const tCbm = rows.reduce((a, r) => a + (r.qty * (Number(r.cbm_per_pc) || 0)), 0);
  const distinct = (fn, filterEmpty) => [...new Set(state.stock.map(fn).filter((v) => v && v !== "" && (filterEmpty ? String(v).trim() !== "" : true) && String(v) !== "—"))].sort();
  const modelOpts = distinct((r) => r.model_name);
  const cats = distinct((r) => r.category);
  const facs = distinct((r) => r.factory_name);
  const truckOpts = [...new Set(state.stock.flatMap((r) => (r.load_trucks || []).map((t) => t.truck_no)).filter(Boolean))].sort();
  const invOpts = distinct((r) => r.invoice_no);
  const orderOpts = distinct((r) => r.order_no);
  const arr = (f) => state.sumFilters[f] || [];
  const mf = (f, label, options, storeName) => {
    const store = storeName === "truck" ? (state.truckFilters || (state.truckFilters = {})) : state.sumFilters;
    const sel = store[f] || [];
    const allOpts = [...new Set([...options, ...sel])];
    return `<div class="mfilter" data-field="${f}" data-store="${storeName || "sum"}"><button type="button" class="f-input mf-toggle" style="text-align:left">${label}${sel.length ? ` (${sel.length})` : ""} ▾</button>
      <div class="mfilter-pop" hidden>
        <input class="f-input mf-search" placeholder="Поиск…">
        <div class="mf-list">${allOpts.map((o) => `<label class="mf-opt"><input type="checkbox" value="${esc(o)}" ${sel.includes(o) ? "checked" : ""}>${esc(o)}</label>`).join("")}</div>
        <div style="display:flex;gap:6px;margin-top:6px"><button type="button" class="btn ghost sm mf-clear">Сбросить</button><button type="button" class="btn sm mf-apply">Готово</button></div>
      </div></div>`;
  };
  const hasF = Object.keys(F).some((k) => (Array.isArray(F[k]) ? F[k].length : F[k] && (F[k].min !== undefined ? (F[k].min || F[k].max) : true)));
  const rng = (f, type) => {
    const v = state.sumFilters[f] || {};
    return `<div style="display:flex;gap:2px"><input class="f-input rng" data-f="${f}" data-edge="min" type="${type}" placeholder="от" value="${esc(v.min || "")}" style="min-width:64px"><input class="f-input rng" data-f="${f}" data-edge="max" type="${type}" placeholder="до" value="${esc(v.max || "")}" style="min-width:64px"></div>`;
  };
  const daysSel = `<select class="f-input sum-filter" data-f="days" style="width:112px">
      <option value="">Дней: все</option>
      <option value="lt7" ${F.days === "lt7" ? "selected" : ""}>до 7 дн.</option>
      <option value="7-13" ${F.days === "7-13" ? "selected" : ""}>7–13 дн.</option>
      <option value="gt13" ${F.days === "gt13" ? "selected" : ""}>14 и более</option>
    </select>`;
  return `
    <div class="toolbar"><div><h1>Сводка: Завод-Граница</h1><p class="sub" style="margin:0">Какой товар у какого логиста и остаток на складе.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${hasF || q ? `<button class="btn ghost" data-action="summary-clear">Сбросить фильтры</button>` : ""}
      <span style="display:flex;gap:4px;flex-wrap:wrap">
    <button class="btn sm ${state.sumView === "all" ? "" : "ghost"}" data-action="sum-view" data-view="all">Все (${allCount})</button>
    <button class="btn sm ${state.sumView === "active" ? "" : "ghost"}" data-action="sum-view" data-view="active">Остатки (${activeCnt})</button>
    <button class="btn sm ${state.sumView === "sent" ? "" : "ghost"}" data-action="sum-view" data-view="sent">Отправленные (${sentCnt})</button>
  </span>
      <button class="btn ghost" data-action="export-summary">Скачать Excel</button>
      <button data-action="open-truck">Записать загрузку</button>
    </div></div>
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      <span style="font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-right:2px">Логист:</span>
      <button class="btn sm ${!state.sumLogId ? "" : "ghost"}" data-action="open-log-goods" data-id="">Все</button>
      ${state.logistics.map((l) => `<button class="btn sm ${Number(state.sumLogId) === Number(l.id) ? "" : "ghost"}" data-action="open-log-goods" data-id="${l.id}">${esc(l.name)}</button>`).join("")}
    </div>
    <div class="tbl-wrap"><table class="table">
      <thead>
        <tr><th>Order №</th><th>Модель</th><th>Категория</th><th>Логист</th><th>Завод</th><th>Инвойс (завод)</th><th>Пришло</th><th>Дата забора</th><th>Отгружено</th><th>Остаток</th><th>Общий куб</th><th>Дней</th><th>Статус</th><th>Действия</th></tr>
        <tr style="background:var(--surface-2)">
          <th>${mf("order", "Order №", orderOpts)}</th>
          <th>${mf("model", "Модель", modelOpts)}</th>
          <th>${mf("category", "Категория", cats)}</th>
          <th>${mf("logistics", "Логист", state.logistics.map((l) => l.name))}</th>
          <th>${mf("factory", "Завод", facs)}</th>
          <th>${mf("invoice", "Инвойс (завод)", invOpts)}</th>
          <th></th><th></th><th></th><th></th><th></th>
          <th>${daysSel}</th>
          <th>${mf("status", "Статус", ["отправлен", "частично", "в складе"])}</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="14"><div class="emptystate">${state.sumView === "sent" ? "Отправленных позиций пока нет." : state.sumView === "active" ? "Остатков по фильтру нет. Добавьте загрузку." : "Позиций пока нет. Добавьте загрузку."}</div></td></tr>` : rows.slice().reverse().map((r, ri) => {
          const oi = rows.length - 1 - ri; // индекс строки в НЕперевёрнутом массиве (state.sumRows)
          const totalCbm = r.qty * (Number(r.cbm_per_pc) || 0);
          const loadStr = (r.load_trucks || []).map((t) => `${esc(t.truck_no)}×${fmtNum(t.qty)}`).join(", ");
          const shipStr = (r.ship_trucks || []).map((t) => `${esc(t.truck_no)}×${fmtNum(t.qty)}`).join(", ");
          return `<tr>
          <td><b>${esc(r.order_no || "—")}</b></td>
          <td>${esc(r.model_name)}</td>
          <td style="color:var(--muted)">${esc(r.category || "—")}</td>
          <td>${esc(r.logistics_name || "—")}</td>
          <td>${esc(r.factory_name || "—")}</td>
          <td style="color:var(--muted)">${esc(r.invoice_no || "—")}</td>
          <td style="color:var(--muted)">${fmtNum(r.received)}</td>
          <td style="color:var(--muted)">${r.pickup_date ? fmtDate(r.pickup_date) : "—"}</td>
          <td>${(()=>{const st=r.ship_trucks||[];if(!st.length)return fmtNum(r.shipped);const t=v=>`<span style="background:var(--surface-2);border-radius:6px;padding:2px 7px;font-size:12px;color:var(--fg);display:inline-block;margin:2px 4px 2px 0">${esc(v.truck_no||"—")} × ${fmtNum(v.qty)}</span>`;return st.length<=2?st.map(t).join(""):st.slice(0,2).map(t).join("")+` <button type="button" class="btn link sm" style="font-size:12px" data-action="ship-trucks" data-idx="${oi}">все (${st.length})</button>`;})()}</td>
          <td><b style="color:${r.qty < 0 ? "var(--danger)" : "var(--fg)"}">${fmtNum(r.qty)}</b></td>
          <td style="color:var(--muted)">${totalCbm ? fmtNum(totalCbm.toFixed(2)) : "—"}</td>
          <td><b style="color:${r.days_sitting >= 7 ? "var(--danger)" : "var(--fg)"}">${r.days_sitting || 0}</b></td>
          <td>${r.shipment_status === "отправлен" ? '<span style="color:#065f46;font-weight:600">отправлен</span>' : r.shipment_status === "частично" ? '<span style="color:#b45309;font-weight:600">частично</span>' : '<span style="color:var(--fg);font-weight:600">в складе</span>'}</td>
          <td style="white-space:nowrap"><button class="btn link sm" title="Изменить загрузку" data-action="edit-sum-row" data-idx="${oi}">✎</button><button class="btn link danger sm" title="Удалить загрузку" data-action="del-sum-row" data-idx="${oi}">${TRASH}</button></td>
        </tr>`;
        }).join("")}
      </tbody>
      <tfoot>
        <tr style="font-weight:700;background:var(--surface-2)">
          <td></td><td>Итого</td><td></td><td></td><td></td><td></td>
          <td>${fmtNum(rows.reduce((a, r) => a + r.received, 0))}</td><td></td>
          <td>${fmtNum(rows.reduce((a, r) => a + r.shipped, 0))}</td>
          <td>${fmtNum(tQty)}</td><td>${fmtNum(tCbm.toFixed(2))}</td><td></td><td></td><td></td>
        </tr>
      </tfoot>
    </table></div>
    <p class="sub" style="margin-top:10px">Остаток = пришло − отгружено. Кнопка «…» в колонке «Отгружено» — фуры, которыми отправлено. Иконки ✎ / 🗑 — изменить / удалить загрузку. Позиции с нулевым остатком автоматически переходят в «Отправленные позиции» (остаток ≤ 5 шт списывается — разница видна в «Граница → Ташкент»).</p>`;
}

// ---------- summary 2: border → Tashkent ----------
function viewTashkent() {
  const rows = state.tashkent;
  return `
    <div class="toolbar"><div><h1>Сводка: Граница → Ташкент</h1><p class="sub" style="margin:0">Товар на складе в Ташкенте.</p></div>
    <button data-action="open-tashkent-out">Записать отправку из Ташкента</button></div>
    <div class="tbl-wrap"><table class="table">
      <thead><tr><th>Модель</th><th>Логист</th><th>Пришло</th><th>Отправлено</th><th>Остаток</th><th>Дата прихода</th><th>Дней в Ташкенте</th><th>Статус</th></tr></thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="8"><div class="emptystate">Пока нет товара в Ташкенте. Сначала запишите отгрузку.</div></td></tr>` : rows.slice().reverse().map((r) => `<tr>
          <td><b>${esc(r.model_name)}</b></td>
          <td>${esc(r.logistics_name)}</td>
          <td style="color:var(--muted)">${fmtNum(r.received)}</td>
          <td style="color:var(--muted)">${fmtNum(r.shipped)}</td>
          <td><b>${fmtNum(r.qty)}</b></td>
          <td style="color:var(--muted)">${r.arrival_date ? fmtDate(r.arrival_date) : "—"}</td>
          <td><b style="color:${r.days_sitting >= 7 ? "var(--danger)" : "var(--fg)"}">${r.days_sitting || 0}</b></td>
          <td>${r.shipped_status === "отправлен" ? '<span style="color:var(--danger);font-weight:600">отправлен</span>' : '<span style="color:#065f46;font-weight:600">на месте</span>'}</td>
        </tr>`).join("")}
      </tbody>
    </table></div>
    <p class="sub" style="margin-top:10px">Пришло = отправлено из границы. Остаток = пришло − отправлено из Ташкента.</p>`;
}

function openTashkentOut() {
  const overlay = openModal(`
    <h3>Отправка из Ташкента</h3>
    <form id="tOutForm" class="form" style="margin-top:14px">
      <div class="grid2">
        <div><label>Логист</label><select id="to_logistic">${state.logistics.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}</select></div>
        <div><label>Дата</label><input id="to_date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      </div>
      <div class="grid2">
        <div><label>Номер фуры</label><input id="to_truck" /></div>
        <div><label>Примечание</label><input id="to_notes" /></div>
      </div>
      <div><label>Товар</label><div id="to_lines"></div>
        <button type="button" class="btn ghost sm" data-line-add>+ Добавить модель</button></div>
      <div id="tOutError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить</button></div>
    </form>`);
  const form = overlay.querySelector("#tOutForm");
  const linesBox = form.querySelector("#to_lines");
  const lineArr = [];
  function availForTok() {
    return state.tashkent.filter((r) => Number(r.qty) > 0).map((r) => ({ id: r.model_id, name: r.model_name, qty: r.qty }));
  }
  function addLine(pre) {
    const avail = availForTok();
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center";
    row.innerHTML = `<select class="line-model" style="flex:1.4"><option value="">Модель</option>${avail.map((a) => `<option value="${a.id}" ${pre && Number(pre.model_id) === Number(a.id) ? "selected" : ""}>${esc(a.name)} (в нал. ${fmtNum(a.qty)})</option>`).join("")}</select>
      <input class="line-qty" type="number" min="0" step="any" value="${pre ? pre.qty : ""}" placeholder="Кол-во" style="flex:1" />
      <button type="button" class="btn danger sm" data-line-del>×</button>`;
    row.querySelector("[data-line-del]").addEventListener("click", () => { row.remove(); const i = lineArr.indexOf(row); if (i >= 0) lineArr.splice(i, 1); });
    linesBox.appendChild(row);
    lineArr.push(row);
  }
  lineArr.length = 0;
  if (availForTok().length === 0) linesBox.innerHTML = `<div class="emptystate" style="padding:10px">В Ташкенте нет товара для отправки. Сначала запишите отгрузку.</div>`;
  else addLine(null);
  form.querySelector("[data-line-add]").addEventListener("click", () => addLine(null));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const lines = lineArr.map((r) => ({ model_id: Number(r.querySelector(".line-model").value), qty: Number(r.querySelector(".line-qty").value) })).filter((l) => l.model_id && l.qty > 0);
    const body = { logistics_id: Number(form.querySelector("#to_logistic").value), date: form.querySelector("#to_date").value, truck_no: form.querySelector("#to_truck").value, notes: form.querySelector("#to_notes").value, lines };
    const r = await api("/api/tashkent/out", { method: "POST", body });
    if (r.data.ok) { overlay.remove(); toast("Отправка записана"); await Promise.all([loadTashkent(), loadOutgoing()]); render(); }
    else form.querySelector("#tOutError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

// ---------- trucks (загрузка) ----------
function viewTrucks() {
  const isAdmin = state.user.role === "admin";
  return `
    <div class="toolbar"><div><h1>Загрузка с заводов</h1><p class="sub" style="margin:0">Фуры, загруженные с завода и привезённые на склад.</p></div>
    <button data-action="open-truck">Записать загрузку</button></div>
    ${state.trucks.length === 0 ? `<div class="emptystate">Загрузок пока нет.</div>` : state.trucks.map((t) => {
    const truckCbm = t.lines.reduce((a, li) => { const m = state.models.find((x) => Number(x.id) === Number(li.model_id)); return a + (Number(li.qty) || 0) * (m ? Number(m.cbm_per_pc) || 0 : 0); }, 0);
    return `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div><b>${esc(t.truck_no || "Фура")}</b> · ${fmtDate(t.date)}
            <span style="color:var(--muted);font-size:13px"> · ${esc(t.factory_name || "—")}</span>
            ${t.invoice_no ? ` <span style="color:var(--muted);font-size:13px">· Инвойс: ${esc(t.invoice_no)}</span>` : ""}
            ${isAdmin ? ` <span style="color:var(--muted);font-size:13px">· ${esc(t.logistics_name)}</span>` : ""}</div>
          <div style="display:flex;gap:10px;align-items:center">
            <span style="font-weight:600">${truckCbm ? truckCbm.toFixed(3) + " м³" : "—"}</span>
            <button class="btn link sm" data-action="edit-truck" data-id="${t.id}">Изменить</button>
            <button class="btn link danger sm" data-action="del-truck" data-id="${t.id}">${TRASH}</button>
          </div>
        </div>
        <div style="margin-top:8px;font-size:14px">${t.lines.map((li) => `${esc(li.model_name)} × <b>${fmtNum(li.qty)}</b>`).join(" · ") || "—"}</div>
        ${t.notes ? `<div style="margin-top:6px;color:var(--muted);font-size:13px">${esc(t.notes)}</div>` : ""}
      </div>`;
    }).join("")}`;
}

function openTruck(item) {
  const isAdmin = state.user.role === "admin";
  const editing = !!item;
  const logId = isAdmin ? "" : String(state.user.company_id);
  const logCmd = isAdmin
    ? `<select id="tr_logistic"><option value="">Выберите логиста</option>${state.logistics.map((l) => `<option value="${l.id}" ${editing && Number(l.id) === Number(item.logistics_id) ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>`
    : `<input value="${esc(state.user.company_name || "")}" disabled />`;
  const overlay = openModal(`
    <h3>${editing ? "Изменить загрузку" : "Записать загрузку (фуру)"}</h3>
    <form id="truckForm" class="form" style="margin-top:14px">
      ${isAdmin ? `<div><label>Логист</label>${logCmd}</div>` : `<div><label>Логист</label>${logCmd}<input type="hidden" id="tr_logistic" value="${logId}" /></div>`}
      <div class="grid2">
        <div><label>Завод</label><select id="tr_factory">${optList(state.factories, "Выберите завод", editing ? item.factory_id : "")}</select></div>
        <div><label>Номер фуры</label><input id="tr_no" value="${editing ? esc(item.truck_no || "") : ""}" placeholder="Например: 202AOH08" /></div>
      </div>
      <div class="grid2">
        <div><label>Order number *</label><input id="tr_order" value="${editing ? esc(item.order_no || "") : ""}" placeholder="Например: ORD-0001" /></div>
        <div><label>Номер инвойса</label><input id="tr_invoice" value="${editing ? esc(item.invoice_no || "") : ""}" placeholder="Например: HD250429" /></div>
      </div>
      <div class="grid2">
        <div><label>Дата загрузки</label><input id="tr_date" type="date" value="${editing ? esc(item.date || "") : new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Примечание</label><input id="tr_notes" value="${editing ? esc(item.notes || "") : ""}" /></div>
      </div>
      <div><label>Товар</label><div id="tr_lines"></div>
        <button type="button" class="btn ghost sm" data-line-add>+ Добавить модель</button></div>
      <div id="tr_totalCbm" style="margin-top:8px;font-weight:600">Общий CBM: 0</div>
      <div id="truckError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">${editing ? "Сохранить" : "Сохранить"}</button></div>
    </form>`);
  const form = overlay.querySelector("#truckForm");
  const linesBox = form.querySelector("#tr_lines");
  const lineArr = [];
  function addLine(pre) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap";
    const preM = pre ? state.models.find((x) => Number(x.id) === Number(pre.model_id)) : null;
    const preCat = preM ? (preM.category || "") : "";
    const cats = [...new Set(state.models.map((x) => x.category).filter((c) => c && String(c).trim()))].sort((a, b) => a.localeCompare(b, "ru"));
    row.innerHTML = `<select class="line-cat" style="flex:1"><option value="">Категория</option>${cats.map((c) => `<option value="${esc(c)}" ${preCat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <select class="line-model" style="flex:1.3"><option value="">Сначала выберите категорию</option></select>
      <input class="line-qty" type="number" min="0" step="any" value="${pre ? pre.qty : ""}" placeholder="Кол-во" style="flex:1" />
      <span class="line-cbm" style="min-width:80px;color:var(--muted);font-size:12px">—</span>
      <button type="button" class="btn danger sm" data-line-del>×</button>`;
    const catSel = row.querySelector(".line-cat");
    const mSel = row.querySelector(".line-model");
    const qIn = row.querySelector(".line-qty");
    const cbmSpan = row.querySelector(".line-cbm");
    function fillModels() {
      const cat = catSel.value;
      if (!cat) { mSel.innerHTML = `<option value="">Сначала выберите категорию</option>`; upd(); return; }
      const list = state.models.filter((m) => (m.category || "") === cat);
      mSel.innerHTML = `<option value="">Модель</option>` + list.map((m) => `<option value="${m.id}" ${pre && Number(pre.model_id) === Number(m.id) ? "selected" : ""}>${esc(m.model)}</option>`).join("");
      upd();
    }
    const upd = () => {
      const m = state.models.find((x) => Number(x.id) === Number(mSel.value));
      const q = Number(qIn.value) || 0;
      const cb = m ? Number(m.cbm_per_pc) || 0 : 0;
      cbmSpan.textContent = q && cb ? (q * cb).toFixed(3) + " м³" : "—";
      let t = 0;
      lineArr.forEach((r) => {
        const mm = state.models.find((x) => Number(x.id) === Number(r.querySelector(".line-model").value));
        const qq = Number(r.querySelector(".line-qty").value) || 0;
        t += qq * (mm ? Number(mm.cbm_per_pc) || 0 : 0);
      });
      const totalEl = document.getElementById("tr_totalCbm");
      if (totalEl) totalEl.textContent = "Общий CBM: " + t.toFixed(3) + " м³";
    };
    catSel.addEventListener("change", fillModels);
    mSel.addEventListener("change", upd);
    qIn.addEventListener("input", upd);
    row.querySelector("[data-line-del]").addEventListener("click", () => { row.remove(); const i = lineArr.indexOf(row); if (i >= 0) lineArr.splice(i, 1); upd(); });
    linesBox.appendChild(row);
    lineArr.push(row);
    fillModels();
  }
  lineArr.length = 0;
  if (editing && item.lines && item.lines.length) item.lines.forEach((li) => addLine(li)); else addLine(null);
  form.querySelector("[data-line-add]").addEventListener("click", () => addLine(null));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const lines = [];
    const errs = [];
    lineArr.forEach((r) => {
      const cat = r.querySelector(".line-cat").value;
      const mid = Number(r.querySelector(".line-model").value);
      const qty = Number(r.querySelector(".line-qty").value) || 0;
      if (!cat && (mid || qty)) errs.push("выберите категорию");
      else if (cat && !mid && qty > 0) errs.push("выберите модель");
      else if (cat && mid && qty > 0) lines.push({ model_id: mid, qty });
    });
    if (errs.length) { form.querySelector("#truckError").textContent = "Нельзя сохранить: " + errs[0]; return; }
    if (!lines.length) { form.querySelector("#truckError").textContent = "Добавьте хотя бы одну модель с количеством"; return; }
    const body = {
      logistics_id: Number(form.querySelector("#tr_logistic").value),
      factory_id: Number(form.querySelector("#tr_factory").value),
      truck_no: form.querySelector("#tr_no").value,
      order_no: form.querySelector("#tr_order").value,
      invoice_no: form.querySelector("#tr_invoice").value,
      date: form.querySelector("#tr_date").value,
      notes: form.querySelector("#tr_notes").value,
      lines,
    };
    const r = await api(editing ? "/api/trucks/" + item.id : "/api/trucks", { method: editing ? "PUT" : "POST", body });
    if (r.data.ok) { overlay.remove(); toast(editing ? "Загрузка обновлена" : "Загрузка записана"); await loadAll(); render(); }
    else form.querySelector("#truckError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

// ---------- Разница (Граница → Ташкент) ----------
// Логика «по фурам»: что получил логист по МОДЕЛИ (сумма загрузок), фуры идут
// по дате отгрузки. Остаток после каждой фуры = получено − накоплено отгружено.
//   −N — фура довела остаток до 1..5 шт (хвост списывается), показываем только на этой фуре;
//   +N — фура, из-за которой суммарно отгружено БОЛЬШЕ, чем получено с завода;
//   иначе — пусто. «0» не показываем.
function shipDiffCtx() {
  const recv = {};
  const key = (log, ord, mid) => log + "|" + (ord || "") + "|" + mid;
  (state.trucks || []).forEach((tr) => (tr.lines || []).forEach((li) => { const k = key(tr.logistics_id, tr.order_no, li.model_id); recv[k] = (recv[k] || 0) + (Number(li.qty) || 0); }));
  const groups = {};
  (state.shipments || []).forEach((sh) => (sh.lines || []).forEach((li) => {
    const k = key(sh.logistics_id, li.order_no, li.model_id);
    (groups[k] = groups[k] || []).push({ sid: sh.id, date: sh.date || "", qty: Number(li.qty) || 0, mid: li.model_id, name: li.model_name || String(li.model_id) });
  }));
  const byShip = {};
  Object.keys(groups).forEach((k) => {
    const list = groups[k].sort((aa, bb) => (aa.date < bb.date ? -1 : aa.date > bb.date ? 1 : (Number(aa.sid) - Number(bb.sid))));
    const recvT = recv[k] || 0;
    let cum = 0, crossed = false;
    list.forEach((g) => {
      cum += g.qty;
      let label = null;
      if (cum > recvT) {
        if (!crossed) { crossed = true; label = "+" + (cum - recvT); }
      } else {
        const remAfter = recvT - cum;
        const remBefore = remAfter + g.qty;
        let show = 0;
        if (remAfter > 0) show = remAfter;
        else if (remAfter === 0 && remBefore >= 1 && remBefore <= 5) show = remBefore;
        if (show >= 1 && show <= 5) label = "-" + show;
      }
      if (label != null) (byShip[g.sid] = byShip[g.sid] || []).push({ mid: g.mid, model: g.name, label });
    });
  });
  return { recv, key, byShip, groups };
}
function shipDiffLabels(s, ctx) {
  return (ctx && ctx.byShip) ? (ctx.byShip[s.id] || []) : [];
}

// ---------- shipments (загрузки + оплаты, одна страница) ----------
function viewShipments() {
  const SF = state.shipFilters || (state.shipFilters = {});
  const frByShip = {};
  (state.finance || []).forEach((g) => (g.rows || []).forEach((r) => { if (r.shipment_id) frByShip[r.shipment_id] = r; }));
  let rows = state.shipments;
  if (state.finLogId) rows = rows.filter((s) => Number(s.logistics_id) === Number(state.finLogId));
  if (state.shipLogId) rows = rows.filter((s) => Number(s.logistics_id) === Number(state.shipLogId));
  const mfS = (f, label, options) => {
    const sel = SF[f] || [];
    const allOpts = [...new Set([...options, ...sel])];
    return `<div class="mfilter" data-field="${f}" data-store="ship"><button type="button" class="f-input mf-toggle" style="text-align:left">${label}${sel.length ? ` (${sel.length})` : ""} ▾</button>
      <div class="mfilter-pop" hidden><input class="f-input mf-search" placeholder="Поиск…"><div class="mf-list">${allOpts.map((o) => `<label class="mf-opt"><input type="checkbox" value="${esc(o)}" ${sel.includes(o) ? "checked" : ""}>${esc(o)}</label>`).join("")}</div>
      <div style="display:flex;gap:6px;margin-top:6px"><button type="button" class="btn ghost sm mf-clear">Сбросить</button><button type="button" class="btn sm mf-apply">Готово</button></div></div></div>`;
  };
  if (SF.truck_no && SF.truck_no.length) rows = rows.filter((s) => SF.truck_no.includes(s.truck_no));
  if (SF.logistics && SF.logistics.length) rows = rows.filter((s) => SF.logistics.includes(s.logistics_name || ""));
  if (SF.pi && SF.pi.length) rows = rows.filter((s) => SF.pi.includes(String(s.pi_number)));
  if (SF.doc && SF.doc.length) rows = rows.filter((s) => SF.doc.includes(String(s.doc_number)));
  if (SF.recv && SF.recv.length) rows = rows.filter((s) => SF.recv.includes(s.receipt_status === "received" ? (s.damaged ? "повреждён" : "прибыл") : "не прибыл"));
  const tNo = [...new Set(state.shipments.map((s) => s.truck_no).filter(Boolean))].sort();
  const tLog = [...new Set(state.shipments.map((s) => s.logistics_name).filter(Boolean))].sort();
  const tPi = [...new Set(state.shipments.map((s) => String(s.pi_number)).filter(Boolean))].sort();
  const tDoc = [...new Set(state.shipments.map((s) => String(s.doc_number)).filter(Boolean))].sort();
  const recvOpts = ["не прибыл", "прибыл", "повреждён"];
  const sHas = Object.keys(SF).some((k) => (SF[k] || []).length);
  const dctx = shipDiffCtx();
  return `
    <div class="toolbar"><div><h1>Сводка: Граница → Ташкент</h1><p class="sub" style="margin:0">Отгрузки с оплатой по номеру документа.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn ghost" data-action="ship-export">Скачать Excel</button>
      <button data-action="open-shipment">Записать отгрузку</button>
    </div></div>
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      <span style="font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-right:2px">Логист:</span>
      <button class="btn sm ${!state.shipLogId ? "" : "ghost"}" data-action="ship-log" data-id="">Все</button>
      ${state.logistics.map((l) => `<button class="btn sm ${Number(state.shipLogId) === Number(l.id) ? "" : "ghost"}" data-action="ship-log" data-id="${l.id}">${esc(l.name)}</button>`).join("")}
    </div>
    ${sHas ? `<div style="margin-bottom:12px"><button class="btn ghost" data-action="ship-clear">Сбросить фильтры</button></div>` : ""}
    <div class="tbl-wrap"><table class="table">
      <thead>
        <tr><th>Номер документа</th><th>Фура</th><th>Дата отправки</th><th>Дата прибытия</th><th>Логист</th><th>Инвойс (завод)</th><th>Товар</th><th>Разница</th><th>Куб</th><th>Стоимость</th><th>0.4%</th><th>Итого</th><th>Приём</th><th></th></tr>
        <tr style="background:var(--surface-2)">
          <th>${mfS("doc", "Документ", tDoc)}</th><th>${mfS("truck_no", "Фура", tNo)}</th><th></th><th></th>
          <th>${mfS("logistics", "Логист", tLog)}</th>
          <th>${mfS("pi", "PI", tPi)}</th><th></th><th></th><th></th><th></th><th></th>
          <th>${mfS("recv", "Приём", recvOpts)}</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="13"><div class="emptystate">Отгрузок пока нет.</div></td></tr>` : rows.slice().reverse().map((s) => {
          return `
          <tr>
            <td><b>${s.doc_number ? esc(s.doc_number) : '<span style="color:var(--danger)">— без номера —</span>'}</b></td>
            <td><b>${esc(s.truck_no || "—")}</b></td>
            <td>${fmtDate(s.date)}</td>
            <td style="color:var(--muted)">${s.arrival_date ? fmtDate(s.arrival_date) : "—"}</td>
            <td>${esc(s.logistics_name || "—")}</td>
            <td>${(()=>{const iv=invoiceCodes(s.logistics_id,s.lines);if(!iv.length)return "—";const c=v=>`<span style="background:var(--surface-2);border-radius:6px;padding:2px 7px;font-size:12px;color:var(--fg);display:inline-block;margin:2px 4px 2px 0">${esc(v)}</span>`;return iv.length<=2?iv.map(c).join(""):c(iv[0])+c(iv[1])+` <button type="button" class="btn link sm" style="font-size:12px" data-action="ship-invoices" data-id="${s.id}">все (${iv.length})</button>`;})()}</td>
            <td>${(()=>{const L=s.lines||[];const q=it=>`<span style="background:var(--surface-2);border-radius:6px;padding:2px 7px;font-size:12px;color:var(--fg);display:inline-block;margin:2px 4px 2px 0">${esc(it.model_name||it.model_id||"")}×${fmtNum(it.qty)}</span>`;if(!L.length)return "—";return L.length<=2?L.map(q).join(""):L.slice(0,2).map(q).join("")+` <button type="button" class="btn link sm" style="font-size:12px" data-action="ship-goods" data-id="${s.id}">все (${L.length})</button>`;})()}</td>
            <td>${(()=>{const D=shipDiffLabels(s,dctx);if(!D.length)return "<span style=\"color:var(--muted)\">—</span>";return D.map((d)=>{const col=d.label[0]==="+"?"#065f46":d.label==="0"?"var(--muted)":"#b45309";return `<span style="background:var(--surface-2);border-radius:6px;padding:2px 7px;font-size:12px;color:${col};display:inline-block;margin:2px 4px 2px 0">${esc(d.model)}: ${d.label}</span>`;}).join("");})()}</td>
            <td style="color:var(--muted)">${fmtCbm(linesCbm(s.lines))}</td>
            <td>${fmtNum(s.cost_amount)} ${esc(s.cost_currency)}</td>
            <td>${s.extra_fee ? `${fmtNum(s.extra_fee)}` : "—"}</td>
            <td><b>${fmtNum(s.total_cost)} ${esc(s.cost_currency)}</b>${(s.damage_amount || s.demurrage_days) ? `<div style="color:var(--muted);font-size:11px">штраф −${fmtNum(s.damage_amount || 0)} · простой +${fmtNum((Number(s.demurrage_days)||0)*(Number(s.demurrage_rate)||0))}</div>` : ""}</td>
            <td>${s.receipt_status === "received" ? (s.damaged ? '<span style="color:var(--danger);font-weight:600">прибыл, повреждён</span>' : '<span style="color:#065f46;font-weight:600">прибыл</span>') : '<span style="color:#b45309;font-weight:600">не прибыл</span>'}</td>
            <td style="white-space:nowrap">
              <button class="btn link sm" title="Изменить" data-action="edit-shipment" data-id="${s.id}">✎</button>
              <button class="btn link sm" title="Отметить приём (поступление)" data-action="receive-shipment" data-id="${s.id}">${ICON_RECV}</button>
              <button class="btn link sm" title="Документы партии" data-action="docs-shipment" data-id="${s.id}">${ICON_DOC}</button>
              <button class="btn link danger sm" title="Удалить" data-action="del-shipment" data-id="${s.id}">${TRASH}</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>`;
}

function viewFinance() {
  let groups = state.finance;
  if (state.finLogId) groups = groups.filter((g) => Number(g.logistics_id) === Number(state.finLogId));
  const totalPaidAll = groups.reduce((a, g) => a + (g.total_paid || 0), 0);
  const totalDebtAll = groups.reduce((a, g) => a + (g.rows || []).reduce((b, r) => b + (r.debt || 0), 0), 0);
  const selDocs = state.bulkSel ? [...state.bulkSel] : [];
  const selRows = selDocs.length ? groups.flatMap((g) => (g.rows || [])).filter((r) => selDocs.includes(String(r.doc_number))) : [];
  const selDebt = selRows.reduce((a, r) => a + (r.debt || 0), 0);
  const finF = state.finCol || {};
  if (finF.doc || finF.truck || finF.inv) groups = groups.map((gg) => ({ ...gg, rows: (gg.rows || []).filter(rr => (!finF.doc || String(rr.doc_number || "") === finF.doc) && (!finF.truck || String(rr.truck_no || "") === finF.truck) && (!finF.inv || invoiceCodes(gg.logistics_id, rr.lines).includes(finF.inv))) })).filter(gg => (gg.rows || []).length);
  return `
    <div class="toolbar"><div><h1>Финансы</h1><p class="sub" style="margin:0">Прибывшие грузы (после приёмки в «Граница → Ташкент»). Срок оплаты — 30 дней с даты приёмки.</p></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="font-size:13px;color:var(--muted)">Оплачено: <b style="color:var(--brand)">${fmtNum(totalPaidAll)}</b> · Долг: <b style="color:var(--danger)">${fmtNum(totalDebtAll)}</b></span>
      ${finF.doc || finF.truck || finF.inv ? `<button class="btn ghost sm" data-action="fin-filter-clear">Сбросить фильтры</button>` : ""}
      <button class="btn ghost sm" data-action="fin-export">Скачать Excel</button>
      ${selRows.length ? `<span style="font-size:13px;color:var(--muted)">Выбрано: <b style="color:var(--fg)">${selRows.length}</b> · долг <b style="color:var(--brand)">${fmtNum(selDebt)}</b></span><button class="btn ghost sm" data-action="bulk-clear">Снять</button><button class="btn sm" data-action="bulk-pay">Оплатить выбранное (${selRows.length})</button>` : `<button class="btn ghost sm" disabled title="Сначала отметьте фуры галочками слева от таблицы">Оплата разом</button>`}
    </div></div>
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      <span style="font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-right:2px">Логист:</span>
      <button class="btn sm ${!state.finLogId ? "" : "ghost"}" data-action="fin-log" data-id="">Все</button>
      ${state.logistics.map((l) => `<button class="btn sm ${Number(state.finLogId) === Number(l.id) ? "" : "ghost"}" data-action="fin-log" data-id="${l.id}">${esc(l.name)}</button>`).join("")}
    </div>
    ${groups.length === 0 ? `<div class="emptystate">Нет прибывших фур. Заполните приёмку в «Граница → Ташкент».</div>` : groups.map((g) => `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
          <h2 style="margin:0">${esc(g.logistics_name)}</h2>
          <div style="font-size:15px">Оплачено: <b style="color:var(--brand)">${fmtNum(g.total_paid)}</b> · Долг: <b style="color:var(--danger)">${fmtNum(g.rows.reduce((a, r) => a + (r.debt || 0), 0))}</b></div>
        </div>
        <div class="tbl-wrap"><table class="table" style="font-size:13px">
          <thead>
            <tr><th></th><th>Номер документа</th><th>Фура</th><th>Дата прибытия</th><th>Инвойс (завод)</th><th>Товар</th><th>Итого</th><th>Оплачено</th><th>Долг</th><th>Дней до оплаты</th><th>История оплат</th><th></th></tr>
            <tr style="background:var(--surface-2)">
              <th></th>
              <th>${finSel("doc", g.logistics_id, g.rows)}</th>
              <th>${finSel("truck", g.logistics_id, g.rows)}</th>
              <th></th>
              <th>${finSel("inv", g.logistics_id, g.rows)}</th>
              <th></th><th></th><th></th><th></th><th></th><th></th><th></th>
            </tr>
          </thead>
          <tbody>
            ${g.rows.slice().reverse().map((r) => `
              <tr>
                <td><input type="checkbox" class="bpick" data-doc="${esc(r.doc_number)}" ${r.has_doc ? "" : "disabled"} ${state.bulkSel.has(String(r.doc_number)) ? "checked" : ""}></td>
                <td><b>${r.doc_number ? esc(r.doc_number) : '<span style="color:var(--danger)">— без номера —</span>'}</b></td>
                <td><b>${esc(r.truck_no || "—")}</b></td>
                <td>${fmtDate(r.arrival_date)}</td>
                <td>${(()=>{const iv=invoiceCodes(g.logistics_id,r.lines);return iv.length?iv.slice(0,2).map(v=>`<span style="background:var(--surface-2);border-radius:6px;padding:2px 7px;font-size:12px;display:inline-block;margin:2px 2px 2px 0">${esc(v)}</span>`).join(""):"—";})()}</td>
                <td>${(()=>{const L=r.lines||[];const q=it=>`<span style="background:var(--surface-2);border-radius:6px;padding:2px 7px;font-size:12px;color:var(--fg);display:inline-block;margin:2px 2px 2px 0">${esc(it.model_name||"")}×${fmtNum(it.qty)}</span>`;return L.length<=2?L.map(q).join("")||"—":L.slice(0,2).map(q).join("")+` <button type="button" class="btn link sm" style="font-size:12px" data-action="ship-goods" data-id="${r.shipment_id}">все (${L.length})</button>`;})()}</td>
                <td>${fmtNum(r.total)} ${esc(r.currency || "")}</td>
                <td><b>${fmtNum(r.paid)}</b></td>
                <td><b style="color:var(--brand)">${fmtNum(r.debt)}</b></td>
                <td>${dueCell(r)}</td>
                <td style="color:var(--muted)">${r.payments.map((p) => `${fmtNum(p.amount)} (${fmtDate(p.date)})`).join(", ") || "—"}</td>
                <td style="white-space:nowrap">
                  <button class="btn link sm" title="Документы партии" data-action="docs-shipment" data-id="${r.shipment_id}">${ICON_DOC}</button>
                  ${r.has_doc ? `<button class="btn link sm" data-action="pay-doc" data-doc="${esc(r.doc_number)}">Оплатить</button>` : `<span style="color:var(--muted);font-size:11px">добавьте № документа ✎</span>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table></div>
      </div>`).join("")}`;
}

function sumTrucks(r) {
  return (state.trucks || []).filter((t) =>
    Number(t.logistics_id) === Number(r.logistics_id) &&
    String(t.invoice_no || "") === String(r.invoice_no) &&
    (t.lines || []).some((li) => Number(li.model_id) === Number(r.model_id)));
}
function openShipTrucks(r) {
  const sts = r.ship_trucks || [];
  if (!sts.length) { toast("Отгрузок по этой позиции не найдено.", false); return; }
  const rows = sts.map((st) => {
    const ship = (state.shipments || []).find((s) => Number(s.logistics_id) === Number(r.logistics_id) && String(s.truck_no || "") === String(st.truck_no));
    const ln = ship && (ship.lines || []).find((l) => Number(l.model_id) === Number(r.model_id));
    return { truck_no: st.truck_no, qty: st.qty, date: ship ? ship.date : "", order_no: ln ? ln.order_no : "" };
  });
  const overlay = openModal(`
    <h3>Забрали в Ташкент: ${esc(r.model_name)} · инвойс ${esc(r.invoice_no || "—")}</h3>
    <p class="sub" style="margin:6px 0 0">Фуры (отгрузки из «Граница → Ташкент»), которыми вывезли товар.</p>
    <div style="margin-top:12px">${rows.slice().reverse().map((t) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)"><span><b>${esc(t.truck_no || "—")}</b> · ${fmtDate(t.date)} · Order ${esc(t.order_no || "—")}</span><span style="color:var(--muted)">${fmtNum(t.qty)} шт</span></div>`).join("")}</div>
    <div class="actions" style="margin-top:14px"><button type="button" class="btn ghost" data-close>Закрыть</button></div>`);
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}
function editSumRow(r) { const t = sumTrucks(r)[0]; if (t) openTruck(t); else toast("Загрузка не найдена.", false); }
async function delSumRow(r) {
  const ts = sumTrucks(r);
  if (!ts.length) { toast("Загрузка не найдена.", false); return; }
  if (!confirmBox(`Удалить загрузку по инвойсу ${r.invoice_no || "—"} для модели ${r.model_name}? Остатки пересчитаются.`)) return;
  toast("Удаляю…");
  for (const t of ts) await api("/api/trucks/" + t.id, { method: "DELETE" });
  toast("Загрузка удалена");
  await loadAll(); render();
}

function openShipmentGoods(id) {
  const s = state.shipments.find((x) => Number(x.id) === Number(id));
  if (!s) return;
  const rowsArr = s.lines || [];
  const totalCbm = linesCbm(rowsArr);
  const overlay = openModal(`
    <h3>Товар фуры ${esc(s.truck_no || "")}${s.doc_number ? ` · № ${esc(s.doc_number)}` : ""}</h3>
    <p class="sub" style="margin:6px 0 0">${esc(s.logistics_name || "")} · отправка ${fmtDate(s.date)}${s.arrival_date ? ` · прибытие ${fmtDate(s.arrival_date)}` : ""} · куб <b>${fmtCbm(totalCbm)}</b></p>
    <div class="tbl-wrap" style="margin-top:12px"><table class="table" style="font-size:13px">
      <thead><tr><th>Order №</th><th>Модель</th><th>Кол-во</th><th>Куб</th></tr></thead>
      <tbody>${rowsArr.length === 0 ? `<tr><td colspan="4"><div class="emptystate" style="padding:10px">Нет позиций.</div></td></tr>` : rowsArr.map((li) => {
        const m = state.models.find((x) => Number(x.id) === Number(li.model_id));
        const c = (Number(li.qty) || 0) * (m ? (Number(m.cbm_per_pc) || 0) : 0);
        return `<tr><td>${esc(li.order_no || "—")}</td><td><b>${esc(m ? m.model : li.model_id)}</b></td><td>${fmtNum(li.qty)}</td><td style="color:var(--muted)">${fmtCbm(c)}</td></tr>`;
      }).join("")}</tbody>
      <tfoot><tr style="font-weight:700;background:var(--surface-2)"><td>Итого</td><td></td><td>${fmtNum(rowsArr.reduce((a, l) => a + (Number(l.qty) || 0), 0))}</td><td>${fmtCbm(totalCbm)}</td></tr></tfoot>
    </table></div>
    <div class="actions" style="margin-top:12px"><button type="button" class="btn ghost" id="sg-dl">Скачать Excel</button><button type="button" class="btn ghost" data-close>Закрыть</button></div>`, "modal-wide");
  overlay.querySelector("#sg-dl").addEventListener("click", () => exportShipmentGoods(s));
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

function openDocs(id) {
  const s = state.shipments.find((x) => Number(x.id) === Number(id));
  if (!s) return;
  const fr = (state.finance || []).flatMap((g) => (g.rows || [])).find((r) => Number(r.shipment_id) === Number(id));
  const docs = [];
  if (s.receipt_file) docs.push({ label: "Приём груза (документ прибытия)", name: s.receipt_file, act: { kind: "shipdoc", which: "receipt", pid: s.id } });
  if (s.damage_file) docs.push({ label: "Фото повреждённого товара", name: s.damage_file, act: { kind: "shipdoc", which: "damage", pid: s.id } });
  if (s.payment_status === "paid" && s.payment_file) docs.push({ label: `Отметка об оплате фуры${s.payment_date ? ` (${fmtDate(s.payment_date)})` : ""}`, name: s.payment_file, act: { kind: "shipdoc", which: "payment", pid: s.id } });
  (fr && fr.payments ? fr.payments : []).forEach((p, i) => {
    if (p.file_name) docs.push({ label: `Платёж ${i + 1} — ${fmtNum(p.amount)} ${p.currency || ""} (${fmtDate(p.date)})`, name: p.file_name, act: { kind: "payment", pid: p.id } });
  });
  const list = docs.length === 0
    ? `<div class="emptystate" style="padding:14px 0">Документов по этой партии пока нет.</div>`
    : `<div style="display:flex;flex-direction:column">${docs.map((d) => `
        <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
          <span style="flex:0 0 240px;color:var(--muted);font-size:13px">${esc(d.label)}</span>
          ${fileLink(d.name, "Открыть")}
          <button type="button" class="btn link danger sm" data-del-doc data-kind="${d.act.kind}" data-which="${d.act.which || ""}" data-pid="${d.act.pid}" title="Удалить документ">${TRASH}</button>
        </div>`).join("")}</div>`;
  const overlay = openModal(`
    <h3>Документы партии${s.doc_number ? ` № ${esc(s.doc_number)}` : ""}</h3>
    <p class="sub" style="margin:6px 0 0">Фура ${esc(s.truck_no || "—")} · ${esc(s.logistics_name || "—")} · отправка ${fmtDate(s.date)}</p>
    <div style="margin-top:10px">${list}</div>
    <div class="actions" style="margin-top:14px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>Закрыть</button></div>`);
  overlay.querySelectorAll("[data-del-doc]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const kind = btn.getAttribute("data-kind");
      const which = btn.getAttribute("data-which");
      const pid = btn.getAttribute("data-pid");
      if (!confirmBox(kind === "payment" ? "Удалить этот платёж вместе с документом? Оплата пересчитается." : "Удалить этот документ?")) return;
      const r = kind === "payment"
        ? await api("/api/payments/" + pid, { method: "DELETE" })
        : await api("/api/shipments/" + pid + "/doc/remove", { method: "POST", body: { which } });
      if (r.data.ok) {
        toast(kind === "payment" ? "Платёж удалён — долг пересчитан" : "Документ удалён");
        await Promise.all([loadShipments(), loadFinance()]);
        render();
        openDocs(id);
      } else toast(r.data.error || "Ошибка", false);
    });
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

function openPayDoc(docNumber, shipmentId) {
  const ship = shipmentId ? state.shipments.find((s) => Number(s.id) === Number(shipmentId)) : null;
  if (ship && ship.receipt_status !== "received") {
    toast("Приём фуры не сделан — оплатить нельзя. Сначала отметьте приём.", false);
    return;
  }
  const hasDoc = !!(docNumber || (ship && ship.doc_number));
  const docVal = docNumber || (ship && ship.doc_number) || "";
  if (!hasDoc && !docVal) {
    toast("Сначала добавьте номер документа у фуры (✎)", false);
    return;
  }
  // Оплата без заполненного поля «0.4%» не проводится.
  const docShips = state.shipments.filter((x) => String(x.doc_number || "") === String(docVal));
  if (docShips.some((x) => !hasExtraFee(x))) {
    toast("Чтобы оплатить, сначала заполните 0.4% (добавить к стоимости, $) у фуры: «✎» → поле «0.4%». Оплата без 0.4% не проводится.", false);
    return;
  }
  const fr = (state.finance || []).flatMap((g) => (g.rows || [])).find((r) => String(r.doc_number) === String(docVal) && (ship ? Number(r.shipment_id) === Number(ship.id) : true));
  const paidList = fr && fr.payments && fr.payments.length ? `
    <div class="card" style="margin-bottom:12px;padding:10px 14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px">Уже оплачено по этому документу: ${fmtNum(fr.paid)} ${esc(fr.currency || "")}</div>
      ${fr.payments.map((p) => `
        <div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-top:1px solid var(--border)">
          <span style="flex:0 0 220px;font-size:13px">${fmtNum(p.amount)} ${esc(p.currency || "")} · ${fmtDate(p.date)}</span>
          ${fileLink(p.file_name, "Документ")}
          <button type="button" class="btn link danger sm" data-del-pay data-pid="${p.id}" title="Удалить оплату и файл">${TRASH}</button>
        </div>`).join("")}
    </div>` : "";
  const overlay = openModal(`
    <h3>Оплата по документу № ${esc(docVal)}</h3>
    <p class="sub" style="margin:6px 0 0">Фура: ${esc((ship && ship.truck_no) || "—")}</p>
    ${paidList}
    <form id="payDocForm" class="form" style="margin-top:14px">
      <div class="grid2">
        <div><label>Сумма *</label><input id="ph_amount" type="number" min="0" step="any" required /></div>
        <div><label>Валюта</label><select id="ph_currency">${CURRENCIES.map((c) => `<option>${c}</option>`).join("")}</select></div>
      </div>
      <div><label>Дата оплаты</label><input id="ph_date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <div><label>Документ об оплате (файл) *</label><input type="file" id="phFile" required /></div>
      <div id="phError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить оплату</button></div>
    </form>`);
  const form = overlay.querySelector("#payDocForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = form.querySelector("#phFile").files[0];
    if (!file) { form.querySelector("#phError").textContent = "При оплате нужен документ — загрузите файл"; return; }
    const amt = Number(form.querySelector("#ph_amount").value);
    if (!amt || amt <= 0) { form.querySelector("#phError").textContent = "Укажите сумму"; return; }
    const up = await uploadFile(file);
    if (!up.ok) { form.querySelector("#phError").textContent = up.error || "Ошибка файла"; return; }
    const r = await api("/api/payments", { method: "POST", body: { doc_number: docVal, amount: amt, currency: form.querySelector("#ph_currency").value, date: form.querySelector("#ph_date").value, file_name: up.file_name } });
    if (r.data.ok) { overlay.remove(); toast("Оплата добавлена"); await loadFinance(); render(); }
    else form.querySelector("#phError").textContent = r.data.error || "Ошибка";
  });
  overlay.querySelectorAll("[data-del-pay]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirmBox("Удалить этот платёж вместе с документом? Долг пересчитается.")) return;
      const r = await api("/api/payments/" + btn.getAttribute("data-pid"), { method: "DELETE" });
      if (r.data.ok) { overlay.remove(); toast("Платёж удалён — долг пересчитан"); await loadFinance(); render(); }
      else toast(r.data.error || "Ошибка", false);
    });
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

function exportSummaryXlsx() {
  const rows = state.sumRows || [];
  const n = (v, dec) => { const x = Number(v); return Number.isFinite(x) ? (dec != null ? +x.toFixed(dec) : x) : null; };
  const head = ["Order №", "Модель", "Категория", "Логист", "Завод", "Инвойс", "Пришло", "Дата забора", "Отгружено", "Остаток", "Общий куб", "Дней", "Статус"];
  const data = [head];
  rows.slice().reverse().forEach((r) => {
    data.push([
      r.order_no || "", r.model_name || "", r.category || "", r.logistics_name || "", r.factory_name || "", r.invoice_no || "",
      n(r.received), xlDate(r.pickup_date), n(r.shipped), n(r.qty),
      n((Number(r.qty) || 0) * (Number(r.cbm_per_pc) || 0), 2), n(r.days_sitting), r.shipment_status || "",
    ]);
  });
  data.push(["ИТОГО", "", "", "", "", "",
    n(rows.reduce((a, r) => a + (Number(r.received) || 0), 0)), "",
    n(rows.reduce((a, r) => a + (Number(r.shipped) || 0), 0)),
    n(rows.reduce((a, r) => a + (Number(r.qty) || 0), 0)),
    n(rows.reduce((a, r) => a + ((Number(r.qty) || 0) * (Number(r.cbm_per_pc) || 0)), 0), 2), "", ""]);
  const tr = [["Модель", "Инвойс", "Фура", "Кол-во", "Тип"]];
  rows.forEach((r) => {
    (r.load_trucks || []).forEach((t) => tr.push([r.model_name, r.invoice_no, t.truck_no, n(t.qty), "загрузка"]));
    (r.ship_trucks || []).forEach((t) => tr.push([r.model_name, r.invoice_no, t.truck_no, n(t.qty), "отгрузка"]));
  });
  downloadXlsx("svodka_zavod-granica", [
    { name: "Завод-Граница", rows: data, widths: [10, 14, 14, 14, 14, 14, 9, 12, 10, 10, 10, 8, 12] },
    { name: "Фуры", rows: tr, widths: [16, 16, 14, 10, 10] },
  ]);
}

function exportShipmentsXlsx() {
  let rows = (state.shipments || []);
  if (state.finLogId) rows = rows.filter((x) => Number(x.logistics_id) === Number(state.finLogId));
  const SF = state.shipFilters || {};
  if ((SF.truck_no || []).length) rows = rows.filter((x) => SF.truck_no.includes(x.truck_no));
  if ((SF.logistics || []).length) rows = rows.filter((x) => SF.logistics.includes(x.logistics_name || ""));
  if ((SF.doc || []).length) rows = rows.filter((x) => SF.doc.includes(String(x.doc_number)));
  const n = (v, dec) => { const z = Number(v); return Number.isFinite(z) ? (dec != null ? +z.toFixed(dec) : z) : null; };
  const dctx = shipDiffCtx();
  const head = ["Номер документа", "Фура", "Дата отправки", "Дата прибытия", "Логист", "Инвойс (завод)", "Модели", "Куб", "Разница", "Стоимость", "0.4%", "Итого", "Приём"];
  const data = [head];
  rows.slice().reverse().forEach((s) => {
    const iv = invoiceCodes(s.logistics_id, s.lines).join(", ");
    const modelStr = (s.lines || []).map((l) => ((l.model_name || l.model_id || "") + " × " + l.qty)).join("; ");
    const diffStr = shipDiffLabels(s, dctx).map((l) => l.label + " " + l.model).join("; ");
    data.push([
      s.doc_number || "", s.truck_no || "", xlDate(s.date), s.arrival_date ? xlDate(s.arrival_date) : null,
      s.logistics_name || "", iv || "—", modelStr || "—", n(linesCbm(s.lines), 2), diffStr || "—",
      n(s.cost_amount), s.extra_fee ? n(s.extra_fee) : null, n(s.total_cost),
      s.receipt_status === "received" ? (s.damaged ? "прибыл, повреждён" : "прибыл") : "не прибыл",
    ]);
  });
  const det = [["Логист", "Номер документа", "Фура", "Order №", "Модель", "Кол-во", "Разница", "Куб"]];
  rows.forEach((s) => (s.lines || []).forEach((li) => {
    const m = state.models.find((x) => Number(x.id) === Number(li.model_id));
    const cbm = m ? Number(m.cbm_per_pc) || 0 : 0;
    const q = Number(li.qty) || 0;
    const dl = (shipDiffLabels(s, dctx) || []).filter((x) => Number(x.mid) === Number(li.model_id))[0];
    const lbl = dl ? dl.label : "";
    det.push([s.logistics_name || "", s.doc_number || "", s.truck_no || "", li.order_no || "", m ? m.model : String(li.model_id), q, lbl === null ? "" : lbl, +(q * cbm).toFixed(3)]);
  }));
  downloadXlsx("granica_tashkent_otgruzki", [
    { name: "Отгрузки", rows: data, widths: [16, 12, 12, 12, 14, 20, 32, 10, 16, 12, 10, 12, 14] },
    { name: "По моделям", rows: det, widths: [14, 16, 12, 10, 16, 10, 10, 10] },
  ]);
}

function exportShipmentGoods(s) {
  const rows = [["Order №", "Модель", "Кол-во", "Куб, м³", "CBM/шт"]];
  let qty = 0, cub = 0;
  (s.lines || []).forEach((li) => {
    const m = state.models.find((x) => Number(x.id) === Number(li.model_id));
    const cbmPc = m ? Number(m.cbm_per_pc) || 0 : 0;
    const q = Number(li.qty) || 0;
    qty += q; cub += q * cbmPc;
    rows.push([li.order_no || "", m ? m.model : String(li.model_id), q, +(q * cbmPc).toFixed(3), cbmPc || null]);
  });
  rows.push(["ИТОГО", "", qty, +cub.toFixed(3), ""]);
  downloadXlsx("товар_фуры_" + ((s.truck_no || s.id) + "").replace(/[^\wа-яёА-ЯЁ-]+/gi, "_"), [{ name: "Товар фуры", rows, widths: [10, 18, 10, 12, 10] }]);
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
  try { return await res.json(); } catch { return { ok: false, error: "Ошибка загрузки файла" }; }
}

function openBulkPay() {
  if (!state.bulkSel || state.bulkSel.size === 0) { toast("Сначала отметьте фуры галочками", false); return; }
  const docs = [...state.bulkSel];
  const rows = (state.finance || []).flatMap((g) => (g.rows || [])).filter((r) => docs.includes(String(r.doc_number)));
  const total = rows.reduce((a, r) => a + (r.debt || 0), 0);
  if (rows.length === 0) { toast("Выбранные фуры не найдены", false); return; }
  const overlay = openModal(`
    <h3>Оплатить разом: ${rows.length} фур</h3>
    <div class="card" style="margin:12px 0;padding:10px 14px">
      ${rows.slice().reverse().map((r) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid var(--border)"><span>${esc(r.doc_number || "—")} · ${esc(r.truck_no || "—")}</span><span style="color:var(--muted)">долг ${fmtNum(r.debt)}</span></div>`).join("")}
      <div style="display:flex;justify-content:space-between;font-weight:700;padding-top:6px"><span>Итого долг</span><span>${fmtNum(total)}</span></div>
    </div>
    <form id="bulkPayForm" class="form">
      <div class="grid2">
        <div><label>Сумма оплаты *</label><input id="bp_amount" type="number" min="0" step="any" value="${total || ""}" required /></div>
        <div><label>Валюта</label><select id="bp_currency">${CURRENCIES.map((c) => `<option>${c}</option>`).join("")}</select></div>
      </div>
      <div><label>Дата оплаты</label><input id="bp_date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <div><label>Документ об оплате (файл) *</label><input type="file" id="bpFile" required /></div>
      <div id="bpError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Оплатить ${rows.length} фур</button></div>
    </form>`, "modal-wide");
  const form = overlay.querySelector("#bulkPayForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = form.querySelector("#bpFile").files[0];
    if (!file) { form.querySelector("#bpError").textContent = "Загрузите документ об оплате"; return; }
    const amt = Number(form.querySelector("#bp_amount").value);
    if (!amt || amt <= 0) { form.querySelector("#bpError").textContent = "Укажите сумму"; return; }
    const up = await uploadFile(file);
    if (!up.ok) { form.querySelector("#bpError").textContent = up.error || "Ошибка файла"; return; }
    const r = await api("/api/payments/bulk", { method: "POST", body: { doc_numbers: docs, amount: amt, currency: form.querySelector("#bp_currency").value, date: form.querySelector("#bp_date").value, file_name: up.file_name } });
    if (r.data.ok) {
      overlay.remove();
      state.bulkSel = new Set();
      toast("Оплачено фур: " + r.data.count);
      await loadFinance(); render();
    } else form.querySelector("#bpError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

function openPay(id) {
  const s = state.shipments.find((x) => Number(x.id) === Number(id));
  if (!s) return;
  // Уже отмечено — показываем сохранённую информацию, а не пустую форму.
  if (s.payment_status === "paid") {
    const overlay = openModal(`
      <h3>Оплата фуры ${esc(s.truck_no || "")}</h3>
      <div class="card" style="margin-top:12px;padding:12px 16px">
        <div style="color:#065f46;font-weight:600;margin-bottom:8px">✓ Оплата уже отмечена${s.payment_date ? ` · ${fmtDate(s.payment_date)}` : ""}</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${fileLink(s.payment_file, "Открыть документ об оплате")}</div>
      </div>
      <div class="actions" style="margin-top:14px"><button type="button" class="btn ghost" data-close>Закрыть</button></div>`);
    [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
    return;
  }
  if (!hasExtraFee(s)) {
    toast("Чтобы отметить оплату, сначала заполните 0.4% (добавить к стоимости, $) у фуры: «✎» → поле «0.4%». Оплата без 0.4% не проводится.", false);
    return;
  }
  const overlay = openModal(`
    <h3>Оплата фуры ${esc(s.truck_no || "")}</h3>
    <form id="payForm" class="form" style="margin-top:14px">
      <div><label>Файл подтверждения оплаты *</label><input type="file" id="payFile" required /></div>
      <div id="payError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Отметить оплату</button></div>
    </form>`);
  const form = overlay.querySelector("#payForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = form.querySelector("#payFile").files[0];
    if (!file) { form.querySelector("#payError").textContent = "Загрузите файл — без него оплату отметить нельзя"; return; }
    const up = await uploadFile(file);
    if (!up.ok) { form.querySelector("#payError").textContent = up.error || "Ошибка загрузки файла"; return; }
    const r = await api("/api/shipments/" + id + "/status", { method: "POST", body: { payment_status: "paid", file_name: up.file_name } });
    if (r.data.ok) { overlay.remove(); toast("Оплата отмечена"); await loadShipments(); render(); }
    else form.querySelector("#payError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

function openReceive(id) {
  const s = state.shipments.find((x) => Number(x.id) === Number(id));
  if (!s) return;
  const already = s.receipt_status === "received";
  const today = new Date().toISOString().slice(0, 10);
  const dmgPhotoHtml = already && s.damage_file
    ? `<div style="margin-bottom:10px">${fileLink(s.damage_file, "Фото повреждения")}</div><div><label>Заменить фото (необязательно)</label><input type="file" id="recvDmgFile" /></div>`
    : `<div><label>Фото повреждённого товара (если товар повреждён)</label><input type="file" id="recvDmgFile" /></div>`;
  const overlay = openModal(`
    <h3>${already ? "Приём груза (уже отмечен): " : "Приём груза: "}фура ${esc(s.truck_no || "")}</h3>
    <form id="recvForm" class="form" style="margin-top:14px">
      <div style="color:var(--muted);font-size:12px;margin-bottom:10px">Документ для приёмки не обязателен.</div>
      <div><label>Дата прибытия</label><input type="date" id="recvDate" value="${already ? esc(s.arrival_date || today) : today}" ${already ? "" : "disabled"} /></div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><label style="margin:0">Прибыл не сегодня (изменить дату)</label><input id="recvNotToday" type="checkbox" style="width:auto" ${already ? "checked" : ""} /></div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><label style="margin:0">Товар повреждён</label><input id="recvDamaged" type="checkbox" style="width:auto" ${already && s.damaged ? "checked" : ""} /></div>
      <div style="margin-top:10px">${dmgPhotoHtml}</div>
      <div class="grid2">
        <div><label>Сумма штрафа за повреждение</label><input id="recvDamage" type="number" min="0" step="any" value="${already ? esc(s.damage_amount || 0) : "0"}" /></div>
        <div><label>Дней простоя (демередж)</label><input id="recvDays" type="number" min="0" value="${already ? esc(s.demurrage_days || 0) : "0"}" /></div>
      </div>
      <div><label>Штраф за 1 день простоя</label><input id="recvRate" type="number" min="0" step="any" value="${already ? esc(s.demurrage_rate || 0) : "0"}" /></div>
      <div id="recvError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>${already ? "Закрыть" : "Отмена"}</button><button type="submit">${already ? "Сохранить изменения" : "Отметить прибытие"}</button></div>
    </form>`);
  const form = overlay.querySelector("#recvForm");
  if (already) form.querySelector("#recvDate").disabled = false;
  form.querySelector("#recvNotToday").addEventListener("change", (e) => {
    form.querySelector("#recvDate").disabled = !e.target.checked;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dmg = form.querySelector("#recvDmgFile").files[0];
    const up = dmg ? await uploadFile(dmg) : null;
    if (dmg && !up.ok) { form.querySelector("#recvError").textContent = up.error || "Ошибка загрузки файла"; return; }
    const damaged = form.querySelector("#recvDamaged").checked;
    const body = {
      receipt_status: "received",
      file_name: "",
      damage_file: up ? up.file_name : (damaged ? (s.damage_file || "") : ""),
      arrival_date: form.querySelector("#recvDate").value,
      damaged,
      damage_amount: Number(String(form.querySelector("#recvDamage").value).replace(",", ".")) || 0,
      demurrage_days: Number(String(form.querySelector("#recvDays").value).replace(",", ".")) || 0,
      demurrage_rate: Number(String(form.querySelector("#recvRate").value).replace(",", ".")) || 0,
    };
    const r = await api("/api/shipments/" + id + "/status", { method: "POST", body });
    if (r.data.ok) { overlay.remove(); toast(already ? "Приём обновлён" : "Прибытие отмечено"); await loadShipments(); render(); }
    else form.querySelector("#recvError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

function openShipment(item) {
  const isAdmin = state.user.role === "admin";
  const editing = !!item;
  const logId = isAdmin ? "" : String(state.user.company_id);
  const logCmd = isAdmin
    ? `<select id="sh_logistic"><option value="">Выберите логиста</option>${state.logistics.map((l) => `<option value="${l.id}" ${editing && Number(l.id) === Number(item.logistics_id) ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>`
    : `<input value="${esc(state.user.company_name || "")}" disabled />`;
  const overlay = openModal(`
    <h3>${editing ? "Изменить отгрузку" : "Отгрузка в Узбекистан"}</h3>
    <form id="shipmentForm" class="form" style="margin-top:14px">
      ${isAdmin ? `<div><label>Логист</label>${logCmd}</div>` : `<div><label>Логист</label>${logCmd}<input type="hidden" id="sh_logistic" value="${logId}" /></div>`}
      <div class="grid2">
        <div><label>Дата отправки</label><input id="sh_date" type="date" value="${editing ? esc(item.date) : new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Номер фуры</label><input id="sh_truck" value="${editing ? esc(item.truck_no || "") : ""}" /></div>
      </div>
      <div class="grid2">
        <div><label>Стоимость фуры</label><input id="sh_amount" type="number" min="0" step="any" value="${editing ? esc(item.cost_amount || "") : ""}" placeholder="5000" /></div>
        <div><label>Валюта</label><select id="sh_currency">${CURRENCIES.map((c) => `<option ${editing && c === item.cost_currency ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      </div>
      ${editing ? `
      <div class="grid2">
        <div><label>Номер документа (для оплаты)</label><input id="sh_doc" value="${esc(item.doc_number || "")}" placeholder="Добавите, когда фура выйдет на дорогу" /></div>
        <div><label>0.4% (добавить к стоимости, $)</label><input id="sh_extra" type="number" min="0" step="any" value="${esc(item.extra_fee || "")}" placeholder="0" /></div>
      </div>` : ""}
      <div>
        <label>Товар</label>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
          <button type="button" class="btn sm" id="shPickGoods">+ Выбрать товары</button>
          <span style="color:var(--muted);font-size:12px">Ордер и товар выбираются отдельно. Остаток пересчитывается автоматически — больше остатка ввести нельзя.</span>
        </div>
        <div id="sh_lines"></div>
      </div>
      <div id="shipmentError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">${editing ? "Сохранить" : "Сохранить отгрузку"}</button></div>
    </form>`, "modal-wide");
  const form = overlay.querySelector("#shipmentForm");
  const linesBox = form.querySelector("#sh_lines");
  const errBox = form.querySelector("#shipmentError");
  const shLogSel = form.querySelector("#sh_logistic");
  const keyOf = (o, m) => `${String(o)}__${Number(m)}`;
  if (isAdmin && shLogSel && !shLogSel.value && state.logistics.length > 0) {
    shLogSel.value = String(state.logistics[0].id);
  }
  let curLog = editing ? Number(item.logistics_id) : (isAdmin ? (shLogSel ? Number(shLogSel.value) : "") : Number(state.user.company_id));
  const excluded = editing ? Number(item.id) : null;
  // Остаток склада = загружено − отгружено ДРУГИМИ фурами (текущая фура ещё не учтена).
  function stock(logId) {
    if (!logId) return {};
    const loaded = {}, other = {};
    (state.trucks || []).filter((t) => Number(t.logistics_id) === Number(logId)).forEach((t) => {
      (t.lines || []).forEach((li) => { const k = keyOf(t.order_no, li.model_id); loaded[k] = (loaded[k] || 0) + (Number(li.qty) || 0); });
    });
    (state.shipments || []).filter((s) => Number(s.logistics_id) === Number(logId) && !(excluded && Number(s.id) === excluded)).forEach((s) => {
      (s.lines || []).forEach((li) => { const k = keyOf(li.order_no, li.model_id); other[k] = (other[k] || 0) + (Number(li.qty) || 0); });
    });
    const out = {};
    Object.keys(loaded).forEach((k) => { out[k] = (loaded[k] || 0) - (other[k] || 0); });
    return out;
  }
  function ordersOf(logId) {
    return [...new Set((state.trucks || []).filter((t) => Number(t.logistics_id) === Number(logId) && t.order_no).map((t) => String(t.order_no)))].sort((a, b) => a.localeCompare(b, "nu"));
  }
  let sel = []; // {ukey, order_no, model_id, model_name, qty, cbm_per_pc}
  function chooseQty(ukey) { return sel.reduce((a, x) => a + (Number(x.qty) || 0), 0); }
  function renderLines() {
    linesBox.innerHTML = "";
    const st = stock(curLog);
    sel.sort((a, b) => a.order_no.localeCompare(b.order_no, "nu") || a.model_name.localeCompare(b.model_name, "ru"));
    sel.forEach((x, i) => {
      const row = document.createElement("div");
      row.className = "line-row";
      row.setAttribute("data-ukey", x.ukey);
      row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap";
      row.innerHTML = `<b>${esc(x.order_no)}</b> <b style="font-weight:600">${esc(x.model_name)}</b>
        <input class="line-qty" type="number" min="0" step="any" value="${esc(x.qty)}" placeholder="Кол-во" style="width:110px" />
        <span class="left" style="color:var(--muted);font-size:12px"></span>
        <span class="cbm" style="color:var(--muted);font-size:12px"></span>
        <span class="over" style="display:none;color:#b45309;font-size:12px;font-weight:600">больше остатка → «Разница»</span>
        <button type="button" class="btn danger sm" data-del>×</button>`;
      const qIn = row.querySelector(".line-qty");
      qIn.addEventListener("input", () => { x.qty = Math.max(0, Number(qIn.value) || 0); refreshLefts(); });
      row.querySelector("[data-del]").addEventListener("click", () => { sel.splice(i, 1); renderLines(); });
      linesBox.appendChild(row);
    });
    refreshLefts();
    if (!sel.length) linesBox.innerHTML = `<div class="emptystate" style="padding:10px">Нажмите «Выбрать товары», чтобы добавить товар из заказа.</div>`;
  }
  function refreshLefts() {
    const st = stock(curLog);
    let bad = false;
    linesBox.querySelectorAll(".line-row").forEach((rowEl) => {
      const uk = rowEl.getAttribute("data-ukey");
      const q = Number(rowEl.querySelector(".line-qty").value) || 0;
      const left = (st[uk] || 0) - q;
      rowEl.querySelector(".left").textContent = "остаток: " + fmtNum(left);
      const it = sel.find((x) => x.ukey === uk) || {};
      rowEl.querySelector(".cbm").textContent = "куб: " + fmtCbm((q * (Number(it.cbm_per_pc) || 0)).toFixed(2));
      const over = left < 0;
      rowEl.querySelector(".over").style.display = over ? "" : "none";
      if (over) bad = true;
    });
    errBox.textContent = "";
  }
  function pickGoods() {
    const orders = ordersOf(curLog);
    if (!orders.length) { errBox.textContent = "У этого логиста нет заказов — сначала запишите загрузку."; return; }
    const st = stock(curLog);
    const pk = openModal(`
      <h3>Выбрать товары из заказов</h3>
      <p class="sub" style="margin:4px 0 0">Отметьте товары в разных заказах и нажмите «Добавить отмеченное» — всё добавится сразу.</p>
      <div id="pgList" style="max-height:360px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin-top:10px;background:var(--surface)"></div>
      <div id="pgErr" class="formerror"></div>
      <div class="actions" style="margin-top:12px"><button type="button" class="btn ghost" data-close>Отмена</button><button type="button" class="btn" id="pgAdd">Добавить отмеченное</button></div>
    `, "modal-wide");
    const listEl = pk.querySelector("#pgList");
    const addBtn = pk.querySelector("#pgAdd");
    const errEl = pk.querySelector("#pgErr");
    // Все заказы сразу, сгруппированные: Order № → товары.
    let html = "";
    orders.forEach((o) => {
      const items = Object.keys(st).filter((k) => k.startsWith(o + "__") && (st[k] || 0) > 0);
      if (!items.length) return;
      html += `<div style="font-weight:600;padding:8px 12px;background:var(--surface-2);border-bottom:1px solid var(--border)">Order № ${esc(o)}</div>`;
      html += `<table class="table" style="font-size:13px"><thead><tr><th></th><th>Модель</th><th>Инвойс (завод)</th><th>Остаток</th><th>Куб</th><th>Кол-во</th></tr></thead><tbody>`;
      html += items.map((k) => {
        const mid = k.split("__")[1];
        const m = state.models.find((x) => Number(x.id) === Number(mid));
        const already = sel.find((x) => x.ukey === k && Number(x.qty) > 0);
        const oInv = (state.trucks || []).find((x) => Number(x.logistics_id) === Number(curLog) && String(x.order_no || "") === String(o) && x.invoice_no);
        return `<tr data-k="${esc(k)}">
          <td><input type="checkbox" class="pg-chk" ${already ? "checked" : ""}></td>
          <td><b>${m ? esc(m.model) : mid}</b></td>
          <td style="color:var(--muted)">${oInv ? `<span style="background:var(--surface-2);border-radius:6px;padding:2px 7px;font-size:12px;display:inline-block">${esc(oInv.invoice_no)}</span>` : "—"}</td>
          <td style="color:var(--muted)">${fmtNum(st[k])}</td>
          <td style="color:var(--muted)">${fmtCbm(m ? m.cbm_per_pc : 0)}</td>
          <td><input type="number" min="0" step="any" class="pg-qty" value="${already ? esc(already.qty) : ""}" ${already ? "" : "disabled"} style="width:90px"></td>
        </tr>`;
      }).join("");
      html += `</tbody></table>`;
    });
    listEl.innerHTML = html || `<div class="emptystate" style="padding:14px">Доступных товаров нет.</div>`;
    listEl.querySelectorAll(".pg-chk").forEach((chk) => {
      chk.addEventListener("change", () => {
        const tr = chk.closest("tr");
        const q = tr.querySelector(".pg-qty");
        q.disabled = !chk.checked;
        if (!chk.checked) q.value = "";
      });
    });
    addBtn.addEventListener("click", () => {
      const byKey = new Map(sel.map((x) => [x.ukey, x]));
      const picks = [];
      let bad = false;
      listEl.querySelectorAll("tr[data-k]").forEach((tr) => {
        const chk = tr.querySelector(".pg-chk");
        if (!chk.checked) return;
        const k = tr.getAttribute("data-k");
        const q = Number(tr.querySelector(".pg-qty").value) || 0;
        if (q <= 0) return;
        if (q > (st[k] || 0)) { bad = true; errEl.textContent = `Нельзя больше ${fmtNum(st[k])} — остаток по этому товару.`; return; }
        const parts = k.split("__");
        const mid = parts[1];
        const m = state.models.find((x) => Number(x.id) === Number(mid));
        picks.push({ ukey: k, order_no: parts[0], model_id: Number(mid), model_name: m ? m.model : mid, qty: q, cbm_per_pc: m ? m.cbm_per_pc : 0 });
      });
      if (bad) return;
      if (!picks.length) { errEl.textContent = "Отметьте товар и укажите количество."; return; }
      picks.forEach((p) => byKey.set(p.ukey, p));
      sel = [...byKey.values()];
      pk.remove();
      renderLines();
    });
    [...pk.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => pk.remove()));
  }

  form.querySelector("#shPickGoods").addEventListener("click", pickGoods);
  if (shLogSel) shLogSel.addEventListener("change", () => {
    curLog = Number(shLogSel.value);
    sel = [];
    renderLines();
  });
  if (editing && item.lines && item.lines.length) {
    const st = stock(curLog);
    item.lines.forEach((li) => {
      const uk = keyOf(li.order_no, li.model_id);
      const m = state.models.find((x) => Number(x.id) === Number(li.model_id));
      sel.push({ ukey: uk, order_no: li.order_no || "", model_id: Number(li.model_id), model_name: m ? m.model : "", qty: Number(li.qty) || 0, cbm_per_pc: m ? m.cbm_per_pc : 0 });
    });
  }
  renderLines();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const st = stock(curLog);
  sel.forEach((x) => { const q = Number(x.qty) || 0; x.qty = q < 0 ? 0 : q; });
    // Превышение остатка РАЗРЕШЕНО: разница (+/−) попадёт в колонку «Разница».
    const lines = sel.filter((x) => (Number(x.qty) || 0) > 0).map((x) => ({ model_id: x.model_id, qty: Number(x.qty), order_no: x.order_no }));
    if (!lines.length) { errBox.textContent = "Добавьте хотя бы один товар."; return; }
    const body = {
      logistics_id: Number(form.querySelector("#sh_logistic").value),
      date: form.querySelector("#sh_date").value,
      // pi_number больше не заполняется,
      truck_no: form.querySelector("#sh_truck").value,
      cost_amount: Number(String(form.querySelector("#sh_amount").value).replace(",", ".")),
      cost_currency: form.querySelector("#sh_currency").value,
      doc_number: editing ? form.querySelector("#sh_doc").value : "",
      extra_fee: editing ? String(form.querySelector("#sh_extra").value).replace(",", ".") : "",
      lines,
    };
    const r = await api(editing ? "/api/shipments/" + item.id : "/api/shipments", { method: editing ? "PUT" : "POST", body });
    if (r.data.ok) { overlay.remove(); toast(editing ? "Отгрузка обновлена" : "Отгрузка записана"); await loadAll(); render(); }
    else errBox.textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

// ---------- models ----------
function viewModels() {
  const isAdmin = state.user.role === "admin";
  return `
    <div class="toolbar"><div><h1>Модели техники</h1><p class="sub" style="margin:0">Справочник моделей с объёмом (CBM/шт).</p></div>
    <div style="display:flex;gap:8px">
      ${isAdmin ? `<button class="btn ghost" data-action="seed">Загрузить из примера (Excel)</button>` : ""}
      ${isAdmin ? `<button data-action="open-model">Добавить модель</button>` : ""}
    </div></div>
    <div class="tbl-wrap"><table class="table">
      <thead><tr><th>Модель</th><th>Категория</th><th>CBM/шт</th><th>Примечание</th>${isAdmin ? "<th></th>" : ""}</tr></thead>
      <tbody>
        ${state.models.length === 0 ? `<tr><td colspan="5"><div class="emptystate">Моделей пока нет.</div></td></tr>` : state.models.map((m) => `<tr>
          <td><b>${esc(m.model)}</b></td>
          <td style="color:var(--muted)">${esc(m.category || "—")}</td>
          <td>${m.cbm_per_pc ? esc(m.cbm_per_pc) : "—"}</td>
          <td style="color:var(--muted)">${esc(m.notes || "—")}</td>
          ${isAdmin ? `<td style="text-align:right;white-space:nowrap"><button class="btn link sm" data-action="open-model" data-id="${m.id}">Изменить</button> <button class="btn link danger sm" data-action="del-model" data-id="${m.id}">${TRASH}</button></td>` : ""}
        </tr>`).join("")}
      </tbody>
    </table></div>`;
}
function openModel(id) {
  const m = id ? state.models.find((x) => Number(x.id) === Number(id)) : null;
  const overlay = openModal(`
    <h3>${m ? "Изменить модель" : "Добавить модель"}</h3>
    <form id="modelForm" class="form" style="margin-top:14px">
      <div><label>Модель *</label><input id="mo_model" value="${esc(m ? m.model : "")}" placeholder="Например: 8BS" /></div>
      <div class="grid2">
        <div><label>Категория</label><input id="mo_cat" value="${esc(m ? m.category : "")}" placeholder="Стиральная машина" /></div>
        <div><label>CBM за 1 шт *</label><input id="mo_cbm" type="text" inputmode="decimal" required value="${esc(m ? m.cbm_per_pc : "")}" placeholder="0.112685625" /></div>
      </div>
      <div><label>Примечание</label><textarea id="mo_notes" rows="2">${esc(m ? m.notes : "")}</textarea></div>
      <div id="modelError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить</button></div>
    </form>`);
  const form = overlay.querySelector("#modelForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { model: form.querySelector("#mo_model").value, category: form.querySelector("#mo_cat").value, cbm_per_pc: form.querySelector("#mo_cbm").value, notes: form.querySelector("#mo_notes").value };
    const r = await api(m ? "/api/models/" + m.id : "/api/models", { method: m ? "PUT" : "POST", body });
    if (r.data.ok) { overlay.remove(); toast("Сохранено"); await loadRefs(); render(); }
    else form.querySelector("#modelError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

// ---------- factories ----------
function viewFactories() {
  const isAdmin = state.user.role === "admin";
  return `
    <div class="toolbar"><div><h1>Заводы</h1><p class="sub" style="margin:0">Справочник заводов, откуда грузится товар.</p></div>
    ${isAdmin ? `<button data-action="open-factory">Добавить завод</button>` : ""}</div>
    <div class="grid2">
      ${state.factories.length === 0 ? `<div class="emptystate">Заводов пока нет.</div>` : state.factories.map((f) => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:10px">
            <div><b>${esc(f.name)}</b><div style="color:var(--muted);font-size:13px">${esc(f.location || "—")}</div></div>
            ${isAdmin ? `<div style="display:flex;gap:8px;flex-shrink:0"><button class="btn link sm" data-action="open-factory" data-id="${f.id}">Изменить</button><button class="btn link danger sm" data-action="del-factory" data-id="${f.id}">${TRASH}</button></div>` : ""}
          </div>
          ${(f.contact_name || f.contact_phone) ? `<div style="margin-top:10px;color:var(--muted);font-size:13px">${f.contact_name ? "Контакт: " + esc(f.contact_name) + "<br/>" : ""}${f.contact_phone ? "Телефон: " + esc(f.contact_phone) : ""}</div>` : ""}
        </div>`).join("")}
    </div>`;
}
function openFactory(id) {
  const f = id ? state.factories.find((x) => Number(x.id) === Number(id)) : null;
  const overlay = openModal(`
    <h3>${f ? "Изменить завод" : "Добавить завод"}</h3>
    <form id="factoryForm" class="form" style="margin-top:14px">
      <div><label>Название *</label><input id="fa_name" value="${esc(f ? f.name : "")}" placeholder="Например: Hangdi" /></div>
      <div class="grid2"><div><label>Расположение</label><input id="fa_loc" value="${esc(f ? f.location : "")}" /></div>
      <div><label>Контакт</label><input id="fa_person" value="${esc(f ? f.contact_name : "")}" /></div></div>
      <div class="grid2"><div><label>Телефон</label><input id="fa_phone" value="${esc(f ? f.contact_phone : "")}" /></div>
      <div><label>Примечание</label><input id="fa_notes" value="${esc(f ? f.notes : "")}" /></div></div>
      <div id="factoryError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить</button></div>
    </form>`);
  const form = overlay.querySelector("#factoryForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: form.querySelector("#fa_name").value, location: form.querySelector("#fa_loc").value, contact_name: form.querySelector("#fa_person").value, contact_phone: form.querySelector("#fa_phone").value, notes: form.querySelector("#fa_notes").value };
    const r = await api(f ? "/api/factories/" + f.id : "/api/factories", { method: f ? "PUT" : "POST", body });
    if (r.data.ok) { overlay.remove(); toast("Сохранено"); await loadRefs(); render(); }
    else form.querySelector("#factoryError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

// ---------- logistics ----------
function viewLogistics() {
  const isAdmin = state.user.role === "admin";
  return `
    <div class="toolbar"><div><h1>Логисты</h1><p class="sub" style="margin:0">Логистические компании.</p></div>
    ${isAdmin ? `<button data-action="open-logistic">Добавить логиста</button>` : ""}</div>
    <div class="grid2">
      ${state.logistics.length === 0 ? `<div class="emptystate">Логистов пока нет.</div>` : state.logistics.map((l) => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:10px">
            <div><b>${esc(l.name)}</b><div style="color:var(--muted);font-size:13px">${esc(l.city || "—")}</div></div>
            ${isAdmin ? `<div style="display:flex;gap:8px;flex-shrink:0"><button class="btn link sm" data-action="open-logistic" data-id="${l.id}">Изменить</button><button class="btn link danger sm" data-action="del-logistic" data-id="${l.id}">${TRASH}</button></div>` : ""}
          </div>
          ${(l.contact_name || l.contact_phone) ? `<div style="margin-top:10px;color:var(--muted);font-size:13px">${l.contact_name ? "Контакт: " + esc(l.contact_name) + "<br/>" : ""}${l.contact_phone ? "Телефон: " + esc(l.contact_phone) : ""}</div>` : ""}
        </div>`).join("")}
    </div>`;
}
function openLogistic(id) {
  const l = id ? state.logistics.find((x) => Number(x.id) === Number(id)) : null;
  const overlay = openModal(`
    <h3>${l ? "Изменить логиста" : "Добавить логиста"}</h3>
    <form id="logisticForm" class="form" style="margin-top:14px">
      <div><label>Название компании *</label><input id="lo_name" value="${esc(l ? l.name : "")}" /></div>
      <div class="grid2"><div><label>Город</label><input id="lo_city" value="${esc(l ? l.city : "")}" /></div>
      <div><label>Контакт</label><input id="lo_person" value="${esc(l ? l.contact_name : "")}" /></div></div>
      <div class="grid2"><div><label>Телефон</label><input id="lo_phone" value="${esc(l ? l.contact_phone : "")}" /></div>
      <div><label>Примечание</label><input id="lo_notes" value="${esc(l ? l.notes : "")}" /></div></div>
      <div id="logisticError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить</button></div>
    </form>`);
  const form = overlay.querySelector("#logisticForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: form.querySelector("#lo_name").value, city: form.querySelector("#lo_city").value, contact_name: form.querySelector("#lo_person").value, contact_phone: form.querySelector("#lo_phone").value, notes: form.querySelector("#lo_notes").value };
    const r = await api(l ? "/api/logistics/" + l.id : "/api/logistics", { method: l ? "PUT" : "POST", body });
    if (r.data.ok) { overlay.remove(); toast("Сохранено"); await loadRefs(); render(); }
    else form.querySelector("#logisticError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

// ---------- users ----------
function viewUsers() {
  if (state.user.role !== "admin") return `<div class="emptystate">Нет доступа.</div>`;
  return `
    <div class="toolbar"><div><h1>Пользователи</h1><p class="sub" style="margin:0">Аккаунты для логистов.</p></div>
    <button data-action="open-user">Добавить пользователя</button></div>
    <div class="tbl-wrap"><table class="table">
      <thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Компания</th><th>Статус</th><th></th></tr></thead>
      <tbody>
        ${state.users.length === 0 ? `<tr><td colspan="6"><div class="emptystate">Пользователей пока нет.</div></td></tr>` : state.users.map((u) => `<tr>
          <td><b>${esc(u.name)}</b>${Number(u.id) === state.user.id ? `<span style="color:var(--muted);font-size:12px"> (вы)</span>` : ""}</td>
          <td style="color:var(--muted)">${esc(u.username)}</td>
          <td>${esc(ROLES[u.role] || u.role)}</td>
          <td style="color:var(--muted)">${esc(u.company_name || "—")}</td>
          <td style="color:${Number(u.active) ? "var(--fg)" : "var(--muted)"}">${Number(u.active) ? "Активен" : "Отключён"}</td>
          <td style="text-align:right;white-space:nowrap"><button class="btn link sm" data-action="open-user" data-id="${u.id}">Изменить</button>${Number(u.id) !== state.user.id ? ` <button class="btn link danger sm" data-action="del-user" data-id="${u.id}">${TRASH}</button>` : ""}</td>
        </tr>`).join("")}
      </tbody>
    </table></div>`;
}
function openUser(id) {
  const u = id ? state.users.find((x) => Number(x.id) === Number(id)) : null;
  const overlay = openModal(`
    <h3>${u ? "Изменить пользователя" : "Добавить пользователя"}</h3>
    <form id="userForm" class="form" style="margin-top:14px">
      <div class="grid2"><div><label>Имя *</label><input id="us_name" value="${esc(u ? u.name : "")}" /></div>
      <div><label>Логин *</label><input id="us_username" value="${esc(u ? u.username : "")}" ${u ? "disabled" : ""} /></div></div>
      <div><label>${u ? "Новый пароль (необязательно)" : "Пароль *"}</label><input id="us_pass" type="password" placeholder="Минимум 6 символов" /></div>
      <div class="grid2">
        <div><label>Роль</label><select id="us_role">${Object.keys(ROLES).map((k) => `<option value="${k}" ${(u ? u.role : "logistic") === k ? "selected" : ""}>${ROLES[k]}</option>`).join("")}</select></div>
        <div id="us_companyWrap"><label>Компания</label><select id="us_company">${optList(state.logistics, "Выберите логиста", u ? u.company_id : "")}</select></div>
      </div>
      ${u ? `<div style="display:flex;gap:8px;align-items:center"><label style="margin:0">Аккаунт активен</label><input id="us_active" type="checkbox" ${Number(u.active) ? "checked" : ""} style="width:auto" /></div>` : ""}
      <div id="userError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить</button></div>
    </form>`);
  const form = overlay.querySelector("#userForm");
  const roleSel = form.querySelector("#us_role");
  const companyWrap = form.querySelector("#us_companyWrap");
  const updateCompany = () => {
    const role = roleSel.value;
    companyWrap.innerHTML = role === "logistic"
      ? `<label>Компания</label><select id="us_company">${optList(state.logistics, "Выберите логиста", u ? u.company_id : "")}</select>`
      : `<label>Компания</label><input disabled value="—" />`;
  };
  roleSel.addEventListener("change", updateCompany);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const role = roleSel.value;
    const body = { name: form.querySelector("#us_name").value, username: form.querySelector("#us_username").value, password: form.querySelector("#us_pass").value, role, company_id: role === "logistic" ? Number(form.querySelector("#us_company").value) : "", active: u ? form.querySelector("#us_active").checked : true };
    const r = await api(u ? "/api/users/" + u.id : "/api/users", { method: u ? "PUT" : "POST", body });
    if (r.data.ok) { overlay.remove(); toast("Сохранено"); await loadUsers(); render(); }
    else form.querySelector("#userError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

function optList(list, placeholder, selected) {
  const opts = list.map((x) => `<option value="${x.id}" ${Number(selected) === Number(x.id) ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  return placeholder ? `<option value="">${placeholder}</option>` + opts : opts;
}

function openModal(html, cls = "") {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

async function go(view) {
  state.view = view;
  render();
  state.loading = true;
  try {
    if (view === "report") { await Promise.all([loadAll(), loadFinance()]); return; }
    if (view === "summary") { await Promise.all([loadStock(), loadRefs(), loadTrucks()]); }
    else if (view === "tashkent") { await Promise.all([loadTashkent(), loadOutgoing()]); }
    else if (view === "trucks") await loadTrucks();
    else if (view === "shipments") { await Promise.all([loadShipments(), loadStock(), loadTashkent(), loadOutgoing(), loadFinance(), loadTrucks()]); }
    else if (view === "finance") { await Promise.all([loadShipments(), loadFinance(), loadRefs(), loadTrucks()]); }
    else if (view === "models" || view === "factories" || view === "logistics") await loadRefs();
    else if (view === "users") await loadUsers();
  } finally {
    state.loading = false;
    render();
  }
}

function wire() {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = loginForm.querySelector("#loginError");
      const body = { username: loginForm.querySelector("#f_username").value, password: loginForm.querySelector("#f_password").value };
      if (state.setup) body.name = loginForm.querySelector("#f_name").value;
      const r = await api("/api/auth/login", { method: "POST", body });
      if (r.data.ok) {
        state.user = r.data.user; state.view = landingView();
        render();
        await loadAll(); await loadStats();
        render();
      } else {
        err.textContent = r.data.error || "Ошибка входа";
        if (r.status === 0 || r.status >= 500 || r.status === 429) err.textContent += " Сервер занят (лимит Google или «просыпается») — подождите минуту и попробуйте снова.";
        if (r.data.needsSetup) { state.setup = true; render(); }
      }
    });
  }
  const sumFilter = document.getElementById("sumFilter");
  if (sumFilter) sumFilter.addEventListener("change", (e) => { state.sumFilter = e.target.value; render(); });
  app.querySelectorAll(".sum-filter").forEach((el) => {
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
      state.sumFilters[el.getAttribute("data-f")] = el.value;
      render();
    });
  });
  app.querySelectorAll(".mfilter").forEach((el) => {
    const field = el.getAttribute("data-field");
    const stName = el.getAttribute("data-store") === "truck" ? "truckFilters" : el.getAttribute("data-store") === "ship" ? "shipFilters" : "sumFilters";
    if (!state[stName]) state[stName] = {};
    const toggle = el.querySelector(".mf-toggle");
    const pop = el.querySelector(".mfilter-pop");
    const search = el.querySelector(".mf-search");
    toggle.addEventListener("click", (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; });
    search.addEventListener("input", () => {
      const s = search.value.trim().toLowerCase();
      el.querySelectorAll(".mf-opt").forEach((lbl) => {
        lbl.style.display = !s || lbl.textContent.toLowerCase().includes(s) ? "" : "none";
      });
    });
    el.querySelector(".mf-apply").addEventListener("click", () => {
      state[stName][field] = [...el.querySelectorAll(".mf-opt input:checked")].map((c) => c.value);
      render();
    });
    el.querySelector(".mf-clear").addEventListener("click", () => { state[stName][field] = []; render(); });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".mfilter")) {
      document.querySelectorAll(".mfilter-pop:not([hidden])").forEach((p) => { p.hidden = true; });
    }
  });
  app.querySelectorAll(".rng").forEach((el) => {
    el.addEventListener("input", () => {
      const f = el.getAttribute("data-f");
      const edge = el.getAttribute("data-edge");
      state.sumFilters[f] = state.sumFilters[f] || {};
      state.sumFilters[f][edge] = el.value;
      render();
    });
  });
  (app.querySelectorAll("[data-fin-col]") || []).forEach((el) => el.addEventListener("change", () => { const c = el.getAttribute("data-fin-col"); const v = el.value; if (!state.finCol) state.finCol = {}; if (!v) delete state.finCol[c]; else state.finCol[c] = v; render(); }));
  app.querySelectorAll(".bpick").forEach((el) => {
    el.addEventListener("change", () => {
      const d = el.getAttribute("data-doc");
      if (!state.bulkSel) state.bulkSel = new Set();
      if (el.checked) state.bulkSel.add(d); else state.bulkSel.delete(d);
      render();
    });
  });
  app.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", onClick);
  });
}

async function onClick(e) {
  const el = e.currentTarget;
  const action = el.getAttribute("data-action");
  const id = el.getAttribute("data-id");
  const idx = el.getAttribute("data-idx");
  // Кнопки со строками таблиц используют data-idx (индекс в state.sumRows).
  const sumAt = (fallbackId) => {
    const i = idx !== null ? Number(idx) : Number(fallbackId);
    return Number.isFinite(i) ? state.sumRows[i] : undefined;
  };
  switch (action) {
    case "toggle-setup": state.setup = !state.setup; render(); break;
    case "boot-retry": boot(); break;
    case "sum-view": state.sumView = el.getAttribute("data-view") || "all"; render(); break;
    case "ship-log": state.shipLogId = id; state.shipFilters = {}; render(); break;
    case "ship-export": exportShipmentsXlsx(); break;
    case "logout":
      await api("/api/auth/logout", { method: "POST" });
      state.user = null; state.view = "login"; state.setup = false; render(); break;
    case "nav": e.preventDefault(); go(el.getAttribute("data-view")); break;
    case "sum-tab": state.summaryTab = el.getAttribute("data-tab"); render(); break;
    case "ship-tab": state.shipTab = el.getAttribute("data-tab"); render(); break;
    case "ship-clear": state.shipFilters = {}; render(); break;
    case "toggle-nav": state.navCollapsed = !state.navCollapsed; render(); break;
    case "fin-log": state.finLogId = id; render(); break;
    case "refresh": (async () => { state.loading = true; render(); try { await Promise.all([loadAll(), loadFinance()]); } finally { state.loading = false; render(); } })(); break;
    case "pay-doc": openPayDoc(el.getAttribute("data-doc"), id); break;
    case "docs-shipment": openDocs(id); break;
    case "ship-goods": openShipmentGoods(id); break;
    case "ship-invoices": openShipInvoices(id); break;
    case "fin-export": exportFinancesXlsx(); break;
    case "fin-filter-clear": state.finCol = {}; render(); break;
    case "ship-trucks": { const r = sumAt(id); if (r) openShipTrucks(r); } break;
    case "edit-sum-row": { const r = sumAt(id); if (r) editSumRow(r); } break;
    case "del-sum-row": { const r = sumAt(id); if (r) delSumRow(r); } break;
    case "bulk-pay": openBulkPay(); break;
    case "bulk-clear": state.bulkSel = new Set(); render(); break;
    case "open-log-goods": state.sumLogId = id; render(); break;
    case "back-log-goods": state.sumLogId = ""; render(); break;
    case "open-tashkent-out": openTashkentOut(); break;
    case "summary-search": state.sumQ = document.getElementById("sumSearch").value; render(); break;
    case "export-summary": exportSummaryXlsx(); break;
    case "summary-clear": state.sumQ = ""; state.sumDraft = ""; state.sumFilter = ""; state.sumFilters = {}; render(); break;
    case "truck-clear": state.truckFilters = {}; render(); break;
    case "open-truck": openTruck(null); break;
    case "edit-truck": { const t = state.trucks.find((x) => Number(x.id) === Number(id)); if (t) openTruck(t); } break;
    case "del-truck": if (confirmBox("Удалить загрузку?")) { toast("Удаляю…"); const r = await api("/api/trucks/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadAll(), render()) : toast(r.data.error, false); } break;
    case "open-shipment": openShipment(null); break;
    case "edit-shipment": { const s = state.shipments.find((x) => Number(x.id) === Number(id)); if (s) openShipment(s); } break;
    case "pay-shipment": openPay(id); break;
    case "receive-shipment": openReceive(id); break;
    case "del-shipment": if (confirmBox("Удалить отгрузку? История (платежи) удалится вместе с ней.")) { toast("Удаляю…"); const r = await api("/api/shipments/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await Promise.all([loadAll(), loadFinance()]), render()) : toast(r.data.error, false); } break;
    case "seed": { const r = await api("/api/seed", { method: "POST", body: {} }); if (r.data.ok) { toast("Справочники загружены"); await loadRefs(); render(); } else toast(r.data.error || "Ошибка", false); } break;
    case "open-model": openModel(id || null); break;
    case "del-model": if (confirmBox("Удалить модель?")) { toast("Удаляю…"); const r = await api("/api/models/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadRefs(), render()) : toast(r.data.error, false); } break;
    case "open-factory": openFactory(id || null); break;
    case "del-factory": if (confirmBox("Удалить завод?")) { toast("Удаляю…"); const r = await api("/api/factories/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadRefs(), render()) : toast(r.data.error, false); } break;
    case "open-logistic": openLogistic(id || null); break;
    case "del-logistic": if (confirmBox("Удалить логиста?")) { toast("Удаляю…"); const r = await api("/api/logistics/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadRefs(), render()) : toast(r.data.error, false); } break;
    case "open-user": openUser(id || null); break;
    case "del-user": if (confirmBox("Удалить пользователя?")) { toast("Удаляю…"); const r = await api("/api/users/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadUsers(), render()) : toast(r.data.error, false); } break;
  }
}

boot();