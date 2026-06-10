-- Remember the unit staff prefer to see while doing mobile stock checks.
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS stock_check_unit text;

COMMENT ON COLUMN ingredients.stock_check_unit IS
  'Preferred unit shown on mobile STOCK checks; quantities are converted back to base_unit before saving inventory.';
