-- SnapKO - Week 4 Patch: Missing Tables from Blueprint
-- Adds: ai_monitoring_logs, support_tickets per Product Blueprint V6.1

-- AI Monitoring Logs (track AI performance, costs, hallucinations)
CREATE TABLE IF NOT EXISTS public.ai_monitoring_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  log_id UUID REFERENCES public.inventory_logs(id) ON DELETE SET NULL,
  acceptance_rate DECIMAL, -- Tỷ lệ chấp nhận AI (0-100%)
  hallucination_detected BOOLEAN DEFAULT false,
  api_cost DECIMAL DEFAULT 0, -- Chi phí request Gemini (USD)
  model_version TEXT, -- e.g., "gemini-1.5-flash"
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_monitoring_business 
ON public.ai_monitoring_logs(business_id, created_at DESC);

-- Support Tickets (customer support tracking)
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  issue_type TEXT NOT NULL CHECK (issue_type IN (
    'PASSWORD_RESET', 'DEVICE_LOSS', 'AI_ERROR', 'MIGRATION_FAIL', 'BILLING', 'OTHER'
  )),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_business 
ON public.support_tickets(business_id, status);

-- RLS for ai_monitoring_logs
ALTER TABLE public.ai_monitoring_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_monitoring_owner_select" ON public.ai_monitoring_logs;
CREATE POLICY "ai_monitoring_owner_select" ON public.ai_monitoring_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.business_id = ai_monitoring_logs.business_id
      AND p.role = 'OWNER'
      AND p.status = 'ACTIVE'
  )
);

-- RLS for support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_business_access" ON public.support_tickets;
CREATE POLICY "support_tickets_business_access" ON public.support_tickets
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.business_id = support_tickets.business_id
      AND p.status = 'ACTIVE'
  )
);

-- Add avatar_url column to profiles if not exists (for user-delete cleanup)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;
