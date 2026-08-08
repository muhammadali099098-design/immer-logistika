/* IMMER Logistika — склад по моделям, приходы и отгрузки. */
"use strict";

const ROLES = { admin: "Администратор", logistic: "Логист" };
const CURRENCIES = ["USD", "UZS", "CNY", "RUB", "EUR"];

const state = {
  user: null,
  view: "login",
  params: {},
  setup: false,
  toast: null,
  // data
  stock: [],
  models: [],
  factories: [],
  logistics: [],
  receipts: [],
  shipments: [],
  users: [],
  stats: null,
  recentR: [],
  recentS: [],
};

const app = document.getElementById("app");

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    credentials: "include",
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  try {
    return { status: res.status, data: await res.json() };
  } catch {
    return { status: res.status, data: { ok: false, error: "Ошибка сети" } };
  }
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString("ru-RU");
}
function toast(msg, ok = true) {
  state.toast = { msg, ok };
  render();
  setTimeout(() => { state.toast = null; render(); }, 3000);
}
function confirmBox(msg) { return window.confirm(msg); }

// ---------- data loading ----------
async function loadStock() {
  const r = await api("/api/stock");
  if (r.data.ok) state.stock = r.data.stock;
}
async function loadRefs() {
  const [f, l, m] = await Promise.all([api("/api/factories"), api("/api/logistics"), api("/api/models")]);
  if (f.data.ok) state.factories = f.data.factories;
  if (l.data.ok) state.logistics = l.data.logistics;
  if (m.data.ok) state.models = m.data.models;
}
async function loadReceipts() {
  const r = await api("/api/receipts");
  if (r.data.ok) state.receipts = r.data.receipts;
}
async function loadShipments() {
  const r = await api("/api/shipments");
  if (r.data.ok) state.shipments = r.data.shipments;
}
async function loadUsers() {
  const r = await api("/api/users");
  if (r.data.ok) state.users = r.data.users;
}
async function loadStats() {
  const r = await api("/api/stats");
  if (r.data.ok) { state.stats = r.data.stats; state.recentR = r.data.recentR; state.recentS = r.data.recentS; }
}

// ---------- boot ----------
async function boot() {
  const r = await api("/api/me");
  if (r.data.ok && r.data.user) {
    state.user = r.data.user;
    state.view = "stock";
    await loadAll();
  } else {
    state.view = "login";
  }
  render();
}

async function loadAll() {
  await Promise.all([loadStock(), loadRefs(), loadReceipts(), loadShipments(), loadStats()]);
}

// ---------- render ----------
function render() {
  if (state.view === "login" || !state.user) { app.innerHTML = renderLogin(); wire(); return; }
  const nav = [
    { v: "stock", l: "Склад" },
    { v: "receipts", l: "Приходы" },
    { v: "shipments", l: "Отгрузки" },
    { v: "models", l: "Модели" },
    { v: "factories", l: "Заводы" },
    { v: "logistics", l: "Логисты" },
    { v: "users", l: "Пользователи", admin: true },
  ].filter((n) => !n.admin || state.user.role === "admin");

  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><a class="logo" href="#" data-action="nav" data-view="stock"><span class="dot"><i></i></span><span>IMMER</span></a></div>
      <nav>${nav.map((n) => `<a href="#" data-action="nav" data-view="${n.v}" class="${state.view === n.v ? "active" : ""}">${n.l}</a>`).join("")}</nav>
      <div class="foot">Склад логиста по моделям<br/><b>IMMER Logistika</b></div>
    </aside>
    <div class="main">
      <div class="topbar">
        <div class="role">Роль: <b>${esc(ROLES[state.user.role] || state.user.role)}</b>${state.user.company_name ? ` · <b style="color:var(--accent-fg)">${esc(state.user.company_name)}</b>` : ""}</div>
        <div style="display:flex;align-items:center;gap:12px">
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
  switch (state.view) {
    case "stock": return viewStock();
    case "receipts": return viewReceipts();
    case "shipments": return viewShipments();
    case "models": return viewModels();
    case "factories": return viewFactories();
    case "logistics": return viewLogistics();
    case "users": return viewUsers();
    default: return "";
  }
}

