BEGIN;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS sex text;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS has_report boolean;

UPDATE public.pre_appointments
SET has_report = false
WHERE has_report IS NULL;

ALTER TABLE public.pre_appointments
  ALTER COLUMN has_report SET DEFAULT false,
  ALTER COLUMN has_report SET NOT NULL;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS cid text;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS urgency text;

UPDATE public.pre_appointments
SET urgency = 'normal'
WHERE urgency IS NULL OR BTRIM(urgency) = '';

ALTER TABLE public.pre_appointments
  ALTER COLUMN urgency SET DEFAULT 'normal',
  ALTER COLUMN urgency SET NOT NULL;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS services jsonb;

UPDATE public.pre_appointments
SET services = '[]'::jsonb
WHERE services IS NULL;

ALTER TABLE public.pre_appointments
  ALTER COLUMN services SET DEFAULT '[]'::jsonb,
  ALTER COLUMN services SET NOT NULL;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS responsible_name text;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS whatsapp boolean;

UPDATE public.pre_appointments
SET whatsapp = false
WHERE whatsapp IS NULL;

ALTER TABLE public.pre_appointments
  ALTER COLUMN whatsapp SET DEFAULT false,
  ALTER COLUMN whatsapp SET NOT NULL;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS how_heard text;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS how_heard_other text;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS referred_by text;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS referred_by_other text;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS cadunico boolean;

UPDATE public.pre_appointments
SET cadunico = false
WHERE cadunico IS NULL;

ALTER TABLE public.pre_appointments
  ALTER COLUMN cadunico SET DEFAULT false,
  ALTER COLUMN cadunico SET NOT NULL;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS consent_whatsapp boolean;

UPDATE public.pre_appointments
SET consent_whatsapp = false
WHERE consent_whatsapp IS NULL;

ALTER TABLE public.pre_appointments
  ALTER COLUMN consent_whatsapp SET DEFAULT false,
  ALTER COLUMN consent_whatsapp SET NOT NULL;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS consent_lgpd boolean;

UPDATE public.pre_appointments
SET consent_lgpd = false
WHERE consent_lgpd IS NULL;

ALTER TABLE public.pre_appointments
  ALTER COLUMN consent_lgpd SET DEFAULT false,
  ALTER COLUMN consent_lgpd SET NOT NULL;

ALTER TABLE public.pre_appointments
  ADD COLUMN IF NOT EXISTS source text;

COMMIT;
