const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { auth, role } = require('../middleware/auth');
const { wrap, httpError, isEmail } = require('../utils');

const router = express.Router();

// GET /api/patients  (admin) -> list of patients (used when booking for a walk-in patient)
router.get('/', auth, role('admin'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT user_id, name, email, phone FROM users WHERE role = 'patient' ORDER BY name"
  );
  res.json(rows);
}));

// POST /api/patients  (admin) -> create a patient account for a walk-in / phone-in patient
router.post('/', auth, role('admin'), wrap(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !name.trim()) throw httpError(400, 'Name is required');
  if (!isEmail(email)) throw httpError(400, 'Please enter a valid email');
  if (!password || password.length < 6) throw httpError(400, 'Password must be at least 6 characters');

  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?,?,?,?,?)',
    [name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 10), phone || null, 'patient']
  );
  res.status(201).json({ user_id: r.insertId, message: 'Patient added' });
}));

module.exports = router;
