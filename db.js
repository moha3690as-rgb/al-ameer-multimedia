// db.js — SQLite database layer for AL AMEER MULTIMEDIA
// Uses Node's built-in node:sqlite (no external dependencies required).
'use strict';

const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'ameer.db');
const isNew = !fs.existsSync(DB_PATH);

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- super_admin | admin | editor
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'sparkles',
  image TEXT,
  group_name TEXT NOT NULL, -- e.g. التصميم الجرافيكي / المونتاج / ...
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category_slug TEXT NOT NULL DEFAULT 'design',
  media_type TEXT NOT NULL DEFAULT 'image', -- image | video
  media_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  service_name TEXT,
  details TEXT,
  budget TEXT,
  needed_date TEXT,
  attachment_url TEXT,
  status TEXT NOT NULL DEFAULT 'جديد', -- جديد | قيد المراجعة | قيد التنفيذ | مكتمل | ملغي
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

function setDefaultSetting(key, value) {
  const row = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (!row) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

// ---- Seed default settings (editable later from the dashboard) ----
setDefaultSetting('company_name_ar', 'شركة الأمير للمالتي ميديا');
setDefaultSetting('company_name_en', 'AL AMEER MULTIMEDIA');
setDefaultSetting('tagline', 'نصنع الفكرة... ونحوّلها إلى تجربة بصرية');
setDefaultSetting('description', 'شركة الأمير للمالتي ميديا تقدم حلولًا إبداعية متكاملة في التصميم، المونتاج، صناعة المحتوى، والإنتاج البصري.');
setDefaultSetting('phone', '');
setDefaultSetting('whatsapp', '');
setDefaultSetting('email', '');
setDefaultSetting('facebook', '');
setDefaultSetting('instagram', '');
setDefaultSetting('tiktok', '');
setDefaultSetting('youtube', '');
setDefaultSetting('primary_color', '#C9A461');
setDefaultSetting('logo_url', '/uploads/logo-placeholder.svg');
setDefaultSetting('hero_image', '');

// ---- Seed categories ----
const categories = [
  ['الكل', 'all'],
  ['تصميم', 'design'],
  ['مونتاج', 'editing'],
  ['إعلانات', 'ads'],
  ['فيديو', 'video'],
  ['AI', 'ai'],
  ['سوشيال ميديا', 'social'],
];
for (const [name_ar, slug] of categories) {
  const row = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (!row) db.prepare('INSERT INTO categories (name_ar, slug) VALUES (?, ?)').run(name_ar, slug);
}

// ---- Seed services (only on first run) ----
if (isNew) {
  const serviceRows = [
    ['تصاميم إعلانية وبوسترات', 'هويات بصرية، شعارات، منشورات سوشيال ميديا وتصاميم مناسبات باحتراف.', 'palette', 'التصميم الجرافيكي', 1],
    ['مونتاج الفيديو', 'مونتاج سينمائي، فيديوهات إعلانية، Reels وShorts، وتعديل ألوان احترافي.', 'film', 'المونتاج', 2],
    ['صناعة المحتوى', 'كتابة أفكار ونصوص وسيناريوهات، وإعداد محتوى إعلاني وسوشيال ميديا.', 'pen', 'صناعة المحتوى', 3],
    ['إنتاج الفيديو', 'فيديوهات ترويجية وتعريفية ووثائقية وقصصية بجودة سينمائية.', 'video', 'إنتاج الفيديو', 4],
    ['حلول الذكاء الاصطناعي', 'توليد وتحريك الصور، أفاتارات رقمية، وتعليق صوتي بالذكاء الاصطناعي.', 'sparkles', 'الذكاء الاصطناعي', 5],
    ['إدارة المحتوى الرقمي', 'إعداد وتنظيم المحتوى وتطوير الهوية البصرية لحسابات التواصل.', 'layers', 'إدارة المحتوى الرقمي', 6],
  ];
  const insertService = db.prepare(
    'INSERT INTO services (name, description, icon, group_name, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  for (const s of serviceRows) insertService.run(...s);

  const portfolioRows = [
    ['هوية بصرية لمقهى فاخر', 'تصميم شعار وهوية متكاملة', 'design', 'image', '', 1],
    ['إعلان مطعم — Reel', 'مونتاج وتصميم حركي لمنصات التواصل', 'social', 'image', '', 2],
    ['فيديو تعريفي لشركة عقارية', 'إنتاج فيديو سينمائي قصير', 'video', 'image', '', 3],
    ['حملة إعلانية لمنتج تجميل', 'تصميم بوسترات وإعلانات مدفوعة', 'ads', 'image', '', 4],
    ['أفاتار رقمي بالذكاء الاصطناعي', 'شخصية رقمية وتعليق صوتي AI', 'ai', 'image', '', 5],
    ['مونتاج حفل زفاف سينمائي', 'قصة بصرية متكاملة بتعديل ألوان دقيق', 'editing', 'image', '', 6],
  ];
  const insertPortfolio = db.prepare(
    'INSERT INTO portfolio (title, description, category_slug, media_type, media_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const p of portfolioRows) insertPortfolio.run(...p);
}

// ---- Seed first Super Admin account if no users exist ----
function ensureDefaultAdmin() {
  const row = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (row) return null;
  const email = 'admin@alameer.local';
  const tempPassword = crypto.randomBytes(6).toString('hex');
  const hash = hashPassword(tempPassword);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Super Admin', email, hash, 'super_admin');
  return { email, tempPassword };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, derived] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(derived, 'hex'));
}

module.exports = { db, ensureDefaultAdmin, hashPassword, verifyPassword };
