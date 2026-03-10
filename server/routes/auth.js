/**
 * API: přihlášení, odhlášení, nastavení/reset/změna hesla.
 */
const bcrypt = require('bcryptjs');
const { db, generateId } = require('../db');
const { requireAuth, requireRole } = require('../auth-middleware');
const router = require('express').Router();

const SESSION_COOKIE = 'sessionId';
const SESSION_DAYS = 7;
const BCRYPT_ROUNDS = 10;
const RESET_EXPIRES_HOURS = 1;

// --- Pomocné ---
function createSession(app, userId, user) {
  const id = generateId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (id, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?)').run(
    id,
    userId,
    expiresAt,
    new Date().toISOString()
  );
  return { id, expiresAt };
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

// --- POST /api/auth/login ---
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail a heslo jsou povinné.' });
  }
  const user = getUserByEmail(email.trim().toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Nesprávný e-mail nebo heslo.' });
  }
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Nesprávný e-mail nebo heslo.' });
  }
  const { id, expiresAt } = createSession(req.app, user.id, {
    id: user.id,
    email: user.email,
    role: user.role,
  });
  res.cookie(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
  res.json({
    user: { id: user.id, email: user.email, role: user.role },
    expiresAt,
    sessionToken: id,
  });
});

// --- POST /api/auth/logout ---
router.post('/logout', (req, res) => {
  const sessionId = req.cookies?.[SESSION_COOKIE] || req.headers.authorization?.replace('Bearer ', '').trim();
  if (sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

// --- GET /api/auth/me ---
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// --- POST /api/auth/set-password (z pozvánky nebo z resetu hesla) ---
router.post('/set-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: 'Token a heslo jsou povinné.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Heslo musí mít alespoň 8 znaků.' });
  }
  const now = new Date().toISOString();

  // 1) Token z pozvánky → vytvoření účtu
  const inv = db.prepare('SELECT * FROM invitations WHERE token = ? AND usedAt IS NULL AND expiresAt > ?').get(
    token,
    now
  );
  if (inv) {
    const userId = generateId();
    const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    db.prepare(
      'INSERT INTO users (id, email, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, inv.email, passwordHash, inv.role, now, now);
    db.prepare('UPDATE invitations SET usedAt = ? WHERE id = ?').run(now, inv.id);
    const user = { id: userId, email: inv.email, role: inv.role };
    const { id: sessionId, expiresAt } = createSession(req.app, userId, user);
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return res.json({ user, expiresAt, sessionToken: sessionId });
  }

  // 2) Token z resetu hesla (admin) → pouze nové heslo
  const reset = db
    .prepare('SELECT * FROM password_resets WHERE token = ? AND usedAt IS NULL AND expiresAt > ?')
    .get(token, now);
  if (reset) {
    const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?').run(passwordHash, now, reset.userId);
    db.prepare('UPDATE password_resets SET usedAt = ? WHERE id = ?').run(now, reset.id);
    const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(reset.userId);
    const { id: sessionId, expiresAt } = createSession(req.app, user.id, user);
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return res.json({ user, expiresAt, sessionToken: sessionId });
  }

  return res.status(400).json({ error: 'Odkaz není platný nebo vypršel.' });
});

// --- POST /api/auth/forgot-password ---
router.post('/forgot-password', (req, res) => {
  const { email } = req.body || {};
  const em = (email || '').trim().toLowerCase();
  const user = em ? getUserByEmail(em) : null;
  if (user) {
    const resetId = generateId();
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_EXPIRES_HOURS * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO password_resets (id, userId, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)'
    ).run(resetId, user.id, resetToken, expiresAt, now);
    // TODO: odeslat e-mail s odkazem např. https://vase-app.cz/reset-password.html?token=...
    req.app.locals.lastResetLink = `http://localhost:3001/reset-password.html?token=${resetToken}`;
  }
  res.json({ message: 'Pokud účet s tímto e-mailem existuje, zašleme vám odkaz pro obnovení hesla.' });
});

// --- POST /api/auth/reset-password ---
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: 'Token a heslo jsou povinné.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Heslo musí mít alespoň 8 znaků.' });
  }
  const row = db
    .prepare('SELECT * FROM password_resets WHERE token = ? AND usedAt IS NULL AND expiresAt > ?')
    .get(token, new Date().toISOString());
  if (!row) {
    return res.status(400).json({ error: 'Odkaz pro obnovení hesla není platný nebo vypršel.' });
  }
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?').run(passwordHash, now, row.userId);
  db.prepare('UPDATE password_resets SET usedAt = ? WHERE id = ?').run(now, row.id);
  const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(row.userId);
  const { id: sessionId, expiresAt } = createSession(req.app, user.id, user);
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
  res.json({ user, expiresAt, sessionToken: sessionId });
});

// --- POST /api/auth/change-password ---
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Aktuální i nové heslo jsou povinné.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Nové heslo musí mít alespoň 8 znaků.' });
  }
  const full = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, full.passwordHash)) {
    return res.status(400).json({ error: 'Aktuální heslo není správné.' });
  }
  const passwordHash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?').run(passwordHash, now, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
