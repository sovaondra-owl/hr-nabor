/**
 * Middleware: ověření session a kontrola role.
 */

function requireAuth(req, res, next) {
  const sessionId = (req.cookies?.sessionId || req.headers.authorization?.replace('Bearer ', '')?.trim()) || null;
  if (!sessionId) {
    return res.status(401).json({ error: 'Nejste přihlášeni.' });
  }
  const session = req.app.locals.getSession(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Session vypršela. Přihlaste se znovu.' });
  }
  req.user = session.user;
  req.sessionId = sessionId;
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nejste přihlášeni.' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Nemáte oprávnění pro tuto akci.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
