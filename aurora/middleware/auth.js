const jwt = require('jsonwebtoken');
const config = require('../config');

// Step 1: check the login token. Adds req.user = { user_id, name, role, dentist_id }
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in first' });

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Your session expired. Please log in again.' });
  }
}

// Step 2: check the user's role. Example: role('admin', 'dentist')
function role(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'You are not allowed to do this' });
    }
    next();
  };
}

module.exports = { auth, role };
