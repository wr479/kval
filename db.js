/**
 * Инициализация SQLite через встроенный модуль Node.js (node:sqlite), файл data/korochki.db.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'korochki.db');

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    submitted_at TEXT NOT NULL,
    review_text TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
`);

const adminRow = db.prepare('SELECT id FROM users WHERE login = ?').get('Admin');
if (!adminRow) {
  const hash = bcrypt.hashSync('KorokNET', 10);
  db.prepare(`
    INSERT INTO users (login, password_hash, full_name, phone, email, is_admin)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(
    'Admin',
    hash,
    'Администратор системы',
    '8(000)000-00-00',
    'admin@korochki.local'
  );
}

module.exports = db;
