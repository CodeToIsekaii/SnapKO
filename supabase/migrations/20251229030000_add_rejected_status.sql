-- Add REJECTED value to profile_status_enum for proper business logic
-- REJECTED = đơn xin việc bị từ chối (different from INACTIVE = nhân viên cũ nghỉ)

ALTER TYPE public.profile_status_enum ADD VALUE IF NOT EXISTS 'REJECTED';

-- Note: IF NOT EXISTS is PostgreSQL 9.3+ feature to prevent error if value already exists
