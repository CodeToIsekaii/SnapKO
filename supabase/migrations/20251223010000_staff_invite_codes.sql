-- Create staff_invite_codes table for Week 2 Employee Management
-- SIMPLIFIED MODEL: Shared invite codes (like group password)
-- Multiple staff can use same code, owner approves individually

CREATE TABLE IF NOT EXISTS staff_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'DELETED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by code
CREATE INDEX idx_staff_invite_codes_code ON staff_invite_codes(code) WHERE status = 'ACTIVE';

-- Index for business_id
CREATE INDEX idx_staff_invite_codes_business ON staff_invite_codes(business_id);

-- RLS Policies
ALTER TABLE staff_invite_codes ENABLE ROW LEVEL SECURITY;

-- Owner can create and view their business's invite codes
CREATE POLICY "Owners can manage invite codes"
  ON staff_invite_codes
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid() AND role = 'OWNER'
    )
  );

-- NO PUBLIC SELECT POLICY
-- Mobile verification happens via Edge Function with Service Role Key

COMMENT ON TABLE staff_invite_codes IS 'Shared invite codes for staff to join businesses. Multiple staff can use same code. Owner approves each staff individually after they join.';
