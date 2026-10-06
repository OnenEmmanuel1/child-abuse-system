/* ─────────────────────────────────────────────────────────────
   CADMS — Auth Routes (login / logout)
   No self-registration per Section 4.
   ───────────────────────────────────────────────────────────── */
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { userOps } = require('../services/caseEngine');
const { guestOnly } = require('../middleware/auth');

/* ── GET /login ── */
router.get('/login', guestOnly, (req, res) => {
  res.render('login', { title: 'Login — CADMS', error: req.flash('error'), success: req.flash('success') });
});

/* ── POST /login ── */
router.post('/login', guestOnly, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      req.flash('error', 'Username and password are required.');
      return res.redirect('/login');
    }

    const user = await userOps.getByUsername(username.trim());

    if (!user) {
      req.flash('error', 'Invalid username or password.');
      return res.redirect('/login');
    }

    if (!user.active) {
      req.flash('error', 'This account has been deactivated. Contact an administrator.');
      return res.redirect('/login');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      req.flash('error', 'Invalid username or password.');
      return res.redirect('/login');
    }

    // Store user in session (never store passwordHash)
    req.session.user = {
      userId: user.userId,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      agency: user.agency
    };

    req.session.save(() => {
      res.redirect('/dashboard');
    });
  } catch (err) {
    // Never expose internal errors to client
    console.error('[CADMS Auth] Login error:', err.message);
    req.flash('error', 'An error occurred. Please try again.');
    res.redirect('/login');
  }
});

/* ── GET /logout ── */
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
