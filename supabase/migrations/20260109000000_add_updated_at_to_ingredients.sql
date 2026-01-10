-- Migration: Add updated_at column to ingredients table
-- Purpose: Enable tracking of last update time for activity logs and incremental sync

-- 1. Add updated_at column (if not exists)
ALTER TABLE ingredients 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Create reusable trigger function for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3. Apply trigger to ingredients table
DROP TRIGGER IF EXISTS update_ingredients_updated_at ON ingredients;
CREATE TRIGGER update_ingredients_updated_at
    BEFORE UPDATE ON ingredients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Backfill existing rows with current timestamp
UPDATE ingredients SET updated_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL;
