// upload.js — tiny multipart/form-data parser, dependency-free.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.mp4', '.webm', '.mov', '.pdf']);
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

function safeExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : '';
}

// Parses a multipart/form-data request body (already fully read into a Buffer).
// Returns { fields: {name: value}, files: [{fieldName, filename, contentType, data}] }
function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) throw new Error('No multipart boundary found');
  const boundary = '--' + (match[1] || match[2]);
  const boundaryBuf = Buffer.from(boundary);
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    const chunk = buffer.slice(start + boundaryBuf.length, next);
    parts.push(chunk);
    start = next;
  }

  const fields = {};
  const files = [];

  for (let part of parts) {
    if (part.slice(0, 2).toString() === '--') continue; // closing boundary
    if (part.slice(0, 2).toString() === '\r\n') part = part.slice(2);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerText = part.slice(0, headerEnd).toString('utf8');
    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);

    const nameMatch = /name="([^"]+)"/.exec(headerText);
    const filenameMatch = /filename="([^"]*)"/.exec(headerText);
    const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
    const fieldName = nameMatch ? nameMatch[1] : null;
    if (!fieldName) continue;

    if (filenameMatch && filenameMatch[1]) {
      files.push({
        fieldName,
        filename: filenameMatch[1],
        contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        data: body,
      });
    } else {
      fields[fieldName] = body.toString('utf8');
    }
  }

  return { fields, files };
}

// Saves a parsed file to disk, returns the public URL, or null if rejected.
function saveUploadedFile(file) {
  if (!file || !file.data || file.data.length === 0) return null;
  if (file.data.length > MAX_BYTES) throw new Error('File too large (max 25MB)');
  const ext = safeExt(file.filename);
  if (!ext) throw new Error('File type not allowed');
  const name = crypto.randomBytes(10).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.data);
  return `/uploads/${name}`;
}

module.exports = { parseMultipart, saveUploadedFile, UPLOAD_DIR, MAX_BYTES };
