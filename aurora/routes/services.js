const express = require('express');
const { pool } = require('../db');
const { auth, role } = require('../middleware/auth');
const { wrap, httpError } = require('../utils');

const router = express.Router();

function check(body) {
  const name = (body.name || '').trim();
  const duration = Number(body.duration_minutes);
  const price = Number(body.price);
  if (!name) throw httpError(400, 'Service name is required');
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    throw httpError(400, 'Duration must be a whole number of minutes (5 to 480)');
  }
  if (!Number.isFinite(price) || price < 0) throw httpError(400, 'Price must be 0 or more');
  return { name, duration, price };
}

// GET /api/services
router.get('/', auth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM services ORDER BY name');
  res.json(rows);
}));

// POST /api/services  (admin)
router.post('/', auth, role('admin'), wrap(async (req, res) => {
  const { name, duration, price } = check(req.body);
  const [r] = await pool.query(
    'INSERT INTO services (name, duration_minutes, price) VALUES (?,?,?)',
    [name, duration, price]
  );
  res.status(201).json({ service_id: r.insertId, message: 'Service added' });
}));

// PUT /api/services/:id  (admin)
router.put('/:id', auth, role('admin'), wrap(async (req, res) => {
  const { name, duration, price } = check(req.body);
  const [r] = await pool.query(
    'UPDATE services SET name = ?, duration_minutes = ?, price = ? WHERE service_id = ?',
    [name, duration, price, req.params.id]
  );
  if (r.affectedRows === 0) throw httpError(404, 'Service not found');
  res.json({ message: 'Service updated' });
}));

// DELETE /api/services/:id  (admin)
router.delete('/:id', auth, role('admin'), wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM services WHERE service_id = ?', [req.params.id]);
  if (r.affectedRows === 0) throw httpError(404, 'Service not found');
  res.json({ message: 'Service deleted' });
}));

module.exports = router;
