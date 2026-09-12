// server.js — AL AMEER MULTIMEDIA — full stack app (Node.js built-ins only)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const { db, ensureDefaultAdmin, hashPassword, verifyPassword } = require('./db');
const { createSessionToken, getSessionFromRequest, sessionCookieHeader, clearCookieHeader } = require('./auth');
const { parseMultipart, saveUploadedFile } = require('./upload');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(__dirname, 'admin');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// ---------- small helpers ----------
function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj, extraHeaders = {}) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
}

function readBody(req, maxBytes = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return {};
  }
}

function requireAuth(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    sendJson(res, 401, { error: 'غير مصرح لك بالدخول. الرجاء تسجيل الدخول.' });
    return null;
  }
  return session;
}

function esc(v) {
  return v === undefined || v === null ? null : v;
}

function boolInt(v) {
  return v ? 1 : 0;
}

// ---------- static file serving ----------
function serveStatic(req, res, rootDir, reqPath) {
  let filePath = path.join(rootDir, decodeURIComponent(reqPath));
  if (!filePath.startsWith(rootDir)) {
    send(res, 403, 'Forbidden');
    return true;
  }
  if (reqPath.endsWith('/')) filePath = path.join(filePath, 'index.html');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  send(res, 200, fs.readFileSync(filePath), { 'Content-Type': contentType, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
  return true;
}

// ---------- settings helpers ----------
function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function getPublicSettings() {
  const all = getAllSettings();
  // Everything in settings is safe to expose publicly (no secrets stored here).
  return all;
}

// ================= API ROUTER =================
async function handleApi(req, res, pathname, query) {
  const method = req.method;

  // ---- AUTH ----
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { email, password } = await readJson(req);
    if (!email || !password) return sendJson(res, 400, { error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendJson(res, 401, { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
    const token = createSessionToken(user);
    return sendJson(res, 200, { id: user.id, name: user.name, email: user.email, role: user.role }, {
      'Set-Cookie': sessionCookieHeader(token),
    });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookieHeader() });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const session = getSessionFromRequest(req);
    if (!session) return sendJson(res, 401, { error: 'غير مسجل الدخول' });
    return sendJson(res, 200, { uid: session.uid, email: session.email, role: session.role });
  }

  // ---- SERVICES ----
  if (pathname === '/api/services' && method === 'GET') {
    const includeHidden = query.all === '1' && getSessionFromRequest(req);
    const rows = includeHidden
      ? db.prepare('SELECT * FROM services ORDER BY sort_order ASC, id ASC').all()
      : db.prepare('SELECT * FROM services WHERE visible = 1 ORDER BY sort_order ASC, id ASC').all();
    return sendJson(res, 200, rows);
  }

  if (pathname === '/api/services' && method === 'POST') {
    if (!requireAuth(req, res)) return;
    const b = await readJson(req);
    if (!b.name) return sendJson(res, 400, { error: 'اسم الخدمة مطلوب' });
    const info = db.prepare(
      'INSERT INTO services (name, description, icon, image, group_name, sort_order, visible) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(b.name, esc(b.description) || '', b.icon || 'sparkles', esc(b.image) || '', b.group_name || 'خدمات', b.sort_order || 0, boolInt(b.visible ?? 1));
    return sendJson(res, 201, db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid));
  }

  let m = pathname.match(/^\/api\/services\/(\d+)$/);
  if (m && (method === 'PUT' || method === 'PATCH')) {
    if (!requireAuth(req, res)) return;
    const id = Number(m[1]);
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'الخدمة غير موجودة' });
    const b = await readJson(req);
    const merged = { ...existing, ...b };
    db.prepare(
      'UPDATE services SET name=?, description=?, icon=?, image=?, group_name=?, sort_order=?, visible=? WHERE id=?'
    ).run(merged.name, merged.description || '', merged.icon || 'sparkles', merged.image || '', merged.group_name, merged.sort_order || 0, boolInt(merged.visible), id);
    return sendJson(res, 200, db.prepare('SELECT * FROM services WHERE id = ?').get(id));
  }
  if (m && method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    db.prepare('DELETE FROM services WHERE id = ?').run(Number(m[1]));
    return sendJson(res, 200, { ok: true });
  }

  // ---- PORTFOLIO ----
  if (pathname === '/api/portfolio' && method === 'GET') {
    const includeHidden = query.all === '1' && getSessionFromRequest(req);
    const cat = query.category;
    let rows;
    if (includeHidden) {
      rows = db.prepare('SELECT * FROM portfolio ORDER BY sort_order ASC, id DESC').all();
    } else if (cat && cat !== 'all') {
      rows = db.prepare('SELECT * FROM portfolio WHERE visible = 1 AND category_slug = ? ORDER BY sort_order ASC, id DESC').all(cat);
    } else {
      rows = db.prepare('SELECT * FROM portfolio WHERE visible = 1 ORDER BY sort_order ASC, id DESC').all();
    }
    return sendJson(res, 200, rows);
  }

  if (pathname === '/api/portfolio' && method === 'POST') {
    if (!requireAuth(req, res)) return;
    const b = await readJson(req);
    if (!b.title) return sendJson(res, 400, { error: 'عنوان المشروع مطلوب' });
    const info = db.prepare(
      'INSERT INTO portfolio (title, description, category_slug, media_type, media_url, sort_order, visible) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(b.title, esc(b.description) || '', b.category_slug || 'design', b.media_type || 'image', esc(b.media_url) || '', b.sort_order || 0, boolInt(b.visible ?? 1));
    return sendJson(res, 201, db.prepare('SELECT * FROM portfolio WHERE id = ?').get(info.lastInsertRowid));
  }

  m = pathname.match(/^\/api\/portfolio\/(\d+)$/);
  if (m && (method === 'PUT' || method === 'PATCH')) {
    if (!requireAuth(req, res)) return;
    const id = Number(m[1]);
    const existing = db.prepare('SELECT * FROM portfolio WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'المشروع غير موجود' });
    const b = await readJson(req);
    const merged = { ...existing, ...b };
    db.prepare(
      'UPDATE portfolio SET title=?, description=?, category_slug=?, media_type=?, media_url=?, sort_order=?, visible=? WHERE id=?'
    ).run(merged.title, merged.description || '', merged.category_slug, merged.media_type, merged.media_url || '', merged.sort_order || 0, boolInt(merged.visible), id);
    return sendJson(res, 200, db.prepare('SELECT * FROM portfolio WHERE id = ?').get(id));
  }
  if (m && method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    db.prepare('DELETE FROM portfolio WHERE id = ?').run(Number(m[1]));
    return sendJson(res, 200, { ok: true });
  }

  // ---- CATEGORIES (read-only public list) ----
  if (pathname === '/api/categories' && method === 'GET') {
    return sendJson(res, 200, db.prepare('SELECT * FROM categories ORDER BY id ASC').all());
  }

  // ---- ORDERS ----
  if (pathname === '/api/orders' && method === 'POST') {
    const b = await readJson(req);
    if (!b.customer_name || !b.phone) return sendJson(res, 400, { error: 'الاسم ورقم الهاتف مطلوبان' });
    const info = db.prepare(
      `INSERT INTO orders (customer_name, phone, email, service_name, details, budget, needed_date, attachment_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'جديد')`
    ).run(b.customer_name, b.phone, esc(b.email) || '', esc(b.service_name) || '', esc(b.details) || '', esc(b.budget) || '', esc(b.needed_date) || '', esc(b.attachment_url) || '');
    return sendJson(res, 201, { ok: true, id: info.lastInsertRowid, message: 'تم استلام طلبك بنجاح، وسنتواصل معك قريبًا.' });
  }

  if (pathname === '/api/orders' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    return sendJson(res, 200, db.prepare('SELECT * FROM orders ORDER BY id DESC').all());
  }

  m = pathname.match(/^\/api\/orders\/(\d+)$/);
  if (m && (method === 'PATCH' || method === 'PUT')) {
    if (!requireAuth(req, res)) return;
    const id = Number(m[1]);
    const b = await readJson(req);
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'الطلب غير موجود' });
    const status = b.status || existing.status;
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    return sendJson(res, 200, db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
  }
  if (m && method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    db.prepare('DELETE FROM orders WHERE id = ?').run(Number(m[1]));
    return sendJson(res, 200, { ok: true });
  }

  // ---- MESSAGES (contact form) ----
  if (pathname === '/api/messages' && method === 'POST') {
    const b = await readJson(req);
    if (!b.name || !b.message) return sendJson(res, 400, { error: 'الاسم والرسالة مطلوبان' });
    const info = db.prepare(
      'INSERT INTO messages (name, phone, email, subject, message) VALUES (?, ?, ?, ?, ?)'
    ).run(b.name, esc(b.phone) || '', esc(b.email) || '', esc(b.subject) || '', b.message);
    return sendJson(res, 201, { ok: true, id: info.lastInsertRowid, message: 'تم إرسال رسالتك بنجاح، سنرد عليك قريبًا.' });
  }
  if (pathname === '/api/messages' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    return sendJson(res, 200, db.prepare('SELECT * FROM messages ORDER BY id DESC').all());
  }
  m = pathname.match(/^\/api\/messages\/(\d+)$/);
  if (m && method === 'PATCH') {
    if (!requireAuth(req, res)) return;
    const b = await readJson(req);
    db.prepare('UPDATE messages SET read = ? WHERE id = ?').run(boolInt(b.read ?? 1), Number(m[1]));
    return sendJson(res, 200, { ok: true });
  }
  if (m && method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    db.prepare('DELETE FROM messages WHERE id = ?').run(Number(m[1]));
    return sendJson(res, 200, { ok: true });
  }

  // ---- SETTINGS ----
  if (pathname === '/api/settings' && method === 'GET') {
    return sendJson(res, 200, getPublicSettings());
  }
  if (pathname === '/api/settings' && method === 'PUT') {
    if (!requireAuth(req, res)) return;
    const b = await readJson(req);
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [k, v] of Object.entries(b)) upsert.run(k, String(v ?? ''));
    return sendJson(res, 200, getAllSettings());
  }

  // ---- DASHBOARD STATS ----
  if (pathname === '/api/stats' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    const totalOrders = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
    const newOrders = db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'جديد'").get().c;
    const services = db.prepare('SELECT COUNT(*) c FROM services').get().c;
    const portfolio = db.prepare('SELECT COUNT(*) c FROM portfolio').get().c;
    const messages = db.prepare('SELECT COUNT(*) c FROM messages').get().c;
    const unreadMessages = db.prepare('SELECT COUNT(*) c FROM messages WHERE read = 0').get().c;
    const recentOrders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 5').all();
    return sendJson(res, 200, { totalOrders, newOrders, services, portfolio, messages, unreadMessages, recentOrders });
  }

  // ---- UPLOAD ----
  if (pathname === '/api/upload' && method === 'POST') {
    if (!requireAuth(req, res)) return;
    try {
      const buf = await readBody(req, 30 * 1024 * 1024);
      const { files } = parseMultipart(buf, req.headers['content-type']);
      if (!files.length) return sendJson(res, 400, { error: 'لم يتم إرفاق أي ملف' });
      const url = saveUploadedFile(files[0]);
      return sendJson(res, 201, { url });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || 'فشل رفع الملف' });
    }
  }

  // Public upload used by order form for attachments (rate-limited by size only)
  if (pathname === '/api/upload/public' && method === 'POST') {
    try {
      const buf = await readBody(req, 25 * 1024 * 1024);
      const { files } = parseMultipart(buf, req.headers['content-type']);
      if (!files.length) return sendJson(res, 400, { error: 'لم يتم إرفاق أي ملف' });
      const url = saveUploadedFile(files[0]);
      return sendJson(res, 201, { url });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || 'فشل رفع الملف' });
    }
  }

  sendJson(res, 404, { error: 'API route not found' });
}

