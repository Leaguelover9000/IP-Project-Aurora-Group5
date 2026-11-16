// Creates the database, the tables, and some sample data.
//   npm run setup   -> create everything (skips sample data if users already exist)
//   npm run reset   -> DELETE the database and start fresh
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('../config');

const dbName = config.db.database;

function ymd(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

async function main() {
  const { database, ...serverConfig } = config.db;
  const conn = await mysql.createConnection({ ...serverConfig, multipleStatements: true });

  if (process.argv.includes('--reset')) {
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    console.log(`Dropped database "${dbName}"`);
  }

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await conn.query(`USE \`${dbName}\``);

  // run schema.sql (skip its CREATE DATABASE / USE lines, we already did that)
  const schema = fs
    .readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(CREATE DATABASE|USE)\b/i.test(line))
    .join('\n');
  await conn.query(schema);
  console.log('Tables are ready.');

  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM users');
  if (n > 0) {
    console.log('Database already has data, so sample data was skipped.');
    console.log('(Use "npm run reset" if you want to start over.)');
    await conn.end();
    return;
  }

  // ---- sample users ----
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const addUser = async (name, email, pw, phone, role) => {
    const [r] = await conn.query(
      'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?,?,?,?,?)',
      [name, email, hash(pw), phone, role]
    );
    return r.insertId;
  };

  await addUser('Clinic Admin', 'admin@clinic.com', 'admin123', '0917-000-0001', 'admin');
  await addUser('Pedro Dela Cruz', 'patient@example.com', 'patient123', '0917-000-0002', 'patient');
  await addUser('Lea Mercado', 'lea@example.com', 'patient123', '0917-000-0003', 'patient');

  const dentistsData = [
    ['Dr. Maria Santos', 'santos@clinic.com', 'General Dentistry'],
    ['Dr. Juan Reyes', 'reyes@clinic.com', 'Orthodontics'],
    ['Dr. Ana Cruz', 'cruz@clinic.com', 'Pediatric Dentistry'],
  ];
  const dentistIds = [];
  for (const [name, email, spec] of dentistsData) {
    const userId = await addUser(name, email, 'dentist123', '0917-000-1000', 'dentist');
    const [r] = await conn.query(
      'INSERT INTO dentists (user_id, specialization) VALUES (?,?)',
      [userId, spec]
    );
    dentistIds.push(r.insertId);
  }

  // ---- sample services ----
  await conn.query(
    'INSERT INTO services (name, duration_minutes, price) VALUES ?',
    [[
      ['Consultation', 30, 500],
      ['Teeth Cleaning', 30, 800],
      ['Tooth Extraction', 30, 1000],
      ['Dental Filling', 30, 1200],
      ['Braces Adjustment', 30, 1500],
    ]]
  );

  // ---- sample schedule: next 14 days, weekdays, 9-12 and 1-4 (30-minute slots) ----
  const rows = [];
  for (let day = 1; day <= 14; day++) {
    const d = new Date();
    d.setDate(d.getDate() + day);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip Sat/Sun
    const date = ymd(d);
    for (const dentistId of dentistIds) {
      for (const [from, to] of [[9, 12], [13, 16]]) {
        for (let m = from * 60; m < to * 60; m += 30) {
          const t = (x) =>
            `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}:00`;
          rows.push([dentistId, date, t(m), t(m + 30)]);
        }
      }
    }
  }
  await conn.query(
    'INSERT INTO schedules (dentist_id, schedule_date, start_time, end_time) VALUES ?',
    [rows]
  );

  console.log(`Sample data added (${rows.length} open time slots).`);
  console.log('\nDemo logins:');
  console.log('  Admin   admin@clinic.com     / admin123');
  console.log('  Dentist santos@clinic.com    / dentist123  (also reyes@, cruz@)');
  console.log('  Patient patient@example.com  / patient123');
  await conn.end();
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message);
  console.error('Is MySQL running (XAMPP control panel -> Start MySQL)? Check the DB settings in config.js / .env.');
  process.exit(1);
});
