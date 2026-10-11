require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hematrik',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
});

// Quick ping on startup (non-fatal)
pool
  .query('SELECT 1')
  .then(() => console.log('Terhubung ke database MySQL'))
  .catch((err) => console.error('Gagal terhubung ke database:', err?.message || err));

module.exports = pool;