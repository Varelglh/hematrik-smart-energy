-- Persisted IoT device state (single-row table)
-- This removes "dummy" in-memory state and makes /devices consistent across restarts.

CREATE TABLE IF NOT EXISTS device_state (
  id TINYINT NOT NULL PRIMARY KEY,
  lampu VARCHAR(8) NULL,
  ac VARCHAR(8) NULL,
  dispenser VARCHAR(8) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Ensure row exists
INSERT INTO device_state (id, lampu, ac, dispenser)
VALUES (1, 'ON', 'ON', 'OFF')
ON DUPLICATE KEY UPDATE id = id;
