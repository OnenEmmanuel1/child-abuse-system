/* ─────────────────────────────────────────────────────────────
   CADMS — Authentication Middleware
   Session-based auth check. No case data in error responses.
   ───────────────────────────────────────────────────────────── */

/**
 * Require a logged-in session.
 */
async function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    try {
      const { userOps } = require('../services/caseEngine');
      const activeUser = await userOps.getById(req.session.user.userId);
      if (!activeUser || !activeUser.active) {
        return req.session.destroy(() => {
          if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Authentication required.' });
          return res.redirect('/login');
        });
      }
      // Refresh role and profile fields so deactivation or role changes take
      // effect for an already-open browser session.
      req.session.user = {
        userId: activeUser.userId,
        fullName: activeUser.fullName,
        username: activeUser.username,
        role: activeUser.role,
        agency: activeUser.agency
      };
    } catch (err) {
      return next(err);
    }
    // Make user available on res.locals for all EJS views
    res.locals.currentUser = req.session.user;
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  req.flash('error', 'Please log in to continue.');
  return res.redirect('/login');
}

/**
 * Require Administrator role.
 */
function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.session.user.role !== 'Administrator') {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
      }
      req.flash('error', 'Access denied. Administrator privileges required.');
      return res.redirect('/dashboard');
    }
    return next();
  });
}

/**
 * Redirect to dashboard if already logged in.
 */
function guestOnly(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = { requireAuth, requireAdmin, guestOnly };
