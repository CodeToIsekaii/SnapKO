-- SnapKO - Fix Unit Cost Update: Include price when importing
-- Updates trigger to also set unit_cost on ingredients when IMPORT log arrives

-- Updated function to update ingredient quantities AND unit_cost
CREATE OR REPLACE FUNCTION public.update_ingredient_quantity()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if ingredient_id and quantity are provided
  IF NEW.ingredient_id IS NOT NULL AND NEW.quantity_change_base IS NOT NULL THEN
    CASE NEW.type
      WHEN 'IMPORT' THEN
        -- Import adds to warehouse AND updates unit cost if provided
        IF NEW.location = 'WAREHOUSE' THEN
          UPDATE public.ingredients 
          SET 
            warehouse_qty = warehouse_qty + NEW.quantity_change_base,
            -- Update unit_cost if provided (average or latest price logic)
            unit_cost = CASE 
              WHEN NEW.unit_cost_at_time IS NOT NULL AND NEW.unit_cost_at_time > 0 
              THEN NEW.unit_cost_at_time 
              ELSE unit_cost 
            END,
            average_unit_cost = CASE 
              WHEN NEW.unit_cost_at_time IS NOT NULL AND NEW.unit_cost_at_time > 0 
              THEN NEW.unit_cost_at_time 
              ELSE average_unit_cost 
            END
          WHERE id = NEW.ingredient_id;
        ELSE
          UPDATE public.ingredients 
          SET 
            bar_qty = bar_qty + NEW.quantity_change_base,
            unit_cost = CASE 
              WHEN NEW.unit_cost_at_time IS NOT NULL AND NEW.unit_cost_at_time > 0 
              THEN NEW.unit_cost_at_time 
              ELSE unit_cost 
            END,
            average_unit_cost = CASE 
              WHEN NEW.unit_cost_at_time IS NOT NULL AND NEW.unit_cost_at_time > 0 
              THEN NEW.unit_cost_at_time 
              ELSE average_unit_cost 
            END
          WHERE id = NEW.ingredient_id;
        END IF;
        
      WHEN 'TRANSFER' THEN
        -- Transfer moves from warehouse to bar (or vice versa)
        IF NEW.location = 'BAR' THEN
          -- Transfer TO bar = subtract from warehouse, add to bar
          UPDATE public.ingredients 
          SET warehouse_qty = warehouse_qty - NEW.quantity_change_base,
              bar_qty = bar_qty + NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        ELSE
          -- Transfer TO warehouse = subtract from bar, add to warehouse
          UPDATE public.ingredients 
          SET bar_qty = bar_qty - NEW.quantity_change_base,
              warehouse_qty = warehouse_qty + NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        END IF;
        
      WHEN 'WASTE' THEN
        -- Waste subtracts from location
        IF NEW.location = 'WAREHOUSE' THEN
          UPDATE public.ingredients 
          SET warehouse_qty = warehouse_qty - NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        ELSE
          UPDATE public.ingredients 
          SET bar_qty = bar_qty - NEW.quantity_change_base
          WHERE id = NEW.ingredient_id;
        END IF;
        
      WHEN 'LENT' THEN
        -- Lent subtracts from location (similar to waste)
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

-- Add comment for documentation
COMMENT ON FUNCTION public.update_ingredient_quantity() IS 
  'Automatically updates ingredients.warehouse_qty, bar_qty, and unit_cost when inventory_logs are inserted. Handles IMPORT (with price), TRANSFER, WASTE, LENT, and AUDIT log types.';
