// Auth: PBKDF2 password hashing + HMAC-signed session cookies.
// Pure Node.js (crypto) — no native modules.
const crypto = require("crypto");

const SESSION_COOKIE = "immer_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ITERATIONS = 65000;

function getSecret() {
  return process.env.AUTH_SECRET || "local-dev-insecure-secret-change-me";
}

function b64(buf) {
  return buf.toString("base64");
}
function b64url(s) {
  return Buffer.from(s, "base64").toString("base64url");
}

function hmac(data) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  return `pbkdf2:${ITERATIONS}:${b64(salt)}:${b64(hash)}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  const actual = crypto.pbkdf2Sync(password, salt, Number(parts[1]), expected.length, "sha256");
  return crypto.timingSafeEqual(actual, expected);
}

function signSession(uid) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = b64url(b64(Buffer.from(JSON.stringify({ uid, exp }))));
  return `${payload}.${hmac(payload)}`;
}

function verifySession(token) {
  const dot = token ? token.indexOf(".") : -1;
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.uid !== "number" || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

// Parse a cookie by name from a req.
function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function makeSessionCookie(token) {
  const secure = process.env.NODE_ENV === "production";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  readCookie,
  makeSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
};