/* IMMER Logistika — сводка-таблица, загрузка фур, отгрузки. */
"use strict";

const ROLES = { admin: "Администратор", logistic: "Логист" };
const CURRENCIES = ["USD", "UZS", "CNY", "RUB", "EUR"];
const TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';

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
  shipFilters: {},
};

const app = document.getElementById("app");

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { "content-type": "application/json" },
      credentials: "include",
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    return { status: 0, data: { ok: false, error: "Сервер не ответил. Бесплатный хостинг «просыпается» до минуты — подождите и нажмите ещё раз." } };
  }
  try { return { status: res.status, data: await res.json() }; }
  catch { return { status: res.status, data: { ok: false, error: "Нет ответа от сервера, попробуйте ещё раз" } }; }
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtDate(s) { if (!s) return ""; return new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
function fmtNum(n) { return Number(n || 0).toLocaleString("ru-RU"); }
function toast(msg, ok = true) { state.toast = { msg, ok }; render(); setTimeout(() => { state.toast = null; render(); }, 3000); }
function confirmBox(msg) { return window.confirm(msg); }

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
function landingView() { return "summary"; }

async function boot() {
  state.view = "login";
  render();
  const r = await api("/api/me");
  if (r.data.ok && r.data.user) {
    state.user = r.data.user;
    state.view = landingView();
    render();
    await loadAll();
    render();
  }
}

function render() {
  if (state.view === "login" || !state.user) { app.innerHTML = renderLogin(); wire(); return; }
  const isAdmin = state.user.role === "admin";
  const navMain = [
    { v: "summary", l: "Сводка: Завод-Граница" },
    { v: "shipments", l: "Сводка: Граница → Ташкент" },
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
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><a class="logo" href="#" data-action="nav" data-view="summary"><img src="/logo.png" class="brand-img" alt="IMMER" /><span class="brand-text">IMMER</span></a></div>
      <nav>${navMain.map(navItem).join("")}${refHtml}</nav>
      <div class="foot">Склад логистов по моделям<br/><b>IMMER Logistika</b></div>
    </aside>
    <div class="main">
      <div class="topbar">
        <div class="role">Роль: <b>${esc(ROLES[state.user.role] || state.user.role)}</b>${state.user.company_name ? ` · <b style="color:var(--accent-fg)">${esc(state.user.company_name)}</b>` : ""}</div>
        <div style="display:flex;align-items:center;gap:12px">
          ${state.loading ? `<span style="color:var(--muted);font-size:12px">Обновление…</span>` : ""}
          <span style="font-weight:600">${esc(state.user.name)}</span>
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
      case "summary": return viewSummary();
      case "tashkent": return viewTashkent();
      case "trucks": return viewTrucks();
      case "shipments": return viewShipments();
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

// ---------- summary (Завод → Граница, с фильтрами и загрузками) ----------
function viewSummary() {
  const isAdmin = state.user.role === "admin";
  const tab = state.summaryTab || "summary";
  const tabBar = `<div style="display:flex;gap:8px;margin-bottom:14px">
    <button class="btn ${tab === "summary" ? "" : "ghost"}" data-action="sum-tab" data-tab="summary">Сводка</button>
    <button class="btn ${tab === "loadings" ? "" : "ghost"}" data-action="sum-tab" data-tab="loadings">Загрузки</button>
    <button class="btn ${tab === "logistics" ? "" : "ghost"}" data-action="sum-tab" data-tab="logistics">Логисты</button>
  </div>`;
  if (tab === "logistics") {
    const selLog = state.sumLogId;
    if (!selLog) {
      return `${tabBar}
        <div class="toolbar"><div><h1>Логисты</h1><p class="sub" style="margin:0">Нажмите на логиста, чтобы увидеть его товары.</p></div></div>
        <div class="grid2">${state.logistics.length === 0 ? `<div class="emptystate">Логистов пока нет.</div>` : state.logistics.map((l) => `<div class="card" style="cursor:pointer" data-action="open-log-goods" data-id="${l.id}"><b>${esc(l.name)}</b><div style="color:var(--muted);font-size:13px">${esc(l.city || "")}</div></div>`).join("")}</div>`;
    }
    const log = state.logistics.find((x) => Number(x.id) === Number(selLog));
    const goods = state.stock.filter((r) => Number(r.logistics_id) === Number(selLog));
    return `${tabBar}
      <div class="toolbar"><div><button class="btn ghost" data-action="back-log-goods">← Логисты</button></div></div>
      <h2>${esc(log ? log.name : "")} · товары на складе</h2>
      <div class="tbl-wrap"><table class="table">
        <thead><tr><th>Модель</th><th>Категория</th><th>Завод</th><th>Инвойс</th><th>Order №</th><th>Пришло</th><th>Отгружено</th><th>Остаток</th><th>Статус</th></tr></thead>
        <tbody>${goods.length === 0 ? `<tr><td colspan="9"><div class="emptystate">У этого логиста нет товара.</div></td></tr>` : goods.map((r) => `<tr>
          <td><b>${esc(r.model_name)}</b></td><td style="color:var(--muted)">${esc(r.category || "—")}</td><td>${esc(r.factory_name || "—")}</td><td style="color:var(--muted)">${esc(r.invoice_no || "—")}</td><td>${esc(r.order_no || "—")}</td>
          <td style="color:var(--muted)">${fmtNum(r.received)}</td><td style="color:var(--muted)">${fmtNum(r.shipped)}</td><td><b>${fmtNum(r.qty)}</b></td>
          <td>${r.shipment_status === "отправлен" ? '<span style="color:#065f46;font-weight:600">отправлен</span>' : r.shipment_status === "частично" ? '<span style="color:#b45309;font-weight:600">частично</span>' : '<span style="color:var(--fg);font-weight:600">в складе</span>'}</td>
        </tr>`).join("")}</tbody>
      </table></div>`;
  }
  if (tab === "loadings") {
    const TF = state.truckFilters || (state.truckFilters = {});
    const mfT = (f, label, options) => {
      const sel = TF[f] || [];
      const allOpts = [...new Set([...options, ...sel])];
      return `<div class="mfilter" data-field="${f}" data-store="truck"><button type="button" class="f-input mf-toggle" style="text-align:left">${label}${sel.length ? ` (${sel.length})` : ""} ▾</button>
        <div class="mfilter-pop" hidden>
          <input class="f-input mf-search" placeholder="Поиск…">
          <div class="mf-list">${allOpts.map((o) => `<label class="mf-opt"><input type="checkbox" value="${esc(o)}" ${sel.includes(o) ? "checked" : ""}>${esc(o)}</label>`).join("")}</div>
          <div style="display:flex;gap:6px;margin-top:6px"><button type="button" class="btn ghost sm mf-clear">Сбросить</button><button type="button" class="btn sm mf-apply">Готово</button></div>
        </div></div>`;
    };
    let trucks = state.trucks;
    if (TF.truck_no && TF.truck_no.length) trucks = trucks.filter((t) => TF.truck_no.includes(t.truck_no));
    if (TF.logistics && TF.logistics.length) trucks = trucks.filter((t) => TF.logistics.includes(t.logistics_name || ""));
    if (TF.factory && TF.factory.length) trucks = trucks.filter((t) => TF.factory.includes(t.factory_name || ""));
    if (TF.invoice && TF.invoice.length) trucks = trucks.filter((t) => TF.invoice.includes(String(t.invoice_no)));
    if (TF.order && TF.order.length) trucks = trucks.filter((t) => TF.order.includes(String(t.order_no)));
    const tNoOpts = [...new Set(state.trucks.map((t) => t.truck_no).filter(Boolean))].sort();
    const tLogOpts = [...new Set(state.trucks.map((t) => t.logistics_name).filter(Boolean))].sort();
    const tFacOpts = [...new Set(state.trucks.map((t) => t.factory_name).filter(Boolean))].sort();
    const tInvOpts = [...new Set(state.trucks.map((t) => String(t.invoice_no)).filter(Boolean))].sort();
    const tOrderOpts = [...new Set(state.trucks.map((t) => String(t.order_no)).filter(Boolean))].sort();
    const tHas = Object.keys(TF).some((k) => (TF[k] || []).length);
    return `
      <div class="toolbar"><div><h1>Сводка: Завод-Граница</h1><p class="sub" style="margin:0">Фуры, загруженные с заводов.</p></div>
      <button data-action="open-truck">Записать загрузку</button></div>
      ${tabBar}
      ${tHas ? `<div style="margin-bottom:12px"><button class="btn ghost" data-action="truck-clear">Сбросить фильтры</button></div>` : ""}
      <div class="tbl-wrap"><table class="table">
        <thead>
          <tr><th>Фура</th><th>Order №</th><th>Дата</th>${isAdmin ? "<th>Логист</th>" : ""}<th>Завод</th><th>Инвойс</th><th>Товар</th><th>CBM</th><th></th></tr>
          <tr style="background:var(--surface-2)"><th>${mfT("truck_no", "Фура", tNoOpts)}</th><th>${mfT("order", "Order №", tOrderOpts)}</th><th></th>${isAdmin ? `<th>${mfT("logistics", "Логист", tLogOpts)}</th>` : ""}<th>${mfT("factory", "Завод", tFacOpts)}</th><th>${mfT("invoice", "Инвойс", tInvOpts)}</th><th></th><th></th><th></th></tr>
        </thead>
        <tbody>
          ${trucks.length === 0 ? `<tr><td colspan="${isAdmin ? 8 : 7}"><div class="emptystate">Загрузок пока нет. Нажмите «Записать загрузку».</div></td></tr>` : trucks.map((t) => {
            const truckCbm = t.lines.reduce((a, li) => { const m = state.models.find((x) => Number(x.id) === Number(li.model_id)); return a + (Number(li.qty) || 0) * (m ? Number(m.cbm_per_pc) || 0 : 0); }, 0);
            return `<tr>
              <td><b>${esc(t.truck_no || "—")}</b></td>
              <td><b>${esc(t.order_no || "—")}</b></td>
              <td>${fmtDate(t.date)}</td>
              ${isAdmin ? `<td>${esc(t.logistics_name)}</td>` : ""}
              <td>${esc(t.factory_name || "—")}</td>
              <td style="color:var(--muted)">${esc(t.invoice_no || "—")}</td>
              <td style="max-width:260px">${t.lines.map((li) => `${esc(li.model_name)} × ${fmtNum(li.qty)}`).join(", ") || "—"}</td>
              <td style="color:var(--muted)">${truckCbm ? truckCbm.toFixed(2) : "—"}</td>
              <td style="white-space:nowrap">
                <button class="btn link sm" data-action="edit-truck" data-id="${t.id}">✎</button>
                <button class="btn link danger sm" data-action="del-truck" data-id="${t.id}">${TRASH}</button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>`;
  }
  const q = state.sumQ.trim().toLowerCase();
  const F = state.sumFilters;
  let rows = state.stock;
  if (q) rows = rows.filter((r) => String(r.model_name).toLowerCase().includes(q));
  if (F.model && F.model.length) rows = rows.filter((r) => F.model.includes(r.model_name));
  if (F.category && F.category.length) rows = rows.filter((r) => F.category.includes(r.category));
  if (F.logistics && F.logistics.length && isAdmin) rows = rows.filter((r) => F.logistics.includes(r.logistics_name));
  if (F.factory && F.factory.length) rows = rows.filter((r) => F.factory.includes(r.factory_name));
  if (F.invoice && F.invoice.length) rows = rows.filter((r) => F.invoice.includes(String(r.invoice_no)));
  if (F.order && F.order.length) rows = rows.filter((r) => F.order.includes(String(r.order_no)));
  if (F.status && F.status.length) rows = rows.filter((r) => F.status.includes(r.shipment_status));
  const rngOK = (f, val) => { const r = F[f]; if (!r) return true; const v = String(val == null ? "" : val); const mn = r.min !== undefined ? String(r.min) : ""; const mx = r.max !== undefined ? String(r.max) : ""; if (mn !== "" && v < mn) return false; if (mx !== "" && v > mx) return false; return true; };
  rows = rows.filter((r) => rngOK("days", r.days_sitting));
  state.sumRows = rows;
  const tQty = rows.reduce((a, r) => a + r.qty, 0);
  const tCbm = rows.reduce((a, r) => a + (r.qty * (Number(r.cbm_per_pc) || 0)), 0);
  const distinct = (fn, filterEmpty) => [...new Set(state.stock.map(fn).filter((v) => v && v !== "" && (filterEmpty ? String(v).trim() !== "" : true) && String(v) !== "—"))].sort();
  const modelOpts = distinct((r) => r.model_name);
  const cats = distinct((r) => r.category);
  const facs = distinct((r) => r.factory_name);
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
  return `
    <div class="toolbar"><div><h1>Сводка: Завод-Граница</h1><p class="sub" style="margin:0">Какой товар у какого логиста и остаток на складе.</p></div>
    <div style="display:flex;gap:8px">
      ${hasF || q ? `<button class="btn ghost" data-action="summary-clear">Сбросить фильтры</button>` : ""}
      <button class="btn ghost" data-action="export-summary">Скачать Excel</button>
    </div></div>
    ${tabBar}
    <div class="tbl-wrap"><table class="table">
      <thead>
        <tr><th>Модель</th><th>Категория</th>${isAdmin ? "<th>Логист</th>" : ""}<th>Завод</th><th>Инвойс</th><th>Order №</th><th>Пришло</th><th>Дата забора</th><th>Отгружено</th><th>Дата отправки</th><th>Остаток</th><th>Общий куб</th><th>Дней</th><th>Статус</th></tr>
        <tr style="background:var(--surface-2)">
          <th>${mf("model", "Модель", modelOpts)}</th>
          <th>${mf("category", "Категория", cats)}</th>
          ${isAdmin ? `<th>${mf("logistics", "Логист", state.logistics.map((l) => l.name))}</th>` : ""}
          <th>${mf("factory", "Завод", facs)}</th>
          <th>${mf("invoice", "Инвойс", invOpts)}</th>
          <th>${mf("order", "Order №", orderOpts)}</th>
          <th></th><th></th><th></th><th></th><th></th><th></th>
          <th>${rng("days", "number")}</th>
          <th>${mf("status", "Статус", ["отправлен", "частично", "в складе"])}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="${isAdmin ? 13 : 12}"><div class="emptystate">Нет данных под фильтр. Добавьте загрузку.</div></td></tr>` : rows.map((r) => {
          const totalCbm = r.qty * (Number(r.cbm_per_pc) || 0);
          const loadStr = (r.load_trucks || []).map((t) => `${esc(t.truck_no)}×${fmtNum(t.qty)}`).join(", ");
          const shipStr = (r.ship_trucks || []).map((t) => `${esc(t.truck_no)}×${fmtNum(t.qty)}`).join(", ");
          return `<tr>
          <td><b>${esc(r.model_name)}</b></td>
          <td style="color:var(--muted)">${esc(r.category || "—")}</td>
          ${isAdmin ? `<td>${esc(r.logistics_name)}</td>` : ""}
          <td>${esc(r.factory_name || "—")}</td>
          <td style="color:var(--muted)">${esc(r.invoice_no || "—")}</td>
          <td>${esc(r.order_no || "—")}</td>
          <td style="color:var(--muted)">${fmtNum(r.received)}</td>
          <td style="color:var(--muted)">${r.pickup_date ? fmtDate(r.pickup_date) : "—"}</td>
          <td>${fmtNum(r.shipped)}${shipStr ? ` <span style="color:var(--muted);font-size:11px">(${shipStr})</span>` : ""}</td>
          <td style="color:var(--muted)">${r.send_date_tashkent ? fmtDate(r.send_date_tashkent) : "—"}</td>
          <td><b style="color:${r.qty < 0 ? "var(--danger)" : "var(--fg)"}">${fmtNum(r.qty)}</b></td>
          <td style="color:var(--muted)">${totalCbm ? fmtNum(totalCbm.toFixed(2)) : "—"}</td>
          <td><b style="color:${r.days_sitting >= 7 ? "var(--danger)" : "var(--fg)"}">${r.days_sitting || 0}</b></td>
          <td>${r.shipment_status === "отправлен" ? '<span style="color:#065f46;font-weight:600">отправлен</span>' : r.shipment_status === "частично" ? '<span style="color:#b45309;font-weight:600">частично</span>' : '<span style="color:var(--fg);font-weight:600">в складе</span>'}</td>
        </tr>`;
        }).join("")}
      </tbody>
      <tfoot>
        <tr style="font-weight:700;background:var(--surface-2)">
          <td>Итого</td><td></td>${isAdmin ? "<td></td>" : ""}<td></td><td></td>
          <td>${fmtNum(rows.reduce((a, r) => a + r.received, 0))}</td><td></td>
          <td>${fmtNum(rows.reduce((a, r) => a + r.shipped, 0))}</td><td></td>
          <td>${fmtNum(tQty)}</td><td>${fmtNum(tCbm.toFixed(2))}</td><td></td><td></td>
        </tr>
      </tfoot>
    </table></div>
    <p class="sub" style="margin-top:10px">Остаток = пришло − отгружено. В колонке «Отгружено» в скобках — номера фур, которыми отправлено. Оплата за логистику — в разделе «Отгрузки».</p>`;
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
        ${rows.length === 0 ? `<tr><td colspan="8"><div class="emptystate">Пока нет товара в Ташкенте. Сначала запишите отгрузку.</div></td></tr>` : rows.map((r) => `<tr>
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
  function addLine(pre, availList) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center";
    const list = availList || state.models;
    row.innerHTML = `<select class="line-model" style="flex:1.4"><option value="">Модель</option>${list.map((x) => `<option value="${x.id}" ${pre && Number(pre.model_id) === Number(x.id) ? "selected" : ""}>${availList ? `${esc(x.name)} (в нал. ${fmtNum(x.qty)})` : esc(x.model)}</option>`).join("")}</select>
      <input class="line-qty" type="number" min="0" step="any" value="${pre ? pre.qty : ""}" placeholder="Кол-во" style="flex:1" />
      <span class="line-cbm" style="min-width:80px;color:var(--muted);font-size:12px">—</span>
      <button type="button" class="btn danger sm" data-line-del>×</button>`;
    const mSel = row.querySelector(".line-model");
    const qIn = row.querySelector(".line-qty");
    const cbmSpan = row.querySelector(".line-cbm");
    const upd = () => {
      const m = state.models.find((x) => Number(x.id) === Number(mSel.value));
      const q = Number(qIn.value) || 0;
      const cb = m ? Number(m.cbm_per_pc) || 0 : 0;
      cbmSpan.textContent = q && cb ? (q * cb).toFixed(3) + " м³" : "—";
      const totalEl = document.getElementById("tr_totalCbm") || document.getElementById("sh_totalCbm");
      if (totalEl) {
        let t = 0;
        lineArr.forEach((r) => {
          const mm = state.models.find((x) => Number(x.id) === Number(r.querySelector(".line-model").value));
          const qq = Number(r.querySelector(".line-qty").value) || 0;
          t += qq * (mm ? Number(mm.cbm_per_pc) || 0 : 0);
        });
        totalEl.textContent = "Общий CBM: " + t.toFixed(3) + " м³";
      }
    };
    mSel.addEventListener("change", upd);
    qIn.addEventListener("input", upd);
    row.querySelector("[data-line-del]").addEventListener("click", () => { row.remove(); const i = lineArr.indexOf(row); if (i >= 0) lineArr.splice(i, 1); upd(); });
    linesBox.appendChild(row);
    lineArr.push(row);
    if (pre) upd();
  }
  lineArr.length = 0;
  if (editing && item.lines && item.lines.length) item.lines.forEach((li) => addLine(li)); else addLine(null);
  form.querySelector("[data-line-add]").addEventListener("click", () => addLine(null));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const lines = lineArr.map((r) => ({ model_id: Number(r.querySelector(".line-model").value), qty: Number(r.querySelector(".line-qty").value) })).filter((l) => l.model_id && l.qty > 0);
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

// ---------- shipments ----------
function viewShipments() {
  const tab = state.shipTab || "shipments";
  const tabBar = `<div style="display:flex;gap:8px;margin-bottom:14px">
    <button class="btn ${tab === "shipments" ? "" : "ghost"}" data-action="ship-tab" data-tab="shipments">Отгрузки</button>
    <button class="btn ${tab === "finance" ? "" : "ghost"}" data-action="ship-tab" data-tab="finance">Финансы</button>
  </div>`;
  if (tab === "finance") return viewFinance(tabBar);
  return viewShipmentsTable(tabBar);
}

function viewShipmentsTable(tabBar) {
  const isAdmin = state.user.role === "admin";
  const SF = state.shipFilters || (state.shipFilters = {});
  let rows = state.shipments;
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
  return `
    <div class="toolbar"><div><h1>Сводка: Граница → Ташкент</h1><p class="sub" style="margin:0">Фуры, отправленные из границы в Ташкент.</p></div>
    <button data-action="open-shipment">Записать отгрузку</button></div>
    ${tabBar}
    ${sHas ? `<div style="margin-bottom:12px"><button class="btn ghost" data-action="ship-clear">Сбросить фильтры</button></div>` : ""}
    <div class="tbl-wrap"><table class="table">
      <thead>
        <tr><th>Фура</th><th>Дата отправки</th><th>Дата прибытия</th>${isAdmin ? "<th>Логист</th>" : ""}<th>Номер PI</th><th>Номер документа</th><th>Товар</th><th>Стоимость</th><th>0.4%</th><th>Итого</th><th>Приём</th><th></th></tr>
        <tr style="background:var(--surface-2)">
          <th>${mfS("truck_no", "Фура", tNo)}</th><th></th><th></th>
          ${isAdmin ? `<th>${mfS("logistics", "Логист", tLog)}</th>` : ""}
          <th>${mfS("pi", "PI", tPi)}</th><th>${mfS("doc", "Документ", tDoc)}</th><th></th><th></th><th></th><th></th>
          <th>${mfS("recv", "Приём", recvOpts)}</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="11"><div class="emptystate">Отгрузок пока нет.</div></td></tr>` : rows.map((s) => `
          <tr>
            <td><b>${esc(s.truck_no || "—")}</b></td>
            <td>${fmtDate(s.date)}</td>
            <td style="color:var(--muted)">${s.arrival_date ? fmtDate(s.arrival_date) : "—"}</td>
            ${isAdmin ? `<td>${esc(s.logistics_name)}</td>` : ""}
            <td style="color:var(--muted)">${esc(s.pi_number || "—")}</td>
            <td style="color:var(--muted)">${esc(s.doc_number || "—")}</td>
            <td style="max-width:200px">${s.lines.map((li) => `${esc(li.model_name)} × ${fmtNum(li.qty)}`).join(", ") || "—"}</td>
            <td>${fmtNum(s.cost_amount)} ${esc(s.cost_currency)}</td>
            <td>${s.extra_fee ? `${fmtNum(s.extra_fee)}` : "—"}</td>
            <td><b>${fmtNum(s.total_cost)} ${esc(s.cost_currency)}</b>${(s.damage_amount || s.demurrage_days) ? `<div style="color:var(--muted);font-size:11px">штраф −${fmtNum(s.damage_amount || 0)} · простой +${fmtNum((Number(s.demurrage_days)||0)*(Number(s.demurrage_rate)||0))}</div>` : ""}</td>
            <td>${s.receipt_status === "received" ? (s.damaged ? '<span style="color:var(--danger);font-weight:600">прибыл, повреждён</span>' : '<span style="color:#065f46;font-weight:600">прибыл</span>') : '<span style="color:#b45309;font-weight:600">не прибыл</span>'}</td>
            <td style="white-space:nowrap">
              <button class="btn link sm" data-action="edit-shipment" data-id="${s.id}">✎</button>
              <button class="btn link sm" data-action="receive-shipment" data-id="${s.id}">Приём</button>
              <button class="btn link danger sm" data-action="del-shipment" data-id="${s.id}">${TRASH}</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
}

function viewFinance(tabBar) {
  const groups = state.finance;
  const totalPaidAll = groups.reduce((a, g) => a + g.total_paid, 0);
  return `${tabBar}
    <div class="card" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="color:var(--muted);font-size:14px">Логистов: <b style="color:var(--fg)">${groups.length}</b></div>
      <div style="font-size:18px">Всего оплачено: <b style="color:var(--brand)">${fmtNum(totalPaidAll)}</b></div>
    </div>
    ${groups.length === 0 ? `<div class="emptystate">Нет данных. Добавьте загрузки, чтобы появились грузы с Order number.</div>` : groups.map((g) => `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
          <h2 style="margin:0">${esc(g.logistics_name)}</h2>
          <div style="font-size:15px">Оплачено: <b style="color:var(--brand)">${fmtNum(g.total_paid)}</b></div>
        </div>
        <div class="tbl-wrap"><table class="table" style="font-size:13px">
          <thead><tr><th>Order №</th><th>Фура</th><th>Дата</th><th>Товар</th><th>Оплачено</th><th>История оплат</th><th></th></tr></thead>
          <tbody>
            ${g.rows.map((r) => `
              <tr>
                <td><b>${esc(r.order_no)}</b></td>
                <td>${esc(r.truck_no || "—")}</td>
                <td>${fmtDate(r.date)}</td>
                <td style="max-width:200px">${r.lines.map((li) => `${esc(li.model_name)} × ${fmtNum(li.qty)}`).join(", ") || "—"}</td>
                <td><b>${fmtNum(r.paid)}</b></td>
                <td style="color:var(--muted)">${r.payments.map((p) => `${fmtNum(p.amount)} (${fmtDate(p.date)})`).join(", ") || "—"}</td>
                <td><button class="btn link sm" data-action="pay-order" data-order="${esc(r.order_no)}">Оплатить</button></td>
              </tr>`).join("")}
          </tbody>
        </table></div>
      </div>`).join("")}`;
}

function openPayOrder(orderNo) {
  const overlay = openModal(`
    <h3>Оплата по Order № ${esc(orderNo)}</h3>
    <form id="payOrderForm" class="form" style="margin-top:14px">
      <div class="grid2">
        <div><label>Сумма *</label><input id="po_amount" type="number" min="0" step="any" required /></div>
        <div><label>Валюта</label><select id="po_currency">${CURRENCIES.map((c) => `<option>${c}</option>`).join("")}</select></div>
      </div>
      <div><label>Дата оплаты</label><input id="po_date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <div><label>Документ об оплате *</label><input type="file" id="poFile" required /></div>
      <div id="poError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить оплату</button></div>
    </form>`);
  const form = overlay.querySelector("#payOrderForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = form.querySelector("#poFile").files[0];
    if (!file) { form.querySelector("#poError").textContent = "Загрузите документ"; return; }
    const up = await uploadFile(file);
    if (!up.ok) { form.querySelector("#poError").textContent = up.error || "Ошибка файла"; return; }
    const r = await api("/api/payments", { method: "POST", body: { order_no: orderNo, amount: Number(form.querySelector("#po_amount").value), currency: form.querySelector("#po_currency").value, date: form.querySelector("#po_date").value, file_name: up.file_name } });
    if (r.data.ok) { overlay.remove(); toast("Оплата добавлена"); await loadFinance(); render(); }
    else form.querySelector("#poError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

function exportSummaryCSV() {
  const rows = state.sumRows || [];
  const head = ["Модель", "Категория", "Логист", "Завод", "Инвойс", "Пришло", "Дата забора", "Отгружено", "Дата отправки", "Остаток", "Общий куб", "Дней", "Статус"];
  const csv = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [head.map(csv).join(";")];
  rows.forEach((r) => {
    lines.push([r.model_name, r.category, r.logistics_name, r.factory_name, r.invoice_no, r.received, r.pickup_date, r.shipped, r.send_date_tashkent, r.qty, (r.qty * (Number(r.cbm_per_pc) || 0)).toFixed(2), r.days_sitting, r.shipment_status].map(csv).join(";"));
  });
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "svodka_zavod-granica.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
  try { return await res.json(); } catch { return { ok: false, error: "Ошибка загрузки файла" }; }
}

function openPay(id) {
  const s = state.shipments.find((x) => Number(x.id) === Number(id));
  if (!s) return;
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
  const overlay = openModal(`
    <h3>Приём груза: фура ${esc(s.truck_no || "")}</h3>
    <form id="recvForm" class="form" style="margin-top:14px">
      <div><label>Документ о получении *</label><input type="file" id="recvFile" required /></div>
      <div><label>Дата прибытия</label><input type="date" id="recvDate" value="${new Date().toISOString().slice(0, 10)}" disabled /></div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><label style="margin:0">Прибыл не сегодня (изменить дату)</label><input id="recvNotToday" type="checkbox" style="width:auto" /></div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><label style="margin:0">Товар повреждён</label><input id="recvDamaged" type="checkbox" style="width:auto" /></div>
      <div class="grid2">
        <div><label>Сумма штрафа за повреждение</label><input id="recvDamage" type="number" min="0" step="any" value="0" /></div>
        <div><label>Дней простоя (демередж)</label><input id="recvDays" type="number" min="0" value="0" /></div>
      </div>
      <div><label>Штраф за 1 день простоя</label><input id="recvRate" type="number" min="0" step="any" value="0" /></div>
      <div id="recvError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Отметить прибытие</button></div>
    </form>`);
  const form = overlay.querySelector("#recvForm");
  form.querySelector("#recvNotToday").addEventListener("change", (e) => {
    form.querySelector("#recvDate").disabled = !e.target.checked;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = form.querySelector("#recvFile").files[0];
    if (!file) { form.querySelector("#recvError").textContent = "Загрузите документ — без него прибытие отметить нельзя"; return; }
    const up = await uploadFile(file);
    if (!up.ok) { form.querySelector("#recvError").textContent = up.error || "Ошибка загрузки файла"; return; }
    const body = {
      receipt_status: "received",
      file_name: up.file_name,
      arrival_date: form.querySelector("#recvDate").value,
      damaged: form.querySelector("#recvDamaged").checked,
      damage_amount: Number(form.querySelector("#recvDamage").value) || 0,
      demurrage_days: Number(form.querySelector("#recvDays").value) || 0,
      demurrage_rate: Number(form.querySelector("#recvRate").value) || 0,
    };
    const r = await api("/api/shipments/" + id + "/status", { method: "POST", body });
    if (r.data.ok) { overlay.remove(); toast("Прибытие отмечено"); await loadShipments(); render(); }
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
        <div><label>Дата отправки</label><input id="sh_date" type="date" value="${editing ? esc(item.date || "") : new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Дата прибытия</label><input id="sh_arrival" type="date" value="${editing ? esc(item.arrival_date || "") : ""}" /></div>
      </div>
      <div class="grid2">
        <div><label>Номер фуры</label><input id="sh_truck" value="${editing ? esc(item.truck_no || "") : ""}" /></div>
        <div><label>Стоимость фуры</label><input id="sh_amount" type="number" min="0" step="any" value="${editing ? esc(item.cost_amount || "") : ""}" placeholder="5000" /></div>
      </div>
      <div class="grid2">
        <div><label>Номер PI</label><input id="sh_pi" value="${editing ? esc(item.pi_number || "") : ""}" placeholder="Например: HD250429" /></div>
        <div><label>Номер документа</label><input id="sh_doc" value="${editing ? esc(item.doc_number || "") : ""}" placeholder="Документ в пути" /></div>
      </div>
      <div class="grid2">
        <div><label>Объём, м³</label><input id="sh_vol" type="number" step="any" value="${editing ? esc(item.volume_m3 || "") : ""}" placeholder="120" /></div>
        <div><label>0.4% (добавить к стоимости, $)</label><input id="sh_extra" type="number" min="0" step="any" value="${editing ? esc(item.extra_fee || "") : ""}" placeholder="0" /></div>
      </div>
      <div><label>Валюта</label><select id="sh_currency">${CURRENCIES.map((c) => `<option ${editing && c === item.cost_currency ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div><label>Товар</label><input class="f-input" id="shModelSearch" placeholder="Поиск по моделям…" style="margin-bottom:8px" /><div id="sh_lines"></div>
        <button type="button" class="btn ghost sm" data-line-add>+ Добавить модель</button></div>
      <div id="sh_totalCbm" style="margin-top:8px;font-weight:600">Общий CBM: 0 м³</div>
      <div id="shipmentError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">${editing ? "Сохранить" : "Сохранить отгрузку"}</button></div>
    </form>`, "modal-wide");
  const form = overlay.querySelector("#shipmentForm");
  const linesBox = form.querySelector("#sh_lines");
  const lineArr = [];
  function availFor(logId) {
    return state.stock
      .filter((r) => Number(r.logistics_id) === Number(logId) && Number(r.qty) > 0)
      .map((r) => ({ id: r.model_id, name: r.model_name, qty: r.qty, cbm_per_pc: r.cbm_per_pc }));
  }
  const shLogSel = form.querySelector("#sh_logistic");
  // For admin: preselect the first logistics so goods show immediately.
  if (isAdmin && shLogSel && !shLogSel.value && state.logistics.length > 0) {
    shLogSel.value = String(state.logistics[0].id);
  }
  let avail = availFor(editing ? Number(item.logistics_id) : (isAdmin && shLogSel ? Number(shLogSel.value) : Number(state.user.company_id)));
  if (editing && item.lines) {
    item.lines.forEach((li) => {
      if (!avail.some((a) => Number(a.id) === Number(li.model_id))) {
        const m = state.models.find((x) => Number(x.id) === Number(li.model_id));
        if (m) avail.push({ id: m.id, name: m.model, qty: 0, cbm_per_pc: m.cbm_per_pc });
      }
    });
  }
  function renderLinesBox(na) {
    linesBox.innerHTML = "";
    lineArr.length = 0;
    if (!na || na.length === 0) {
      linesBox.innerHTML = `<div class="emptystate" style="padding:10px">На складе этого логиста нет товара для отгрузки. Сначала добавьте загрузку.</div>`;
    } else {
      addLine(null, na);
    }
  }
  if (shLogSel) shLogSel.addEventListener("change", () => {
    renderLinesBox(availFor(Number(shLogSel.value)));
  });
  const shSearch = form.querySelector("#shModelSearch");
  if (shSearch) shSearch.addEventListener("input", () => {
    const s = shSearch.value.trim().toLowerCase();
    form.querySelectorAll("#sh_lines .line-model").forEach((sel) => {
      [...sel.options].forEach((o) => { o.hidden = !!s && !o.textContent.toLowerCase().includes(s); });
    });
  });
  function addLine(pre, availList) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center";
    const list = availList || state.models;
    row.innerHTML = `<select class="line-model" style="flex:1.4"><option value="">Модель</option>${list.map((x) => `<option value="${x.id}" ${pre && Number(pre.model_id) === Number(x.id) ? "selected" : ""}>${availList ? `${esc(x.name)} (в нал. ${fmtNum(x.qty)})` : esc(x.model)}</option>`).join("")}</select>
      <input class="line-qty" type="number" min="0" step="any" value="${pre ? pre.qty : ""}" placeholder="Кол-во" style="flex:1" />
      <span class="line-cbm" style="min-width:80px;color:var(--muted);font-size:12px">—</span>
      <button type="button" class="btn danger sm" data-line-del>×</button>`;
    const mSel = row.querySelector(".line-model");
    const qIn = row.querySelector(".line-qty");
    const cbmSpan = row.querySelector(".line-cbm");
    const upd = () => {
      const m = state.models.find((x) => Number(x.id) === Number(mSel.value));
      const q = Number(qIn.value) || 0;
      const cb = m ? Number(m.cbm_per_pc) || 0 : 0;
      cbmSpan.textContent = q && cb ? (q * cb).toFixed(3) + " м³" : "—";
      const totalEl = document.getElementById("sh_totalCbm");
      if (totalEl) {
        let t = 0;
        lineArr.forEach((r) => {
          const mm = state.models.find((x) => Number(x.id) === Number(r.querySelector(".line-model").value));
          const qq = Number(r.querySelector(".line-qty").value) || 0;
          t += qq * (mm ? Number(mm.cbm_per_pc) || 0 : 0);
        });
        totalEl.textContent = "Общий CBM: " + t.toFixed(3) + " м³";
      }
    };
    mSel.addEventListener("change", upd);
    qIn.addEventListener("input", upd);
    row.querySelector("[data-line-del]").addEventListener("click", () => { row.remove(); const i = lineArr.indexOf(row); if (i >= 0) lineArr.splice(i, 1); upd(); });
    linesBox.appendChild(row);
    lineArr.push(row);
    if (pre) upd();
  }
  lineArr.length = 0;
  if (editing && item.lines && item.lines.length) {
    item.lines.forEach((li) => addLine(li, avail));
  } else if (avail.length === 0) {
    linesBox.innerHTML = `<div class="emptystate" style="padding:10px">На складе этого логиста нет товара для отгрузки. Сначала добавьте загрузку.</div>`;
  } else {
    addLine(null, avail);
  }
  form.querySelector("[data-line-add]").addEventListener("click", () => addLine(null, avail));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const lines = lineArr.map((r) => ({ model_id: Number(r.querySelector(".line-model").value), qty: Number(r.querySelector(".line-qty").value) })).filter((l) => l.model_id && l.qty > 0);
    const body = {
      logistics_id: Number(form.querySelector("#sh_logistic").value),
      date: form.querySelector("#sh_date").value,
      arrival_date: form.querySelector("#sh_arrival").value,
      pi_number: form.querySelector("#sh_pi").value,
      doc_number: form.querySelector("#sh_doc").value,
      extra_fee: form.querySelector("#sh_extra").value,
      truck_no: form.querySelector("#sh_truck").value,
      volume_m3: form.querySelector("#sh_vol").value,
      cost_amount: Number(form.querySelector("#sh_amount").value),
      cost_currency: form.querySelector("#sh_currency").value,
      lines,
    };
    const r = await api(editing ? "/api/shipments/" + item.id : "/api/shipments", { method: editing ? "PUT" : "POST", body });
    if (r.data.ok) { overlay.remove(); toast(editing ? "Отгрузка обновлена" : "Отгрузка записана"); await loadAll(); render(); }
    else form.querySelector("#shipmentError").textContent = r.data.error || "Ошибка";
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
    if (view === "summary") { await Promise.all([loadStock(), loadRefs(), loadTrucks()]); }
    else if (view === "tashkent") { await Promise.all([loadTashkent(), loadOutgoing()]); }
    else if (view === "trucks") await loadTrucks();
    else if (view === "shipments") { await Promise.all([loadShipments(), loadStock(), loadTashkent(), loadOutgoing(), loadFinance()]); }
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
  app.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", onClick);
  });
}

async function onClick(e) {
  const el = e.currentTarget;
  const action = el.getAttribute("data-action");
  const id = el.getAttribute("data-id");
  switch (action) {
    case "toggle-setup": state.setup = !state.setup; render(); break;
    case "logout":
      await api("/api/auth/logout", { method: "POST" });
      state.user = null; state.view = "login"; state.setup = false; render(); break;
    case "nav": e.preventDefault(); go(el.getAttribute("data-view")); break;
    case "sum-tab": state.summaryTab = el.getAttribute("data-tab"); render(); break;
    case "ship-tab": state.shipTab = el.getAttribute("data-tab"); render(); break;
    case "ship-clear": state.shipFilters = {}; render(); break;
    case "pay-order": openPayOrder(el.getAttribute("data-order")); break;
    case "open-log-goods": state.sumLogId = id; render(); break;
    case "back-log-goods": state.sumLogId = ""; render(); break;
    case "open-tashkent-out": openTashkentOut(); break;
    case "summary-search": state.sumQ = document.getElementById("sumSearch").value; render(); break;
    case "export-summary": exportSummaryCSV(); break;
    case "summary-clear": state.sumQ = ""; state.sumDraft = ""; state.sumFilter = ""; state.sumFilters = {}; render(); break;
    case "truck-clear": state.truckFilters = {}; render(); break;
    case "open-truck": openTruck(null); break;
    case "edit-truck": { const t = state.trucks.find((x) => Number(x.id) === Number(id)); if (t) openTruck(t); } break;
    case "del-truck": if (confirmBox("Удалить загрузку?")) { const r = await api("/api/trucks/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadAll(), render()) : toast(r.data.error, false); } break;
    case "open-shipment": openShipment(null); break;
    case "edit-shipment": { const s = state.shipments.find((x) => Number(x.id) === Number(id)); if (s) openShipment(s); } break;
    case "pay-shipment": openPay(id); break;
    case "receive-shipment": openReceive(id); break;
    case "del-shipment": if (confirmBox("Удалить отгрузку?")) { const r = await api("/api/shipments/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadAll(), render()) : toast(r.data.error, false); } break;
    case "seed": { const r = await api("/api/seed", { method: "POST", body: {} }); if (r.data.ok) { toast("Справочники загружены"); await loadRefs(); render(); } else toast(r.data.error || "Ошибка", false); } break;
    case "open-model": openModel(id || null); break;
    case "del-model": if (confirmBox("Удалить модель?")) { const r = await api("/api/models/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadRefs(), render()) : toast(r.data.error, false); } break;
    case "open-factory": openFactory(id || null); break;
    case "del-factory": if (confirmBox("Удалить завод?")) { const r = await api("/api/factories/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadRefs(), render()) : toast(r.data.error, false); } break;
    case "open-logistic": openLogistic(id || null); break;
    case "del-logistic": if (confirmBox("Удалить логиста?")) { const r = await api("/api/logistics/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadRefs(), render()) : toast(r.data.error, false); } break;
    case "open-user": openUser(id || null); break;
    case "del-user": if (confirmBox("Удалить пользователя?")) { const r = await api("/api/users/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadUsers(), render()) : toast(r.data.error, false); } break;
  }
}

boot();