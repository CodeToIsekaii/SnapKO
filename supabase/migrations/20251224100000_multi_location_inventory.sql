-- =========================================================
-- Migration: Multi-Location Inventory Model
-- Created: 2025-12-24
-- Purpose: Implement SIMPLE/STANDARD/CHAIN inventory models
--          with storage_areas, stock_levels, transfer_logs
-- 
-- CRITICAL: Includes DATA BACKFILL to preserve existing data
-- =========================================================

-- =============================================
-- STEP 1: Create Inventory Model Enum
-- =============================================

CREATE TYPE inventory_model_type AS ENUM ('SIMPLE', 'STANDARD', 'CHAIN');
CREATE TYPE storage_area_type AS ENUM ('STORAGE', 'SERVICE');

-- =============================================
-- STEP 2: Update profiles table with inventory_model
-- =============================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS inventory_model inventory_model_type DEFAULT 'STANDARD',
ADD COLUMN IF NOT EXISTS stock_check_frequency TEXT DEFAULT 'daily';

COMMENT ON COLUMN profiles.inventory_model IS 'Business inventory model: SIMPLE (1 storage), STANDARD (warehouse+bar), CHAIN (multi-store)';

-- =============================================
-- STEP 3: Create storage_areas table
-- =============================================

CREATE TABLE IF NOT EXISTS storage_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  type storage_area_type NOT NULL DEFAULT 'STORAGE',
  
  -- For CHAIN model
  store_code TEXT, -- Store identifier for multi-store
  address TEXT,
  
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Each business can only have one default area
  UNIQUE(business_id, is_default) -- Partial unique handled by trigger
);

CREATE INDEX idx_storage_areas_business ON storage_areas(business_id);

