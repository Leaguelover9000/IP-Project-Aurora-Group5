# Aurora - Dental Clinic Appointment System

A simple dental clinic system with online scheduling. Patients see each dentist's
available schedule and book appointments. Dentists manage their own time slots.
The admin manages dentists, services and all appointments.

- **Backend:** Node.js + Express REST API (JSON)
- **Database:** MySQL (XAMPP)
- **Frontend:** plain HTML, CSS and JavaScript (no framework), served by the same Express server

## How to run it

You need **Node.js** (LTS version) and **XAMPP**.

1. Open the XAMPP Control Panel and click **Start** next to **MySQL**.
2. Open a terminal in this folder (`aurora`).
3. Install the packages:
   ```
   npm install
   ```
4. Create the database, the tables and the sample data:
   ```
   npm run setup
   ```
5. Start the server:
   ```
   npm start
   ```
6. Open **http://localhost:3000** in your browser.

## Demo accounts

| Role    | Email                | Password   |
|---------|----------------------|------------|
| Patient | patient@example.com  | patient123 |
| Dentist | santos@clinic.com    | dentist123 |
| Admin   | admin@clinic.com     | admin123   |

Other dentists: `reyes@clinic.com`, `cruz@clinic.com` (password `dentist123`).
The login page has buttons that fill these in for you.
The sample data includes open time slots for the next 14 days (weekdays only).
Slots are generated when you run `npm run setup`, so run `npm run reset` again later if they run out.

## What each role can do

| Role | Pages |
|------|-------|
| **Patient** | Register and log in. View dentists and services. Pick a dentist and date, see the open slots, and book. View and cancel own appointments. |
| **Dentist** | Add available time slots (one at a time, or a range cut into 30/45/60-minute slots). Remove open slots. See own appointments, confirm them and mark them done. |
| **Admin** | See all appointments (confirm, done, cancel). Book for a patient. Add patients (walk-ins). Add, edit and delete dentists and services. |

## Scheduling logic (the integration)

1. The patient picks a dentist and date. The API returns only slots that are **Open** and in the future (`GET /api/dentists/:id/schedule?date=`).
2. The patient picks a slot and service, and the app sends `POST /api/appointments`.
3. In one database transaction, the server locks the slot row, checks it is still Open, creates the appointment (status **Pending**) and sets the slot to **Booked**. If two people click at the same moment, only one booking succeeds and the other gets a `409` error.
4. Cancelling an appointment sets it to **Cancelled** and the slot goes back to **Open**.

## API summary

Base URL: `http://localhost:3000/api`. Protected routes need the header `Authorization: Bearer <token>` (the token comes from the login response).

| Method | Endpoint | Who | What it does |
|---|---|---|---|
| POST | /auth/register | Public | Create a patient account |
| POST | /auth/login | Public | Log in, returns token and user |
| GET | /auth/me | Any logged in | Current user info |
| GET | /dentists | Any logged in | List dentists |
| POST / PUT / DELETE | /dentists, /dentists/:id | Admin | Add, edit, delete a dentist |
| GET | /dentists/:id/schedule?date= | Any logged in | Open slots for a dentist (date is optional) |
| GET | /services | Any logged in | List services |
| POST / PUT / DELETE | /services, /services/:id | Admin | Add, edit, delete a service |
| GET | /schedules/me | Dentist | My upcoming slots |
| POST | /schedules | Dentist, Admin | Add slot(s). Body: `schedule_date`, `start_time`, `end_time`, optional `slot_minutes` (admin also sends `dentist_id`) |
| DELETE | /schedules/:id | Dentist (own), Admin | Remove a slot (only if Open) |
| POST | /appointments | Patient, Admin | Book a slot. Body: `schedule_id`, `service_id` (admin also sends `patient_id`) |
| GET | /appointments/me | Patient | My appointments |
| GET | /appointments?status= | Admin, Dentist | All appointments (a dentist only sees their own) |
| PATCH | /appointments/:id/cancel | Patient (own), Admin | Cancel and free the slot |
| PATCH | /appointments/:id/status | Dentist (own), Admin | Body: `status` = `Confirmed` or `Done` |
| GET / POST | /patients | Admin | List or add patients |

Status codes: `200/201` success, `400` bad input, `401` not logged in, `403` role not allowed, `404` not found, `409` conflict (slot already booked, overlap, duplicate email).

You can test the API in Postman: first `POST /api/auth/login`, copy the `token`, then add it as a Bearer token on the other requests.

## Project structure

```
aurora/
  server.js              starts Express, connects routes, serves /public
  config.js              port, database and token settings
  db.js                  MySQL connection and transaction helper
  utils.js               small validation helpers
  middleware/auth.js     checks the login token and the user's role
  routes/                auth, dentists, services, schedules, appointments, patients
  database/
    schema.sql           CREATE TABLE statements (5 tables)
    setup.js             creates the database + sample data (npm run setup / reset)
  public/                the frontend
    index.html           login and register
    book.html            booking page (patient, and admin booking for a patient)
    my-appointments.html, dentists.html                         (patient)
    dentist-schedule.html, dentist-appointments.html            (dentist)
    admin-appointments.html, admin-patients.html,
    admin-dentists.html, admin-services.html                    (admin)
    css/style.css, js/app.js   shared styles and helper functions
```

Database tables: `users`, `dentists`, `services`, `schedules`, `appointments`.

## Troubleshooting

- **"connect ECONNREFUSED" or "Could not use the database":** MySQL is not running. Start it in the XAMPP Control Panel, then run `npm run setup` again.
- **"Access denied for user root":** your MySQL root user has a password. Copy `.env.example` to `.env` and put the password in `DB_PASSWORD=`.
- **Port 3000 already in use:** set `PORT=3001` in `.env` and open http://localhost:3001.
- **Want to start over with fresh sample data:** `npm run reset` (this deletes the whole database).
- **Using phpMyAdmin instead of `npm run setup`:** you can import `database/schema.sql`, but the demo users and slots are only created by `npm run setup` (passwords have to be hashed).

## Security notes (for your report)

- Passwords are hashed with bcrypt and never stored as plain text.
- Login uses a JSON Web Token (JWT). Every protected route checks the token first, then the role.
- All SQL uses parameters (`?`), which prevents SQL injection.
- Text shown on pages is escaped, which prevents script injection.
- Before real use, set your own `JWT_SECRET` in `.env`.
