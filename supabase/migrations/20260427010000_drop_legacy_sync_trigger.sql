-- Drop the legacy trigger that wrote a single stock_level row back to
-- ingredients.warehouse_qty / bar_qty (logic was incorrect — set instead of SUM).
-- syncLegacyQty() in the application layer now handles this correctly.

DROP TRIGGER IF EXISTS trg_sync_stock_levels ON stock_levels;
DROP FUNCTION IF EXISTS sync_stock_to_ingredients();
