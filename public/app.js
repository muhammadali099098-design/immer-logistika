/* IMMER Logistika — сводка-таблица, загрузка фур, отгрузки. */
"use strict";

const ROLES = { admin: "Администратор", logistic: "Логист" };
const CURRENCIES = ["USD", "UZS", "CNY", "RUB", "EUR"];

const state = {
  user: null,
  view: "login",
  setup: false,
  toast: null,
  loading: false,
  stock: [],
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
async function loadRefs() {
  const [f, l, m] = await Promise.all([api("/api/factories"), api("/api/logistics"), api("/api/models")]);
  if (f.data.ok) state.factories = f.data.factories;
  if (l.data.ok) state.logistics = l.data.logistics;
  if (m.data.ok) state.models = m.data.models;
}
async function loadTrucks() { const r = await api("/api/trucks"); if (r.data.ok) state.trucks = r.data.trucks; }
async function loadShipments() { const r = await api("/api/shipments"); if (r.data.ok) state.shipments = r.data.shipments; }
async function loadUsers() { const r = await api("/api/users"); if (r.data.ok) state.users = r.data.users; }
async function loadStats() { const r = await api("/api/stats"); if (r.data.ok) state.stats = r.data.stats; }
async function loadAll() { await Promise.all([loadStock(), loadRefs(), loadTrucks(), loadShipments()]); }
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
  const nav = [
    { v: "summary", l: "Сводка" },
    { v: "trucks", l: "Загрузка" },
    { v: "shipments", l: "Отгрузки" },
    { v: "models", l: "Модели" },
    { v: "factories", l: "Заводы" },
    { v: "logistics", l: "Логисты", admin: true },
    { v: "users", l: "Пользователи", admin: true },
  ].filter((n) => !n.admin || isAdmin);

  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><a class="logo" href="#" data-action="nav" data-view="summary"><span class="dot"><i></i></span><span>IMMER</span></a></div>
      <nav>${nav.map((n) => `<a href="#" data-action="nav" data-view="${n.v}" class="${state.view === n.v ? "active" : ""}">${n.l}</a>`).join("")}</nav>
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
      <div class="logo"><span class="dot"><i></i></span><span>IMMER</span></div>
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

// ---------- summary (table with filter) ----------
function viewSummary() {
  const isAdmin = state.user.role === "admin";
  const q = state.sumQ.trim().toLowerCase();
  let rows = state.stock;
  if (state.sumFilter && isAdmin) rows = rows.filter((r) => r.logistics_id === Number(state.sumFilter));
  if (q) rows = rows.filter((r) => String(r.model_name).toLowerCase().includes(q));
  const tQty = rows.reduce((a, r) => a + r.qty, 0);
  const tCbm = rows.reduce((a, r) => a + r.cbm, 0);
  const showLog = isAdmin && !state.sumFilter;
  return `
    <div class="toolbar"><div><h1>Сводка</h1><p class="sub" style="margin:0">Какой товар у какого логиста и остаток на складе.</p></div></div>
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      ${isAdmin ? `
      <select id="sumFilter" style="max-width:220px">
        <option value="">Все логисты</option>
        ${state.logistics.map((l) => `<option value="${l.id}" ${String(state.sumFilter) === String(l.id) ? "selected" : ""}>${esc(l.name)}</option>`).join("")}
      </select>` : ""}
      <input style="max-width:240px" placeholder="Поиск модели…" value="${esc(state.sumDraft)}" id="sumSearch" onkeydown="if(event.key==='Enter'){state.sumQ=this.value;render()}" />
      <button class="btn ghost" data-action="summary-search">Найти</button>
      ${state.sumQ ? `<button class="btn link" data-action="summary-clear">Сбросить</button>` : ""}
    </div>
    <div class="tbl-wrap"><table class="table">
      <thead><tr><th>Модель</th><th>Категория</th>${showLog ? "<th>Логист</th>" : ""}<th>CBM/шт</th><th>Остаток</th><th>Объём, м³</th><th>Пришло</th><th>Отгружено</th><th>Завод</th></tr></thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="${showLog ? 9 : 8}"><div class="emptystate">Нет данных под фильтр. Добавьте загрузку.</div></td></tr>` : rows.map((r) => `<tr>
          <td><b>${esc(r.model_name)}</b></td>
          <td style="color:var(--muted)">${esc(r.category || "—")}</td>
          ${showLog ? `<td>${esc(r.logistics_name)}</td>` : ""}
          <td style="color:var(--muted)">${r.cbm_per_pc ? esc(r.cbm_per_pc) : "—"}</td>
          <td><b style="color:${r.qty < 0 ? "var(--danger)" : "var(--fg)"}">${fmtNum(r.qty)}</b></td>
          <td style="color:var(--muted)">${r.cbm ? fmtNum(r.cbm) : "—"}</td>
          <td style="color:var(--muted)">${fmtNum(r.received)}</td>
          <td style="color:var(--muted)">${fmtNum(r.shipped)}</td>
          <td>${esc(r.factory_name || "—")}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot>
        <tr style="font-weight:700;background:var(--surface-2)">
          <td>Итого</td><td></td>${showLog ? "<td></td>" : ""}<td></td>
          <td>${fmtNum(tQty)}</td><td>${fmtNum(tCbm)}</td>
          <td>${fmtNum(rows.reduce((a, r) => a + r.received, 0))}</td>
          <td>${fmtNum(rows.reduce((a, r) => a + r.shipped, 0))}</td>
          <td></td>
        </tr>
      </tfoot>
    </table></div>
    <p class="sub" style="margin-top:10px">Остаток = загружено с заводов − отгружено в Узбекистан. Оплата за логистику — в разделе «Отгрузки».</p>`;
}

// ---------- trucks (загрузка) ----------
function viewTrucks() {
  const isAdmin = state.user.role === "admin";
  return `
    <div class="toolbar"><div><h1>Загрузка с заводов</h1><p class="sub" style="margin:0">Фуры, загруженные с завода и привезённые на склад.</p></div>
    <button data-action="open-truck">Записать загрузку</button></div>
    ${state.trucks.length === 0 ? `<div class="emptystate">Загрузок пока нет.</div>` : state.trucks.map((t) => `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div><b>${esc(t.truck_no || "Фура")}</b> · ${fmtDate(t.date)}
            <span style="color:var(--muted);font-size:13px"> · ${esc(t.factory_name || "—")}</span>
            ${isAdmin ? ` <span style="color:var(--muted);font-size:13px">· ${esc(t.logistics_name)}</span>` : ""}</div>
          <div style="display:flex;gap:10px;align-items:center">
            <button class="btn link sm" data-action="edit-truck" data-id="${t.id}">Изменить</button>
            <button class="btn link danger sm" data-action="del-truck" data-id="${t.id}">Удалить</button>
          </div>
        </div>
        <div style="margin-top:8px;font-size:14px">${t.lines.map((li) => `${esc(li.model_name)} × <b>${fmtNum(li.qty)}</b>`).join(" · ") || "—"}</div>
        ${t.notes ? `<div style="margin-top:6px;color:var(--muted);font-size:13px">${esc(t.notes)}</div>` : ""}
      </div>`).join("")}`;
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
        <div><label>Дата загрузки</label><input id="tr_date" type="date" value="${editing ? esc(item.date || "") : new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Примечание</label><input id="tr_notes" value="${editing ? esc(item.notes || "") : ""}" /></div>
      </div>
      <div><label>Товар</label><div id="tr_lines"></div>
        <button type="button" class="btn ghost sm" data-line-add>+ Добавить модель</button></div>
      <div id="truckError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">${editing ? "Сохранить" : "Сохранить"}</button></div>
    </form>`);
  const form = overlay.querySelector("#truckForm");
  const linesBox = form.querySelector("#tr_lines");
  const lineArr = [];
  function addLine(pre) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center";
    row.innerHTML = `<select class="line-model" style="flex:1.4"><option value="">Модель</option>${state.models.map((m) => `<option value="${m.id}" ${pre && Number(pre.model_id) === Number(m.id) ? "selected" : ""}>${esc(m.model)}</option>`).join("")}</select>
      <input class="line-qty" type="number" min="0" step="any" value="${pre ? pre.qty : ""}" placeholder="Кол-во" style="flex:1" />
      <button type="button" class="btn danger sm" data-line-del>×</button>`;
    row.querySelector("[data-line-del]").addEventListener("click", () => { row.remove(); const i = lineArr.indexOf(row); if (i >= 0) lineArr.splice(i, 1); });
    linesBox.appendChild(row);
    lineArr.push(row);
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
  const isAdmin = state.user.role === "admin";
  const totalPaid = state.shipments.reduce((a, s) => a + (Number(s.cost_amount) || 0), 0);
  return `
    <div class="toolbar"><div><h1>Отгрузки в Узбекистан</h1><p class="sub" style="margin:0">Фуры со склада. Вы платите за каждую отправленную фуру.</p></div>
    <button data-action="open-shipment">Записать отгрузку</button></div>
    <div class="card" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="color:var(--muted);font-size:14px">Отгрузок: <b style="color:var(--fg)">${state.shipments.length}</b></div>
      <div style="font-size:16px">Всего оплачено за отправленные фуры: <b style="color:var(--brand)">${fmtNum(totalPaid)}</b></div>
    </div>
    ${state.shipments.length === 0 ? `<div class="emptystate">Отгрузок пока нет.</div>` : state.shipments.map((s) => `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
          <div><b>${esc(s.truck_no || "Фура")}</b> · ${fmtDate(s.date)}
            ${isAdmin ? ` <span style="color:var(--muted);font-size:13px">· ${esc(s.logistics_name)}</span>` : ""}</div>
          <div style="display:flex;gap:10px;align-items:center">
            <b style="color:var(--accent-fg)">${fmtNum(s.cost_amount)} ${esc(s.cost_currency)}</b>
            <button class="btn link sm" data-action="edit-shipment" data-id="${s.id}">Изменить</button>
            <button class="btn link danger sm" data-action="del-shipment" data-id="${s.id}">Удалить</button>
          </div>
        </div>
        ${s.volume_m3 ? `<div style="color:var(--muted);font-size:13px;margin-top:4px">Объём: ${esc(s.volume_m3)} м³</div>` : ""}
        <div style="margin-top:8px;font-size:14px">${s.lines.map((li) => `${esc(li.model_name)} × <b>${fmtNum(li.qty)}</b>`).join(" · ") || "—"}</div>
        ${s.notes ? `<div style="margin-top:6px;color:var(--muted);font-size:13px">${esc(s.notes)}</div>` : ""}
      </div>`).join("")}`;
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
        <div><label>Дата</label><input id="sh_date" type="date" value="${editing ? esc(item.date || "") : new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Номер фуры</label><input id="sh_truck" value="${editing ? esc(item.truck_no || "") : ""}" /></div>
      </div>
      <div class="grid2">
        <div><label>Объём, м³</label><input id="sh_vol" type="number" step="any" value="${editing ? esc(item.volume_m3 || "") : ""}" placeholder="120" /></div>
        <div><label>Стоимость фуры</label><input id="sh_amount" type="number" min="0" step="any" value="${editing ? esc(item.cost_amount || "") : ""}" placeholder="5000" /></div>
      </div>
      <div><label>Валюта</label><select id="sh_currency">${CURRENCIES.map((c) => `<option ${editing && c === item.cost_currency ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div><label>Товар</label><div id="sh_lines"></div>
        <button type="button" class="btn ghost sm" data-line-add>+ Добавить модель</button></div>
      <div id="shipmentError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">${editing ? "Сохранить" : "Сохранить отгрузку"}</button></div>
    </form>`);
  const form = overlay.querySelector("#shipmentForm");
  const linesBox = form.querySelector("#sh_lines");
  const lineArr = [];
  function addLine(pre) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center";
    row.innerHTML = `<select class="line-model" style="flex:1.4"><option value="">Модель</option>${state.models.map((m) => `<option value="${m.id}" ${pre && Number(pre.model_id) === Number(m.id) ? "selected" : ""}>${esc(m.model)}</option>`).join("")}</select>
      <input class="line-qty" type="number" min="0" step="any" value="${pre ? pre.qty : ""}" placeholder="Кол-во" style="flex:1" />
      <button type="button" class="btn danger sm" data-line-del>×</button>`;
    row.querySelector("[data-line-del]").addEventListener("click", () => { row.remove(); const i = lineArr.indexOf(row); if (i >= 0) lineArr.splice(i, 1); });
    linesBox.appendChild(row);
    lineArr.push(row);
  }
  lineArr.length = 0;
  if (editing && item.lines && item.lines.length) item.lines.forEach((li) => addLine(li)); else addLine(null);
  form.querySelector("[data-line-add]").addEventListener("click", () => addLine(null));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const lines = lineArr.map((r) => ({ model_id: Number(r.querySelector(".line-model").value), qty: Number(r.querySelector(".line-qty").value) })).filter((l) => l.model_id && l.qty > 0);
    const body = {
      logistics_id: Number(form.querySelector("#sh_logistic").value),
      date: form.querySelector("#sh_date").value,
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
          ${isAdmin ? `<td style="text-align:right;white-space:nowrap"><button class="btn link sm" data-action="open-model" data-id="${m.id}">Изменить</button> <button class="btn link danger sm" data-action="del-model" data-id="${m.id}">Удалить</button></td>` : ""}
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
        <div><label>CBM за 1 шт *</label><input id="mo_cbm" type="text" inputmode="decimal" value="${esc(m ? m.cbm_per_pc : "")}" placeholder="0.112685625" /></div>
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
            ${isAdmin ? `<div style="display:flex;gap:8px;flex-shrink:0"><button class="btn link sm" data-action="open-factory" data-id="${f.id}">Изменить</button><button class="btn link danger sm" data-action="del-factory" data-id="${f.id}">Удалить</button></div>` : ""}
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
            ${isAdmin ? `<div style="display:flex;gap:8px;flex-shrink:0"><button class="btn link sm" data-action="open-logistic" data-id="${l.id}">Изменить</button><button class="btn link danger sm" data-action="del-logistic" data-id="${l.id}">Удалить</button></div>` : ""}
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
          <td style="text-align:right;white-space:nowrap"><button class="btn link sm" data-action="open-user" data-id="${u.id}">Изменить</button>${Number(u.id) !== state.user.id ? ` <button class="btn link danger sm" data-action="del-user" data-id="${u.id}">Удалить</button>` : ""}</td>
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

function openModal(html) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

async function go(view) {
  state.view = view;
  render();
  state.loading = true;
  try {
    if (view === "summary") { await Promise.all([loadStock(), loadRefs()]); }
    else if (view === "trucks") await loadTrucks();
    else if (view === "shipments") await loadShipments();
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
    case "summary-search": state.sumQ = document.getElementById("sumSearch").value; render(); break;
    case "summary-clear": state.sumQ = ""; state.sumDraft = ""; state.sumFilter = ""; render(); break;
    case "open-truck": openTruck(null); break;
    case "edit-truck": { const t = state.trucks.find((x) => Number(x.id) === Number(id)); if (t) openTruck(t); } break;
    case "del-truck": if (confirmBox("Удалить загрузку?")) { const r = await api("/api/trucks/" + id, { method: "DELETE" }); r.data.ok ? (toast("Удалено"), await loadAll(), render()) : toast(r.data.error, false); } break;
    case "open-shipment": openShipment(null); break;
    case "edit-shipment": { const s = state.shipments.find((x) => Number(x.id) === Number(id)); if (s) openShipment(s); } break;
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