-- RLS for storage_areas
ALTER TABLE storage_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business storage areas"
ON storage_areas FOR SELECT
TO authenticated
USING (business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Owner can manage storage areas"
ON storage_areas FOR ALL
TO authenticated
USING (business_id IN (
  SELECT business_id FROM profiles WHERE id = auth.uid() AND role = 'OWNER'
));

-- =============================================
-- STEP 4: Create stock_levels table (NEW quantity location)
-- =============================================

CREATE TABLE IF NOT EXISTS stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES storage_areas(id) ON DELETE CASCADE,
  
  quantity DECIMAL(15, 4) NOT NULL DEFAULT 0,
  
  -- For tracking
  last_counted_at TIMESTAMPTZ,
  last_counted_by UUID REFERENCES profiles(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- CRITICAL: Each ingredient can only have one entry per area
  UNIQUE(ingredient_id, area_id)
);

CREATE INDEX idx_stock_levels_ingredient ON stock_levels(ingredient_id);
CREATE INDEX idx_stock_levels_area ON stock_levels(area_id);

-- RLS for stock_levels
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business stock levels"
ON stock_levels FOR SELECT
TO authenticated
USING (
  ingredient_id IN (
    SELECT id FROM ingredients WHERE business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update own business stock levels"
ON stock_levels FOR UPDATE
TO authenticated
USING (
  ingredient_id IN (
    SELECT id FROM ingredients WHERE business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid()
    )
  )
);

-- =============================================
-- STEP 5: Create transfer_logs table
-- =============================================

CREATE TABLE IF NOT EXISTS transfer_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  from_area_id UUID NOT NULL REFERENCES storage_areas(id),
  to_area_id UUID NOT NULL REFERENCES storage_areas(id),
  
  -- Transfer details (JSON array of items)
  -- Structure: [{ ingredient_id, quantity, unit }]
  items_json JSONB NOT NULL DEFAULT '[]',
  
  -- Optional: Photo of transfer ticket
  transfer_ticket_photo_url TEXT,
  
  notes TEXT,
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Validation: Cannot transfer to same area
  CONSTRAINT different_areas CHECK (from_area_id != to_area_id)
);

CREATE INDEX idx_transfer_logs_business ON transfer_logs(business_id);
CREATE INDEX idx_transfer_logs_from ON transfer_logs(from_area_id);
CREATE INDEX idx_transfer_logs_to ON transfer_logs(to_area_id);

-- RLS for transfer_logs
ALTER TABLE transfer_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business transfer logs"
ON transfer_logs FOR SELECT
TO authenticated
USING (business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert transfer logs"
ON transfer_logs FOR INSERT
TO authenticated
WITH CHECK (business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid()));

-- =============================================
-- STEP 6: Update import_logs with target_area_id
-- =============================================

ALTER TABLE import_logs
ADD COLUMN IF NOT EXISTS target_area_id UUID REFERENCES storage_areas(id);

COMMENT ON COLUMN import_logs.target_area_id IS 'Destination area: STORAGE (Kho Tổng) or SERVICE (Quầy Bar - Urgent)';

-- =============================================
-- STEP 7: Update inventory_logs with area_id and is_partial_check
-- =============================================

-- First, check if inventory_logs table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_logs') THEN
    -- Add new columns
    ALTER TABLE inventory_logs 
    ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES storage_areas(id),
    ADD COLUMN IF NOT EXISTS is_partial_check BOOLEAN DEFAULT false;
    
    COMMENT ON COLUMN inventory_logs.area_id IS 'Which storage area was checked (Warehouse vs Bar)';
    COMMENT ON COLUMN inventory_logs.is_partial_check IS 'true = only items in photo updated, false = full inventory count';
  END IF;
END $$;

-- =============================================
-- STEP 8: DATA BACKFILL - CRITICAL FOR EXISTING DATA
-- Migrate existing quantity data to stock_levels
-- =============================================

-- Create a function to perform the migration for a single business
CREATE OR REPLACE FUNCTION migrate_inventory_to_stock_levels(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_default_area_id UUID;
  v_bar_area_id UUID;
  v_migrated_count INT := 0;
  v_ingredient RECORD;
BEGIN
  -- 1. Create default STORAGE area (Kho Tổng) if not exists
  INSERT INTO storage_areas (business_id, name, type, is_default)
  VALUES (p_business_id, 'Kho Tổng', 'STORAGE', true)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_default_area_id;
  
  -- If not inserted, get existing
  IF v_default_area_id IS NULL THEN
    SELECT id INTO v_default_area_id 
    FROM storage_areas 
    WHERE business_id = p_business_id AND type = 'STORAGE' AND is_default = true
    LIMIT 1;
  END IF;
  
  -- 2. Create SERVICE area (Quầy Bar) for STANDARD model
  INSERT INTO storage_areas (business_id, name, type, is_default)
  VALUES (p_business_id, 'Quầy Bar', 'SERVICE', false)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_bar_area_id;
  
  IF v_bar_area_id IS NULL THEN
    SELECT id INTO v_bar_area_id 
    FROM storage_areas 
    WHERE business_id = p_business_id AND type = 'SERVICE'
    LIMIT 1;
  END IF;
  
  -- 3. Migrate existing ingredient quantities to stock_levels
  FOR v_ingredient IN 
    SELECT id, warehouse_qty, bar_qty 
    FROM ingredients 
    WHERE business_id = p_business_id
  LOOP
    -- Insert warehouse quantity
    IF v_ingredient.warehouse_qty > 0 AND v_default_area_id IS NOT NULL THEN
      INSERT INTO stock_levels (ingredient_id, area_id, quantity)
      VALUES (v_ingredient.id, v_default_area_id, v_ingredient.warehouse_qty)
      ON CONFLICT (ingredient_id, area_id) 
      DO UPDATE SET quantity = EXCLUDED.quantity;
      
      v_migrated_count := v_migrated_count + 1;
    END IF;
    
    -- Insert bar quantity
    IF v_ingredient.bar_qty > 0 AND v_bar_area_id IS NOT NULL THEN
      INSERT INTO stock_levels (ingredient_id, area_id, quantity)
      VALUES (v_ingredient.id, v_bar_area_id, v_ingredient.bar_qty)
      ON CONFLICT (ingredient_id, area_id) 
      DO UPDATE SET quantity = EXCLUDED.quantity;
      
      v_migrated_count := v_migrated_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'business_id', p_business_id,
    'storage_area_id', v_default_area_id,
    'service_area_id', v_bar_area_id,
    'migrated_stock_levels', v_migrated_count
  );
END;
$$;

-- 4. Run migration for ALL existing businesses
DO $$
DECLARE
  v_business RECORD;
  v_result JSONB;
BEGIN
  FOR v_business IN SELECT id FROM businesses
  LOOP
    v_result := migrate_inventory_to_stock_levels(v_business.id);
    RAISE NOTICE 'Migrated business %: %', v_business.id, v_result;
  END LOOP;
END $$;

-- =============================================
-- STEP 9: Function to process transfer
-- =============================================

CREATE OR REPLACE FUNCTION process_transfer(
  p_transfer_log_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transfer RECORD;
  v_item JSONB;
  v_results JSONB := '[]'::JSONB;
BEGIN
  -- Get transfer details
  SELECT * INTO v_transfer FROM transfer_logs WHERE id = p_transfer_log_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer log not found: %', p_transfer_log_id;
  END IF;
  
  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_transfer.items_json)
  LOOP
    -- Deduct from source area
    UPDATE stock_levels 
    SET quantity = quantity - (v_item->>'quantity')::DECIMAL,
        updated_at = NOW()
    WHERE ingredient_id = (v_item->>'ingredient_id')::UUID 
      AND area_id = v_transfer.from_area_id;
    
    -- Add to destination area (upsert)
    INSERT INTO stock_levels (ingredient_id, area_id, quantity)
    VALUES (
      (v_item->>'ingredient_id')::UUID,
      v_transfer.to_area_id,
      (v_item->>'quantity')::DECIMAL
    )
    ON CONFLICT (ingredient_id, area_id)
    DO UPDATE SET 
      quantity = stock_levels.quantity + EXCLUDED.quantity,
      updated_at = NOW();
    
    v_results := v_results || v_item;
  END LOOP;
  
  RETURN jsonb_build_object(
    'transfer_id', p_transfer_log_id,
    'items_processed', jsonb_array_length(v_transfer.items_json)
  );
END;
$$;

-- =============================================
-- STEP 10: Helper function to get stock by area
-- =============================================

CREATE OR REPLACE FUNCTION get_stock_by_area(
  p_business_id UUID,
  p_area_id UUID DEFAULT NULL
)
RETURNS TABLE (
  ingredient_id UUID,
  ingredient_name TEXT,
  area_id UUID,
  area_name TEXT,
  area_type storage_area_type,
  quantity DECIMAL,
  unit TEXT,
  min_threshold DECIMAL,
  is_low_stock BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id AS ingredient_id,
    i.name AS ingredient_name,
    sa.id AS area_id,
    sa.name AS area_name,
    sa.type AS area_type,
    COALESCE(sl.quantity, 0) AS quantity,
    i.base_unit AS unit,
    i.min_threshold,
    COALESCE(sl.quantity, 0) < i.min_threshold AS is_low_stock
  FROM ingredients i
  JOIN storage_areas sa ON sa.business_id = i.business_id
  LEFT JOIN stock_levels sl ON sl.ingredient_id = i.id AND sl.area_id = sa.id
  WHERE i.business_id = p_business_id
    AND (p_area_id IS NULL OR sa.id = p_area_id)
    AND i.archived = false
    AND sa.is_active = true
  ORDER BY i.name, sa.type;
END;
$$;

-- =============================================
-- STEP 11: Keep warehouse_qty, bar_qty for backward compatibility
-- but mark as deprecated (DO NOT DROP YET)
-- =============================================

COMMENT ON COLUMN ingredients.warehouse_qty IS 'DEPRECATED: Use stock_levels table with area_id. Kept for backward compatibility.';
COMMENT ON COLUMN ingredients.bar_qty IS 'DEPRECATED: Use stock_levels table with area_id. Kept for backward compatibility.';

-- =============================================
-- STEP 12: Trigger to sync stock_levels back to ingredients (backward compat)
-- =============================================

CREATE OR REPLACE FUNCTION sync_stock_to_ingredients()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_area_type storage_area_type;
BEGIN
  -- Get area type
  SELECT type INTO v_area_type FROM storage_areas WHERE id = NEW.area_id;
  
  -- Update legacy columns
  IF v_area_type = 'STORAGE' THEN
    UPDATE ingredients SET warehouse_qty = NEW.quantity WHERE id = NEW.ingredient_id;
  ELSIF v_area_type = 'SERVICE' THEN
    UPDATE ingredients SET bar_qty = NEW.quantity WHERE id = NEW.ingredient_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_stock_levels
AFTER INSERT OR UPDATE ON stock_levels
FOR EACH ROW
EXECUTE FUNCTION sync_stock_to_ingredients();
