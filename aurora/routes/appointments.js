const express = require('express');
const { pool, tx } = require('../db');
const { auth, role } = require('../middleware/auth');
const { wrap, httpError, isFuture } = require('../utils');

const router = express.Router();

// Shared SELECT that returns an appointment with patient, dentist, service and time.
const BASE = `
  SELECT a.appointment_id, a.status, a.created_at,
         a.patient_id, p.name AS patient_name, p.phone AS patient_phone,
         s.schedule_id, s.schedule_date, s.start_time, s.end_time,
         d.dentist_id, du.name AS doctor_name,
         sv.service_id, sv.name AS service_name, sv.price
  FROM appointments a
  JOIN users p      ON p.user_id = a.patient_id
  JOIN schedules s  ON s.schedule_id = a.schedule_id
  JOIN dentists d   ON d.dentist_id = s.dentist_id
  JOIN users du     ON du.user_id = d.user_id
  JOIN services sv  ON sv.service_id = a.service_id`;
const ORDER = 'ORDER BY s.schedule_date DESC, s.start_time DESC';

// POST /api/appointments  (patient or admin) -> book a slot
// body: { schedule_id, service_id, patient_id (admin only) }
router.post('/', auth, role('patient', 'admin'), wrap(async (req, res) => {
  const scheduleId = Number(req.body.schedule_id);
  const serviceId = Number(req.body.service_id);
  if (!scheduleId || !serviceId) throw httpError(400, 'schedule_id and service_id are required');

  const patientId = req.user.role === 'patient' ? req.user.user_id : Number(req.body.patient_id);
  if (!patientId) throw httpError(400, 'patient_id is required');

  const appointmentId = await tx(async (conn) => {
    // lock the slot row so two people cannot book it at the same time
    const [slots] = await conn.query('SELECT * FROM schedules WHERE schedule_id = ? FOR UPDATE', [scheduleId]);
    const slot = slots[0];
    if (!slot) throw httpError(404, 'Slot not found');
    if (slot.status !== 'Open') throw httpError(409, 'This slot is no longer available');
    if (!isFuture(slot.schedule_date, slot.start_time)) throw httpError(400, 'This slot is already in the past');

    const [svc] = await conn.query('SELECT service_id FROM services WHERE service_id = ?', [serviceId]);
    if (!svc[0]) throw httpError(404, 'Service not found');

    const [pat] = await conn.query("SELECT user_id FROM users WHERE user_id = ? AND role = 'patient'", [patientId]);
    if (!pat[0]) throw httpError(404, 'Patient not found');

    const [ins] = await conn.query(
      "INSERT INTO appointments (patient_id, schedule_id, service_id, status) VALUES (?,?,?,'Pending')",
      [patientId, scheduleId, serviceId]
    );
    await conn.query("UPDATE schedules SET status = 'Booked' WHERE schedule_id = ?", [scheduleId]);
    return ins.insertId;
  });

  res.status(201).json({ appointment_id: appointmentId, status: 'Pending', message: 'Appointment booked' });
}));

// GET /api/appointments/me  (patient) -> my appointments
router.get('/me', auth, role('patient'), wrap(async (req, res) => {
  const [rows] = await pool.query(`${BASE} WHERE a.patient_id = ? ${ORDER}`, [req.user.user_id]);
  res.json(rows);
}));

// GET /api/appointments  (admin: all, dentist: only their own)
router.get('/', auth, role('admin', 'dentist'), wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (req.user.role === 'dentist') {
    where.push('s.dentist_id = ?');
    params.push(req.user.dentist_id);
  }
  if (req.query.status) {
    where.push('a.status = ?');
    params.push(req.query.status);
  }
  const [rows] = await pool.query(
    `${BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ${ORDER}`,
    params
  );
  res.json(rows);
}));

// PATCH /api/appointments/:id/cancel  (patient: own only, admin: any)
// Cancelling frees the slot again.
router.patch('/:id/cancel', auth, role('patient', 'admin'), wrap(async (req, res) => {
  await tx(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM appointments WHERE appointment_id = ? FOR UPDATE', [req.params.id]);
    const appt = rows[0];
    if (!appt) throw httpError(404, 'Appointment not found');
    if (req.user.role === 'patient' && appt.patient_id !== req.user.user_id) {
      throw httpError(403, 'This is not your appointment');
    }
    if (!['Pending', 'Confirmed'].includes(appt.status)) {
      throw httpError(409, `A ${appt.status} appointment cannot be cancelled`);
    }
    await conn.query("UPDATE appointments SET status = 'Cancelled' WHERE appointment_id = ?", [appt.appointment_id]);
    await conn.query("UPDATE schedules SET status = 'Open' WHERE schedule_id = ?", [appt.schedule_id]);
  });
  res.json({ message: 'Appointment cancelled' });
}));

// PATCH /api/appointments/:id/status  (dentist: own only, admin: any)
// body: { status: "Confirmed" | "Done" }
router.patch('/:id/status', auth, role('dentist', 'admin'), wrap(async (req, res) => {
  const { status } = req.body;
  if (!['Confirmed', 'Done'].includes(status)) throw httpError(400, 'Status must be Confirmed or Done');

  const allowed = { Pending: ['Confirmed', 'Done'], Confirmed: ['Done'] };

  const [rows] = await pool.query(
    `SELECT a.status, s.dentist_id FROM appointments a
     JOIN schedules s ON s.schedule_id = a.schedule_id WHERE a.appointment_id = ?`,
    [req.params.id]
  );
  const appt = rows[0];
  if (!appt) throw httpError(404, 'Appointment not found');
  if (req.user.role === 'dentist' && appt.dentist_id !== req.user.dentist_id) {
    throw httpError(403, 'This is not your appointment');
  }
  if (!(allowed[appt.status] || []).includes(status)) {
    throw httpError(409, `Cannot change a ${appt.status} appointment to ${status}`);
  }
  await pool.query('UPDATE appointments SET status = ? WHERE appointment_id = ?', [status, req.params.id]);
  res.json({ message: `Appointment marked ${status}` });
}));

module.exports = router;
