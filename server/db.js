/**
 * SQLite databáze (sql.js – čistý JS, bez nativní kompilace).
 * Uživatelé, pozvánky, reset hesel, session. Persistence do souboru.
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'hr-auth.db');

const wrapper = {
  _db: null,
  prepare(sql) {
    return {
      run: (...params) => {
        wrapper._db.run(sql, params);
        save();
      },
      get: (...params) => {
        const stmt = wrapper._db.prepare(sql);
        stmt.bind(params);
        const row = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return row;
      },
      all: (...params) => {
        const stmt = wrapper._db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
    };
  },
  exec(sql) {
    wrapper._db.run(sql);
  },
};

function save() {
  try {
    const data = wrapper._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (e) {
    console.error('Chyba ukládání DB:', e.message);
  }
}

const ready = (async () => {
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    wrapper._db = new SQL.Database(buffer);
  } else {
    wrapper._db = new SQL.Database();
  }
  wrapper._db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
    CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
  `);
  save();
})();

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

module.exports = { db: wrapper, generateId, ready };
