-- Add STOCK enum to inventory_type_enum for Inventory Check feature
ALTER TYPE inventory_type_enum ADD VALUE IF NOT EXISTS 'STOCK';
ALTER TYPE inventory_type_enum ADD VALUE IF NOT EXISTS 'STOCK_CHECK';
