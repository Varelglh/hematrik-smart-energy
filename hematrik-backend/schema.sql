-- Hematrik: minimal schema for logs table (MySQL)
-- Columns requested: waktu, jumlah orang, kondisi, status listrik, gambar, notifikasi

CREATE TABLE IF NOT EXISTS logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  waktu TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  jumlah_orang INT NOT NULL DEFAULT 0,
  kondisi VARCHAR(20) NOT NULL,
  status_listrik VARCHAR(8) NOT NULL,
  gambar VARCHAR(255) NOT NULL DEFAULT '',
  notifikasi TEXT,
  lampu VARCHAR(8) NULL,
  ac VARCHAR(8) NULL,
  PRIMARY KEY (id),
  INDEX idx_logs_waktu (waktu),
  INDEX idx_logs_kondisi (kondisi),
  INDEX idx_logs_status_listrik (status_listrik)
);
