/* ─────────────────────────────────────────────────────────────
   CADMS — Page Routes (EJS rendering)
   All routes require authentication; case detail routes have
   audit-view middleware applied per Section 8.
   ───────────────────────────────────────────────────────────── */
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { auditView, auditWrite, auditViews } = require('../middleware/audit');
const { caseOps, childOps, offenderOps, investigationOps, userOps, CASE_TYPES, CASE_STATUS, INV_STATUS } = require('../services/caseEngine');
const reportEngine = require('../services/reportEngine');
const auditEngine = require('../services/auditEngine');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;

/* ═══════════════ DASHBOARD ═══════════════ */
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const cases = await caseOps.getAll(req.session.user);
    await auditViews(req.session.user.userId, 'abuse_case', cases, 'caseId');
    const summary = req.session.user.role === 'Administrator'
      ? await reportEngine.systemSummary()
      : {
          totalCases: cases.length,
          reportedCases: cases.filter(c => c.status === 'Reported').length,
          activeCases: cases.filter(c => c.status === 'UnderInvestigation').length,
          closedCases: cases.filter(c => c.status === 'Closed').length
        };
    // For caseworkers, show only their case count
    const myCaseCount = cases.length;
    res.render('dashboard', {
      title: 'Dashboard — CADMS',
      summary,
      myCaseCount,
      recentCases: cases.slice(0, 5),
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('[CADMS] Dashboard error:', err.message);
    req.flash('error', 'Failed to load dashboard.');
    res.render('dashboard', { title: 'Dashboard — CADMS', summary: {}, myCaseCount: 0, recentCases: [], error: req.flash('error'), success: [] });
  }
});

