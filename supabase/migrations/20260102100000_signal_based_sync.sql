-- Signal-Based Realtime Sync Migration
-- Implements the "Rung Chuông" (Signal Pattern) for efficient sync
-- Made fully idempotent to handle re-runs

-- 1. Create sync_signals table (The Bell)
CREATE TABLE IF NOT EXISTS public.sync_signals (
    business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
    last_stock_update TIMESTAMPTZ DEFAULT NOW(),
    last_master_data_update TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Realtime on sync_signals (idempotent)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_signals;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- 3. RLS Policies for sync_signals (idempotent with DROP IF EXISTS)
ALTER TABLE public.sync_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own business signals" ON public.sync_signals;
CREATE POLICY "Users can view own business signals"
    ON public.sync_signals FOR SELECT
    USING (business_id IN (SELECT business_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own business signals" ON public.sync_signals;
CREATE POLICY "Users can update own business signals"
    ON public.sync_signals FOR UPDATE
    USING (business_id IN (SELECT business_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own business signals" ON public.sync_signals;
CREATE POLICY "Users can insert own business signals"
    ON public.sync_signals FOR INSERT
    WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE id = auth.uid()));

-- 4. Add soft delete columns to ingredients (if not exists)
ALTER TABLE public.ingredients 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 5. Add soft delete columns to stock_levels (if not exists)
ALTER TABLE public.stock_levels 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 6. Create index on deleted_at for performance
CREATE INDEX IF NOT EXISTS idx_ingredients_deleted_at 
    ON public.ingredients(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_levels_deleted_at 
    ON public.stock_levels(deleted_at) WHERE deleted_at IS NULL;

-- 7. Trigger to auto-update updated_at on sync_signals
CREATE OR REPLACE FUNCTION update_sync_signals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_signals_updated_at ON public.sync_signals;
CREATE TRIGGER trigger_sync_signals_updated_at
    BEFORE UPDATE ON public.sync_signals
    FOR EACH ROW
    EXECUTE FUNCTION update_sync_signals_timestamp();

-- 8. Helper functions (idempotent with CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION ring_stock_bell(p_business_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO public.sync_signals (business_id, last_stock_update)
    VALUES (p_business_id, NOW())
    ON CONFLICT (business_id) 
    DO UPDATE SET last_stock_update = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ring_master_data_bell(p_business_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO public.sync_signals (business_id, last_master_data_update)
    VALUES (p_business_id, NOW())
    ON CONFLICT (business_id) 
    DO UPDATE SET last_master_data_update = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
