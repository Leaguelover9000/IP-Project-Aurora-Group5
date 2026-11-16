// Settings for the app. The defaults match a fresh XAMPP install
// (MySQL user "root" with no password). To change them, copy
// .env.example to .env and edit the values there.
require('dotenv').config({ quiet: true });

module.exports = {
  port: process.env.PORT || 3000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dental_clinic',
  },
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret-for-the-class-project',
  jwtExpiresIn: '8h',
};
