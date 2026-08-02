-- RUN THIS IN SUPABASE SQL EDITOR to add the customers table
-- If you already created this table, run the ALTER statements below instead

CREATE TABLE IF NOT EXISTS customers (
  phone VARCHAR(15) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  street_address TEXT DEFAULT '',
  city VARCHAR(50) DEFAULT '',
  state VARCHAR(50) DEFAULT '',
  zip_code VARCHAR(10) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