// ---------- login ----------
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

// ---------- stock ----------
function viewStock() {
  const isAdmin = state.user.role === "admin";
  const rows = state.stock;
  return `
    <div class="toolbar"><div><h1>Склад по моделям</h1><p class="sub" style="margin:0">Остаток вашего товара на складе логиста.</p></div></div>
    <div class="grid-stats">
      <div class="card stat"><div class="num">${fmtNum(rows.length)}</div><div class="lbl">Позиций на складе</div></div>
      <div class="card stat"><div class="num">${fmtNum(rows.reduce((a, r) => a + r.qty, 0))}</div><div class="lbl">Всего единиц в наличии</div></div>
      <div class="card stat"><div class="num red">${fmtNum(state.stats ? state.stats.totalCost : 0)} ${esc(state.stats ? state.stats.totalCostCurrency : "USD")}</div><div class="lbl">Потрачено на логистику (фуры в Узбекистан)</div></div>
    </div>
    <div class="tbl-wrap"><table class="table">
      <thead><tr><th>Модель</th><th>Категория</th>${isAdmin ? "<th>Логист</th>" : ""}<th>Остаток на складе</th><th>Пришло</th><th>Отгружено</th><th>Загружен с завода</th><th>Стоимость логистики</th></tr></thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="${isAdmin ? 8 : 7}"><div class="emptystate">Пока нет данных. Добавьте модели и приходы.</div></td></tr>`
          : rows.map((r) => {
            const risk = r.qty < 0;
            return `<tr>
              <td><b>${esc(r.model_name)}</b></td>
              <td style="color:var(--muted)">${esc(r.category || "—")}</td>
              ${isAdmin ? `<td>${esc(r.logistics_name)}</td>` : ""}
              <td><b style="color:${risk ? "var(--danger)" : "var(--fg)"}">${fmtNum(r.qty)}</b></td>
              <td style="color:var(--muted)">${fmtNum(r.received)}</td>
              <td style="color:var(--muted)">${fmtNum(r.shipped)}</td>
              <td>${esc(r.factory_name || "—")}</td>
              <td>${r.cost_amount ? `${fmtNum(r.cost_amount)} ${esc(r.cost_currency)}` : "—"}</td>
            </tr>`;
          }).join("")}
      </tbody>
    </table></div>
    <p class="sub" style="margin-top:10px">Остаток = пришло с заводов − отгружено в Узбекистан. Стоимость логистики — сумма за фуры, в которых этот товар отправлен.</p>`;
}

// ---------- receipts ----------
function viewReceipts() {
  const isAdmin = state.user.role === "admin";
  return `
    <div class="toolbar"><div><h1>Приходы на склад</h1><p class="sub" style="margin:0">Груз загружен с завода и доставлен на склад логиста.</p></div>
    <button data-action="open-receipt">Записать приход</button></div>
    <div class="tbl-wrap"><table class="table">
      <thead><tr><th>Дата</th>${isAdmin ? "<th>Логист</th>" : ""}<th>Завод</th><th>Машина</th><th>Объём</th><th>Товар</th></tr></thead>
      <tbody>
        ${state.receipts.length === 0 ? `<tr><td colspan="6"><div class="emptystate">Приходов пока нет.</div></td></tr>`
          : state.receipts.map((r) => `<tr>
            <td>${fmtDate(r.date)}</td>
            ${isAdmin ? `<td>${esc(r.logistics_name)}</td>` : ""}
            <td>${esc(r.factory_name || "—")}</td>
            <td style="color:var(--muted)">${esc(r.truck_no || "—")}</td>
            <td style="color:var(--muted)">${esc(r.volume_m3 || "—")} м³</td>
            <td style="max-width:320px">${r.lines.map((li) => `${esc(li.model_name)} × <b>${fmtNum(li.qty)}</b>`).join("<br/>") || "—"}</td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
}

function openReceipt() {
  const isAdmin = state.user.role === "admin";
  const logId = isAdmin ? "" : String(state.user.company_id);
  const factoryCmd = `<select id="rc_factory"><option value="">Выберите завод</option>${state.factories.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select>`;
  const logCmd = isAdmin
    ? `<select id="rc_logistic"><option value="">Выберите логиста</option>${state.logistics.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}</select>`
    : `<input value="${esc(state.user.company_name || "")}" disabled />`;
  const overlay = openModal(`
    <h3>Приход на склад</h3>
    <form id="receiptForm" class="form" style="margin-top:14px">
      ${isAdmin ? `<div><label>Логист</label>${logCmd}</div>` : `<div><label>Логист</label>${logCmd}<input type="hidden" id="rc_logistic" value="${logId}" /></div>`}
      <div class="grid2">
        <div><label>Завод</label>${factoryCmd}</div>
        <div><label>Дата</label><input id="rc_date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      </div>
      <div class="grid2">
        <div><label>Номер машины</label><input id="rc_truck" /></div>
        <div><label>Объём, м³</label><input id="rc_vol" type="number" placeholder="120" /></div>
      </div>
      <div><label>Товар</label><div id="rc_lines"></div>
        <button type="button" class="btn ghost sm" data-line-add>+ Добавить модель</button></div>
      <div id="receiptError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить приход</button></div>
    </form>`);
  const form = overlay.querySelector("#receiptForm");
  const linesBox = form.querySelector("#rc_lines");
  const lineArr = [];
  function addLine() {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center";
    row.innerHTML = `<select class="line-model" style="flex:1.4"><option value="">Модель</option>${state.models.map((m) => `<option value="${m.id}">${esc(m.model)}</option>`).join("")}</select>
      <input class="line-qty" type="number" min="0" placeholder="Кол-во" style="flex:1" />
      <button type="button" class="btn danger sm" data-line-del>×</button>`;
    row.querySelector("[data-line-del]").addEventListener("click", () => { row.remove(); const i = lineArr.indexOf(row); if (i >= 0) lineArr.splice(i, 1); });
    linesBox.appendChild(row);
    lineArr.push(row);
  }
  lineArr.length = 0;
  addLine();
  form.querySelector("[data-line-add]").addEventListener("click", addLine);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const lines = lineArr.map((r) => ({ model_id: Number(r.querySelector(".line-model").value), qty: Number(r.querySelector(".line-qty").value) })).filter((l) => l.model_id && l.qty > 0);
    const body = {
      logistics_id: Number(form.querySelector("#rc_logistic").value),
      factory_id: Number(form.querySelector("#rc_factory").value),
      date: form.querySelector("#rc_date").value,
      truck_no: form.querySelector("#rc_truck").value,
      volume_m3: form.querySelector("#rc_vol").value,
      lines,
    };
    const r = await api("/api/receipts", { method: "POST", body });
    if (r.data.ok) { overlay.remove(); toast("Приход записан"); await loadAll(); render(); }
    else form.querySelector("#receiptError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

// ---------- shipments ----------
function viewShipments() {
  const isAdmin = state.user.role === "admin";
  return `
    <div class="toolbar"><div><h1>Отгрузки в Узбекистан</h1><p class="sub" style="margin:0">Фуры со склада в Узбекистан. За каждую фуру — стоимость логистики.</p></div>
    <button data-action="open-shipment">Записать отгрузку</button></div>
    <div class="tbl-wrap"><table class="table">
      <thead><tr><th>Дата</th>${isAdmin ? "<th>Логист</th>" : ""}<th>Машина</th><th>Объём</th><th>Товар</th><th>Стоимость</th></tr></thead>
      <tbody>
        ${state.shipments.length === 0 ? `<tr><td colspan="6"><div class="emptystate">Отгрузок пока нет.</div></td></tr>`
          : state.shipments.map((s) => `<tr>
            <td>${fmtDate(s.date)}</td>
            ${isAdmin ? `<td>${esc(s.logistics_name)}</td>` : ""}
            <td style="color:var(--muted)">${esc(s.truck_no || "—")}</td>
            <td style="color:var(--muted)">${esc(s.volume_m3 || "—")} м³</td>
            <td style="max-width:320px">${s.lines.map((li) => `${esc(li.model_name)} × <b>${fmtNum(li.qty)}</b>`).join("<br/>") || "—"}</td>
            <td><b>${fmtNum(s.cost_amount)} ${esc(s.cost_currency)}</b></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
}

function openShipment() {
  const isAdmin = state.user.role === "admin";
  const logId = isAdmin ? "" : String(state.user.company_id);
  const logCmd = isAdmin
    ? `<select id="sh_logistic"><option value="">Выберите логиста</option>${state.logistics.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}</select>`
    : `<input value="${esc(state.user.company_name || "")}" disabled />`;
  const overlay = openModal(`
    <h3>Отгрузка в Узбекистан</h3>
    <p class="sub" style="margin:0 0 14px">Можно смешивать разные модели из любых партий (30% от одной, 70% от другой).</p>
    <form id="shipmentForm" class="form" style="gap:14px">
      ${isAdmin ? `<div><label>Логист</label>${logCmd}</div>` : `<div><label>Логист</label>${logCmd}<input type="hidden" id="sh_logistic" value="${logId}" /></div>`}
      <div class="grid2">
        <div><label>Дата</label><input id="sh_date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Номер фуры</label><input id="sh_truck" /></div>
      </div>
      <div class="grid2">
        <div><label>Объём, м³</label><input id="sh_vol" type="number" placeholder="120" /></div>
        <div><label>Стоимость фуры</label><input id="sh_amount" type="number" min="0" placeholder="5000" /></div>
      </div>
      <div><label>Валюта</label><select id="sh_currency">${CURRENCIES.map((c) => `<option>${c}</option>`).join("")}</select></div>
      <div><label>Товар</label><div id="sh_lines"></div>
        <button type="button" class="btn ghost sm" data-line-add>+ Добавить модель</button></div>
      <div id="shipmentError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить отгрузку</button></div>
    </form>`);
  const form = overlay.querySelector("#shipmentForm");
  const linesBox = form.querySelector("#sh_lines");
  const lineArr = [];
  function addLine() {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center";
    row.innerHTML = `<select class="line-model" style="flex:1.4"><option value="">Модель</option>${state.models.map((m) => `<option value="${m.id}">${esc(m.model)}</option>`).join("")}</select>
      <input class="line-qty" type="number" min="0" placeholder="Кол-во" style="flex:1" />
      <button type="button" class="btn danger sm" data-line-del>×</button>`;
    row.querySelector("[data-line-del]").addEventListener("click", () => { row.remove(); const i = lineArr.indexOf(row); if (i >= 0) lineArr.splice(i, 1); });
    linesBox.appendChild(row);
    lineArr.push(row);
  }
  lineArr.length = 0;
  addLine();
  form.querySelector("[data-line-add]").addEventListener("click", addLine);
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
    const r = await api("/api/shipments", { method: "POST", body });
    if (r.data.ok) { overlay.remove(); toast("Отгрузка записана"); await loadAll(); render(); }
    else form.querySelector("#shipmentError").textContent = r.data.error || "Ошибка";
  });
  [...overlay.querySelectorAll("[data-close]")].forEach((b) => b.addEventListener("click", () => overlay.remove()));
}

// ---------- models ----------
function viewModels() {
  const isAdmin = state.user.role === "admin";
  return `
    <div class="toolbar"><div><h1>Модели техники</h1><p class="sub" style="margin:0">Справочник моделей, по которым ведётся склад.</p></div>
    ${isAdmin ? `<button data-action="open-model">Добавить модель</button>` : ""}</div>
    <div class="tbl-wrap"><table class="table">
      <thead><tr><th>Модель</th><th>Категория</th><th>Примечание</th>${isAdmin ? "<th></th>" : ""}</tr></thead>
      <tbody>
        ${state.models.length === 0 ? `<tr><td colspan="4"><div class="emptystate">Моделей пока нет.</div></td></tr>`
          : state.models.map((m) => `<tr>
            <td><b>${esc(m.model)}</b></td>
            <td style="color:var(--muted)">${esc(m.category || "—")}</td>
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
      <div><label>Модель *</label><input id="mo_model" value="${esc(m ? m.model : "")}" placeholder="Например: IVC1910IBGR" /></div>
      <div><label>Категория</label><input id="mo_cat" value="${esc(m ? m.category : "")}" placeholder="Например: стиральная машина" /></div>
      <div><label>Примечание</label><textarea id="mo_notes" rows="2">${esc(m ? m.notes : "")}</textarea></div>
      <div id="modelError" class="formerror"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit">Сохранить</button></div>
    </form>`);
  const form = overlay.querySelector("#modelForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { model: form.querySelector("#mo_model").value, category: form.querySelector("#mo_cat").value, notes: form.querySelector("#mo_notes").value };
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
      ${state.factories.length === 0 ? `<div class="emptystate">Заводов пока нет.</div>`
        : state.factories.map((f) => `
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
      <div><label>Название *</label><input id="fa_name" value="${esc(f ? f.name : "")}" placeholder="Например: Midea" /></div>
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
    <div class="toolbar"><div><h1>Логисты</h1><p class="sub" style="margin:0">Логистические компании и их склады.</p></div>
    ${isAdmin ? `<button data-action="open-logistic">Добавить логиста</button>` : ""}</div>
    <div class="grid2">
      ${state.logistics.length === 0 ? `<div class="emptystate">Логистов пока нет.</div>`
        : state.logistics.map((l) => `
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
    <div class="toolbar"><div><h1>Пользователи</h1><p class="sub" style="margin:0">Доступы для логистов.</p></div>
    <button data-action="open-user">Добавить пользователя</button></div>
    <div class="tbl-wrap"><table class="table">
      <thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Компания</th><th>Статус</th><th></th></tr></thead>
      <tbody>
        ${state.users.length === 0 ? `<tr><td colspan="6"><div class="emptystate">Пользователей пока нет.</div></td></tr>`
          : state.users.map((u) => `<tr>
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
  const companies = state.logistics;
  const overlay = openModal(`
    <h3>${u ? "Изменить пользователя" : "Добавить пользователя"}</h3>
    <form id="userForm" class="form" style="margin-top:14px">
      <div class="grid2"><div><label>Имя *</label><input id="us_name" value="${esc(u ? u.name : "")}" /></div>
      <div><label>Логин *</label><input id="us_username" value="${esc(u ? u.username : "")}" ${u ? "disabled" : ""} /></div></div>
      <div><label>${u ? "Новый пароль (необязательно)" : "Пароль *"}</label><input id="us_pass" type="password" placeholder="Минимум 6 символов" /></div>
      <div class="grid2">
        <div><label>Роль</label><select id="us_role">${Object.keys(ROLES).map((k) => `<option value="${k}" ${(u ? u.role : "logistic") === k ? "selected" : ""}>${ROLES[k]}</option>`).join("")}</select></div>
        <div id="us_companyWrap"><label>Компания</label><select id="us_company">${optList(companies, "Выберите логиста", u ? u.company_id : "")}</select></div>
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

// ---------- modal ----------
function openModal(html) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

// ---------- navigation ----------
async function go(view) {
  state.view = view;
  if (view === "stock") await loadStock();
  else if (view === "receipts") await loadReceipts();
  else if (view === "shipments") await loadShipments();
  else if (view === "models" || view === "factories" || view === "logistics") await loadRefs();
  else if (view === "users") await loadUsers();
  render();
}

// ---------- wiring ----------
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
        state.user = r.data.user; state.view = "stock";
        await loadAll(); render();
      } else {
        err.textContent = r.data.error || "Ошибка входа";
        if (r.data.needsSetup) { state.setup = true; render(); }
      }
    });
  }
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
    case "open-receipt": openReceipt(); break;
    case "open-shipment": openShipment(); break;
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