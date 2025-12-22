-- SnapKO - PayOS Gateway Support
-- Adds PAYOS to payment_gateway_enum

alter type public.payment_gateway_enum add value if not exists 'PAYOS';
