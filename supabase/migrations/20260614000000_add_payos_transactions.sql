ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.subscription_plans(id),
  ADD COLUMN IF NOT EXISTS plan_code text,
  ADD COLUMN IF NOT EXISTS order_code bigint,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_payload jsonb;

UPDATE public.payment_transactions
SET
  plan_code = COALESCE(plan_code, 'LEGACY'),
  order_code = COALESCE(order_code, (extract(epoch FROM created_at) * 1000000)::bigint + floor(random() * 1000)::bigint)
WHERE plan_code IS NULL OR order_code IS NULL;

ALTER TABLE public.payment_transactions
  ALTER COLUMN plan_code SET NOT NULL,
  ALTER COLUMN order_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_order_code_key
  ON public.payment_transactions(order_code);

CREATE INDEX IF NOT EXISTS payment_transactions_plan_id_idx
  ON public.payment_transactions(plan_id);
