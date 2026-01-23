-- Migration: Add SALES to inventory_type_enum
-- This allows syncing sales capture logs from mobile app

ALTER TYPE inventory_type_enum ADD VALUE IF NOT EXISTS 'SALES';
