/**
 * Express server: auth API, pozvánky, session.
 * Spuštění: cd server && npm install && npm start
 * Port: 3001 (nebo env PORT)
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { db, generateId, ready } = require('./db');
const authRoutes = require('./routes/auth');
const invitationRoutes = require('./routes/invitations');
const userRoutes = require('./routes/users');
const { requireAuth, requireRole } = require('./auth-middleware');

const PORT = process.env.PORT || 3001;
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Session lookup (z DB, smazání vypršených)
function getSession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND expiresAt > ?').get(
    sessionId,
    new Date().toISOString()
  );
  if (!row) return null;
  const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(row.userId);
  return user ? { user } : null;
}
app.locals.getSession = getSession;

// Veřejné: ověření tokenu (pozvánka nebo reset hesla) pro stránku set-password
app.get('/api/invitations/validate', (req, res) => {
  const token = (req.query.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Chybí token.' });
  }
  const now = new Date().toISOString();
  const inv = db
    .prepare('SELECT id, email, role FROM invitations WHERE token = ? AND usedAt IS NULL AND expiresAt > ?')
    .get(token, now);
  if (inv) {
    return res.json({ email: inv.email, role: inv.role, type: 'invite' });
  }
  const reset = db
    .prepare('SELECT id, userId FROM password_resets WHERE token = ? AND usedAt IS NULL AND expiresAt > ?')
    .get(token, now);
  if (reset) {
    const user = db.prepare('SELECT email, role FROM users WHERE id = ?').get(reset.userId);
    if (user) return res.json({ email: user.email, role: user.role, type: 'reset' });
  }
  return res.status(400).json({ error: 'Odkaz není platný nebo vypršel.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/invitations', invitationRoutes);
// POST /api/users/delete – registrované zde, aby route vždy fungovala
app.post('/api/users/delete', requireAuth, requireRole('admin'), (req, res) => {
  const userId = (req.body?.id || '').trim();
  if (!userId) return res.status(400).json({ error: 'Chybí id uživatele.' });
  if (req.user.id === userId) return res.status(400).json({ error: 'Nemůžete odstranit sám sebe.' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Uživatel nenalezen.' });
  db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
  db.prepare('DELETE FROM password_resets WHERE userId = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ ok: true });
});
app.use('/api/users', userRoutes);

// Kořen – jen informace (aplikace běží na portu 3000)
app.get('/', (req, res) => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>HR Nábor API</title></head>
    <body style="font-family:system-ui;max-width:600px;margin:3rem auto;padding:0 1rem;">
      <h1>HR Nábor API</h1>
      <p>Backend běží na portu ${PORT}. Toto je jen API server.</p>
      <p><strong>Aplikaci otevřete na:</strong> <a href="http://localhost:3000">http://localhost:3000</a></p>
      <p><a href="/api/health">/api/health</a> – kontrola stavu</p>
    </body></html>
  `);
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Výchozí účet admin / admin, pokud v DB ještě není žádný uživatel
function seedAdminIfNeeded() {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
  if (count.n > 0) return;
  const id = generateId();
  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync('admin', 10);
  db.prepare(
    'INSERT INTO users (id, email, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, 'admin', passwordHash, 'admin', now, now);
  console.log('Vytvořen výchozí účet: přihlášení admin / heslo admin');
}

(async () => {
  await ready;
  seedAdminIfNeeded();
  app.listen(PORT, () => {
    console.log(`HR Nábor API běží na http://localhost:${PORT}`);
  });
})();
