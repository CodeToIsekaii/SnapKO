-- Migration: Add ADMIN role
-- Date: 2026-01-13
-- Description: Adds 'ADMIN' to profile_role_enum to support Admin Dashboard access

-- Wrap in transaction to ensure atomic update
BEGIN;

  ALTER TYPE public.profile_role_enum ADD VALUE IF NOT EXISTS 'ADMIN';

COMMIT;
