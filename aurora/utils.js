// Small helper functions used by the route files.

// Lets us use async/await in routes without try/catch everywhere.
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Create an error that carries an HTTP status code.
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');

// "2026-11-20" -> true (and the date must really exist)
function isDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

// "9:00", "09:00" or "09:00:00" -> "09:00:00" (or null if invalid)
function normTime(s) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s || '');
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}:00`;
}

const toMinutes = (t) => {
  const [h, m] = t.split(':');
  return +h * 60 + +m;
};

const toTime = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

// Is this date + time still in the future?
const isFuture = (date, time) => new Date(`${date}T${time}`) > new Date();

module.exports = { wrap, httpError, isEmail, isDate, normTime, toMinutes, toTime, isFuture };
