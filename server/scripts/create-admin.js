/**
 * Vytvoření prvního admina (bez pozvánky).
 * Použití: node scripts/create-admin.js email@example.com Heslo123
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'hr-auth.db');
const db = new Database(dbPath);

const email = (process.argv[2] || '').trim().toLowerCase();
const password = process.argv[3];

if (!email || !password) {
  console.error('Použití: node scripts/create-admin.js <email> <heslo>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Heslo musí mít alespoň 8 znaků.');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  console.error('Uživatel s tímto e-mailem již existuje.');
  process.exit(1);
}

const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
const passwordHash = bcrypt.hashSync(password, 10);
const now = new Date().toISOString();
db.prepare(
  'INSERT INTO users (id, email, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
).run(id, email, passwordHash, 'admin', now, now);

console.log('Admin vytvořen:', email);
