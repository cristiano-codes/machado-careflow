BEGIN;

ALTER TABLE public.professional_roles
  ADD COLUMN IF NOT EXISTS show_in_pre_appointment boolean;

UPDATE public.professional_roles
SET show_in_pre_appointment = true
WHERE show_in_pre_appointment IS NULL;

ALTER TABLE public.professional_roles
  ALTER COLUMN show_in_pre_appointment SET DEFAULT true,
  ALTER COLUMN show_in_pre_appointment SET NOT NULL;

COMMIT;
