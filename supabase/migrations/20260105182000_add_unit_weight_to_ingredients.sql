-- Migration: Add unit_weight and unit_weight_unit to ingredients table
-- Required for Unit Conversion logic and Desktop Sync

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit_weight float8; -- or REAL
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit_weight_unit text;
