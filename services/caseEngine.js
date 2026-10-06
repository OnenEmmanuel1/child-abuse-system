/* ─────────────────────────────────────────────────────────────
   CADMS — Case Engine (services/caseEngine.js)
   All business logic for child, offender, abuse_case, and
   investigation CRUD, with RBAC-scoped queries.
   ───────────────────────────────────────────────────────────── */
const pool = require('../config/db');

/* ═══════════════ VALID ENUM VALUES ═══════════════ */
const CASE_TYPES  = ['Physical', 'Sexual', 'Emotional', 'Neglect', 'Exploitation', 'Trafficking'];
const CASE_STATUS = ['Reported', 'UnderInvestigation', 'Closed'];
const INV_STATUS  = ['Ongoing', 'Completed', 'Suspended'];

/* ═══════════════ CHILD ═══════════════ */
const childOps = {
  async getAll(user) {
    const sql = user && user.role === 'Caseworker'
      ? `SELECT c.* FROM child c WHERE c.createdBy=? OR EXISTS (SELECT 1 FROM abuse_case ac WHERE ac.childId=c.childId AND ac.assignedCaseworker=?) ORDER BY c.lastName,c.firstName`
      : 'SELECT * FROM child ORDER BY lastName, firstName';
    const [rows] = await pool.query(sql, user && user.role === 'Caseworker' ? [user.userId, user.userId] : []);
    return rows;
  },

  async getById(childId, user) {
    const sql = user && user.role === 'Caseworker'
      ? `SELECT c.* FROM child c WHERE c.childId=? AND (c.createdBy=? OR EXISTS (SELECT 1 FROM abuse_case ac WHERE ac.childId=c.childId AND ac.assignedCaseworker=?))`
      : 'SELECT * FROM child WHERE childId = ?';
    const [rows] = await pool.query(sql, user && user.role === 'Caseworker' ? [childId, user.userId, user.userId] : [childId]);
    return rows[0] || null;
  },

  async create({ firstName, lastName, dateOfBirth, gender, guardianContact, address }, createdBy) {
    const [result] = await pool.query(
      `INSERT INTO child (firstName, lastName, dateOfBirth, gender, guardianContact, address, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [firstName, lastName, dateOfBirth || null, gender || null, guardianContact || null, address || null, createdBy || null]
    );
    return result.insertId;
  },

  async update(childId, { firstName, lastName, dateOfBirth, gender, guardianContact, address }) {
    await pool.query(
      `UPDATE child SET firstName=?, lastName=?, dateOfBirth=?, gender=?, guardianContact=?, address=?
       WHERE childId=?`,
      [firstName, lastName, dateOfBirth || null, gender || null, guardianContact || null, address || null, childId]
    );
  },

  async delete(childId) {
    await pool.query('DELETE FROM child WHERE childId = ?', [childId]);
  }
};

/* ═══════════════ OFFENDER ═══════════════ */
const offenderOps = {
  async getAll(user) {
    const sql = user && user.role === 'Caseworker'
      ? `SELECT o.* FROM offender o WHERE o.createdBy=? OR EXISTS (SELECT 1 FROM abuse_case ac WHERE ac.offenderId=o.offenderId AND ac.assignedCaseworker=?) ORDER BY o.fullName`
      : 'SELECT * FROM offender ORDER BY fullName';
    const [rows] = await pool.query(sql, user && user.role === 'Caseworker' ? [user.userId, user.userId] : []);
    return rows;
  },

  async getById(offenderId, user) {
    const sql = user && user.role === 'Caseworker'
      ? `SELECT o.* FROM offender o WHERE o.offenderId=? AND (o.createdBy=? OR EXISTS (SELECT 1 FROM abuse_case ac WHERE ac.offenderId=o.offenderId AND ac.assignedCaseworker=?))`
      : 'SELECT * FROM offender WHERE offenderId = ?';
    const [rows] = await pool.query(sql, user && user.role === 'Caseworker' ? [offenderId, user.userId, user.userId] : [offenderId]);
    return rows[0] || null;
  },

  async create({ fullName, knownAliases, lastKnownAddress, identifyingDetails }, createdBy) {
    const [result] = await pool.query(
      `INSERT INTO offender (fullName, knownAliases, lastKnownAddress, identifyingDetails, createdBy)
       VALUES (?, ?, ?, ?, ?)`,
      [fullName || null, knownAliases || null, lastKnownAddress || null, identifyingDetails || null, createdBy || null]
    );
    return result.insertId;
  },

  async update(offenderId, { fullName, knownAliases, lastKnownAddress, identifyingDetails }) {
    await pool.query(
      `UPDATE offender SET fullName=?, knownAliases=?, lastKnownAddress=?, identifyingDetails=?
       WHERE offenderId=?`,
      [fullName || null, knownAliases || null, lastKnownAddress || null, identifyingDetails || null, offenderId]
    );
  },

  async delete(offenderId) {
    await pool.query('DELETE FROM offender WHERE offenderId = ?', [offenderId]);
  },

  /**
   * Search offenders by name/alias — Section 5.5 offender tracking.
   */
  async search(query, user) {
    const like = `%${query}%`;
    const scoped = user && user.role === 'Caseworker';
    const [rows] = await pool.query(
      `SELECT * FROM offender
       WHERE (fullName LIKE ? OR knownAliases LIKE ? OR identifyingDetails LIKE ?)
       ${scoped ? 'AND (offender.createdBy=? OR EXISTS (SELECT 1 FROM abuse_case ac WHERE ac.offenderId=offender.offenderId AND ac.assignedCaseworker=?))' : ''}
       ORDER BY fullName`,
      scoped ? [like, like, like, user.userId, user.userId] : [like, like, like]
    );
    return rows;
  },

  /**
   * Get all cases linked to a specific offender — cross-case tracing.
   */
  async getLinkedCases(offenderId, user) {
    const scoped = user && user.role === 'Caseworker';
    const [rows] = await pool.query(
      `SELECT ac.*, c.firstName AS childFirst, c.lastName AS childLast,
              u.fullName AS caseworkerName
       FROM abuse_case ac
       JOIN child c ON ac.childId = c.childId
       LEFT JOIN users u ON ac.assignedCaseworker = u.userId
       WHERE ac.offenderId = ? ${scoped ? 'AND ac.assignedCaseworker = ?' : ''}
       ORDER BY ac.dateReported DESC`,
      scoped ? [offenderId, user.userId] : [offenderId]
    );
    return rows;
  }
};

/* ═══════════════ ABUSE CASE ═══════════════ */
const caseOps = {
  /**
   * Get cases scoped by user role:
   * - Administrator: all cases
   * - Caseworker: only assigned cases
   */
  async getAll(user) {
    let sql = `
      SELECT ac.*, c.firstName AS childFirst, c.lastName AS childLast,
             o.fullName AS offenderName, u.fullName AS caseworkerName
      FROM abuse_case ac
      JOIN child c ON ac.childId = c.childId
      LEFT JOIN offender o ON ac.offenderId = o.offenderId
      LEFT JOIN users u ON ac.assignedCaseworker = u.userId
    `;
    const params = [];

    if (user.role === 'Caseworker') {
      sql += ' WHERE ac.assignedCaseworker = ?';
      params.push(user.userId);
    }

    sql += ' ORDER BY ac.dateReported DESC';
    const [rows] = await pool.query(sql, params);
    return rows;
  },

  /**
   * Get a single case by ID — with RBAC check.
   * Returns null if user has no access.
   */
  async getById(caseId, user) {
    const [rows] = await pool.query(
      `SELECT ac.*, c.firstName AS childFirst, c.lastName AS childLast,
              c.dateOfBirth AS childDOB, c.gender AS childGender,
              c.guardianContact, c.address AS childAddress,
              o.fullName AS offenderName, o.knownAliases, o.lastKnownAddress,
              u.fullName AS caseworkerName, u.username AS caseworkerUsername
       FROM abuse_case ac
       JOIN child c ON ac.childId = c.childId
       LEFT JOIN offender o ON ac.offenderId = o.offenderId
       LEFT JOIN users u ON ac.assignedCaseworker = u.userId
       WHERE ac.caseId = ?`,
      [caseId]
    );

    if (rows.length === 0) return null;

    const caseRecord = rows[0];

    // RBAC: Caseworker can only view their own assigned cases
    if (user.role === 'Caseworker' && caseRecord.assignedCaseworker !== user.userId) {
      return null;
    }

    return caseRecord;
  },

  /**
   * Create a new case with a linked investigation in a transaction.
   */
  async create({ childId, offenderId, caseType, dateReported, status, assignedCaseworker, notes }, creatorId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [caseResult] = await conn.query(
        `INSERT INTO abuse_case (childId, offenderId, caseType, dateReported, status, assignedCaseworker, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [childId, offenderId || null, caseType, dateReported, status || 'Reported', assignedCaseworker || null, notes || null]
      );
      const newCaseId = caseResult.insertId;

      // Auto-create an investigation record if a caseworker is assigned
      if (assignedCaseworker) {
        await conn.query(
          `INSERT INTO investigation (caseId, investigatorId, progressNotes, status)
           VALUES (?, ?, 'Case opened. Initial assessment pending.', 'Ongoing')`,
          [newCaseId, assignedCaseworker]
        );
      }

      await conn.commit();
      return newCaseId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async update(caseId, { childId, offenderId, caseType, dateReported, status, assignedCaseworker, notes }) {
    await pool.query(
      `UPDATE abuse_case
       SET childId=?, offenderId=?, caseType=?, dateReported=?, status=?, assignedCaseworker=?, notes=?
       WHERE caseId=?`,
      [childId, offenderId || null, caseType, dateReported, status, assignedCaseworker || null, notes || null, caseId]
    );
  },

  async delete(caseId) {
    await pool.query('DELETE FROM abuse_case WHERE caseId = ?', [caseId]);
  },

  /**
   * Search cases — scoped by RBAC.
   */
  async search({ caseId, childName, caseType, dateFrom, dateTo, status }, user) {
    let sql = `
      SELECT ac.*, c.firstName AS childFirst, c.lastName AS childLast,
             o.fullName AS offenderName, u.fullName AS caseworkerName
      FROM abuse_case ac
      JOIN child c ON ac.childId = c.childId
      LEFT JOIN offender o ON ac.offenderId = o.offenderId
      LEFT JOIN users u ON ac.assignedCaseworker = u.userId
      WHERE 1=1
    `;
    const params = [];

    // RBAC scoping
    if (user.role === 'Caseworker') {
      sql += ' AND ac.assignedCaseworker = ?';
      params.push(user.userId);
    }

    if (caseId) {
      sql += ' AND ac.caseId = ?';
      params.push(parseInt(caseId, 10));
    }
    if (childName) {
      const like = `%${childName}%`;
      sql += ' AND (c.firstName LIKE ? OR c.lastName LIKE ?)';
      params.push(like, like);
    }
    if (caseType) {
      sql += ' AND ac.caseType = ?';
      params.push(caseType);
    }
    if (CASE_STATUS.includes(status)) {
      sql += ' AND ac.status = ?';
      params.push(status);
    }
    if (dateFrom) {
      sql += ' AND ac.dateReported >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ' AND ac.dateReported <= ?';
      params.push(dateTo);
    }

    sql += ' ORDER BY ac.dateReported DESC';
    const [rows] = await pool.query(sql, params);
    return rows;
  }
};

/* ═══════════════ INVESTIGATION ═══════════════ */
const investigationOps = {
  async getByCaseId(caseId) {
    const [rows] = await pool.query(
      `SELECT inv.*, u.fullName AS investigatorName
       FROM investigation inv
       JOIN users u ON inv.investigatorId = u.userId
       WHERE inv.caseId = ?
       ORDER BY inv.lastUpdated DESC`,
      [caseId]
    );
    return rows;
  },

  async getById(investigationId) {
    const [rows] = await pool.query(
      `SELECT inv.*, u.fullName AS investigatorName,
              ac.caseType, ac.status AS caseStatus
       FROM investigation inv
       JOIN users u ON inv.investigatorId = u.userId
       JOIN abuse_case ac ON inv.caseId = ac.caseId
       WHERE inv.investigationId = ?`,
      [investigationId]
    );
    return rows[0] || null;
  },

  async create({ caseId, investigatorId, progressNotes, status }) {
    const [result] = await pool.query(
      `INSERT INTO investigation (caseId, investigatorId, progressNotes, status)
       VALUES (?, ?, ?, ?)`,
      [caseId, investigatorId, progressNotes || null, status || 'Ongoing']
    );
    return result.insertId;
  },

  async update(investigationId, { progressNotes, status }) {
    await pool.query(
      `UPDATE investigation SET progressNotes=?, status=?, lastUpdated=NOW()
       WHERE investigationId=?`,
      [progressNotes || null, status, investigationId]
    );
  },

  async delete(investigationId) {
    await pool.query('DELETE FROM investigation WHERE investigationId = ?', [investigationId]);
  }
};

/* ═══════════════ USER MANAGEMENT ═══════════════ */
const userOps = {
  async getAll() {
    const [rows] = await pool.query(
      'SELECT userId, fullName, username, role, agency, active, createdAt FROM users ORDER BY fullName'
    );
    return rows;
  },

  async getById(userId) {
    const [rows] = await pool.query(
      'SELECT userId, fullName, username, role, agency, active, createdAt FROM users WHERE userId = ?',
      [userId]
    );
    return rows[0] || null;
  },

  async getByUsername(username) {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0] || null;
  },

  async getCaseworkers() {
    const [rows] = await pool.query(
      "SELECT userId, fullName, username FROM users WHERE role = 'Caseworker' AND active = TRUE ORDER BY fullName"
    );
    return rows;
  },

  async create({ fullName, username, passwordHash, role, agency }) {
    const [result] = await pool.query(
      `INSERT INTO users (fullName, username, passwordHash, role, agency)
       VALUES (?, ?, ?, ?, ?)`,
      [fullName, username, passwordHash, role, agency || null]
    );
    return result.insertId;
  },

  async update(userId, { fullName, username, role, agency, active }) {
    await pool.query(
      `UPDATE users SET fullName=?, username=?, role=?, agency=?, active=?
       WHERE userId=?`,
      [fullName, username, role, agency || null, active, userId]
    );
  },

  async updatePassword(userId, passwordHash) {
    await pool.query('UPDATE users SET passwordHash=? WHERE userId=?', [passwordHash, userId]);
  }
};

module.exports = {
  CASE_TYPES,
  CASE_STATUS,
  INV_STATUS,
  childOps,
  offenderOps,
  caseOps,
  investigationOps,
  userOps
};
