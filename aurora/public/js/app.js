// Shared helpers used by every page.

const API = '/api';

// ---------- login info (saved in the browser) ----------
function getAuth() {
  try { return JSON.parse(localStorage.getItem('dental_auth')); } catch (e) { return null; }
}
function setAuth(auth) {
  localStorage.setItem('dental_auth', JSON.stringify(auth));
}
function logout() {
  try { localStorage.removeItem('dental_auth'); } catch (e) {}
  location.href = 'index.html';
}

// ---------- talking to the API ----------
// api('GET', '/dentists')   api('POST', '/appointments', { ... })
async function api(method, url, body) {
  const auth = getAuth();
  const res = await fetch(API + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: 'Bearer ' + auth.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}

  if (res.status === 401 && auth && !url.startsWith('/auth/login')) {
    logout(); // token expired
    throw new Error('Your session expired. Please log in again.');
  }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}

// ---------- menu for each role ----------
const HOME = {
  patient: 'book.html',
  dentist: 'dentist-schedule.html',
  admin: 'admin-appointments.html',
};
const MENUS = {
  patient: [
    ['book.html', 'Book Appointment'],
    ['my-appointments.html', 'My Appointments'],
    ['dentists.html', 'Dentists & Services'],
  ],
  dentist: [
    ['dentist-schedule.html', 'My Schedule'],
    ['dentist-appointments.html', 'My Appointments'],
  ],
  admin: [
    ['admin-appointments.html', 'Appointments'],
    ['book.html', 'Book for Patient'],
    ['admin-patients.html', 'Patients'],
    ['admin-dentists.html', 'Dentists'],
    ['admin-services.html', 'Services'],
  ],
};

// Call this at the top of every page. Returns the logged-in user,
// or sends the visitor back to the login page.
function initPage(allowedRoles) {
  const auth = getAuth();
  if (!auth || !auth.user || !allowedRoles.includes(auth.user.role)) {
    location.href = 'index.html';
    return null;
  }
  const user = auth.user;
  const current = location.pathname.split('/').pop() || 'index.html';
  const links = MENUS[user.role]
    .map(([href, label]) =>
      `<a href="${href}" class="${href === current ? 'active' : ''}">${label}</a>`)
    .join('');

  document.getElementById('nav').innerHTML = `
    <header class="nav"><div class="nav-inner">
      <a class="brand" href="${HOME[user.role]}"><span class="brand-mark">A</span>Aurora</a>
      <nav class="nav-links">${links}</nav>
      <div class="who"><span><strong>${esc(user.name)}</strong> (${user.role})</span>
        <button class="btn btn-sm" onclick="logout()">Log out</button></div>
    </div></header>`;
  return user;
}

// ---------- small helpers ----------
// Escape text before putting it inside HTML (stops names like <b> from breaking the page).
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "2026-11-20" -> "Fri, Nov 20, 2026"
function fmtDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

// "14:00:00" -> "2:00 PM"
function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const fmtRange = (start, end) => `${fmtTime(start)} - ${fmtTime(end)}`;
const peso = (n) => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 });
const badge = (status) => `<span class="badge ${esc(status)}">${esc(status)}</span>`;

// today (or today + n days) as "YYYY-MM-DD" in the user's local time
function dateStr(plusDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Show a green or red message at the top of the page.
let msgTimer;
function showMsg(text, type = 'ok') {
  const box = document.getElementById('msg');
  if (!box) return;
  box.innerHTML = `<div class="msg ${type}">${esc(text)}</div>`;
  clearTimeout(msgTimer);
  if (type === 'ok') msgTimer = setTimeout(() => (box.innerHTML = ''), 5000);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const showError = (err) => showMsg(err.message || String(err), 'err');
