-- ═══════════════════════════════════════════════════════════
--  BODHISATVVAM — SUPABASE DATABASE SCHEMA
--  Run this ONCE in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- PRODUCTS TABLE
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📦',
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  rating INTEGER DEFAULT 5,
  badge TEXT DEFAULT '',
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CATEGORIES TABLE
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📦',
  description TEXT DEFAULT '',
  default_product_desc TEXT DEFAULT '',
  id_prefix INTEGER UNIQUE NOT NULL,
  display_order INTEGER DEFAULT 1
);

-- SITE CONTENT TABLE (each section stored as JSONB)
CREATE TABLE site_content (
  section TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDERS TABLE (for order history)
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  address TEXT,
  items JSONB NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'New Order',
  payment_id VARCHAR(100),
  customer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BOOKINGS TABLE
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  booking_id VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(150),
  session_name VARCHAR(100),
  date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  payment_id VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_orders_phone ON orders(phone);
CREATE INDEX idx_bookings_phone ON bookings(phone);
CREATE INDEX idx_bookings_date ON bookings(date);
CREATE INDEX idx_products_category ON products(category);
