const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { pool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// ---- API routes ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dentists', require('./routes/dentists'));
app.use('/api/services', require('./routes/services'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/patients', require('./routes/patients'));

// unknown /api/... address
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));

// ---- frontend (the files in /public) ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- error handler: every error ends up here ----
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email is already registered' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ error: 'This record is used by appointments, so it cannot be deleted' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

// ---- start ----
async function start() {
  try {
    await pool.query('SELECT 1');
    await pool.query('SELECT COUNT(*) FROM users');
  } catch (err) {
    console.error('\nCould not use the database:', err.message);
    console.error('1) Start MySQL in the XAMPP control panel');
    console.error('2) Run:  npm run setup   (creates the tables and sample data)\n');
    process.exit(1);
  }
  app.listen(config.port, () => {
    console.log(`Aurora running at http://localhost:${config.port}`);
  });
}

start();
