// Auth: PBKDF2 password hashing + HMAC-signed session cookies.
// Pure Node.js (crypto) — no native modules.
const crypto = require("crypto");

const SESSION_COOKIE = "immer_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ITERATIONS = 65000;

// Render sets RENDER=true; some platforms set NODE_ENV=production.
const IS_PROD = process.env.NODE_ENV === "production" || !!process.env.RENDER;

// BUG-006: never fall back to a known/default secret in production.
// If AUTH_SECRET is missing/weak on a real deploy, session cookies could be forged
// (anyone could sign {uid:1} and log in as admin). Fail loudly instead.
// For local dev over http you may set ALLOW_INSECURE_SECRET=1.
function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (IS_PROD && !process.env.ALLOW_INSECURE_SECRET) {
    throw new Error(
      "AUTH_SECRET is not set (or shorter than 16 chars). Set a long random AUTH_SECRET in the environment (Render → Settings → Environment)."
    );
  }
  return "local-dev-insecure-secret-change-me";
}

// Startup validation so the server refuses to boot with an insecure secret in prod,
// instead of failing per-request with 500s.
function assertSecretConfigured() {
  getSecret();
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
  const secure = IS_PROD;
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
  assertSecretConfigured,
  SESSION_COOKIE,
};