-- Phase 3 (Feature 3): Transfer status workflow.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransferStatusEnum') THEN
    CREATE TYPE "TransferStatusEnum" AS ENUM ('PENDING','ACCEPTED','REJECTED','CANCELLED');
  END IF;
END $$;

ALTER TABLE transfer_logs
  ADD COLUMN IF NOT EXISTS status "TransferStatusEnum" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by_id UUID,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- Backfill: historical transfers should be treated as ACCEPTED.
UPDATE transfer_logs SET status = 'ACCEPTED' WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '1 minute';
