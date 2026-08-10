const path = require("path");
const express = require("express");
const store = require("./helpers/store");
const {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  readCookie,
  makeSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
} = require("./helpers/auth");

const app = express();
app.use(express.json({ limit: "2mb" }));
// Never let the browser cache the app files.
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ---------- auth helpers ----------

async function loadUser(id) {
  const rows = await store.list("users");
  const u = rows.find((r) => Number(r.id) === Number(id));
  if (!u || Number(u.active) !== 1) return null;
  let company_name = null;
  if (u.role === "logistic" && u.company_id) {
    const l = await store.list("logistics");
    const found = l.find((x) => Number(x.id) === Number(u.company_id));
    company_name = found ? found.name : null;
  }
  return {
    id: Number(u.id),
    username: u.username,
    name: u.name,
    role: u.role,
    company_id: u.company_id ? Number(u.company_id) : null,
    company_name,
  };
}

async function auth(req) {
  const token = readCookie(req, SESSION_COOKIE);
  const uid = token ? verifySession(token) : null;
  if (!uid) return null;
  return loadUser(uid);
}

function requireAuth(req, res, next) {
  auth(req).then((user) => {
    if (!user) return res.status(401).json({ ok: false, error: "Не авторизован" });
    req.user = user;
    next();
  }).catch(next);
}

function isAdmin(u) { return u.role === "admin"; }
function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ ok: false, error: "Нет доступа" });
  next();
}

// Scope: admin = all (null), logistic = own company. No company -> see nothing.
function scopeLogId(u) {
  if (isAdmin(u)) return null;
  if (u.role === "logistic") {
    const cid = Number(u.company_id);
    return cid > 0 ? cid : -1;
  }
  return -1;
}

// ---------- shared helpers ----------

