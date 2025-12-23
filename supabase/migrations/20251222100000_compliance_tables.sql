-- SnapKO: Compliance Tables for DPIA Logs and AI Monitoring
-- Per .antigravityrules: "Compliance Tables: dpia_logs, ai_monitoring_logs"
-- NOTE: Drops existing tables first to ensure clean schema

-- ==============================================================
-- 0. CLEANUP - Drop existing tables/views if they exist with old schema
-- ==============================================================
DROP VIEW IF EXISTS public.ai_performance_summary CASCADE;
DROP TABLE IF EXISTS public.dpia_logs CASCADE;
DROP TABLE IF EXISTS public.ai_monitoring_logs CASCADE;

-- ==============================================================
-- 1. DPIA LOGS - Data Protection Impact Assessment logging
-- Required for Decree 13 compliance
-- ==============================================================
CREATE TABLE public.dpia_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Action type: data_export, data_access, data_deletion, consent_change
  action_type TEXT NOT NULL,
  
  -- Description of the action
  description TEXT,
  
  -- What data was affected
  affected_data_types TEXT[], -- e.g., ['profile', 'inventory', 'photos']
  
  -- Request source: user_request, automated, admin
  source TEXT NOT NULL DEFAULT 'user_request',
  
  -- Status: pending, completed, failed
  status TEXT NOT NULL DEFAULT 'pending',
  
  -- IP address (hashed for privacy)
  ip_hash TEXT,
  
  -- User agent (anonymized)
  user_agent TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Metadata for additional context
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for querying by business
CREATE INDEX idx_dpia_logs_business_id ON public.dpia_logs(business_id);
CREATE INDEX idx_dpia_logs_created_at ON public.dpia_logs(created_at DESC);
CREATE INDEX idx_dpia_logs_action_type ON public.dpia_logs(action_type);

-- RLS
ALTER TABLE public.dpia_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dpia_logs_business_access" ON public.dpia_logs
  FOR ALL
  TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ==============================================================
-- 2. AI MONITORING LOGS - Track AI parsing accuracy and usage
-- Required for monitoring AI confidence and model performance
-- ==============================================================
CREATE TABLE public.ai_monitoring_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- AI function that was called
  function_name TEXT NOT NULL, -- e.g., 'ai-parse-inventory', 'ai-parse-menu'
  
  -- Input summary (no raw data for privacy)
  input_type TEXT, -- e.g., 'image/jpeg', 'image/png'
  input_size_bytes INTEGER,
  
  -- AI Response metrics
  items_detected INTEGER DEFAULT 0,
  total_confidence NUMERIC(5, 2), -- 0-100 average confidence score
  low_confidence_count INTEGER DEFAULT 0, -- items with <85% confidence
  
  -- User corrections
  items_corrected INTEGER DEFAULT 0, -- how many items user had to edit
  items_added INTEGER DEFAULT 0, -- new items added by user
  items_removed INTEGER DEFAULT 0, -- items removed by user
  
  -- Processing metrics
  processing_time_ms INTEGER,
  
  -- Status: success, partial, failed
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Raw AI response for debugging (optional, encrypted)
  raw_response JSONB
);

-- Indexes for analytics
CREATE INDEX idx_ai_monitoring_business_id ON public.ai_monitoring_logs(business_id);
CREATE INDEX idx_ai_monitoring_created_at ON public.ai_monitoring_logs(created_at DESC);
CREATE INDEX idx_ai_monitoring_function ON public.ai_monitoring_logs(function_name);
CREATE INDEX idx_ai_monitoring_confidence ON public.ai_monitoring_logs(total_confidence);

-- RLS
ALTER TABLE public.ai_monitoring_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_monitoring_business_access" ON public.ai_monitoring_logs
  FOR ALL
  TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ==============================================================
-- 3. Analytics Views for AI Performance Dashboard
-- ==============================================================
CREATE OR REPLACE VIEW public.ai_performance_summary AS
SELECT 
  business_id,
  function_name,
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as total_calls,
  AVG(total_confidence) as avg_confidence,
  SUM(low_confidence_count) as total_low_confidence_items,
  SUM(items_corrected) as total_corrections,
  AVG(processing_time_ms) as avg_processing_time
FROM public.ai_monitoring_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY business_id, function_name, DATE_TRUNC('day', created_at);

-- Grant access to authenticated users
GRANT SELECT ON public.ai_performance_summary TO authenticated;

COMMENT ON TABLE public.dpia_logs IS 'Logs for Data Protection Impact Assessment - Decree 13 compliance';
COMMENT ON TABLE public.ai_monitoring_logs IS 'AI parsing accuracy and performance monitoring';
