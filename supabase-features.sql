-- ═══════════════════════════════════════════════════════════
--  BODHISATVVAM — NEW FEATURES DATABASE SCHEMA
--  Run this ONCE in the Supabase SQL Editor
--  (Does NOT modify any existing tables)
-- ═══════════════════════════════════════════════════════════

-- 1. REVIEWS TABLE (Verified Customer Reviews)
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  order_id VARCHAR(30),
  customer_name VARCHAR(50) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT DEFAULT '',
  verified_purchase BOOLEAN DEFAULT TRUE,
  approved BOOLEAN DEFAULT FALSE,
  review_token VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved);

-- 2. SAVED CARTS TABLE (Abandoned Cart Recovery)
CREATE TABLE IF NOT EXISTS saved_carts (
  phone VARCHAR(15) PRIMARY KEY,
  customer_name VARCHAR(100),
  items JSONB NOT NULL,
  total DECIMAL(10,2) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  reminder_sent BOOLEAN DEFAULT FALSE
);

-- 3. JOURNAL ENTRIES TABLE (Healing Journal)
CREATE TABLE IF NOT EXISTS journal_entries (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(15) NOT NULL,
  title VARCHAR(200) DEFAULT '',
  content TEXT NOT NULL,
  mood_emoji VARCHAR(10) DEFAULT '🌿',
  moon_phase VARCHAR(30) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_phone ON journal_entries(phone);

-- 4. Enable RLS on all new tables (security)
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
