-- Add IoT device columns to existing `monitoring` table
-- Run these if you want Lampu/AC/Dispenser to be stored per check.

ALTER TABLE monitoring ADD COLUMN lampu VARCHAR(8) NULL;
ALTER TABLE monitoring ADD COLUMN ac VARCHAR(8) NULL;
ALTER TABLE monitoring ADD COLUMN dispenser VARCHAR(8) NULL;

-- Optional indexes for dashboard queries
CREATE INDEX idx_monitoring_waktu ON monitoring (waktu);
CREATE INDEX idx_monitoring_kondisi ON monitoring (kondisi);
CREATE INDEX idx_monitoring_status_listrik ON monitoring (status_listrik);
