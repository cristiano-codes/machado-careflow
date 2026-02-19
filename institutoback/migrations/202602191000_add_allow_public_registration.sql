-- Add toggle to control public self-registration from admin settings.

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS allow_public_registration boolean;

UPDATE public.system_settings
SET allow_public_registration = COALESCE(allow_public_registration, false);

ALTER TABLE public.system_settings
  ALTER COLUMN allow_public_registration SET DEFAULT false,
  ALTER COLUMN allow_public_registration SET NOT NULL;
