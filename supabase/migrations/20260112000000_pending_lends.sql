-- 20260112000000_pending_lends.sql

-- Table for tracking lent items
CREATE TABLE IF NOT EXISTS pending_lends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id),
  ingredient_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT,
  source_location TEXT NOT NULL CHECK (source_location IN ('WAREHOUSE', 'BAR')),
  lent_at TIMESTAMPTZ DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  is_returned BOOLEAN DEFAULT FALSE,
  return_location TEXT CHECK (return_location IN ('WAREHOUSE', 'BAR')),
  related_log_id UUID,
  created_by UUID REFERENCES auth.users(id),
  returned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pending_lends'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pending_lends;
  END IF;
END $$;

-- RLS Policies
ALTER TABLE pending_lends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view pending_lends for their business" ON pending_lends;
CREATE POLICY "Users can view pending_lends for their business"
  ON pending_lends FOR SELECT
  USING (business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert pending_lends for their business" ON pending_lends;
CREATE POLICY "Users can insert pending_lends for their business"
  ON pending_lends FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update pending_lends for their business" ON pending_lends;
CREATE POLICY "Users can update pending_lends for their business"
  ON pending_lends FOR UPDATE
  USING (business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete pending_lends for their business" ON pending_lends;
CREATE POLICY "Users can delete pending_lends for their business"
  ON pending_lends FOR DELETE
  USING (business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid()));

