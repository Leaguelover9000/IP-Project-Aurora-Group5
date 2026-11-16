const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const config = require('../config');
const { auth } = require('../middleware/auth');
const { wrap, httpError, isEmail } = require('../utils');

const router = express.Router();

// POST /api/auth/register  -> create a patient account
router.post('/register', wrap(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !name.trim()) throw httpError(400, 'Name is required');
  if (!isEmail(email)) throw httpError(400, 'Please enter a valid email');
  if (!password || password.length < 6) throw httpError(400, 'Password must be at least 6 characters');

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?,?,?,?,?)',
    [name.trim(), email.trim().toLowerCase(), hash, phone || null, 'patient']
  );
  res.status(201).json({ user_id: result.insertId, message: 'Account created. You can log in now.' });
}));

// POST /api/auth/login  -> returns a token and the user's role
router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw httpError(400, 'Email and password are required');

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw httpError(401, 'Wrong email or password');
  }

  let dentistId = null;
  if (user.role === 'dentist') {
    const [d] = await pool.query('SELECT dentist_id FROM dentists WHERE user_id = ?', [user.user_id]);
    dentistId = d[0] ? d[0].dentist_id : null;
  }

  const payload = { user_id: user.user_id, name: user.name, role: user.role, dentist_id: dentistId };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.json({ token, user: { ...payload, email: user.email } });
}));

// GET /api/auth/me  -> info about the logged-in user
router.get('/me', auth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT user_id, name, email, phone, role FROM users WHERE user_id = ?',
    [req.user.user_id]
  );
  if (!rows[0]) throw httpError(404, 'User not found');
  res.json({ ...rows[0], dentist_id: req.user.dentist_id });
}));

module.exports = router;
