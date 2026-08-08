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

function isAdmin(u) {
  return u.role === "admin";
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ ok: false, error: "Нет доступа" });
  next();
}

// Return the logistics scope for a user: null = all, else company_id.
function scopeLogId(u) {
  if (isAdmin(u)) return null;
  if (u.role === "logistic") return u.company_id;
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

async function refs() {
  const [factories, logistics, models] = await Promise.all([
    store.list("factories"),
    store.list("logistics"),
    store.list("models"),
  ]);
  return {
    factories: factories.map((f) => ({ ...f, id: Number(f.id) })),
    logistics: logistics.map((l) => ({ ...l, id: Number(l.id) })),
    models: models.map((m) => ({ ...m, id: Number(m.id) })),
  };
}

// Stock by model per logistics.
async function computeStock(u) {
  const { factories, logistics, models } = await refs();
  const receipts = await store.list("receipts");
  const shipments = await store.list("shipments");
  const scope = scopeLogId(u);

  const rows = [];
  for (const model of models) {
    for (const log of logistics) {
      if (scope != null && Number(log.id) !== Number(scope)) continue;
      let inQty = 0;
      let outQty = 0;
      let lastFactory = null; // factory of latest receipt containing this model
      let lastReceiptDate = "";
      let cost = 0;
      let costCurrency = "";
      // receipts
      for (const r of receipts) {
        if (Number(r.logistics_id) !== Number(log.id)) continue;
        const lines = parseLines(r.lines);
        const line = lines.find((li) => Number(li.model_id) === Number(model.id));
        if (!line) continue;
        inQty += Number(line.qty) || 0;
        if (String(r.date || "") >= lastReceiptDate) {
          lastReceiptDate = String(r.date || "");
          lastFactory = Number(r.factory_id);
        }
      }
      // shipments
      for (const s of shipments) {
        if (Number(s.logistics_id) !== Number(log.id)) continue;
        const lines = parseLines(s.lines);
        const line = lines.find((li) => Number(li.model_id) === Number(model.id));
        if (!line) continue;
        outQty += Number(line.qty) || 0;
        cost += Number(s.cost_amount) || 0;
        costCurrency = s.cost_currency || costCurrency;
      }
      if (inQty === 0 && outQty === 0) continue;
      const factory = factories.find((f) => Number(f.id) === Number(lastFactory));
      rows.push({
        model_id: Number(model.id),
        model_name: model.model,
        category: model.category || "",
        logistics_id: Number(log.id),
        logistics_name: log.name,
        qty: inQty - outQty,
        received: inQty,
        shipped: outQty,
        factory_id: lastFactory,
        factory_name: factory ? factory.name : "",
        cost_amount: cost,
        cost_currency: costCurrency,
      });
    }
  }
  return rows;
}

function enrichLines(lines, models) {
  return parseLines(lines).map((li) => {
    const m = models.find((x) => Number(x.id) === Number(li.model_id));
    return { model_id: Number(li.model_id), model_name: m ? m.model : li.model_id, qty: Number(li.qty) || 0 };
  });
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
      await store.insert("users", {
        username, password_hash: await hashPassword(password), name, role: "admin", company_id: "", active: 1,
      });
      // Re-read: the admin was just created, so the old list is stale.
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
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
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
    if (String(req.body.next || "").length < 6) return res.status(400).json({ ok: false, error: "Новый пароль не короче 6 символов" });
    await store.update("users", u.id, { password_hash: await hashPassword(String(req.body.next)) });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

// ---------- stock & stats ----------

app.get("/api/stock", requireAuth, async (req, res) => {
  try {
    const rows = await computeStock(req.user);
    rows.sort((a, b) => a.model_name.localeCompare(b.model_name, "ru"));
    res.json({ ok: true, rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const scope = scopeLogId(req.user);
    const stock = await computeStock(req.user);
    const receipts = await store.list("receipts");
    const shipments = await store.list("shipments");
    const inScopeR = receipts.filter((r) => scope == null || Number(r.logistics_id) === Number(scope));
    const inScopeS = shipments.filter((s) => scope == null || Number(s.logistics_id) === Number(scope));
    const totalQty = stock.reduce((a, r) => a + r.qty, 0);
    const totalCost = inScopeS.reduce((a, s) => a + (Number(s.cost_amount) || 0), 0);
    const recentR = inScopeR.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
    const recentS = inScopeS.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
    res.json({
      ok: true,
      stats: {
        models: stock.length,
        totalQty,
        totalCost,
        totalCostCurrency: inScopeS[0]?.cost_currency || "USD",
        receipts: inScopeR.length,
        shipments: inScopeS.length,
      },
      recentR,
      recentS,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

// ---------- models ----------

app.get("/api/models", requireAuth, async (req, res) => {
  try {
    const models = await store.list("models");
    res.json({ ok: true, models: models.map((m) => ({ ...m, id: Number(m.id) })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.post("/api/models", requireAuth, requireAdmin, async (req, res) => {
  try {
    const model = String(req.body.model || "").trim();
    if (!model) return res.status(400).json({ ok: false, error: "Укажите модель" });
    const duplicate = (await store.list("models")).some((m) => String(m.model).toLowerCase() === model.toLowerCase());
    if (duplicate) return res.status(400).json({ ok: false, error: "Такая модель уже есть" });
    const id = await store.insert("models", {
      model, category: req.body.category || "", notes: req.body.notes || "", created_at: new Date().toISOString(),
    });
    res.json({ ok: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.put("/api/models/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await store.update("models", req.params.id, {
      model: req.body.model || "", category: req.body.category || "", notes: req.body.notes || "",
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.delete("/api/models/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await store.remove("models", req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

// ---------- factories (reference) ----------

app.get("/api/factories", requireAuth, async (req, res) => {
  try {
    const rows = await store.list("factories");
    res.json({ ok: true, factories: rows.map((f) => ({ ...f, id: Number(f.id) })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.put("/api/factories/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await store.update("factories", req.params.id, {
      name: req.body.name || "", location: req.body.location || "", contact_name: req.body.contact_name || "",
      contact_phone: req.body.contact_phone || "", notes: req.body.notes || "",
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.delete("/api/factories/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await store.remove("factories", req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

// ---------- logistics ----------

app.get("/api/logistics", requireAuth, async (req, res) => {
  try {
    const rows = await store.list("logistics");
    res.json({ ok: true, logistics: rows.map((l) => ({ ...l, id: Number(l.id) })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.put("/api/logistics/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await store.update("logistics", req.params.id, {
      name: req.body.name || "", city: req.body.city || "", contact_name: req.body.contact_name || "",
      contact_phone: req.body.contact_phone || "", notes: req.body.notes || "",
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.delete("/api/logistics/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await store.remove("logistics", req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

// ---------- receipts (factory → warehouse) ----------

app.get("/api/receipts", requireAuth, async (req, res) => {
  try {
    const scope = scopeLogId(req.user);
    const { models } = await refs();
    let rows = await store.list("receipts");
    if (scope != null) rows = rows.filter((r) => Number(r.logistics_id) === Number(scope));
    const logistics = await store.list("logistics");
    const factories = await store.list("factories");
    rows = rows.map((r) => ({
      ...r,
      id: Number(r.id),
      logistics_id: Number(r.logistics_id),
      factory_id: Number(r.factory_id),
      logistics_name: (logistics.find((l) => Number(l.id) === Number(r.logistics_id)) || {}).name || "",
      factory_name: (factories.find((f) => Number(f.id) === Number(r.factory_id)) || {}).name || "",
      lines: enrichLines(r.lines, models),
    })).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    res.json({ ok: true, receipts: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.post("/api/receipts", requireAuth, async (req, res) => {
  try {
    const logistics_id = Number(req.body.logistics_id);
    const factory_id = Number(req.body.factory_id);
    if (req.user.role === "logistic" && logistics_id !== req.user.company_id) {
      return res.status(403).json({ ok: false, error: "Только для своей компании" });
    }
    if (!logistics_id) return res.status(400).json({ ok: false, error: "Выберите логиста" });
    const lines = Array.isArray(req.body.lines) ? req.body.lines.filter((l) => l.qty > 0) : [];
    if (lines.length === 0) return res.status(400).json({ ok: false, error: "Добавьте хотя бы одну модель" });
    await store.insert("receipts", {
      logistics_id, factory_id: factory_id || "",
      date: req.body.date || new Date().toISOString().slice(0, 10),
      truck_no: req.body.truck_no || "", volume_m3: req.body.volume_m3 ? Number(req.body.volume_m3) : "",
      lines: JSON.stringify(lines.map((l) => ({ model_id: Number(l.model_id), qty: Number(l.qty) }))),
      created_by: req.user.id, created_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

// ---------- shipments (warehouse → Uzbekistan) ----------

app.get("/api/shipments", requireAuth, async (req, res) => {
  try {
    const scope = scopeLogId(req.user);
    const { models } = await refs();
    let rows = await store.list("shipments");
    if (scope != null) rows = rows.filter((s) => Number(s.logistics_id) === Number(scope));
    const logistics = await store.list("logistics");
    rows = rows.map((s) => ({
      ...s,
      id: Number(s.id),
      logistics_id: Number(s.logistics_id),
      logistics_name: (logistics.find((l) => Number(l.id) === Number(s.logistics_id)) || {}).name || "",
      lines: enrichLines(s.lines, models),
    })).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    res.json({ ok: true, shipments: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.post("/api/shipments", requireAuth, async (req, res) => {
  try {
    const logistics_id = Number(req.body.logistics_id);
    if (req.user.role === "logistic" && logistics_id !== req.user.company_id) {
      return res.status(403).json({ ok: false, error: "Только для своей компании" });
    }
    if (!logistics_id) return res.status(400).json({ ok: false, error: "Выберите логиста" });
    const lines = Array.isArray(req.body.lines) ? req.body.lines.filter((l) => l.qty > 0) : [];
    if (lines.length === 0) return res.status(400).json({ ok: false, error: "Добавьте хотя бы одну модель" });
    const cost = Number(req.body.cost_amount);
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ ok: false, error: "Укажите стоимость фуры" });
    await store.insert("shipments", {
      logistics_id,
      date: req.body.date || new Date().toISOString().slice(0, 10),
      truck_no: req.body.truck_no || "", volume_m3: req.body.volume_m3 ? Number(req.body.volume_m3) : "",
      cost_amount: cost, cost_currency: req.body.cost_currency || "USD",
      lines: JSON.stringify(lines.map((l) => ({ model_id: Number(l.model_id), qty: Number(l.qty) }))),
      created_by: req.user.id, created_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.put("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const users = await store.list("users");
    const target = users.find((u) => Number(u.id) === Number(id));
    if (!target) return res.status(404).json({ ok: false, error: "Пользователь не найден" });
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Укажите имя" });
    const role = String(req.body.role || target.role);
    let company_id = role === "admin" ? "" : (Number(req.body.company_id) || target.company_id || "");
    const active = req.body.active ? 1 : 0;
    if (Number(id) === req.user.id && !active) return res.status(400).json({ ok: false, error: "Нельзя отключить себя" });
    const patch = { name, role, company_id, active };
    if (req.body.password) patch.password_hash = await hashPassword(String(req.body.password));
    await store.update("users", id, patch);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ ok: false, error: "Нельзя удалить себя" });
    await store.remove("users", req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

// ---------- SPA fallback ----------

app.get(["/", "/login"], (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ---------- boot ----------

(async () => {
  await store.ensureTables();
  app.listen(PORT, () => console.log(`IMMER Logistika listening on ${PORT}`));
})().catch((e) => {
  console.error("Failed to init:", e);
  process.exit(1);
});
