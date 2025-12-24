-- =========================================================
-- Migration: 3-Snap Workflow Tables
-- Created: 2025-12-23
-- Purpose: Add import_logs, sales_logs, fraud_alerts tables
--          Update ingredients with average_unit_cost, min_threshold
--          Create Postgres function for atomic COGS calculation
-- =========================================================

-- =============================================
-- PART 1: Update ingredients table
-- =============================================

ALTER TABLE ingredients 
ADD COLUMN IF NOT EXISTS average_unit_cost DECIMAL(15, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_threshold DECIMAL(12, 4) DEFAULT 0;

-- Copy existing unit_cost to average_unit_cost
UPDATE ingredients 
SET average_unit_cost = unit_cost 
WHERE average_unit_cost = 0 OR average_unit_cost IS NULL;

COMMENT ON COLUMN ingredients.average_unit_cost IS 'Weighted average cost per base unit (auto-calculated on import)';
COMMENT ON COLUMN ingredients.min_threshold IS 'Minimum quantity threshold for low stock alerts';

-- =============================================
-- PART 2: import_logs table (Inbound - Supplier Invoices)
-- =============================================

CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Invoice metadata
  invoice_number TEXT,
  supplier_name TEXT,
  invoice_date DATE,
  total_amount DECIMAL(15, 2),
  
  -- Photo evidence
  invoice_photo_url TEXT,
  
  -- Parsed data (JSON array of items)
  -- Structure: [{ ingredient_id, ingredient_name, quantity, unit, unit_price, total_price }]
  items_json JSONB NOT NULL DEFAULT '[]',
  
  -- AI parsing metadata
  ai_confidence DECIMAL(5, 2), -- Overall confidence 0-100
  raw_ai_response JSONB, -- For debugging
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for import_logs
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business import logs"
ON import_logs FOR SELECT
TO authenticated
USING (
  business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert own business import logs"
ON import_logs FOR INSERT
TO authenticated
WITH CHECK (
  business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  )
);

-- =============================================
-- PART 3: sales_logs table (Outbound - POS Z-Reports)
-- =============================================

CREATE TABLE IF NOT EXISTS sales_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Report metadata
  report_date DATE NOT NULL,
  shift TEXT, -- 'morning', 'evening', etc.
  total_revenue DECIMAL(15, 2),
  
  -- Photo evidence
  report_photo_url TEXT,
  
  -- Parsed data (JSON array of sold menu items)
  -- Structure: [{ menu_item_name, recipe_id, quantity_sold }]
  items_sold_json JSONB NOT NULL DEFAULT '[]',
  
  -- Deducted ingredients (calculated from recipes)
  -- Structure: [{ ingredient_id, ingredient_name, deducted_qty, unit }]
  items_deducted_json JSONB NOT NULL DEFAULT '[]',
  
  -- AI parsing metadata
  ai_confidence DECIMAL(5, 2),
  raw_ai_response JSONB,
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for sales_logs
ALTER TABLE sales_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business sales logs"
ON sales_logs FOR SELECT
TO authenticated
USING (
  business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert own business sales logs"
ON sales_logs FOR INSERT
TO authenticated
WITH CHECK (
  business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  )
);

-- =============================================
-- PART 4: fraud_alerts table
-- =============================================

CREATE TYPE fraud_risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE fraud_alert_type AS ENUM (
  'high_variance',      -- Variance > threshold
  'perfect_match',      -- Suspicious 0% variance
  'pattern_anomaly',    -- Unusual pattern detected
  'missing_evidence'    -- No photo for high variance
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Reference to the log that triggered the alert
  log_type TEXT NOT NULL, -- 'inventory_log', 'import_log', 'sales_log'
  log_id UUID NOT NULL,
  
  -- Alert details
  alert_type fraud_alert_type NOT NULL,
  risk_level fraud_risk_level NOT NULL DEFAULT 'medium',
  
  -- Context
  ingredient_id UUID REFERENCES ingredients(id),
  variance_percentage DECIMAL(8, 2),
  theoretical_qty DECIMAL(12, 4),
  actual_qty DECIMAL(12, 4),
  
  -- Resolution
  reason_selected TEXT, -- VarianceReason from app
  evidence_photo_url TEXT,
  notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for fraud_alerts
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view business fraud alerts"
ON fraud_alerts FOR SELECT
TO authenticated
USING (
  business_id IN (
    SELECT business_id FROM profiles 
    WHERE id = auth.uid() AND role = 'OWNER'
  )
);

-- =============================================
-- PART 5: Postgres Function for Weighted Average COGS
-- CRITICAL: Uses transaction for atomicity
-- =============================================

CREATE OR REPLACE FUNCTION update_ingredient_cost_on_import(
  p_ingredient_id UUID,
  p_import_qty DECIMAL,
  p_import_price DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_qty DECIMAL;
  v_old_cost DECIMAL;
  v_new_cost DECIMAL;
  v_new_qty DECIMAL;
  v_result JSONB;
BEGIN
  -- Get current values with row lock
  SELECT 
    COALESCE(warehouse_qty + bar_qty, 0),
    COALESCE(average_unit_cost, 0)
  INTO v_old_qty, v_old_cost
  FROM ingredients
  WHERE id = p_ingredient_id
  FOR UPDATE; -- Lock row to prevent race conditions
  
  -- Calculate new weighted average cost
  -- Formula: ((OldQty * OldCost) + (ImportQty * ImportPrice)) / (OldQty + ImportQty)
  v_new_qty := v_old_qty + p_import_qty;
  
  IF v_new_qty <= 0 THEN
    -- Edge case: no inventory
    v_new_cost := p_import_price;
  ELSE
    v_new_cost := ((v_old_qty * v_old_cost) + (p_import_qty * p_import_price)) / v_new_qty;
  END IF;
  
  -- Update ingredient (atomic with the SELECT FOR UPDATE)
  UPDATE ingredients
  SET 
    average_unit_cost = v_new_cost,
    warehouse_qty = warehouse_qty + p_import_qty,
    unit_cost = v_new_cost, -- Keep unit_cost in sync for backwards compatibility
    updated_at = NOW()
  WHERE id = p_ingredient_id;
  
  -- Return result for logging
  v_result := jsonb_build_object(
    'ingredient_id', p_ingredient_id,
    'old_qty', v_old_qty,
    'old_cost', v_old_cost,
    'import_qty', p_import_qty,
    'import_price', p_import_price,
    'new_qty', v_new_qty,
    'new_cost', ROUND(v_new_cost, 4)
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION update_ingredient_cost_on_import IS 
'Atomically updates ingredient quantity and calculates weighted average cost. 
Uses FOR UPDATE lock to prevent race conditions.';

-- =============================================
-- PART 6: Function to process full import log
-- =============================================

CREATE OR REPLACE FUNCTION process_import_log(
  p_import_log_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_import_log RECORD;
  v_item JSONB;
  v_results JSONB := '[]'::JSONB;
  v_item_result JSONB;
BEGIN
  -- Get the import log
  SELECT * INTO v_import_log 
  FROM import_logs 
  WHERE id = p_import_log_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import log not found: %', p_import_log_id;
  END IF;
  
  -- Process each item in the import
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_import_log.items_json)
  LOOP
    -- Update ingredient cost (atomic)
    v_item_result := update_ingredient_cost_on_import(
      (v_item->>'ingredient_id')::UUID,
      (v_item->>'quantity')::DECIMAL,
      (v_item->>'unit_price')::DECIMAL
    );
    
    -- Collect results
    v_results := v_results || v_item_result;
  END LOOP;
  
  RETURN jsonb_build_object(
    'import_log_id', p_import_log_id,
    'items_processed', jsonb_array_length(v_import_log.items_json),
    'results', v_results
  );
END;
$$;

-- =============================================
-- PART 7: Indexes for performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_import_logs_business ON import_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_date ON import_logs(invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_logs_business ON sales_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_logs_date ON sales_logs(report_date);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_business ON fraud_alerts(business_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_unresolved ON fraud_alerts(business_id) 
  WHERE resolved_at IS NULL;
