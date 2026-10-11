-- Professional schema extensions for Hematrik (MySQL)
-- Adds multi-room readiness, auditability, and richer analytics.
-- Safe to re-run and phpMyAdmin-friendly: wraps ALTER/INDEX changes in a stored procedure
-- that ignores "already exists" errors (duplicate column/index).

-- ==============================
-- 1) Rooms & Cameras (future multi-room/multi-camera)
-- ==============================
CREATE TABLE IF NOT EXISTS rooms (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rooms_name (name)
);

CREATE TABLE IF NOT EXISTS cameras (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id INT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  camera_index INT NULL,
  yolo_service_url VARCHAR(255) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cameras_room_id (room_id)
);

-- Seed defaults (single-room, single-camera) if empty
INSERT INTO rooms (id, name, description)
SELECT 1, 'Ruangan 1', 'Default room'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE id = 1);

INSERT INTO cameras (id, room_id, name, camera_index, yolo_service_url, enabled)
SELECT 1, 1, 'Kamera 1', NULL, NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM cameras WHERE id = 1);

-- ==============================
-- 2) Monitoring table extensions
-- ==============================
-- Note: phpMyAdmin commonly fails on PREPARE/EXECUTE blocks depending on settings.
-- We apply schema changes via a stored procedure and ignore "already exists" errors.

DROP PROCEDURE IF EXISTS hematrik_apply_professional_schema;
DELIMITER //
CREATE PROCEDURE hematrik_apply_professional_schema()
BEGIN
  -- 1050: Table already exists
  DECLARE CONTINUE HANDLER FOR 1050 BEGIN END;
  -- 1060: Duplicate column name
  DECLARE CONTINUE HANDLER FOR 1060 BEGIN END;
  -- 1061: Duplicate key name
  DECLARE CONTINUE HANDLER FOR 1061 BEGIN END;

  -- Add missing device columns
  ALTER TABLE monitoring ADD COLUMN lampu VARCHAR(8) NULL;
  ALTER TABLE monitoring ADD COLUMN ac VARCHAR(8) NULL;
  ALTER TABLE monitoring ADD COLUMN dispenser VARCHAR(8) NULL;

  -- Link to room/camera for future scale
  ALTER TABLE monitoring ADD COLUMN room_id INT UNSIGNED NULL;
  ALTER TABLE monitoring ADD COLUMN camera_id INT UNSIGNED NULL;

  -- Helpful indexes for dashboard queries
  CREATE INDEX idx_monitoring_waktu ON monitoring (waktu);
  CREATE INDEX idx_monitoring_kondisi ON monitoring (kondisi);
  CREATE INDEX idx_monitoring_status_listrik ON monitoring (status_listrik);
END//
DELIMITER ;

CALL hematrik_apply_professional_schema();
DROP PROCEDURE hematrik_apply_professional_schema;

-- ==============================
-- 3) Device events (audit trail)
-- ==============================
CREATE TABLE IF NOT EXISTS device_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(16) NOT NULL, -- 'manual' | 'auto' | 'system'
  device_name VARCHAR(20) NOT NULL, -- lampu|ac|dispenser
  prev_state VARCHAR(8) NULL,
  next_state VARCHAR(8) NULL,
  reason VARCHAR(255) NULL,
  monitoring_id BIGINT UNSIGNED NULL,
  room_id INT UNSIGNED NULL,
  camera_id INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_device_events_time (event_time),
  KEY idx_device_events_device (device_name)
);

-- ==============================
-- 4) Detections per check (debuggable analytics)
-- ==============================
CREATE TABLE IF NOT EXISTS detections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  monitoring_id BIGINT UNSIGNED NOT NULL,
  class_id INT NULL,
  class_name VARCHAR(64) NULL,
  confidence FLOAT NULL,
  x1 INT NOT NULL,
  y1 INT NOT NULL,
  x2 INT NOT NULL,
  y2 INT NOT NULL,
  track_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_detections_monitoring_id (monitoring_id)
);

-- ==============================
-- 5) Notifications (acknowledgeable)
-- ==============================
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  level VARCHAR(12) NOT NULL, -- info|warning|danger
  kondisi VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  monitoring_id BIGINT UNSIGNED NULL,
  acknowledged_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_notifications_created_at (created_at),
  KEY idx_notifications_ack (acknowledged_at)
);
