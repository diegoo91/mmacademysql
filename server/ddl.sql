
drop DATABASE IF EXISTS mmacademy ;
CREATE DATABASE if not EXISTS mmacademy;
use mmacademy;

-- DDL File

CREATE TABLE `users` (
    `user_id` INT AUTO_INCREMENT PRIMARY KEY,
    `uuid` VARCHAR(36) DEFAULT (UUID()),
    `user_code` VARCHAR(50),
    `name` VARCHAR(255),
    `email` VARCHAR(255),
    `phone` VARCHAR(50),
    `dob` VARCHAR(50),
    `password_hash` VARCHAR(255),
    `role` VARCHAR(50),
    `skill_level` VARCHAR(50),
    `member_since` VARCHAR(10),
    `force_password_change` TINYINT(1) DEFAULT 0,
    `member_code` VARCHAR(50),
    `is_claimed` TINYINT(1) DEFAULT 0,
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `players` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `full_name` VARCHAR(255),
    `email` VARCHAR(255),
    `phone` VARCHAR(50),
    `dob` VARCHAR(50),
    `skill_level` VARCHAR(50),
    `notes` TEXT,
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `results` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `date` DATE,
    `format` VARCHAR(50),
    `side_a` JSON,
    `side_b` JSON,
    `player_a` VARCHAR(255),
    `player_b` VARCHAR(255),
    `score_a` INT,
    `score_b` INT,
    `score_side_a` VARCHAR(50),
    `score_side_b` VARCHAR(50),
    `winner_side` VARCHAR(10),
    `winner` VARCHAR(255),
    `status` VARCHAR(50),
    `submitted_by` INT,
    `court` INT,
    `competition` VARCHAR(100),
    `notes` TEXT,
    `import_batch` INT,
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `slots` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `date` DATE,
    `time` VARCHAR(10),
    `court` INT,
    `player_name_1` VARCHAR(255),
    `player_name_2` VARCHAR(255),
    `player_text` VARCHAR(255),
    `booking_id` INT,
    `session_type` VARCHAR(50),
    `status` VARCHAR(50),
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `bookings` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ref` VARCHAR(50),
    `user_id` INT,
    `session_type` VARCHAR(50),
    `mode` VARCHAR(50),
    `sessions_json` JSON,
    `total` DECIMAL(10,2),
    `status` VARCHAR(50),
    `player_name` VARCHAR(255),
    `private_remaining` INT,
    `group_remaining` INT,
    `deducted_from` INT,
    `deducted_count` INT,
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `import_batches` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `kind` VARCHAR(50),
    `filename` VARCHAR(255),
    `row_count` INT,
    `error_count` INT,
    `by_user` INT,
    `status` VARCHAR(50),
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `comments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT,
    `user_name` VARCHAR(255),
    `text` TEXT,
    `rating` INT,
    `status` VARCHAR(50),
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `notifications` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT,
    `kind` VARCHAR(50),
    `title` VARCHAR(255),
    `body` TEXT,
    `link` VARCHAR(255),
    `is_read` TINYINT(1) DEFAULT 0,
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `conversion_requests` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT,
    `user_name` VARCHAR(255),
    `from_type` VARCHAR(50),
    `to_type` VARCHAR(50),
    `count` INT,
    `status` VARCHAR(50),
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `expenses` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `date` DATE,
    `category` VARCHAR(100),
    `description` TEXT,
    `amount` DECIMAL(10,2),
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `booking_requests` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `kind` VARCHAR(50),
    `slot_id` INT,
    `booking_id` INT,
    `player_id` INT,
    `player_name` VARCHAR(255),
    `payload` JSON,
    `status` VARCHAR(50),
    `decided_by` INT,
    `decided_at` DATETIME,
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `payments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ref` VARCHAR(50),
    `date` DATE,
    `player_name` VARCHAR(255),
    `player_id` INT,
    `method` VARCHAR(50),
    `amount` DECIMAL(10,2),
    `private_sessions` INT,
    `group_sessions` INT,
    `notes` TEXT,
    `status` VARCHAR(50),
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `audit_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `timestamp` DATETIME,
    `actor_id` INT,
    `actor_name` VARCHAR(255),
    `actor_role` VARCHAR(50),
    `ip` VARCHAR(50),
    `action` VARCHAR(255),
    `target_type` VARCHAR(100),
    `target_id` VARCHAR(100),
    `rec_before` JSON,
    `rec_after` JSON,
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `court_defaults` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `court` INT,
    `coach_id` INT,
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_by` INT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);