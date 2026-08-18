:root {
  --bg: #f6f5f1;
  --surface: #ffffff;
  --surface-2: #efede6;
  --fg: #1b1a17;
  --muted: #6f6c63;
  --brand: #d7151f;
  --accent: #fbebea;
  --accent-fg: #8a1118;
  --danger: #c0392b;
  --border: #e5e2d9;
  --border-strong: #d5d2c6;
  --radius: 12px;
}

* { box-sizing: border-box; border-color: var(--border); }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  font-size: 15px;
}
#app { min-height: 100vh; }

/* Layout */
.shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 230px; flex-shrink: 0; background: var(--surface);
  border-right: 1px solid var(--border); display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
}
.sidebar .brand { padding: 22px 20px 16px; }
.sidebar nav { flex: 1; padding: 4px 10px; display: flex; flex-direction: column; gap: 2px; }
.sidebar nav a {
  display: block; padding: 9px 12px; border-radius: 8px; color: var(--fg);
  opacity: .72; text-decoration: none; font-weight: 500; font-size: 14px;
}
.sidebar nav a:hover { background: var(--surface-2); opacity: 1; }
.sidebar nav a.active { background: var(--accent); color: var(--accent-fg); opacity: 1; }
.sidebar nav .nav-label { margin: 18px 12px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.sidebar .foot {
  border-top: 1px solid var(--border); padding: 14px 20px; font-size: 12px; color: var(--muted);
}
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.shell.nav-collapsed .sidebar { display: none; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--border); background: var(--surface);
  padding: 12px 28px; gap: 12px;
}
.topbar .role { color: var(--muted); font-size: 14px; }
.topbar .role b { color: var(--fg); }
.content { flex: 1; padding: 26px 28px; }
.wrap { max-width: 1600px; margin: 0 auto; }

/* Logo */
.logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.logo .brand-img { height: 40px; width: 40px; object-fit: contain; }
.logo .brand-text { font-weight: 800; letter-spacing: .18em; color: var(--fg); font-size: 17px; }
.logo .dot {
  width: 34px; height: 34px; border-radius: 50%; background: var(--brand);
  display: grid; place-items: center; flex-shrink: 0;
}
.logo .dot i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; display: block; }
.logo span { font-weight: 800; letter-spacing: .18em; color: var(--fg); font-size: 17px; }

/* Typography */
h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -.01em; }
.sub { color: var(--muted); margin: 0 0 22px; font-size: 14px; }
h2 { font-size: 14px; color: var(--fg); opacity: .78; margin: 0 0 14px; text-transform: uppercase; letter-spacing: .04em; }

/* Cards */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
.grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 22px; }
.stat .num { font-size: 26px; font-weight: 700; }
.stat .num.red { color: var(--brand); }
.stat .lbl { color: var(--muted); font-size: 13px; margin-top: 2px; }
.row { display: flex; gap: 22px; flex-wrap: wrap; }
.col { flex: 1; min-width: 300px; }

/* Buttons */
button, .btn {
  border: 0; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 500;
  border-radius: 8px; padding: 10px 16px; background: var(--brand); color: #fff;
}
button:hover { opacity: .9; }
button:disabled { opacity: .5; cursor: not-allowed; }
.btn.ghost { background: var(--surface); border: 1px solid var(--border-strong); color: var(--fg); }
.btn.danger { background: transparent; color: var(--danger); border: 0; }
.btn.sm { padding: 6px 10px; font-size: 13px; }
.btn.link { background: none; color: var(--accent-fg); padding: 0; font-weight: 600; }
.btn.link.danger { color: var(--danger); }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }

/* Compact summary bar (Финансы) */
.fin-bar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 9px 14px; margin-bottom: 14px; font-size: 14px;
}
.fin-stat { white-space: nowrap; }
.fin-stat b { font-weight: 700; }
.fin-hint { color: var(--muted); font-size: 12px; }

/* Forms */
label { display: block; font-weight: 500; font-size: 13px; margin-bottom: 6px; }
input, select, textarea {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border-strong);
  border-radius: 8px; background: var(--bg); font-family: inherit; font-size: 14px; color: var(--fg);
}
input:focus, select:focus, textarea:focus { outline: 2px solid var(--brand); outline-offset: 0; border-color: transparent; }
.form { display: grid; gap: 14px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
.formerror { color: var(--danger); font-size: 13px; }

/* Table */
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th { text-align: left; color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.table td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
.table tr:last-child td { border-bottom: 0; }
.table a.order { color: var(--accent-fg); font-weight: 600; text-decoration: none; }
.table a.order:hover { text-decoration: underline; }
.tbl-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: auto; }
.f-input { width: 100%; min-width: 80px; padding: 4px 6px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--bg); font-size: 12px; color: var(--fg); }
.f-input:focus { outline: 1px solid var(--brand); }
.mfilter { position: relative; }
.mfilter-pop { position: absolute; z-index: 60; top: 100%; left: 0; margin-top: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.12); padding: 8px; min-width: 180px; max-height: 260px; overflow: auto; }
.mf-list { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.mf-opt { display: flex; gap: 6px; align-items: center; font-size: 13px; padding: 2px 0; cursor: pointer; }
.mf-opt input { width: auto; }

/* Badge */
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.b-new { background: #f1f5f9; color: #334155; }
.b-picked_up { background: #fef3c7; color: #92400e; }
.b-to_border { background: #e0f2fe; color: #075985; }
.b-at_border { background: #e0e7ff; color: #3730a3; }
.b-truck_change { background: #ffedd5; color: #9a3412; }
.b-shipped { background: #ede9fe; color: #5b21b6; }
.b-delivered { background: #d1fae5; color: #065f46; }

/* Timeline */
.timeline { position: relative; margin-left: 8px; padding-left: 22px; border-left: 2px solid var(--border); }
.tl-item { position: relative; padding-bottom: 18px; }
.tl-item:last-child { padding-bottom: 0; }
.tl-item::before {
  content: ""; position: absolute; left: -29px; top: 4px; width: 12px; height: 12px;
  border-radius: 50%; background: var(--brand); border: 3px solid var(--surface);
}
.tl-item .meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }
.tl-item .when { color: var(--muted); font-size: 12px; }
.tl-item p { margin: 4px 0 0; }
.emptystate { color: var(--muted); font-size: 14px; padding: 24px; text-align: center; border: 1px dashed var(--border); border-radius: var(--radius); }

/* Login */
.login-wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.login-card { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,.05); }
.login-card .logo { justify-content: center; margin-bottom: 22px; }
.login-card h1 { font-size: 20px; text-align: center; }
.login-card .sub { text-align: center; }
.login-card .toggle { background: none; border: 0; color: var(--accent-fg); font-size: 13px; font-weight: 600; margin-top: 14px; cursor: pointer; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(20,20,16,.4); display: grid; place-items: center; padding: 18px; z-index: 50; }
.modal { background: var(--surface); border-radius: 14px; width: 100%; max-width: 480px; padding: 24px; max-height: 90vh; overflow: auto; }
.modal-wide { max-width: 1000px; }
.modal h3 { margin: 0 0 4px; }
@media (max-width: 640px) {
  .sidebar { display: none; }
  .grid2 { grid-template-columns: 1fr; }
  .content { padding: 18px 14px; }
  .topbar { padding: 12px 14px; }
}