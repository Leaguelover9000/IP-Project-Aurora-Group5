const mysql = require('mysql2/promise');
const config = require('./config');

// dateStrings: true makes MySQL return DATE/TIME as plain text
// ("2026-11-20", "09:00:00") instead of JavaScript Date objects.
const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

// Run several queries as one transaction (all succeed, or none are saved).
async function tx(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, tx };
