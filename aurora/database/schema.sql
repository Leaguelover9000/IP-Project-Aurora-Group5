-- Dental Clinic Appointment System - database structure
-- You can import this file in phpMyAdmin, or just run:  npm run setup

CREATE DATABASE IF NOT EXISTS dental_clinic;
USE dental_clinic;

CREATE TABLE IF NOT EXISTS users (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(20),
  role          ENUM('patient','dentist','admin') NOT NULL DEFAULT 'patient'
);

CREATE TABLE IF NOT EXISTS dentists (
  dentist_id     INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL UNIQUE,
  specialization VARCHAR(100) NOT NULL DEFAULT 'General Dentistry',
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS services (
  service_id       INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(100) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  price            DECIMAL(8,2) NOT NULL DEFAULT 0
);

-- The dentist's available time slots
CREATE TABLE IF NOT EXISTS schedules (
  schedule_id   INT AUTO_INCREMENT PRIMARY KEY,
  dentist_id    INT NOT NULL,
  schedule_date DATE NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  status        ENUM('Open','Booked') NOT NULL DEFAULT 'Open',
  INDEX idx_dentist_date (dentist_id, schedule_date),
  FOREIGN KEY (dentist_id) REFERENCES dentists(dentist_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  appointment_id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id     INT NOT NULL,
  schedule_id    INT NOT NULL,
  service_id     INT NOT NULL,
  status         ENUM('Pending','Confirmed','Cancelled','Done') NOT NULL DEFAULT 'Pending',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id)  REFERENCES users(user_id)         ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id)  REFERENCES services(service_id)
);