function parseLines(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Parse a decimal that Google Sheets may return as "0,112685625" (comma) or a number.
function parseCbm(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Available quantity of a model at a logistics (received - already shipped).
async function availableQty(logId, modelId, excludeShipmentId) {
  const loadTrucks = await store.list("load_trucks");
  const shipments = await store.list("shipments");
  let inQty = 0, outQty = 0;
  for (const lt of loadTrucks) {
    if (Number(lt.logistics_id) !== Number(logId)) continue;
    inQty += parseLines(lt.lines)
      .filter((li) => Number(li.model_id) === Number(modelId))
      .reduce((a, li) => a + (Number(li.qty) || 0), 0);
  }
  for (const s of shipments) {
    if (Number(s.logistics_id) !== Number(logId)) continue;
    if (excludeShipmentId && Number(s.id) === Number(excludeShipmentId)) continue;
    outQty += parseLines(s.lines)
      .filter((li) => Number(li.model_id) === Number(modelId))
      .reduce((a, li) => a + (Number(li.qty) || 0), 0);
  }
  return inQty - outQty;
}

async function refs() {
  const [factories, logistics, models] = await Promise.all([
    store.list("factories"),
    store.list("logistics"),
    store.list("models"),
  ]);
  return {
    factories: factories.map((f) => ({ ...f, id: Number(f.id) })),
    logistics: logistics.map((l) => ({ ...l, id: Number(l.id) })),
    models: models.map((m) => ({ ...m, id: Number(m.id), cbm_per_pc: parseCbm(m.cbm_per_pc) })),
  };
}

function enrichLines(lines, models) {
  return parseLines(lines).map((li) => {
    const m = models.find((x) => Number(x.id) === Number(li.model_id));
    return { model_id: Number(li.model_id), model_name: m ? m.model : li.model_id, qty: Number(li.qty) || 0 };
  });
}

// ---------- stock ----------

async function computeStock(u) {
  const { factories, logistics, models } = await refs();
  const loadTrucks = await store.list("load_trucks");
  const shipments = await store.list("shipments");
  const scope = scopeLogId(u);

  const rows = [];
  for (const model of models) {
    for (const log of logistics) {
      if (scope != null && Number(log.id) !== Number(scope)) continue;
      const logId = Number(log.id);
      // Per-invoice received for this model at this logistics.
      const inv = new Map();
      for (const lt of loadTrucks) {
        if (Number(lt.logistics_id) !== logId) continue;
        const qty = parseLines(lt.lines)
          .filter((li) => Number(li.model_id) === Number(model.id))
          .reduce((a, li) => a + (Number(li.qty) || 0), 0);
        if (!qty) continue;
        const key = String(lt.invoice_no || "—");
        const cur = inv.get(key) || { qty: 0, factory: Number(lt.factory_id), date: "" };
        cur.qty += qty;
        if (String(lt.date || "") >= cur.date) { cur.date = String(lt.date || ""); cur.factory = Number(lt.factory_id); }
        inv.set(key, cur);
      }
      if (inv.size === 0) continue;
      const invArr = [...inv.entries()]
        .map(([invoice, v]) => ({ invoice, received: v.qty, remaining: v.qty, factory: v.factory, date: v.date }))
        .sort((a, b) => a.date.localeCompare(b.date));
      // Allocate shipped quantities to invoices FIFO (when a shipment mixes batches).
      for (const s of shipments) {
        if (Number(s.logistics_id) !== logId) continue;
        const shippedQty = parseLines(s.lines)
          .filter((li) => Number(li.model_id) === Number(model.id))
          .reduce((a, li) => a + (Number(li.qty) || 0), 0);
        if (!shippedQty) continue;
        let left = shippedQty;
        for (const row of invArr) {
          if (left <= 0) break;
          const take = Math.min(row.remaining, left);
          row.remaining -= take;
          left -= take;
        }
      }
      for (const row of invArr) {
        const factory = factories.find((f) => Number(f.id) === Number(row.factory));
        const shipped = row.received - row.remaining;
        if (row.received === 0 && shipped === 0) continue;
        rows.push({
          model_id: Number(model.id),
          model_name: model.model,
          category: model.category || "",
          cbm_per_pc: model.cbm_per_pc,
          logistics_id: logId,
          logistics_name: log.name,
          invoice_no: row.invoice,
          qty: row.remaining,
          cbm: +(row.remaining * model.cbm_per_pc).toFixed(2),
          received: row.received,
          shipped,
          factory_id: row.factory,
          factory_name: factory ? factory.name : "",
        });
      }
    }
  }
  rows.sort((a, b) => a.model_name.localeCompare(b.model_name, "ru") || a.invoice_no.localeCompare(b.invoice_no));
  return rows;
}

// ---------- auth routes ----------

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    let users = await store.list("users");
    if (users.length === 0) {
      const name = String(req.body.name || "").trim();
      if (!username || !name || password.length < 6) {
        return res.status(400).json({ ok: false, needsSetup: true, error: "Укажите логин, имя и пароль (не короче 6 символов)" });
      }
      await store.insert("users", { username, password_hash: await hashPassword(password), name, role: "admin", company_id: "", active: 1 });
      users = await store.list("users");
    }
    const user = users.find((u) => u.username === username);
    if (!user || Number(user.active) !== 1) return res.status(401).json({ ok: false, error: "Неверный логин или пароль" });
    const good = await verifyPassword(password, user.password_hash);
    if (!good) return res.status(401).json({ ok: false, error: "Неверный логин или пароль" });
    const publicUser = await loadUser(Number(user.id));
    res.setHeader("set-cookie", makeSessionCookie(signSession(Number(user.id))));
    res.json({ ok: true, user: publicUser });
  } catch (e) {
    console.error("login error:", e);
    res.status(500).json({ ok: false, error: "Ошибка сервера: " + (e && e.message ? e.message : String(e)) });
  }
});
app.post("/api/auth/logout", (req, res) => {
  res.setHeader("set-cookie", clearSessionCookie());
  res.json({ ok: true });
});
app.get("/api/me", requireAuth, (req, res) => res.json({ ok: true, user: req.user }));
app.post("/api/me/password", requireAuth, async (req, res) => {
  try {
    const users = await store.list("users");
    const u = users.find((x) => Number(x.id) === Number(req.user.id));
    const ok = await verifyPassword(String(req.body.current || ""), u.password_hash);
    if (!ok) return res.status(400).json({ ok: false, error: "Текущий пароль неверен" });
    if (String(req.body.next || "").length < 6) return res.status(400).json({ ok: false, error: "Новый пароль короче 6 символов" });
    await store.update("users", u.id, { password_hash: await hashPassword(String(req.body.next)) });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// ---------- stock & stats ----------

app.get("/api/stock", requireAuth, async (req, res) => {
  try {
    res.json({ ok: true, rows: await computeStock(req.user) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// Consolidated summary per logistics: goods held, total, paid, remaining.
app.get("/api/summary", requireAuth, async (req, res) => {
  try {
    const scope = scopeLogId(req.user);
    const stock = await computeStock(req.user);
    const shipments = await store.list("shipments");
    const logistics = await store.list("logistics");
    const loadTrucks = await store.list("load_trucks");
    const groups = [];
    for (const log of logistics) {
      if (scope != null && Number(log.id) !== Number(scope)) continue;
      const lid = Number(log.id);
      const logShip = shipments.filter((s) => Number(s.logistics_id) === lid);
      const logLoads = loadTrucks.filter((l) => Number(l.logistics_id) === lid);
      const rows = stock.filter((r) => r.logistics_id === lid);
      if (rows.length === 0 && logLoads.length === 0 && logShip.length === 0) continue;
      groups.push({
        logistics_id: lid,
        logistics_name: log.name,
        models: rows.length,
        totalQty: rows.reduce((a, r) => a + r.qty, 0),
        totalCbm: +rows.reduce((a, r) => a + r.cbm, 0).toFixed(2),
        totalReceived: rows.reduce((a, r) => a + r.received, 0),
        totalShipped: rows.reduce((a, r) => a + r.shipped, 0),
        totalPaid: logShip.reduce((a, s) => a + (Number(s.cost_amount) || 0), 0),
        loadings: logLoads.length,
        shipments: logShip.length,
        stock: rows,
      });
    }
    groups.sort((a, b) => a.logistics_name.localeCompare(b.logistics_name, "ru"));
    res.json({ ok: true, groups });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

app.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const scope = scopeLogId(req.user);
    const stock = await computeStock(req.user);
    const loadings = await store.list("loadings");
    const shipments = await store.list("shipments");
    const inL = loadings.filter((l) => scope == null || Number(l.logistics_id) === Number(scope));
    const inS = shipments.filter((s) => scope == null || Number(s.logistics_id) === Number(scope));
    const totalQty = stock.reduce((a, r) => a + r.qty, 0);
    const totalCbm = stock.reduce((a, r) => a + r.cbm, 0);
    const totalCost = inS.reduce((a, s) => a + (Number(s.cost_amount) || 0), 0);
    res.json({
      ok: true,
      stats: {
        models: stock.length, totalQty, totalCbm, totalCost,
        totalCostCurrency: inS[0]?.cost_currency || "USD",
        loadings: inL.length, shipments: inS.length,
      },
    });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// ---------- models ----------

app.get("/api/models", requireAuth, async (req, res) => {
  try {
    const rows = await store.list("models");
    res.json({ ok: true, models: rows.map((m) => ({ ...m, id: Number(m.id), cbm_per_pc: parseCbm(m.cbm_per_pc) })) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.post("/api/models", requireAuth, requireAdmin, async (req, res) => {
  try {
    const model = String(req.body.model || "").trim();
    if (!model) return res.status(400).json({ ok: false, error: "Укажите модель" });
    if ((await store.list("models")).some((m) => String(m.model).toLowerCase() === model.toLowerCase()))
      return res.status(400).json({ ok: false, error: "Такая модель уже есть" });
    const cbm = req.body.cbm_per_pc !== undefined && req.body.cbm_per_pc !== "" ? Number(String(req.body.cbm_per_pc).replace(",", ".")) : "";
    if (!(cbm > 0)) return res.status(400).json({ ok: false, error: "Укажите CBM за 1 шт (обязательно)" });
    const id = await store.insert("models", {
      model, category: req.body.category || "",
      cbm_per_pc: cbm, notes: req.body.notes || "", created_at: new Date().toISOString(),
    });
    res.json({ ok: true, id });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.put("/api/models/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const cbm = req.body.cbm_per_pc !== undefined && req.body.cbm_per_pc !== "" ? Number(String(req.body.cbm_per_pc).replace(",", ".")) : "";
    if (!(cbm > 0)) return res.status(400).json({ ok: false, error: "Укажите CBM за 1 шт (обязательно)" });
    await store.update("models", req.params.id, {
      model: req.body.model || "", category: req.body.category || "",
      cbm_per_pc: cbm, notes: req.body.notes || "",
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.delete("/api/models/:id", requireAuth, requireAdmin, async (req, res) => {
  try { await store.remove("models", req.params.id); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// ---------- factories ----------

app.get("/api/factories", requireAuth, async (req, res) => {
  try { res.json({ ok: true, factories: (await store.list("factories")).map((f) => ({ ...f, id: Number(f.id) })) }); }
  catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.post("/api/factories", requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Укажите название" });
    const id = await store.insert("factories", {
      name, location: req.body.location || "", contact_name: req.body.contact_name || "",
      contact_phone: req.body.contact_phone || "", notes: req.body.notes || "", created_at: new Date().toISOString(),
    });
    res.json({ ok: true, id });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.put("/api/factories/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await store.update("factories", req.params.id, {
      name: req.body.name || "", location: req.body.location || "", contact_name: req.body.contact_name || "",
      contact_phone: req.body.contact_phone || "", notes: req.body.notes || "",
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.delete("/api/factories/:id", requireAuth, requireAdmin, async (req, res) => {
  try { await store.remove("factories", req.params.id); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// ---------- logistics ----------

app.get("/api/logistics", requireAuth, async (req, res) => {
  try { res.json({ ok: true, logistics: (await store.list("logistics")).map((l) => ({ ...l, id: Number(l.id) })) }); }
  catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.post("/api/logistics", requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Укажите название" });
    const id = await store.insert("logistics", {
      name, city: req.body.city || "", contact_name: req.body.contact_name || "",
      contact_phone: req.body.contact_phone || "", notes: req.body.notes || "", created_at: new Date().toISOString(),
    });
    res.json({ ok: true, id });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.put("/api/logistics/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await store.update("logistics", req.params.id, {
      name: req.body.name || "", city: req.body.city || "", contact_name: req.body.contact_name || "",
      contact_phone: req.body.contact_phone || "", notes: req.body.notes || "",
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.delete("/api/logistics/:id", requireAuth, requireAdmin, async (req, res) => {
  try { await store.remove("logistics", req.params.id); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// ---------- loadings (trucks from factory) ----------

app.get("/api/trucks", requireAuth, async (req, res) => {
  try {
    const scope = scopeLogId(req.user);
    const { models } = await refs();
    const factories = await store.list("factories");
    const logistics = await store.list("logistics");
    let rows = await store.list("load_trucks");
    if (scope != null) rows = rows.filter((l) => Number(l.logistics_id) === Number(scope));
    const result = rows.map((t) => ({
      ...t, id: Number(t.id), logistics_id: Number(t.logistics_id), factory_id: Number(t.factory_id),
      logistics_name: (logistics.find((x) => Number(x.id) === Number(t.logistics_id)) || {}).name || "",
      factory_name: (factories.find((x) => Number(x.id) === Number(t.factory_id)) || {}).name || "",
      lines: enrichLines(t.lines, models),
    })).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    res.json({ ok: true, trucks: result });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

app.post("/api/trucks", requireAuth, async (req, res) => {
  try {
    const logistics_id = Number(req.body.logistics_id);
    if (req.user.role === "logistic" && logistics_id !== req.user.company_id)
      return res.status(403).json({ ok: false, error: "Только для своей компании" });
    if (!logistics_id) return res.status(400).json({ ok: false, error: "Выберите логиста" });
    const invoice_no = String(req.body.invoice_no || "").trim();
    if (!invoice_no) return res.status(400).json({ ok: false, error: "Укажите номер инвойса (обязательно)" });
    const lines = Array.isArray(req.body.lines) ? req.body.lines.filter((l) => l.qty > 0) : [];
    if (lines.length === 0) return res.status(400).json({ ok: false, error: "Добавьте хотя бы одну модель" });
    await store.insert("load_trucks", {
      logistics_id, factory_id: Number(req.body.factory_id) || "",
      truck_no: req.body.truck_no || "", invoice_no,
      date: req.body.date || new Date().toISOString().slice(0, 10),
      lines: JSON.stringify(lines.map((l) => ({ model_id: Number(l.model_id), qty: Number(l.qty) }))),
      notes: req.body.notes || "", created_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

app.put("/api/trucks/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const all = await store.list("load_trucks");
    const t = all.find((x) => Number(x.id) === id);
    if (!t) return res.status(404).json({ ok: false, error: "Загрузка не найдена" });
    if (req.user.role === "logistic" && Number(t.logistics_id) !== req.user.company_id)
      return res.status(403).json({ ok: false, error: "Нет доступа" });
    const invoice_no = String(req.body.invoice_no || "").trim();
    if (!invoice_no) return res.status(400).json({ ok: false, error: "Укажите номер инвойса (обязательно)" });
    const lines = Array.isArray(req.body.lines) ? req.body.lines.filter((l) => l.qty > 0) : [];
    if (lines.length === 0) return res.status(400).json({ ok: false, error: "Добавьте хотя бы одну модель" });
    await store.update("load_trucks", id, {
      factory_id: Number(req.body.factory_id) || t.factory_id,
      truck_no: req.body.truck_no || "", invoice_no,
      date: req.body.date || t.date,
      lines: JSON.stringify(lines.map((l) => ({ model_id: Number(l.model_id), qty: Number(l.qty) }))),
      notes: req.body.notes || "",
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

app.delete("/api/trucks/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const all = await store.list("load_trucks");
    const t = all.find((x) => Number(x.id) === id);
    if (!t) return res.status(404).json({ ok: false, error: "Загрузка не найдена" });
    if (req.user.role === "logistic" && Number(t.logistics_id) !== req.user.company_id)
      return res.status(403).json({ ok: false, error: "Нет доступа" });
    await store.remove("load_trucks", id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// ---------- shipments ----------

app.get("/api/shipments", requireAuth, async (req, res) => {
  try {
    const scope = scopeLogId(req.user);
    const { models } = await refs();
    const logistics = await store.list("logistics");
    let rows = await store.list("shipments");
    if (scope != null) rows = rows.filter((s) => Number(s.logistics_id) === Number(scope));
    const result = rows.map((s) => ({
      ...s, id: Number(s.id), logistics_id: Number(s.logistics_id),
      logistics_name: (logistics.find((l) => Number(l.id) === Number(s.logistics_id)) || {}).name || "",
      lines: enrichLines(s.lines, models),
    })).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    res.json({ ok: true, shipments: result });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

app.post("/api/shipments", requireAuth, async (req, res) => {
  try {
    const logistics_id = Number(req.body.logistics_id);
    if (req.user.role === "logistic" && logistics_id !== req.user.company_id)
      return res.status(403).json({ ok: false, error: "Только для своей компании" });
    if (!logistics_id) return res.status(400).json({ ok: false, error: "Выберите логиста" });
    const lines = Array.isArray(req.body.lines) ? req.body.lines.filter((l) => l.qty > 0) : [];
    if (lines.length === 0) return res.status(400).json({ ok: false, error: "Добавьте хотя бы одну модель" });
    for (const l of lines) {
      const avail = await availableQty(logistics_id, Number(l.model_id));
      if (Number(l.qty) > avail) return res.status(400).json({ ok: false, error: `У модели ${l.model_id} нельзя отгрузить больше, чем на складе (доступно ${avail})` });
    }
    const cost = Number(req.body.cost_amount);
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ ok: false, error: "Укажите стоимость фуры" });
    await store.insert("shipments", {
      logistics_id,
      date: req.body.date || new Date().toISOString().slice(0, 10),
      truck_no: req.body.truck_no || "", volume_m3: req.body.volume_m3 ? Number(req.body.volume_m3) : "",
      cost_amount: cost, cost_currency: req.body.cost_currency || "USD",
      lines: JSON.stringify(lines.map((l) => ({ model_id: Number(l.model_id), qty: Number(l.qty) }))),
      notes: req.body.notes || "", created_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

app.put("/api/shipments/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const all = await store.list("shipments");
    const s = all.find((x) => Number(x.id) === id);
    if (!s) return res.status(404).json({ ok: false, error: "Отгрузка не найдена" });
    if (req.user.role === "logistic" && Number(s.logistics_id) !== req.user.company_id)
      return res.status(403).json({ ok: false, error: "Нет доступа" });
    const lines = Array.isArray(req.body.lines) ? req.body.lines.filter((l) => l.qty > 0) : [];
    if (lines.length === 0) return res.status(400).json({ ok: false, error: "Добавьте хотя бы одну модель" });
    for (const l of lines) {
      const avail = await availableQty(Number(s.logistics_id), Number(l.model_id), id);
      if (Number(l.qty) > avail) return res.status(400).json({ ok: false, error: `У модели ${l.model_id} нельзя отгрузить больше, чем на складе (доступно ${avail})` });
    }
    const cost = Number(req.body.cost_amount);
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ ok: false, error: "Укажите стоимость" });
    await store.update("shipments", id, {
      date: req.body.date || s.date, truck_no: req.body.truck_no || "",
      volume_m3: req.body.volume_m3 ? Number(req.body.volume_m3) : "",
      cost_amount: cost, cost_currency: req.body.cost_currency || "USD",
      lines: JSON.stringify(lines.map((l) => ({ model_id: Number(l.model_id), qty: Number(l.qty) }))),
      notes: req.body.notes || "",
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

app.delete("/api/shipments/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const all = await store.list("shipments");
    const s = all.find((x) => Number(x.id) === id);
    if (!s) return res.status(404).json({ ok: false, error: "Отгрузка не найдена" });
    if (req.user.role === "logistic" && Number(s.logistics_id) !== req.user.company_id)
      return res.status(403).json({ ok: false, error: "Нет доступа" });
    await store.remove("shipments", id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// Seed factories + models from the user's Excel example (idempotent).
// FISH is the LOGISTICS company; the file holds goods from two factories.
const SEED_LOGISTICS = ["FISH"];
const SEED_FACTORIES = ["Hangdi", "Jidea"];
const SEED_MODELS = [
  ["8BS", "0.112685625"], ["8MT", "0.112685625"], ["8FB", "0.112685625"], ["8BSR", "0.112685625"],
  ["8FBR", "0.112685625"], ["8BSB", "0.112685625"], ["9BS", "0.112685625"], ["9MT", "0.112685625"],
  ["9FB", "0.112685625"], ["9BSR", "0.112685625"], ["9FBR", "0.112685625"], ["10BSB", "0.112685625"],
  ["BLACK T8", "0.345"], ["BLACK 10 DD", "0.36923616"], ["RED T7", "0.345"], ["RED T8", "0.345"],
];
app.post("/api/seed", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Full reset: clear existing reference data + movements, then reload from the example.
    await store.clear("load_trucks");
    await store.clear("shipments");
    await store.clear("factories");
    await store.clear("logistics");
    await store.clear("models");
    for (const name of SEED_LOGISTICS) {
      await store.insert("logistics", { name, city: "", contact_name: "", contact_phone: "", notes: "", created_at: new Date().toISOString() });
    }
    for (const name of SEED_FACTORIES) {
      await store.insert("factories", { name, location: "", contact_name: "", contact_phone: "", notes: "", created_at: new Date().toISOString() });
    }
    for (const [model, cbm] of SEED_MODELS) {
      await store.insert("models", { model, category: "", cbm_per_pc: Number(cbm), notes: "", created_at: new Date().toISOString() });
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// ---------- users (admin) ----------

app.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const logistics = await store.list("logistics");
    const users = (await store.list("users")).map((u) => {
      const company_name = u.role === "logistic" ? (logistics.find((l) => Number(l.id) === Number(u.company_id)) || {}).name || null : null;
      const { password_hash, ...rest } = u;
      return { ...rest, id: Number(u.id), company_name };
    });
    res.json({ ok: true, users });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "");
    if (!username || !name || password.length < 6) return res.status(400).json({ ok: false, error: "Заполните логин, имя и пароль (мин. 6)" });
    if (!["admin", "logistic"].includes(role)) return res.status(400).json({ ok: false, error: "Неверная роль" });
    let company_id = "";
    if (role === "logistic") {
      company_id = Number(req.body.company_id);
      if (!company_id) return res.status(400).json({ ok: false, error: "Выберите логиста" });
    }
    if ((await store.list("users")).some((u) => u.username === username)) return res.status(400).json({ ok: false, error: "Логин занят" });
    await store.insert("users", { username, name, password_hash: await hashPassword(password), role, company_id, active: 1 });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.put("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const users = await store.list("users");
    const target = users.find((u) => Number(u.id) === id);
    if (!target) return res.status(404).json({ ok: false, error: "Пользователь не найден" });
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Укажите имя" });
    const role = String(req.body.role || target.role);
    let company_id = role === "admin" ? "" : (Number(req.body.company_id) || target.company_id || "");
    const active = req.body.active ? 1 : 0;
    if (id === req.user.id && !active) return res.status(400).json({ ok: false, error: "Нельзя отключить себя" });
    const patch = { name, role, company_id, active };
    if (req.body.password) patch.password_hash = await hashPassword(String(req.body.password));
    await store.update("users", id, patch);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});
app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ ok: false, error: "Нельзя удалить себя" });
    await store.remove("users", req.params.id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: "Ошибка сервера" }); }
});

// ---------- SPA fallback ----------

app.get(["/", "/login"], (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

(async () => {
  await store.ensureTables();
  app.listen(PORT, () => console.log(`IMMER Logistika listening on ${PORT}`));
})().catch((e) => {
  console.error("Failed to init:", e);
  process.exit(1);
});