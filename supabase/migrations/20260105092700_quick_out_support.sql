-- SnapKO - Add Quick Out Support
-- Adds QUICK_OUT type handling to inventory trigger (DAMAGED, LOAN, MARKETING reasons)
-- Also adds optional reminders table for loan follow-ups

-- Update the trigger function to handle QUICK_OUT
CREATE OR REPLACE FUNCTION public.update_ingredient_quantity()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if ingredient_id and quantity are provided
  IF NEW.ingredient_id IS NOT NULL AND NEW.quantity_change_base IS NOT NULL THEN
    CASE NEW.type
      WHEN 'IMPORT' THEN
        -- Import adds to warehouse or bar
        IF NEW.location = 'WAREHOUSE' THEN
          UPDATE public.ingredients 
          SET warehouse_qty = warehouse_qty + NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        ELSE
          UPDATE public.ingredients 
          SET bar_qty = bar_qty + NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        END IF;
        
      WHEN 'TRANSFER' THEN
        -- Transfer moves from warehouse to bar (or vice versa)
        IF NEW.location = 'BAR' THEN
          UPDATE public.ingredients 
          SET warehouse_qty = warehouse_qty - NEW.quantity_change_base,
              bar_qty = bar_qty + NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        ELSE
          UPDATE public.ingredients 
          SET bar_qty = bar_qty - NEW.quantity_change_base,
              warehouse_qty = warehouse_qty + NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        END IF;
        
      WHEN 'WASTE', 'LENT', 'QUICK_OUT' THEN
        -- WASTE/LENT/QUICK_OUT all subtract from location
        -- QUICK_OUT covers: DAMAGED, LOAN, MARKETING reasons
        IF NEW.location = 'WAREHOUSE' THEN
          UPDATE public.ingredients 
          SET warehouse_qty = warehouse_qty - NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        ELSE
          UPDATE public.ingredients 
          SET bar_qty = bar_qty - NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        END IF;
        
      WHEN 'AUDIT' THEN
        -- Audit sets absolute value (reconciliation)
        IF NEW.final_confirmed_quantity IS NOT NULL THEN
          IF NEW.location = 'WAREHOUSE' THEN
            UPDATE public.ingredients 
            SET warehouse_qty = NEW.final_confirmed_quantity
            WHERE id = NEW.ingredient_id;
          ELSE
            UPDATE public.ingredients 
            SET bar_qty = NEW.final_confirmed_quantity
            WHERE id = NEW.ingredient_id;
          END IF;
        END IF;
        
      ELSE
        -- Unknown type, do nothing
        NULL;
    END CASE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update comment
COMMENT ON FUNCTION public.update_ingredient_quantity() IS 
  'Automatically updates ingredients.warehouse_qty or bar_qty when inventory_logs are inserted. Handles IMPORT, TRANSFER, WASTE, LENT, QUICK_OUT, and AUDIT log types.';

-- Create reminders table for loan follow-ups (optional sync from mobile)
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('LOAN_FOLLOWUP', 'LOW_STOCK', 'EXPIRY', 'CUSTOM')),
  title TEXT NOT NULL,
  message TEXT,
  remind_at TIMESTAMPTZ NOT NULL,
  is_done BOOLEAN DEFAULT FALSE,
  related_log_id UUID REFERENCES public.inventory_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT reminders_remind_at_future CHECK (remind_at > created_at - interval '1 day')
);

-- Create indexes
CREATE INDEX IF NOT EXISTS reminders_business_pending_idx 
  ON public.reminders (business_id, is_done, remind_at) 
  WHERE is_done = FALSE;

-- Enable RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for reminders
DROP POLICY IF EXISTS "reminders_select" ON public.reminders;
CREATE POLICY "reminders_select"
ON public.reminders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'ACTIVE'
      AND p.business_id = reminders.business_id
  )
);

DROP POLICY IF EXISTS "reminders_insert" ON public.reminders;
CREATE POLICY "reminders_insert"
ON public.reminders
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'ACTIVE'
      AND p.business_id = reminders.business_id
  )
);

DROP POLICY IF EXISTS "reminders_update" ON public.reminders;
CREATE POLICY "reminders_update"
ON public.reminders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'ACTIVE'
      AND p.business_id = reminders.business_id
  )
);

-- Add comment
COMMENT ON TABLE public.reminders IS 'Reminders for loan follow-ups, low stock alerts, expiry warnings, etc.';
