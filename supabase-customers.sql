-- RUN THIS IN SUPABASE SQL EDITOR to add the customers table
CREATE TABLE IF NOT EXISTS customers (
  phone VARCHAR(15) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
