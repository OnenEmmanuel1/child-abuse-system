/* ─────────────────────────────────────────────────────────────
   CADMS — Audit Engine (services/auditEngine.js)
   Centralised audit logging. Every case-record read and write
   goes through this module per Section 4/8 requirements.
   ───────────────────────────────────────────────────────────── */
const pool = require('../config/db');

const auditEngine = {
  /**
   * Log an action to the audit_log table.
   * @param {number} userId       - ID of the user performing the action
   * @param {string} action       - 'View' | 'Create' | 'Update' | 'Delete'
   * @param {string} targetTable  - Table being accessed
   * @param {number} targetId     - PK of the record accessed
   * @param {string} [detail]     - Optional human-readable detail
   */
  async log(userId, action, targetTable, targetId, detail = null) {
    await pool.query(
      `INSERT INTO audit_log (userId, action, targetTable, targetId, detail, timestamp)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, action, targetTable, targetId, detail]
    );
  },

  /**
   * Retrieve audit log entries (Admin only).
   * @param {object} filters - { targetTable, userId, action, dateFrom, dateTo, limit, offset }
   */
  async getEntries({ targetTable, userId, action, dateFrom, dateTo, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT al.logId, al.action, al.targetTable, al.targetId, al.detail, al.timestamp,
             u.fullName AS performedBy, u.username
      FROM audit_log al
      JOIN users u ON al.userId = u.userId
      WHERE 1=1
    `;
    const params = [];

    if (targetTable) {
      sql += ' AND al.targetTable = ?';
      params.push(targetTable);
    }
    if (userId) {
      sql += ' AND al.userId = ?';
      params.push(userId);
    }
    if (action) {
      sql += ' AND al.action = ?';
      params.push(action);
    }
    if (dateFrom) {
      sql += ' AND al.timestamp >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ' AND al.timestamp <= ?';
      params.push(dateTo + ' 23:59:59');
    }

    sql += ' ORDER BY al.timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(sql, params);
    return rows;
  },

  /**
   * Count total audit entries (for pagination).
   */
  async countEntries({ targetTable, userId, action, dateFrom, dateTo } = {}) {
    let sql = 'SELECT COUNT(*) AS total FROM audit_log al WHERE 1=1';
    const params = [];

    if (targetTable) { sql += ' AND al.targetTable = ?'; params.push(targetTable); }
    if (userId)      { sql += ' AND al.userId = ?';      params.push(userId); }
    if (action)      { sql += ' AND al.action = ?';      params.push(action); }
    if (dateFrom)    { sql += ' AND al.timestamp >= ?';   params.push(dateFrom); }
    if (dateTo)      { sql += ' AND al.timestamp <= ?';   params.push(dateTo + ' 23:59:59'); }

    const [rows] = await pool.query(sql, params);
    return rows[0].total;
  }
};

module.exports = auditEngine;