// ================= MAIN SERVER =================
const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const query = parsed.query;

    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, pathname, query);
    }

    if (pathname.startsWith('/admin')) {
      const session = getSessionFromRequest(req);
      const sub = pathname.replace(/^\/admin/, '') || '/';
      if (sub === '/' || sub === '') {
        // redirect root /admin to dashboard or login
        send(res, 302, '', { Location: session ? '/admin/dashboard.html' : '/admin/login.html' });
        return;
      }
      if (serveStatic(req, res, ADMIN_DIR, sub)) return;
      return send(res, 404, 'Not found');
    }

    if (pathname.startsWith('/uploads/')) {
      if (serveStatic(req, res, PUBLIC_DIR, pathname)) return;
      return send(res, 404, 'Not found');
    }

    if (serveStatic(req, res, PUBLIC_DIR, pathname)) return;
    // SPA-ish fallback: unknown routes go to index
    if (serveStatic(req, res, PUBLIC_DIR, '/index.html')) return;
    send(res, 404, 'Not found');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'خطأ في الخادم الداخلي' });
  }
});

const firstAdmin = ensureDefaultAdmin();
server.listen(PORT, () => {
  console.log(`\n✅  AL AMEER MULTIMEDIA server running: http://localhost:${PORT}`);
  console.log(`    Admin login:                          http://localhost:${PORT}/admin/login.html`);
  if (firstAdmin) {
    console.log(`\n🔑  First-run Super Admin account created:`);
    console.log(`    Email:    ${firstAdmin.email}`);
    console.log(`    Password: ${firstAdmin.tempPassword}`);
    console.log(`    (change this after first login — stored securely hashed, never in plaintext)\n`);
  }
});
