/**
 * API: seznam uživatelů, odstranění uživatele (jen admin).
 */
const { db } = require('../db');
const { requireAuth, requireRole } = require('../auth-middleware');
const router = require('express').Router();

router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id, email, role, createdAt FROM users ORDER BY createdAt DESC').all();
  const invitations = db
    .prepare(
      'SELECT id, email, role, token, expiresAt, usedAt, createdAt FROM invitations ORDER BY createdAt DESC'
    )
    .all();
  res.json({ users, invitations });
});

function deleteUserHandler(req, res) {
  const userId = (req.params.id || req.body?.id || '').trim();
  if (!userId) return res.status(400).json({ error: 'Chybí id uživatele.' });
  if (req.user.id === userId) {
    return res.status(400).json({ error: 'Nemůžete odstranit sám sebe.' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Uživatel nenalezen.' });

  db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
  db.prepare('DELETE FROM password_resets WHERE userId = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ ok: true });
}

// DELETE /api/users/:id – admin odstraní uživatele
router.delete('/:id', requireAuth, requireRole('admin'), deleteUserHandler);
// POST /api/users/delete – stejná akce (fallback, pokud DELETE neprojde)
router.post('/delete', requireAuth, requireRole('admin'), (req, res) => {
  req.params = req.params || {};
  req.params.id = (req.body?.id || '').trim();
  return deleteUserHandler(req, res);
});

module.exports = router;
