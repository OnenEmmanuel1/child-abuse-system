/* ─────────────────────────────────────────────────────────────
   CADMS — Audit Middleware
   Automatically logs View actions on case-detail routes.
   Applied as route-level middleware, not an afterthought.
   ───────────────────────────────────────────────────────────── */
const auditEngine = require('../services/auditEngine');

/**
 * Creates middleware that logs a View action for the given table.
 * Reads the record ID from req.params[paramName].
 */
function auditView(targetTable, paramName = 'id') {
  return async (req, res, next) => {
    try {
      const targetId = parseInt(req.params[paramName], 10);
      if (!isNaN(targetId) && req.session && req.session.user) {
        await auditEngine.log(
          req.session.user.userId,
          'View',
          targetTable,
          targetId
        );
      }
    } catch (err) {
      // Sensitive records must not be returned unless the read is auditable.
      return next(err);
    }
    next();
  };
}

/**
 * Helper to log a write action from within a route handler.
 */
async function auditWrite(userId, action, targetTable, targetId, detail = null) {
  await auditEngine.log(userId, action, targetTable, targetId, detail);
}

async function auditViews(userId, targetTable, records, idField) {
  for (const record of records) {
    await auditEngine.log(userId, 'View', targetTable, record[idField]);
  }
}

module.exports = { auditView, auditWrite, auditViews };
