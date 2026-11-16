const express = require('express');
const { pool } = require('../db');
const { auth, role } = require('../middleware/auth');
const { wrap, httpError, isDate, normTime, toMinutes, toTime, isFuture } = require('../utils');

const router = express.Router();

// GET /api/schedules/me  (dentist) -> my upcoming slots, with the patient if booked
router.get('/me', auth, role('dentist'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.schedule_id, s.schedule_date, s.start_time, s.end_time, s.status,
            a.appointment_id, a.status AS appointment_status, p.name AS patient_name
     FROM schedules s
     LEFT JOIN appointments a ON a.schedule_id = s.schedule_id AND a.status IN ('Pending','Confirmed','Done')
     LEFT JOIN users p ON p.user_id = a.patient_id
     WHERE s.dentist_id = ? AND s.schedule_date >= CURDATE()
     ORDER BY s.schedule_date, s.start_time`,
    [req.user.dentist_id]
  );
  res.json(rows);
}));

// POST /api/schedules  (dentist or admin) -> add one slot, or many slots at once
// body: { schedule_date, start_time, end_time, slot_minutes?, dentist_id? (admin only) }
// If slot_minutes is given, the time range is cut into slots of that length.
router.post('/', auth, role('dentist', 'admin'), wrap(async (req, res) => {
  const dentistId = req.user.role === 'dentist' ? req.user.dentist_id : Number(req.body.dentist_id);
  if (!dentistId) throw httpError(400, 'dentist_id is required');

  const [d] = await pool.query('SELECT dentist_id FROM dentists WHERE dentist_id = ?', [dentistId]);
  if (!d[0]) throw httpError(404, 'Dentist not found');

  const { schedule_date: date } = req.body;
  const start = normTime(req.body.start_time);
  const end = normTime(req.body.end_time);
  if (!isDate(date)) throw httpError(400, 'Date must look like 2026-11-20');
  if (!start || !end) throw httpError(400, 'Start and end time must look like 09:00');
  if (toMinutes(end) <= toMinutes(start)) throw httpError(400, 'End time must be later than start time');
  if (!isFuture(date, start)) throw httpError(400, 'You can only add slots in the future');

  // cut the range into slots
  const slotMinutes = req.body.slot_minutes ? Number(req.body.slot_minutes) : null;
  const slots = [];
  if (slotMinutes) {
    if (!Number.isInteger(slotMinutes) || slotMinutes < 10) throw httpError(400, 'Slot length must be at least 10 minutes');
    const total = toMinutes(end) - toMinutes(start);
    if (total % slotMinutes !== 0) {
      throw httpError(400, `The time range (${total} min) must divide evenly into ${slotMinutes}-minute slots`);
    }
    for (let m = toMinutes(start); m < toMinutes(end); m += slotMinutes) {
      slots.push([dentistId, date, toTime(m), toTime(m + slotMinutes)]);
    }
  } else {
    slots.push([dentistId, date, start, end]);
  }
  if (slots.length > 48) throw httpError(400, 'Too many slots at once (maximum 48)');

  // a dentist cannot have overlapping slots
  const [overlap] = await pool.query(
    `SELECT schedule_id FROM schedules
     WHERE dentist_id = ? AND schedule_date = ? AND start_time < ? AND end_time > ? LIMIT 1`,
    [dentistId, date, end, start]
  );
  if (overlap[0]) throw httpError(409, 'These times overlap with a slot you already have on that date');

  await pool.query(
    'INSERT INTO schedules (dentist_id, schedule_date, start_time, end_time) VALUES ?',
    [slots]
  );
  res.status(201).json({ created: slots.length, message: `${slots.length} slot(s) added` });
}));

// DELETE /api/schedules/:id  (dentist or admin) -> only if the slot is still Open
router.delete('/:id', auth, role('dentist', 'admin'), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM schedules WHERE schedule_id = ?', [req.params.id]);
  const slot = rows[0];
  if (!slot) throw httpError(404, 'Slot not found');
  if (req.user.role === 'dentist' && slot.dentist_id !== req.user.dentist_id) {
    throw httpError(403, 'This is not your slot');
  }
  if (slot.status !== 'Open') {
    throw httpError(409, 'This slot is booked. Cancel the appointment first.');
  }
  await pool.query('DELETE FROM schedules WHERE schedule_id = ?', [req.params.id]);
  res.json({ message: 'Slot removed' });
}));

module.exports = router;
