/* ─────────────────────────────────────────────────────────────
   CADMS — Report Engine (services/reportEngine.js)
   SQL aggregate-function reporting per Objective v.
   All reports return aggregate statistics only — never raw
   exports of individual children's identifying details.
   ───────────────────────────────────────────────────────────── */
const pool = require('../config/db');

const reportEngine = {
  /**
   * Case counts grouped by case type.
   */
  async casesByType() {
    const [rows] = await pool.query(`
      SELECT caseType, COUNT(*) AS caseCount
      FROM abuse_case
      GROUP BY caseType
      ORDER BY caseCount DESC
    `);
    return rows;
  },

  /**
   * Case counts grouped by status.
   */
  async casesByStatus() {
    const [rows] = await pool.query(`
      SELECT status, COUNT(*) AS caseCount
      FROM abuse_case
      GROUP BY status
      ORDER BY caseCount DESC
    `);
    return rows;
  },

  /**
   * Case counts grouped by month/year (trend over time).
   */
  async casesTrend() {
    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(dateReported, '%Y-%m') AS period,
        COUNT(*) AS caseCount
      FROM abuse_case
      GROUP BY period
      ORDER BY period ASC
    `);
    return rows;
  },

  /**
   * Case counts by type AND status (cross-tab).
   */
  async casesByTypeAndStatus() {
    const [rows] = await pool.query(`
      SELECT caseType, status, COUNT(*) AS caseCount
      FROM abuse_case
      GROUP BY caseType, status
      ORDER BY caseType, status
    `);
    return rows;
  },

  /**
   * Cases per caseworker (workload summary).
   */
  async casesByCaseworker() {
    const [rows] = await pool.query(`
      SELECT u.fullName AS caseworkerName, u.userId,
             COUNT(ac.caseId) AS caseCount,
             SUM(CASE WHEN ac.status = 'Reported' THEN 1 ELSE 0 END) AS reported,
             SUM(CASE WHEN ac.status = 'UnderInvestigation' THEN 1 ELSE 0 END) AS underInvestigation,
             SUM(CASE WHEN ac.status = 'Closed' THEN 1 ELSE 0 END) AS closed
      FROM users u
      LEFT JOIN abuse_case ac ON u.userId = ac.assignedCaseworker
      WHERE u.role = 'Caseworker' AND u.active = TRUE
      GROUP BY u.userId, u.fullName
      ORDER BY caseCount DESC
    `);
    return rows;
  },

  /**
   * Total system summary (dashboard cards).
   */
  async systemSummary() {
    const [[totals]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM abuse_case) AS totalCases,
        (SELECT COUNT(*) FROM abuse_case WHERE status = 'Reported') AS reportedCases,
        (SELECT COUNT(*) FROM abuse_case WHERE status = 'UnderInvestigation') AS activeCases,
        (SELECT COUNT(*) FROM abuse_case WHERE status = 'Closed') AS closedCases,
        (SELECT COUNT(*) FROM child) AS totalChildren,
        (SELECT COUNT(*) FROM offender) AS totalOffenders,
        (SELECT COUNT(*) FROM investigation WHERE status = 'Ongoing') AS ongoingInvestigations,
        (SELECT COUNT(*) FROM users WHERE active = TRUE) AS activeUsers
    `);
    return totals;
  },

  /**
   * Cases within a specific date range, grouped by type.
   */
  async casesByTypeInPeriod(dateFrom, dateTo) {
    const [rows] = await pool.query(`
      SELECT caseType, COUNT(*) AS caseCount
      FROM abuse_case
      WHERE dateReported >= ? AND dateReported <= ?
      GROUP BY caseType
      ORDER BY caseCount DESC
    `, [dateFrom, dateTo]);
    return rows;
  }
};

module.exports = reportEngine;