/* ═══════════════ CASES ═══════════════ */
router.get('/cases', requireAuth, async (req, res) => {
  try {
    const cases = await caseOps.getAll(req.session.user);
    await auditViews(req.session.user.userId, 'abuse_case', cases, 'caseId');
    res.render('cases/index', { title: 'Cases — CADMS', cases, CASE_TYPES, CASE_STATUS, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Cases list error:', err.message);
    req.flash('error', 'Failed to load cases.');
    res.redirect('/dashboard');
  }
});

router.get('/cases/create', requireAuth, async (req, res) => {
  try {
    const children = await childOps.getAll(req.session.user);
    const offenders = await offenderOps.getAll(req.session.user);
    await auditViews(req.session.user.userId, 'child', children, 'childId');
    await auditViews(req.session.user.userId, 'offender', offenders, 'offenderId');
    const caseworkers = await userOps.getCaseworkers();
    res.render('cases/create', { title: 'New Case — CADMS', children, offenders, caseworkers, CASE_TYPES, CASE_STATUS, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Case create form error:', err.message);
    req.flash('error', 'Failed to load form.');
    res.redirect('/cases');
  }
});

router.post('/cases/create', requireAuth, async (req, res) => {
  try {
    const { childId, offenderId, caseType, dateReported, status, assignedCaseworker, notes } = req.body;

    // Server-side validation
    if (!childId || !caseType || !dateReported) {
      req.flash('error', 'Child, case type, and date reported are required.');
      return res.redirect('/cases/create');
    }
    if (!CASE_TYPES.includes(caseType)) {
      req.flash('error', 'Invalid case type.');
      return res.redirect('/cases/create');
    }

    const newId = await caseOps.create({
      childId: parseInt(childId, 10),
      offenderId: offenderId ? parseInt(offenderId, 10) : null,
      caseType,
      dateReported,
      status: status || 'Reported',
      assignedCaseworker: req.session.user.role === 'Administrator'
        ? (assignedCaseworker ? parseInt(assignedCaseworker, 10) : null)
        : req.session.user.userId,
      notes: notes || null
    }, req.session.user.userId);

    await auditWrite(req.session.user.userId, 'Create', 'abuse_case', newId);

    req.flash('success', 'Case created successfully.');
    res.redirect(`/cases/${newId}`);
  } catch (err) {
    console.error('[CADMS] Case create error:', err.message);
    req.flash('error', 'Failed to create case.');
    res.redirect('/cases/create');
  }
});

// Case detail — auditView middleware logs the View action
router.get('/cases/:id', requireAuth, auditView('abuse_case', 'id'), async (req, res) => {
  try {
    const caseRecord = await caseOps.getById(parseInt(req.params.id, 10), req.session.user);
    if (!caseRecord) {
      req.flash('error', 'Case not found or access denied.');
      return res.redirect('/cases');
    }
    const investigations = await investigationOps.getByCaseId(caseRecord.caseId);
    res.render('cases/view', { title: `Case #${caseRecord.caseId} — CADMS`, caseRecord, investigations, CASE_TYPES, CASE_STATUS, INV_STATUS, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Case detail error:', err.message);
    req.flash('error', 'Failed to load case.');
    res.redirect('/cases');
  }
});

router.get('/cases/:id/edit', requireAuth, auditView('abuse_case', 'id'), async (req, res) => {
  try {
    const caseRecord = await caseOps.getById(parseInt(req.params.id, 10), req.session.user);
    if (!caseRecord) {
      req.flash('error', 'Case not found or access denied.');
      return res.redirect('/cases');
    }
    const children = await childOps.getAll(req.session.user);
    const offenders = await offenderOps.getAll(req.session.user);
    await auditViews(req.session.user.userId, 'child', children, 'childId');
    await auditViews(req.session.user.userId, 'offender', offenders, 'offenderId');
    const caseworkers = await userOps.getCaseworkers();
    res.render('cases/edit', { title: `Edit Case #${caseRecord.caseId} — CADMS`, caseRecord, children, offenders, caseworkers, CASE_TYPES, CASE_STATUS, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Case edit form error:', err.message);
    req.flash('error', 'Failed to load case for editing.');
    res.redirect('/cases');
  }
});

router.post('/cases/:id/edit', requireAuth, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    // Verify access
    const existing = await caseOps.getById(caseId, req.session.user);
    if (!existing) {
      req.flash('error', 'Case not found or access denied.');
      return res.redirect('/cases');
    }
    await auditWrite(req.session.user.userId, 'View', 'abuse_case', caseId);

    const { childId, offenderId, caseType, dateReported, status, assignedCaseworker, notes } = req.body;
    if (!childId || !caseType || !dateReported) {
      req.flash('error', 'Child, case type, and date reported are required.');
      return res.redirect(`/cases/${caseId}/edit`);
    }
    if (!CASE_TYPES.includes(caseType)) {
      req.flash('error', 'Invalid case type.');
      return res.redirect(`/cases/${caseId}/edit`);
    }

    await caseOps.update(caseId, {
      childId: parseInt(childId, 10),
      offenderId: offenderId ? parseInt(offenderId, 10) : null,
      caseType,
      dateReported,
      status,
      assignedCaseworker: req.session.user.role === 'Administrator'
        ? (assignedCaseworker ? parseInt(assignedCaseworker, 10) : null)
        : req.session.user.userId,
      notes: notes || null
    });

    await auditWrite(req.session.user.userId, 'Update', 'abuse_case', caseId);

    req.flash('success', 'Case updated successfully.');
    res.redirect(`/cases/${caseId}`);
  } catch (err) {
    console.error('[CADMS] Case update error:', err.message);
    req.flash('error', 'Failed to update case.');
    res.redirect(`/cases/${req.params.id}/edit`);
  }
});

router.post('/cases/:id/delete', requireAdmin, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    await auditWrite(req.session.user.userId, 'Delete', 'abuse_case', caseId);
    await caseOps.delete(caseId);
    req.flash('success', 'Case deleted.');
    res.redirect('/cases');
  } catch (err) {
    console.error('[CADMS] Case delete error:', err.message);
    req.flash('error', 'Failed to delete case.');
    res.redirect('/cases');
  }
});

/* ═══════════════ CHILDREN ═══════════════ */
router.get('/children', requireAuth, async (req, res) => {
  try {
    const children = await childOps.getAll(req.session.user);
    await auditViews(req.session.user.userId, 'child', children, 'childId');
    res.render('children/index', { title: 'Children — CADMS', children, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Children list error:', err.message);
    req.flash('error', 'Failed to load children.');
    res.redirect('/dashboard');
  }
});

router.get('/children/create', requireAuth, (req, res) => {
  res.render('children/create', { title: 'Register Child — CADMS', error: req.flash('error'), success: req.flash('success') });
});

router.post('/children/create', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, dateOfBirth, gender, guardianContact, address } = req.body;
    if (!firstName || !lastName) {
      req.flash('error', 'First name and last name are required.');
      return res.redirect('/children/create');
    }
    const newId = await childOps.create({ firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth, gender, guardianContact, address }, req.session.user.userId);
    await auditWrite(req.session.user.userId, 'Create', 'child', newId);
    req.flash('success', 'Child record created.');
    res.redirect('/children');
  } catch (err) {
    console.error('[CADMS] Child create error:', err.message);
    req.flash('error', 'Failed to create child record.');
    res.redirect('/children/create');
  }
});

router.get('/children/:id', requireAuth, auditView('child', 'id'), async (req, res) => {
  try {
    const child = await childOps.getById(parseInt(req.params.id, 10), req.session.user);
    if (!child) { req.flash('error', 'Child not found.'); return res.redirect('/children'); }
    res.render('children/view', { title: `Child Record — CADMS`, child, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Child detail error:', err.message);
    req.flash('error', 'Failed to load child record.');
    res.redirect('/children');
  }
});

router.get('/children/:id/edit', requireAuth, auditView('child', 'id'), async (req, res) => {
  try {
    const child = await childOps.getById(parseInt(req.params.id, 10), req.session.user);
    if (!child) { req.flash('error', 'Child not found.'); return res.redirect('/children'); }
    res.render('children/edit', { title: `Edit Child — CADMS`, child, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Child edit form error:', err.message);
    req.flash('error', 'Failed to load child for editing.');
    res.redirect('/children');
  }
});

router.post('/children/:id/edit', requireAuth, async (req, res) => {
  try {
    const childId = parseInt(req.params.id, 10);
    const existingChild = await childOps.getById(childId, req.session.user);
    if (!existingChild) { req.flash('error', 'Child not found or access denied.'); return res.redirect('/children'); }
    const { firstName, lastName, dateOfBirth, gender, guardianContact, address } = req.body;
    if (!firstName || !lastName) {
      req.flash('error', 'First name and last name are required.');
      return res.redirect(`/children/${childId}/edit`);
    }
    await childOps.update(childId, { firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth, gender, guardianContact, address });
    await auditWrite(req.session.user.userId, 'Update', 'child', childId);
    req.flash('success', 'Child record updated.');
    res.redirect(`/children/${childId}`);
  } catch (err) {
    console.error('[CADMS] Child update error:', err.message);
    req.flash('error', 'Failed to update child record.');
    res.redirect(`/children/${req.params.id}/edit`);
  }
});

router.post('/children/:id/delete', requireAdmin, async (req, res) => {
  try {
    const childId = parseInt(req.params.id, 10);
    await auditWrite(req.session.user.userId, 'Delete', 'child', childId);
    await childOps.delete(childId);
    req.flash('success', 'Child record deleted.');
    res.redirect('/children');
  } catch (err) {
    console.error('[CADMS] Child delete error:', err.message);
    req.flash('error', 'Failed to delete child record. It may be linked to existing cases.');
    res.redirect('/children');
  }
});

/* ═══════════════ OFFENDERS ═══════════════ */
router.get('/offenders', requireAuth, async (req, res) => {
  try {
    const offenders = await offenderOps.getAll(req.session.user);
    await auditViews(req.session.user.userId, 'offender', offenders, 'offenderId');
    res.render('offenders/index', { title: 'Offenders — CADMS', offenders, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Offenders list error:', err.message);
    req.flash('error', 'Failed to load offenders.');
    res.redirect('/dashboard');
  }
});

router.get('/offenders/create', requireAuth, (req, res) => {
  res.render('offenders/create', { title: 'Register Offender — CADMS', error: req.flash('error'), success: req.flash('success') });
});

router.post('/offenders/create', requireAuth, async (req, res) => {
  try {
    const { fullName, knownAliases, lastKnownAddress, identifyingDetails } = req.body;
    const newId = await offenderOps.create({ fullName, knownAliases, lastKnownAddress, identifyingDetails }, req.session.user.userId);
    await auditWrite(req.session.user.userId, 'Create', 'offender', newId);
    req.flash('success', 'Offender record created.');
    res.redirect(`/offenders/${newId}`);
  } catch (err) {
    console.error('[CADMS] Offender create error:', err.message);
    req.flash('error', 'Failed to create offender record.');
    res.redirect('/offenders/create');
  }
});

router.get('/offenders/:id', requireAuth, auditView('offender', 'id'), async (req, res) => {
  try {
    const offender = await offenderOps.getById(parseInt(req.params.id, 10), req.session.user);
    if (!offender) { req.flash('error', 'Offender not found.'); return res.redirect('/offenders'); }
    const linkedCases = await offenderOps.getLinkedCases(offender.offenderId, req.session.user);
    await auditViews(req.session.user.userId, 'abuse_case', linkedCases, 'caseId');
    res.render('offenders/view', { title: `Offender Record — CADMS`, offender, linkedCases, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Offender detail error:', err.message);
    req.flash('error', 'Failed to load offender record.');
    res.redirect('/offenders');
  }
});

router.get('/offenders/:id/edit', requireAuth, auditView('offender', 'id'), async (req, res) => {
  try {
    const offender = await offenderOps.getById(parseInt(req.params.id, 10), req.session.user);
    if (!offender) { req.flash('error', 'Offender not found.'); return res.redirect('/offenders'); }
    res.render('offenders/edit', { title: `Edit Offender — CADMS`, offender, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Offender edit form error:', err.message);
    req.flash('error', 'Failed to load offender for editing.');
    res.redirect('/offenders');
  }
});

router.post('/offenders/:id/edit', requireAuth, async (req, res) => {
  try {
    const offenderId = parseInt(req.params.id, 10);
    const existingOffender = await offenderOps.getById(offenderId, req.session.user);
    if (!existingOffender) { req.flash('error', 'Offender not found or access denied.'); return res.redirect('/offenders'); }
    const { fullName, knownAliases, lastKnownAddress, identifyingDetails } = req.body;
    await offenderOps.update(offenderId, { fullName, knownAliases, lastKnownAddress, identifyingDetails });
    await auditWrite(req.session.user.userId, 'Update', 'offender', offenderId);
    req.flash('success', 'Offender record updated.');
    res.redirect(`/offenders/${offenderId}`);
  } catch (err) {
    console.error('[CADMS] Offender update error:', err.message);
    req.flash('error', 'Failed to update offender record.');
    res.redirect(`/offenders/${req.params.id}/edit`);
  }
});

router.post('/offenders/:id/delete', requireAdmin, async (req, res) => {
  try {
    const offenderId = parseInt(req.params.id, 10);
    await auditWrite(req.session.user.userId, 'Delete', 'offender', offenderId);
    await offenderOps.delete(offenderId);
    req.flash('success', 'Offender record deleted.');
    res.redirect('/offenders');
  } catch (err) {
    console.error('[CADMS] Offender delete error:', err.message);
    req.flash('error', 'Failed to delete offender record. It may be linked to existing cases.');
    res.redirect('/offenders');
  }
});

/* ═══════════════ INVESTIGATIONS ═══════════════ */
router.get('/investigations/create/:caseId', requireAuth, async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId, 10);
    const caseRecord = await caseOps.getById(caseId, req.session.user);
    if (!caseRecord) { req.flash('error', 'Case not found or access denied.'); return res.redirect('/cases'); }
    const caseworkers = await userOps.getCaseworkers();
    res.render('investigations/create', { title: 'New Investigation — CADMS', caseRecord, caseworkers, INV_STATUS, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Investigation create form error:', err.message);
    req.flash('error', 'Failed to load form.');
    res.redirect('/cases');
  }
});

router.post('/investigations/create/:caseId', requireAuth, async (req, res) => {
  try {
    const caseId = parseInt(req.params.caseId, 10);
    const caseRecord = await caseOps.getById(caseId, req.session.user);
    if (!caseRecord) { req.flash('error', 'Case not found or access denied.'); return res.redirect('/cases'); }

    const { investigatorId, progressNotes, status } = req.body;
    if (!investigatorId || !status) {
      req.flash('error', 'Investigator and status are required.');
      return res.redirect(`/investigations/create/${caseId}`);
    }
    if (!INV_STATUS.includes(status)) {
      req.flash('error', 'Invalid investigation status.');
      return res.redirect(`/investigations/create/${caseId}`);
    }

    const newId = await investigationOps.create({
      caseId,
      investigatorId: parseInt(investigatorId, 10),
      progressNotes,
      status
    });

    await auditWrite(req.session.user.userId, 'Create', 'investigation', newId);
    req.flash('success', 'Investigation record created.');
    res.redirect(`/cases/${caseId}`);
  } catch (err) {
    console.error('[CADMS] Investigation create error:', err.message);
    req.flash('error', 'Failed to create investigation.');
    res.redirect(`/cases/${req.params.caseId}`);
  }
});

router.get('/investigations/:id/edit', requireAuth, auditView('investigation', 'id'), async (req, res) => {
  try {
    const inv = await investigationOps.getById(parseInt(req.params.id, 10));
    if (!inv) { req.flash('error', 'Investigation not found.'); return res.redirect('/cases'); }
    if (req.session.user.role === 'Caseworker') {
      const assignedCase = await caseOps.getById(inv.caseId, req.session.user);
      if (!assignedCase) { req.flash('error', 'Access denied.'); return res.redirect('/cases'); }
    }
    // RBAC check via the linked case
    const caseRecord = await caseOps.getById(inv.caseId, req.session.user);
    if (!caseRecord) { req.flash('error', 'Access denied.'); return res.redirect('/cases'); }
    res.render('investigations/edit', { title: 'Edit Investigation — CADMS', inv, INV_STATUS, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Investigation edit form error:', err.message);
    req.flash('error', 'Failed to load investigation for editing.');
    res.redirect('/cases');
  }
});

router.post('/investigations/:id/edit', requireAuth, async (req, res) => {
  try {
    const invId = parseInt(req.params.id, 10);
    const inv = await investigationOps.getById(invId);
    if (!inv) { req.flash('error', 'Investigation not found.'); return res.redirect('/cases'); }
    await auditWrite(req.session.user.userId, 'View', 'investigation', invId);
    if (req.session.user.role === 'Caseworker' && !(await caseOps.getById(inv.caseId, req.session.user))) {
      req.flash('error', 'Access denied.'); return res.redirect('/cases');
    }
    const caseRecord = await caseOps.getById(inv.caseId, req.session.user);
    if (!caseRecord) { req.flash('error', 'Access denied.'); return res.redirect('/cases'); }

    const { progressNotes, status } = req.body;
    if (!status || !INV_STATUS.includes(status)) {
      req.flash('error', 'Valid investigation status required.');
      return res.redirect(`/investigations/${invId}/edit`);
    }

    await investigationOps.update(invId, { progressNotes, status });
    await auditWrite(req.session.user.userId, 'Update', 'investigation', invId);
    req.flash('success', 'Investigation updated.');
    res.redirect(`/cases/${inv.caseId}`);
  } catch (err) {
    console.error('[CADMS] Investigation update error:', err.message);
    req.flash('error', 'Failed to update investigation.');
    res.redirect('/cases');
  }
});

router.post('/investigations/:id/delete', requireAdmin, async (req, res) => {
  try {
    const invId = parseInt(req.params.id, 10);
    const inv = await investigationOps.getById(invId);
    if (!inv) { req.flash('error', 'Investigation not found.'); return res.redirect('/cases'); }
    await auditWrite(req.session.user.userId, 'Delete', 'investigation', invId);
    await investigationOps.delete(invId);
    req.flash('success', 'Investigation deleted.');
    res.redirect(`/cases/${inv.caseId}`);
  } catch (err) {
    console.error('[CADMS] Investigation delete error:', err.message);
    req.flash('error', 'Failed to delete investigation.');
    res.redirect('/cases');
  }
});

/* ═══════════════ SEARCH (Objective iv) ═══════════════ */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { caseId, childName, caseType, dateFrom, dateTo, status } = req.query;
    let results = null;
    const hasQuery = caseId || childName || caseType || dateFrom || dateTo || status;

    if (hasQuery) {
      results = await caseOps.search({ caseId, childName, caseType, dateFrom, dateTo, status }, req.session.user);
      await auditViews(req.session.user.userId, 'abuse_case', results, 'caseId');
    }

    res.render('search/index', {
      title: 'Search Cases — CADMS',
      results,
      query: { caseId: caseId || '', childName: childName || '', caseType: caseType || '', dateFrom: dateFrom || '', dateTo: dateTo || '', status: status || '' },
      CASE_TYPES,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('[CADMS] Search error:', err.message);
    req.flash('error', 'Search failed.');
    res.redirect('/dashboard');
  }
});

/* ═══════════════ OFFENDER SEARCH (Section 5.5) ═══════════════ */
router.get('/offenders-search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    let results = null;
    if (q && q.trim()) {
      results = await offenderOps.search(q.trim(), req.session.user);
      await auditViews(req.session.user.userId, 'offender', results, 'offenderId');
    }
    res.render('offenders/search', {
      title: 'Offender Search — CADMS',
      results,
      query: q || '',
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('[CADMS] Offender search error:', err.message);
    req.flash('error', 'Offender search failed.');
    res.redirect('/dashboard');
  }
});

/* ═══════════════ REPORTS (Objective v — Admin only) ═══════════════ */
router.get('/reports', requireAdmin, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const [byType, byStatus, trend, byCaseworker, byTypeAndStatus] = await Promise.all([
      dateFrom && dateTo ? reportEngine.casesByTypeInPeriod(dateFrom, dateTo) : reportEngine.casesByType(),
      reportEngine.casesByStatus(),
      reportEngine.casesTrend(),
      reportEngine.casesByCaseworker(),
      reportEngine.casesByTypeAndStatus()
    ]);
    const summary = await reportEngine.systemSummary();

    res.render('reports/index', {
      title: 'Reports — CADMS',
      byType,
      byStatus,
      trend,
      byCaseworker,
      byTypeAndStatus,
      summary,
      dateFrom: dateFrom || '',
      dateTo: dateTo || '',
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('[CADMS] Reports error:', err.message);
    req.flash('error', 'Failed to generate reports.');
    res.redirect('/dashboard');
  }
});

/* ═══════════════ USER MANAGEMENT (Admin only) ═══════════════ */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await userOps.getAll();
    res.render('users/index', { title: 'User Management — CADMS', users, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] Users list error:', err.message);
    req.flash('error', 'Failed to load users.');
    res.redirect('/dashboard');
  }
});

router.get('/users/create', requireAdmin, (req, res) => {
  res.render('users/create', { title: 'Create User — CADMS', error: req.flash('error'), success: req.flash('success') });
});

router.post('/users/create', requireAdmin, async (req, res) => {
  try {
    const { fullName, username, password, role, agency } = req.body;
    if (!fullName || !username || !password || !role) {
      req.flash('error', 'All required fields must be filled.');
      return res.redirect('/users/create');
    }
    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters.');
      return res.redirect('/users/create');
    }
    if (!['Caseworker', 'Administrator'].includes(role)) {
      req.flash('error', 'Invalid role.');
      return res.redirect('/users/create');
    }

    // Check username uniqueness
    const existing = await userOps.getByUsername(username.trim());
    if (existing) {
      req.flash('error', 'Username already exists.');
      return res.redirect('/users/create');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const newId = await userOps.create({ fullName: fullName.trim(), username: username.trim(), passwordHash, role, agency });
    await auditWrite(req.session.user.userId, 'Create', 'users', newId);
    req.flash('success', 'User created successfully.');
    res.redirect('/users');
  } catch (err) {
    console.error('[CADMS] User create error:', err.message);
    req.flash('error', 'Failed to create user.');
    res.redirect('/users/create');
  }
});

router.get('/users/:id/edit', requireAdmin, async (req, res) => {
  try {
    const user = await userOps.getById(parseInt(req.params.id, 10));
    if (!user) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    res.render('users/edit', { title: 'Edit User — CADMS', editUser: user, error: req.flash('error'), success: req.flash('success') });
  } catch (err) {
    console.error('[CADMS] User edit form error:', err.message);
    req.flash('error', 'Failed to load user.');
    res.redirect('/users');
  }
});

router.post('/users/:id/edit', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { fullName, username, password, role, agency, active } = req.body;

    if (!fullName || !username || !role) {
      req.flash('error', 'Full name, username, and role are required.');
      return res.redirect(`/users/${userId}/edit`);
    }
    if (!['Caseworker', 'Administrator'].includes(role)) {
      req.flash('error', 'Invalid role.');
      return res.redirect(`/users/${userId}/edit`);
    }

    // Check username uniqueness (exclude current user)
    const existing = await userOps.getByUsername(username.trim());
    if (existing && existing.userId !== userId) {
      req.flash('error', 'Username already in use by another account.');
      return res.redirect(`/users/${userId}/edit`);
    }

    await userOps.update(userId, {
      fullName: fullName.trim(),
      username: username.trim(),
      role,
      agency,
      active: active === 'on' || active === 'true' || active === '1'
    });

    // Update password if provided
    if (password && password.length > 0) {
      if (password.length < 8) {
        req.flash('error', 'Password must be at least 8 characters.');
        return res.redirect(`/users/${userId}/edit`);
      }
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await userOps.updatePassword(userId, passwordHash);
    }

    await auditWrite(req.session.user.userId, 'Update', 'users', userId);
    req.flash('success', 'User updated successfully.');
    res.redirect('/users');
  } catch (err) {
    console.error('[CADMS] User update error:', err.message);
    req.flash('error', 'Failed to update user.');
    res.redirect(`/users/${req.params.id}/edit`);
  }
});

/* ═══════════════ AUDIT LOG (Admin only) ═══════════════ */
router.get('/audit', requireAdmin, async (req, res) => {
  try {
    const { targetTable, userId, action, dateFrom, dateTo, page } = req.query;
    const currentPage = parseInt(page, 10) || 1;
    const limit = 30;
    const offset = (currentPage - 1) * limit;

    const filters = {
      targetTable: targetTable || undefined,
      userId: userId ? parseInt(userId, 10) : undefined,
      action: action || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined
    };

    const [entries, total] = await Promise.all([
      auditEngine.getEntries({ ...filters, limit, offset }),
      auditEngine.countEntries(filters)
    ]);

    const totalPages = Math.ceil(total / limit);
    const users = await userOps.getAll();

    res.render('audit/index', {
      title: 'Audit Log — CADMS',
      entries,
      users,
      filters: { targetTable: targetTable || '', userId: userId || '', action: action || '', dateFrom: dateFrom || '', dateTo: dateTo || '' },
      pagination: { currentPage, totalPages, total },
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('[CADMS] Audit log error:', err.message);
    req.flash('error', 'Failed to load audit log.');
    res.redirect('/dashboard');
  }
});

/* ═══════════════ ROOT REDIRECT ═══════════════ */
router.get('/', (req, res) => {
  res.redirect('/dashboard');
});

module.exports = router;
