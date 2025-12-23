-- Create daily_inventory_stats table for COGS historical data
-- Per user feedback: Snapshot strategy instead of mock data

CREATE TABLE IF NOT EXISTS daily_inventory_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  total_value_warehouse NUMERIC NOT NULL DEFAULT 0,
  total_value_bar NUMERIC NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for date queries
CREATE INDEX idx_daily_stats_date ON daily_inventory_stats(date DESC);

COMMENT ON TABLE daily_inventory_stats IS 'Daily snapshots of inventory value for COGS trend analysis. Auto-populated by Desktop app on startup.';
