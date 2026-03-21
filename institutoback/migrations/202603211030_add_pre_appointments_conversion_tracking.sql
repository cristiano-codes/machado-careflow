BEGIN;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS cpf text;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS converted_to_patient_id text;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS converted_by text;

UPDATE public.pre_appointments
SET status = 'pending'
WHERE status IS NULL
   OR BTRIM(status) = '';

CREATE INDEX IF NOT EXISTS idx_pre_appointments_converted_to_patient_id
  ON public.pre_appointments (converted_to_patient_id);

CREATE INDEX IF NOT EXISTS idx_pre_appointments_converted_at
  ON public.pre_appointments (converted_at);

CREATE INDEX IF NOT EXISTS idx_pre_appointments_eligible_lookup
  ON public.pre_appointments (created_at DESC)
  WHERE converted_at IS NULL;

COMMIT;
