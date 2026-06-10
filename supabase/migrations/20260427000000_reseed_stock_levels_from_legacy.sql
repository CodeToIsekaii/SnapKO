-- ============================================================
-- Reseed stock_levels from legacy warehouse_qty / bar_qty
-- Idempotent: safe to run multiple times
-- ============================================================

-- 1. Ensure every business has a default STORAGE area
INSERT INTO storage_areas (id, business_id, name, type, is_default, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  b.id,
  'Kho Tổng',
  'STORAGE',
  true,
  true,
  NOW(),
  NOW()
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM storage_areas sa
  WHERE sa.business_id = b.id AND sa.type = 'STORAGE'
)
ON CONFLICT DO NOTHING;

-- 2. Ensure PRO/CHAIN businesses have a SERVICE area
INSERT INTO storage_areas (id, business_id, name, type, is_default, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  b.id,
  'Quầy Bar',
  'SERVICE',
  false,
  true,
  NOW(),
  NOW()
FROM businesses b
WHERE b.tier IN ('PRO', 'CHAIN')
  AND NOT EXISTS (
    SELECT 1 FROM storage_areas sa
    WHERE sa.business_id = b.id AND sa.type = 'SERVICE'
  )
ON CONFLICT DO NOTHING;

-- 3. Reseed STORAGE stock_levels from warehouse_qty (idempotent upsert)
INSERT INTO stock_levels (id, ingredient_id, area_id, quantity, updated_at)
SELECT
  gen_random_uuid(),
  i.id,
  sa.id,
  COALESCE(i.warehouse_qty, 0),
  NOW()
FROM ingredients i
JOIN storage_areas sa
  ON sa.business_id = i.business_id
  AND sa.type = 'STORAGE'
  AND sa.is_default = true
  AND sa.is_active = true
WHERE i.deleted_at IS NULL
ON CONFLICT (ingredient_id, area_id) DO UPDATE
  SET quantity   = EXCLUDED.quantity,
      updated_at = NOW();

-- 4. Reseed SERVICE stock_levels from bar_qty (only where bar_qty > 0)
INSERT INTO stock_levels (id, ingredient_id, area_id, quantity, updated_at)
SELECT
  gen_random_uuid(),
  i.id,
  sa.id,
  COALESCE(i.bar_qty, 0),
  NOW()
FROM ingredients i
JOIN storage_areas sa
  ON sa.business_id = i.business_id
  AND sa.type = 'SERVICE'
  AND sa.is_active = true
WHERE i.deleted_at IS NULL
  AND COALESCE(i.bar_qty, 0) > 0
ON CONFLICT (ingredient_id, area_id) DO UPDATE
  SET quantity   = EXCLUDED.quantity,
      updated_at = NOW();
