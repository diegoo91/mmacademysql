-- MM Padel Academy — corrected MySQL 8 schema (database: mmacademy)
-- Source of truth for fresh installs: `mysql -h localhost -P 5175 -u USER -p < server/ddl.sql`
-- Decisions: users PK = user_id (API aliases to id); no players TABLE (VIEW below);
-- notifications.is_read; audit_logs.rec_before; slots.player_text only;
-- results/comments/conversion_requests have FULL columns; money DECIMAL(10,2);
-- dates DATE; timestamps DATETIME(3); snapshots JSON; every table keeps
-- created_by/updated_by (nullable). Users self-FKs omitted (bootstrap safe).
-- Import with FOREIGN_KEY_CHECKS=0, then validate (orphans are logged + nulled
-- by scripts/migrate-json-to-mysql.js, never fail the load).

CREATE DATABASE IF NOT EXISTS `mmacademy` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `mmacademy`;

SET NAMES utf8mb4;

DROP VIEW IF EXISTS `players`;
DROP TABLE IF EXISTS `players`;

CREATE TABLE `users` (
  `user_id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL DEFAULT (UUID()),
  `user_code` VARCHAR(6) NULL UNIQUE,
  `name` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL UNIQUE,
  `phone` VARCHAR(32) NULL,
  `dob` DATE NULL,
  `password_hash` VARCHAR(255) NULL,
  `role` VARCHAR(32) NULL,
  `skill_level` VARCHAR(32) NULL,
  `member_since` VARCHAR(8) NULL,
  `force_password_change` TINYINT(1) NULL DEFAULT 1,
  `member_code` VARCHAR(16) NULL UNIQUE,
  `is_claimed` TINYINT(1) NULL,
  `private_balance` INT NULL DEFAULT 0,
  `group_balance` INT NULL DEFAULT 0,
  `balance_zero_since` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `position` VARCHAR(64) NULL,
  `permissions` JSON NULL,
  `avatar` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  KEY `ix_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `import_batches` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `kind` VARCHAR(32) NULL,
  `filename` VARCHAR(255) NULL,
  `row_count` INT NULL,
  `error_count` INT NULL,
  `by_user` INT NULL,
  `status` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  CONSTRAINT `fk_import_batches_by_user` FOREIGN KEY (`by_user`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_import_batches_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_import_batches_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bookings` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `ref` VARCHAR(64) NULL UNIQUE,
  `user_id` INT NULL,
  `session_type` VARCHAR(16) NULL,
  `mode` VARCHAR(16) NULL,
  `sessions_json` JSON NULL,
  `sessions` TEXT NULL,
  `total` DECIMAL(10,2) NULL,
  `status` VARCHAR(32) NULL,
  `player_name` VARCHAR(191) NULL,
  `private_remaining` INT NULL,
  `group_remaining` INT NULL,
  `deducted_from` VARCHAR(64) NULL,
  `deducted_count` INT NULL,
  `paid` TINYINT(1) NULL,
  `amount_paid` DECIMAL(10,2) NULL,
  `payment_method` VARCHAR(32) NULL,
  `payment_date` DATE NULL,
  `import_batch` INT NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  KEY `ix_bookings_user` (`user_id`),
  KEY `ix_bookings_status` (`status`),
  CONSTRAINT `fk_bookings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bookings_import` FOREIGN KEY (`import_batch`) REFERENCES `import_batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bookings_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bookings_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `slots` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `date` DATE NULL,
  `time` VARCHAR(16) NULL,
  `court` INT NULL,
  `player_text` TEXT NULL,
  `booking_id` INT NULL,
  `user_id` INT NULL,
  `coach_id` INT NULL,
  `session_type` VARCHAR(16) NULL,
  `status` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  UNIQUE KEY `uq_slots_slot` (`date`, `time`, `court`),
  KEY `ix_slots_date` (`date`),
  KEY `ix_slots_booking` (`booking_id`),
  KEY `ix_slots_user` (`user_id`),
  CONSTRAINT `fk_slots_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_slots_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_slots_coach` FOREIGN KEY (`coach_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_slots_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_slots_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payments` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `ref` VARCHAR(32) NULL UNIQUE,
  `date` DATE NULL,
  `player_name` VARCHAR(191) NULL,
  `player_id` INT NULL,
  `method` VARCHAR(32) NULL,
  `amount` DECIMAL(10,2) NULL,
  `private_sessions` INT NULL DEFAULT 0,
  `group_sessions` INT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `status` VARCHAR(32) NULL,
  `booking_id` INT NULL,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `updated_by` INT NULL,
  KEY `ix_payments_player` (`player_id`),
  KEY `ix_payments_booking` (`booking_id`),
  KEY `ix_payments_status` (`status`),
  CONSTRAINT `fk_payments_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `booking_requests` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `kind` VARCHAR(32) NULL,
  `slot_id` INT NULL,
  `booking_id` INT NULL,
  `player_id` INT NULL,
  `player_name` VARCHAR(191) NULL,
  `payload` JSON NULL,
  `status` VARCHAR(32) NULL,
  `decided_by` INT NULL,
  `decided_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  KEY `ix_breq_status` (`status`),
  KEY `ix_breq_player` (`player_id`),
  CONSTRAINT `fk_breq_slot` FOREIGN KEY (`slot_id`) REFERENCES `slots` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_breq_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_breq_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_breq_decided` FOREIGN KEY (`decided_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_breq_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_breq_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `comments` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `user_name` VARCHAR(191) NULL,
  `text` TEXT NULL,
  `rating` TINYINT NULL,
  `status` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  KEY `ix_comments_status` (`status`),
  CONSTRAINT `fk_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_comments_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_comments_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `kind` VARCHAR(64) NULL,
  `title` VARCHAR(255) NULL,
  `body` TEXT NULL,
  `link` VARCHAR(255) NULL,
  `is_read` TINYINT(1) NULL DEFAULT 0,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  KEY `ix_notifications_user` (`user_id`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notifications_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notifications_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `conversion_requests` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `user_name` VARCHAR(191) NULL,
  `from` VARCHAR(32) NULL,
  `to` VARCHAR(32) NULL,
  `count` INT NULL,
  `status` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  KEY `ix_conversion_status` (`status`),
  CONSTRAINT `fk_conversion_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_conversion_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_conversion_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `expenses` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `date` DATE NULL,
  `category` VARCHAR(64) NULL,
  `description` TEXT NULL,
  `amount` DECIMAL(10,2) NULL,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `updated_by` INT NULL,
  KEY `ix_expenses_date` (`date`),
  CONSTRAINT `fk_expenses_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_expenses_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `results` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `date` DATE NULL,
  `format` VARCHAR(32) NULL,
  `sideA` JSON NULL,
  `sideB` JSON NULL,
  `side_a` TEXT NULL,
  `side_b` TEXT NULL,
  `player_a` VARCHAR(191) NULL,
  `player_b` VARCHAR(191) NULL,
  `score_a` INT NULL,
  `score_b` INT NULL,
  `score_text` VARCHAR(32) NULL,
  `winner_side` VARCHAR(4) NULL,
  `winner` VARCHAR(191) NULL,
  `status` VARCHAR(32) NULL,
  `submitted_by` INT NULL,
  `court` INT NULL,
  `court_time` VARCHAR(128) NULL,
  `competition` VARCHAR(128) NULL,
  `notes` TEXT NULL,
  `import_batch` INT NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  KEY `ix_results_date` (`date`),
  KEY `ix_results_status` (`status`),
  CONSTRAINT `fk_results_submitted` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_results_import` FOREIGN KEY (`import_batch`) REFERENCES `import_batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_results_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_results_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `timestamp` DATETIME(3) NULL,
  `actor_id` INT NULL,
  `actor_name` VARCHAR(191) NULL,
  `actor_role` VARCHAR(64) NULL,
  `ip` VARCHAR(64) NULL,
  `action` VARCHAR(128) NULL,
  `target_type` VARCHAR(64) NULL,
  `target_id` VARCHAR(128) NULL,
  `rec_before` LONGTEXT NULL,
  `after` LONGTEXT NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  KEY `ix_audit_action` (`action`),
  KEY `ix_audit_actor` (`actor_id`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audit_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audit_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `court_defaults` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `court` INT NULL UNIQUE,
  `coach_id` INT NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  CONSTRAINT `fk_court_coach` FOREIGN KEY (`coach_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_court_cby` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_court_uby` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Players are users with role='player'. History lives in slots (player_text),
-- not here — this view exists so SQL keeps the familiar name.
CREATE OR REPLACE VIEW `players` AS
SELECT `user_id` AS `id`, `user_id`, `uuid`, `user_code`, `name`,
       `name` AS `full_name`, `email`, `phone`, `dob`, `skill_level`,
       `position`, `notes`, `private_balance`, `group_balance`,
       `balance_zero_since`, `member_code`, `member_since`,
       `is_claimed`, `created_at`, `updated_at`
FROM `users` WHERE `role` = 'player';
