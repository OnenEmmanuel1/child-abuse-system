/* ─────────────────────────────────────────────────────────────
   CADMS — Database Seed Script
   Creates schema, inserts fictional demo data.
   ALL seed data is entirely fictional and categorical —
   no realistic narrative case content per Section 4.
   Run:  node db/seed.js
   ───────────────────────────────────────────────────────────── */
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;

async function seed() {
  /* ── Connect without database first to create it ── */
  const initConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  console.log('[CADMS Seed] Connected to MySQL server.');

  /* ── Run schema.sql ── */
  const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await initConn.query(schemaSQL);
  for (const table of ['child', 'offender']) {
    const [columns] = await initConn.query(
      'SELECT COUNT(*) AS found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [process.env.DB_NAME || 'cadms', table, 'createdBy']
    );
    if (!columns[0].found) {
      const constraint = table === 'child' ? 'fk_child_creator' : 'fk_offender_creator';
      await initConn.query(`ALTER TABLE \`${table}\` ADD COLUMN createdBy INT NULL, ADD CONSTRAINT \`${constraint}\` FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL`);
    }
    const creatorIndex = table === 'child' ? 'idx_child_creator' : 'idx_offender_creator';
    const [indexes] = await initConn.query(
      'SELECT COUNT(*) AS found FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
      [process.env.DB_NAME || 'cadms', table, creatorIndex]
    );
    if (!indexes[0].found) await initConn.query(`CREATE INDEX \`${creatorIndex}\` ON \`${table}\` (createdBy)`);
  }
  for (const index of [
    ['abuse_case', 'idx_case_type_status_date', 'caseType, status, dateReported'],
    ['abuse_case', 'idx_case_date_reported', 'dateReported'],
    ['audit_log', 'idx_audit_timestamp', 'timestamp']
  ]) {
    const [indexes] = await initConn.query(
      'SELECT COUNT(*) AS found FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
      [process.env.DB_NAME || 'cadms', index[0], index[1]]
    );
    if (!indexes[0].found) await initConn.query(`CREATE INDEX \`${index[1]}\` ON \`${index[0]}\` (${index[2]})`);
  }
  console.log('[CADMS Seed] Schema created / verified.');
  await initConn.end();

  /* ── Reconnect with database selected ── */
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cadms',
    multipleStatements: true
  });

  /* ── Check if already seeded ── */
  const [existingUsers] = await conn.query('SELECT COUNT(*) AS cnt FROM users');
  if (existingUsers[0].cnt > 0) {
    const demoHash = await bcrypt.hash('password123', SALT_ROUNDS);
    await conn.query(
      "UPDATE users SET passwordHash = ? WHERE username IN ('admin', 'jane.doe', 'john.smith')",
      [demoHash]
    );
    console.log('[CADMS Seed] Existing data retained; demo account passwords set to password123 where those accounts exist.');
    await conn.end();
    return;
  }

  /* ── Users (1 Administrator, 2 Caseworkers) ── */
  const demoHash = await bcrypt.hash('password123', SALT_ROUNDS);

  await conn.query(`
    INSERT INTO users (fullName, username, passwordHash, role, agency) VALUES
      ('Admin User',     'admin',      ?, 'Administrator', 'Central Child Protection Agency'),
      ('Jane Doe',       'jane.doe',   ?, 'Caseworker',    'District Office Alpha'),
      ('John Smith',     'john.smith', ?, 'Caseworker',    'District Office Beta')
  `, [demoHash, demoHash, demoHash]);
  console.log('[CADMS Seed] Users inserted (admin / jane.doe / john.smith).');

  /* ── Children (fictional placeholder names) ── */
  await conn.query(`
    INSERT INTO child (firstName, lastName, dateOfBirth, gender, guardianContact, address) VALUES
      ('Child', 'Alpha',   '2018-03-15', 'Female', 'Guardian A — 0800-000-001', '1 Placeholder Street, City A'),
      ('Child', 'Bravo',   '2016-07-22', 'Male',   'Guardian B — 0800-000-002', '2 Placeholder Avenue, City B'),
      ('Child', 'Charlie', '2019-11-05', 'Female', 'Guardian C — 0800-000-003', '3 Placeholder Road, City C'),
      ('Child', 'Delta',   '2015-01-10', 'Male',   'Guardian D — 0800-000-004', '4 Placeholder Lane, City D'),
      ('Child', 'Echo',    '2020-06-30', 'Female', 'Guardian E — 0800-000-005', '5 Placeholder Close, City E')
  `);
  console.log('[CADMS Seed] Children inserted (5 fictional records).');

  /* ── Offenders (fictional placeholders) ── */
  await conn.query(`
    INSERT INTO offender (fullName, knownAliases, lastKnownAddress, identifyingDetails) VALUES
      ('Suspect One',   'Alias X',          '10 Unknown Street, City F', 'Placeholder identifying detail.'),
      ('Suspect Two',   NULL,               '20 Unknown Avenue, City G', 'Placeholder identifying detail.'),
      ('Suspect Three', 'Alias Y, Alias Z', '30 Unknown Road, City H',  'Placeholder identifying detail.')
  `);
  console.log('[CADMS Seed] Offenders inserted (3 fictional records).');

  /* ── Abuse Cases (categorical labels only — no narrative content per Section 4) ── */
  await conn.query(`
    INSERT INTO abuse_case (childId, offenderId, caseType, dateReported, status, assignedCaseworker, notes) VALUES
      (1, 1,    'Neglect',       '2025-01-10', 'UnderInvestigation', 2, 'Case opened following a referral from a partner agency. Initial assessment scheduled.'),
      (2, 2,    'Physical',      '2025-02-18', 'Reported',           3, 'Case opened following a referral. Awaiting caseworker assignment review.'),
      (3, NULL, 'Emotional',     '2025-03-05', 'UnderInvestigation', 2, 'Case opened following an institutional referral. Assessment in progress.'),
      (4, 1,    'Exploitation',  '2025-04-12', 'Closed',             3, 'Case opened and investigated. Outcome recorded. Case closed per protocol.'),
      (5, 3,    'Neglect',       '2025-05-20', 'Reported',           2, 'Case opened following a community referral. Pending initial assessment.')
  `);
  console.log('[CADMS Seed] Abuse cases inserted (5 fictional records).');

  /* ── Investigations ── */
  await conn.query(`
    INSERT INTO investigation (caseId, investigatorId, progressNotes, status, lastUpdated) VALUES
      (1, 2, 'Administrative progress update recorded.', 'Ongoing',   '2025-01-15 10:00:00'),
      (3, 2, 'Administrative progress update recorded.', 'Ongoing',   '2025-03-12 14:30:00'),
      (4, 3, 'Administrative progress update recorded.', 'Completed', '2025-05-01 09:00:00')
  `);
  console.log('[CADMS Seed] Investigations inserted (3 records).');

  /* ── Audit log entries for the seed actions ── */
  await conn.query(`
    INSERT INTO audit_log (userId, action, targetTable, targetId, detail, timestamp) VALUES
      (1, 'Create', 'abuse_case', 1, 'Seed: case created by system.', '2025-01-10 08:00:00'),
      (1, 'Create', 'abuse_case', 2, 'Seed: case created by system.', '2025-02-18 08:00:00'),
      (1, 'Create', 'abuse_case', 3, 'Seed: case created by system.', '2025-03-05 08:00:00'),
      (1, 'Create', 'abuse_case', 4, 'Seed: case created by system.', '2025-04-12 08:00:00'),
      (1, 'Create', 'abuse_case', 5, 'Seed: case created by system.', '2025-05-20 08:00:00')
  `);
  console.log('[CADMS Seed] Audit log entries inserted.');

  await conn.end();
  console.log('[CADMS Seed] ✔ Seed complete. Ready to run.');
}

seed().catch(err => {
  console.error('[CADMS Seed] FATAL:', err.message);
  process.exit(1);
});
