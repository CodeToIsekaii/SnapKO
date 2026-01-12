
-- Migration: Add plan_code and update tier_enum

-- 1. Add PREMIUM to tier_enum if not exists
-- Postgres doesn't support "IF NOT EXISTS" for ADD VALUE easily in transaction blocks in some versions, 
-- but we can wrap it or just run it. ALTER TYPE cannot run inside a transaction block in some contexts, 
-- but Supabase usually handles it. If it fails, we might need a separate script.
-- Safest way is to just add the column plan_code first.

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS plan_code TEXT;

-- 2. Update tier_enum to include PREMIUM
-- Note: 'PERSONAL' and 'CHAIN' are legacy, we leave them or validly ignore them.
-- We must run this outside of a transaction block usually, or hope Supabase handles it.
-- ALTER TYPE tier_enum ADD VALUE IF NOT EXISTS 'PREMIUM'; -- Syntax valid in PG 12+

-- Since we can't easily check for value existence in pure SQL without PL/PGSQL block:
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid  
                   WHERE t.typname = 'tier_enum' AND e.enumlabel = 'PREMIUM') THEN
        ALTER TYPE tier_enum ADD VALUE 'PREMIUM';
    END IF;
END$$;

-- 3. Index for performance
CREATE INDEX IF NOT EXISTS idx_businesses_plan_code ON businesses(plan_code);
