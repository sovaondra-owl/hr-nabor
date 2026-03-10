/**
 * API: pozvánky (jen admin). Na základě e-mailu vygeneruje odkaz na stránku
 * pro vytvoření účtu a hesla (set-password.html?token=...).
 */
const crypto = require('crypto');
const { db, generateId } = require('../db');
const { requireAuth, requireRole } = require('../auth-middleware');
const router = require('express').Router();
const nodemailer = require('nodemailer');

const INVITE_EXPIRES_DAYS = 7;

function getMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

router.use(requireAuth);
router.use(requireRole('admin'));

// POST /api/invitations – vytvoření pozvánky (e-mail + role) → vrátí odkaz
router.post('/', async (req, res) => {
  const { email, role } = req.body || {};
  const em = (email || '').trim().toLowerCase();
  if (!em) {
    return res.status(400).json({ error: 'E-mail je povinný.' });
  }
  const allowedRoles = ['admin', 'manager', 'recruiter', 'viewer'];
  const r = allowedRoles.includes(role) ? role : 'viewer';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(em);
  if (existing) {
    return res.status(400).json({ error: 'Uživatel s tímto e-mailem již existuje.' });
  }

  const id = generateId();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO invitations (id, email, role, token, expiresAt, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, em, r, token, expiresAt, req.user.id, now);

  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  const inviteLink = `${baseUrl}/set-password.html?token=${token}`;

  let emailSent = false;
  const transport = getMailer();
  if (transport) {
    try {
      const from = process.env.MAIL_FROM || process.env.SMTP_USER;
      await transport.sendMail({
        from: from || 'noreply@localhost',
        to: em,
        subject: 'Pozvánka do HR Nábor',
        text: `Dobrý den,\n\nbyl/a jste pozván/a do systému HR Nábor. Pro nastavení hesla a přihlášení použijte tento odkaz (platný ${INVITE_EXPIRES_DAYS} dní):\n\n${inviteLink}\n\nS pozdravem,\nHR Nábor`,
        html: `<p>Dobrý den,</p><p>byl/a jste pozván/a do systému <strong>HR Nábor</strong>. Pro nastavení hesla a přihlášení použijte tento odkaz (platný ${INVITE_EXPIRES_DAYS} dní):</p><p><a href="${inviteLink}">${inviteLink}</a></p><p>S pozdravem,<br>HR Nábor</p>`,
      });
      emailSent = true;
    } catch (err) {
      console.error('Chyba odeslání pozvánky e-mailem:', err.message);
    }
  }

  res.status(201).json({ id, email: em, role: r, inviteLink, expiresAt, emailSent });
});

module.exports = router;
