BEGIN;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS converted_to_patient_id text,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by text;

ALTER TABLE public.pre_appointments
  ALTER COLUMN cpf TYPE text USING cpf::text,
  ALTER COLUMN status TYPE text USING status::text,
  ALTER COLUMN converted_to_patient_id TYPE text USING NULLIF(BTRIM(converted_to_patient_id::text), ''),
  ALTER COLUMN converted_at TYPE timestamptz USING converted_at::timestamptz,
  ALTER COLUMN converted_by TYPE text USING NULLIF(BTRIM(converted_by::text), '');

UPDATE public.pre_appointments
SET status = 'pending'
WHERE status IS NULL
   OR BTRIM(status) = '';

ALTER TABLE public.pre_appointments
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pre_appointments_converted_to_patient_id
  ON public.pre_appointments (converted_to_patient_id);

CREATE INDEX IF NOT EXISTS idx_pre_appointments_converted_at
  ON public.pre_appointments (converted_at);

CREATE INDEX IF NOT EXISTS idx_pre_appointments_eligible_lookup
  ON public.pre_appointments (created_at DESC)
  WHERE converted_at IS NULL
    AND NULLIF(BTRIM(COALESCE(converted_to_patient_id::text, '')), '') IS NULL
    AND LOWER(COALESCE(status, 'pending')) <> 'converted'
    AND LOWER(COALESCE(status, 'pending')) <> 'cancelled';

COMMIT;
