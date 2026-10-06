/* ─────────────────────────────────────────────────────────────
   CADMS — Database Connection Pool
   Uses mysql2/promise for async/await parameterized queries.
   ───────────────────────────────────────────────────────────── */
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cadms',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Never expose real data in connection errors
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

module.exports = pool;
