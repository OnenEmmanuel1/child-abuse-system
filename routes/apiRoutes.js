/* ─────────────────────────────────────────────────────────────
   CADMS — JSON API Routes (/api/...)
   Separated from page-rendering routes per spec Section 3.
   ───────────────────────────────────────────────────────────── */
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { auditWrite, auditViews } = require('../middleware/audit');
const { caseOps, childOps, offenderOps, investigationOps, userOps, CASE_TYPES, CASE_STATUS, INV_STATUS } = require('../services/caseEngine');
const reportEngine = require('../services/reportEngine');

/* ═══════════════ CASES ═══════════════ */
router.get('/cases', requireAuth, async (req, res) => {
  try {
    const cases = await caseOps.getAll(req.session.user);
    await auditViews(req.session.user.userId, 'abuse_case', cases, 'caseId');
    res.json({ data: cases });
  } catch (err) {
    console.error('[CADMS API] Cases error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve cases.' });
  }
});

router.get('/cases/:id', requireAuth, async (req, res) => {
  try {
    const caseRecord = await caseOps.getById(parseInt(req.params.id, 10), req.session.user);
    if (!caseRecord) return res.status(404).json({ error: 'Case not found or access denied.' });
    await auditWrite(req.session.user.userId, 'View', 'abuse_case', caseRecord.caseId);
    res.json({ data: caseRecord });
  } catch (err) {
    console.error('[CADMS API] Case detail error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve case.' });
  }
});

/* ═══════════════ SEARCH ═══════════════ */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { caseId, childName, caseType, dateFrom, dateTo, status } = req.query;
    const results = await caseOps.search({ caseId, childName, caseType, dateFrom, dateTo, status }, req.session.user);
    await auditViews(req.session.user.userId, 'abuse_case', results, 'caseId');
    res.json({ data: results });
  } catch (err) {
    console.error('[CADMS API] Search error:', err.message);
    res.status(500).json({ error: 'Search failed.' });
  }
});

/* ═══════════════ OFFENDER SEARCH (Section 5.5) ═══════════════ */
router.get('/offenders/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) return res.json({ data: [] });
    const results = await offenderOps.search(q.trim(), req.session.user);
    await auditViews(req.session.user.userId, 'offender', results, 'offenderId');
    res.json({ data: results });
  } catch (err) {
    console.error('[CADMS API] Offender search error:', err.message);
    res.status(500).json({ error: 'Offender search failed.' });
  }
});

router.get('/offenders/:id/cases', requireAuth, async (req, res) => {
  try {
    const linkedCases = await offenderOps.getLinkedCases(parseInt(req.params.id, 10), req.session.user);
    await auditViews(req.session.user.userId, 'abuse_case', linkedCases, 'caseId');
    res.json({ data: linkedCases });
  } catch (err) {
    console.error('[CADMS API] Offender cases error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve linked cases.' });
  }
});

/* ═══════════════ REPORTS (Admin) ═══════════════ */
router.get('/reports/summary', requireAdmin, async (req, res) => {
  try {
    const summary = await reportEngine.systemSummary();
    res.json({ data: summary });
  } catch (err) {
    console.error('[CADMS API] Summary error:', err.message);
    res.status(500).json({ error: 'Failed to generate summary.' });
  }
});

router.get('/reports/by-type', requireAdmin, async (req, res) => {
  try {
    const data = await reportEngine.casesByType();
    res.json({ data });
  } catch (err) {
    console.error('[CADMS API] Report error:', err.message);
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

router.get('/reports/by-status', requireAdmin, async (req, res) => {
  try {
    const data = await reportEngine.casesByStatus();
    res.json({ data });
  } catch (err) {
    console.error('[CADMS API] Report error:', err.message);
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

router.get('/reports/trend', requireAdmin, async (req, res) => {
  try {
    const data = await reportEngine.casesTrend();
    res.json({ data });
  } catch (err) {
    console.error('[CADMS API] Report error:', err.message);
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

/* ═══════════════ CHILDREN (JSON helpers) ═══════════════ */
router.get('/children', requireAuth, async (req, res) => {
  try {
    const children = await childOps.getAll(req.session.user);
    await auditViews(req.session.user.userId, 'child', children, 'childId');
    res.json({ data: children });
  } catch (err) {
    console.error('[CADMS API] Children error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve children.' });
  }
});

/* ═══════════════ CASEWORKERS list ═══════════════ */
router.get('/caseworkers', requireAuth, async (req, res) => {
  try {
    const caseworkers = await userOps.getCaseworkers();
    res.json({ data: caseworkers });
  } catch (err) {
    console.error('[CADMS API] Caseworkers error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve caseworkers.' });
  }
});

module.exports = router;
