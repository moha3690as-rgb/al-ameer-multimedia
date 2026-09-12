// auth.js — signed session tokens (self-contained, no external JWT library needed)
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET_PATH = path.join(__dirname, 'data', '.session-secret');
let SECRET;
if (fs.existsSync(SECRET_PATH)) {
  SECRET = fs.readFileSync(SECRET_PATH, 'utf8').trim();
} else {
  SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_PATH, SECRET, { mode: 0o600 });
}

const SESSION_HOURS = 12;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadObj) {
  const payload = base64url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function createSessionToken(user) {
  return sign({
    uid: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  return verify(cookies.ameer_session);
}

function sessionCookieHeader(token) {
  return `ameer_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_HOURS * 3600}; SameSite=Lax`;
}

function clearCookieHeader() {
  return `ameer_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

module.exports = {
  createSessionToken,
  getSessionFromRequest,
  sessionCookieHeader,
  clearCookieHeader,
};
