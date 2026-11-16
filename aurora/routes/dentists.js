const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../db');
const { auth, role } = require('../middleware/auth');
const { wrap, httpError, isEmail, isDate } = require('../utils');

const router = express.Router();

// GET /api/dentists  -> list all dentists
router.get('/', auth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT d.dentist_id, u.user_id, u.name, u.email, u.phone, d.specialization
     FROM dentists d JOIN users u ON u.user_id = d.user_id
     ORDER BY u.name`
  );
  res.json(rows);
}));

// GET /api/dentists/:id/schedule?date=YYYY-MM-DD  -> the dentist's OPEN slots
// (this is the scheduling integration: only future slots with status = Open)
router.get('/:id/schedule', auth, wrap(async (req, res) => {
  const { date } = req.query;
  if (date && !isDate(date)) throw httpError(400, 'Date must look like 2026-11-20');

  const [dentist] = await pool.query(
    'SELECT d.dentist_id, u.name, d.specialization FROM dentists d JOIN users u ON u.user_id = d.user_id WHERE d.dentist_id = ?',
    [req.params.id]
  );
  if (!dentist[0]) throw httpError(404, 'Dentist not found');

  const params = [req.params.id];
  let dateFilter = '';
  if (date) {
    dateFilter = 'AND s.schedule_date = ?';
    params.push(date);
  }
  const [slots] = await pool.query(
    `SELECT s.schedule_id, s.dentist_id, ? AS doctor_name, ? AS specialization,
            s.schedule_date, s.start_time, s.end_time, s.status
     FROM schedules s
     WHERE s.dentist_id = ? AND s.status = 'Open'
       AND TIMESTAMP(s.schedule_date, s.start_time) > NOW() ${dateFilter}
     ORDER BY s.schedule_date, s.start_time`,
    [dentist[0].name, dentist[0].specialization, ...params]
  );
  res.json(slots);
}));

// POST /api/dentists  (admin) -> creates the login account and the dentist profile
router.post('/', auth, role('admin'), wrap(async (req, res) => {
  const { name, email, password, phone, specialization } = req.body;
  if (!name || !name.trim()) throw httpError(400, 'Name is required');
  if (!isEmail(email)) throw httpError(400, 'Please enter a valid email');
  if (!password || password.length < 6) throw httpError(400, 'Password must be at least 6 characters');

  const hash = await bcrypt.hash(password, 10);
  const dentistId = await tx(async (conn) => {
    const [u] = await conn.query(
      'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?,?,?,?,?)',
      [name.trim(), email.trim().toLowerCase(), hash, phone || null, 'dentist']
    );
    const [d] = await conn.query(
      'INSERT INTO dentists (user_id, specialization) VALUES (?,?)',
      [u.insertId, (specialization || 'General Dentistry').trim()]
    );
    return d.insertId;
  });
  res.status(201).json({ dentist_id: dentistId, message: 'Dentist added' });
}));

// PUT /api/dentists/:id  (admin)
router.put('/:id', auth, role('admin'), wrap(async (req, res) => {
  const { name, email, password, phone, specialization } = req.body;
  if (!name || !name.trim()) throw httpError(400, 'Name is required');
  if (!isEmail(email)) throw httpError(400, 'Please enter a valid email');
  if (password && password.length < 6) throw httpError(400, 'Password must be at least 6 characters');

  const [rows] = await pool.query('SELECT user_id FROM dentists WHERE dentist_id = ?', [req.params.id]);
  if (!rows[0]) throw httpError(404, 'Dentist not found');
  const userId = rows[0].user_id;

  await tx(async (conn) => {
    await conn.query(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE user_id = ?',
      [name.trim(), email.trim().toLowerCase(), phone || null, userId]
    );
    if (password) {
      await conn.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [
        await bcrypt.hash(password, 10),
        userId,
      ]);
    }
    await conn.query('UPDATE dentists SET specialization = ? WHERE dentist_id = ?', [
      (specialization || 'General Dentistry').trim(),
      req.params.id,
    ]);
  });
  res.json({ message: 'Dentist updated' });
}));

// DELETE /api/dentists/:id  (admin)
router.delete('/:id', auth, role('admin'), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT user_id FROM dentists WHERE dentist_id = ?', [req.params.id]);
  if (!rows[0]) throw httpError(404, 'Dentist not found');

  const [active] = await pool.query(
    `SELECT COUNT(*) AS n FROM appointments a
     JOIN schedules s ON s.schedule_id = a.schedule_id
     WHERE s.dentist_id = ? AND a.status IN ('Pending','Confirmed')`,
    [req.params.id]
  );
  if (active[0].n > 0) {
    throw httpError(409, 'This dentist still has active appointments. Cancel them first.');
  }

  // deleting the user also removes the dentist profile and slots (ON DELETE CASCADE)
  await pool.query('DELETE FROM users WHERE user_id = ?', [rows[0].user_id]);
  res.json({ message: 'Dentist deleted' });
}));

module.exports = router;
