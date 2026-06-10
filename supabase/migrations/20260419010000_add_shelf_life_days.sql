-- Phase 4 (schema only): allow tracking shelf life per ingredient.
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS shelf_life_days INT;
