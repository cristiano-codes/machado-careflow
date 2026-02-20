BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS registration_mode text,
  ADD COLUMN IF NOT EXISTS public_signup_default_status text,
  ADD COLUMN IF NOT EXISTS link_policy text,
  ADD COLUMN IF NOT EXISTS allow_create_user_from_professional boolean,
  ADD COLUMN IF NOT EXISTS block_duplicate_email boolean;

UPDATE public.system_settings
SET registration_mode = CASE
      WHEN UPPER(COALESCE(registration_mode, '')) IN ('ADMIN_ONLY', 'PUBLIC_SIGNUP', 'INVITE_ONLY')
        THEN UPPER(registration_mode)
      WHEN allow_public_registration = true THEN 'PUBLIC_SIGNUP'
      ELSE 'INVITE_ONLY'
    END,
    public_signup_default_status = CASE
      WHEN LOWER(COALESCE(public_signup_default_status, '')) IN ('pendente', 'ativo')
        THEN LOWER(public_signup_default_status)
      ELSE 'pendente'
    END,
    link_policy = CASE
      WHEN UPPER(COALESCE(link_policy, '')) IN ('MANUAL_LINK_ADMIN', 'AUTO_LINK_BY_EMAIL', 'SELF_CLAIM_WITH_APPROVAL')
        THEN UPPER(link_policy)
      ELSE 'MANUAL_LINK_ADMIN'
    END,
    allow_create_user_from_professional = COALESCE(allow_create_user_from_professional, true),
    block_duplicate_email = COALESCE(block_duplicate_email, true),
    allow_public_registration = CASE
      WHEN UPPER(COALESCE(registration_mode, '')) = 'PUBLIC_SIGNUP' THEN true
      ELSE COALESCE(allow_public_registration, false)
    END;

ALTER TABLE public.system_settings
  ALTER COLUMN registration_mode SET DEFAULT 'INVITE_ONLY',
  ALTER COLUMN registration_mode SET NOT NULL,
  ALTER COLUMN public_signup_default_status SET DEFAULT 'pendente',
  ALTER COLUMN public_signup_default_status SET NOT NULL,
  ALTER COLUMN link_policy SET DEFAULT 'MANUAL_LINK_ADMIN',
  ALTER COLUMN link_policy SET NOT NULL,
  ALTER COLUMN allow_create_user_from_professional SET DEFAULT true,
  ALTER COLUMN allow_create_user_from_professional SET NOT NULL,
  ALTER COLUMN block_duplicate_email SET DEFAULT true,
  ALTER COLUMN block_duplicate_email SET NOT NULL,
  ALTER COLUMN allow_public_registration SET DEFAULT false,
  ALTER COLUMN allow_public_registration SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'system_settings_registration_mode_check'
  ) THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_registration_mode_check
      CHECK (registration_mode IN ('ADMIN_ONLY', 'PUBLIC_SIGNUP', 'INVITE_ONLY'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'system_settings_public_signup_default_status_check'
  ) THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_public_signup_default_status_check
      CHECK (public_signup_default_status IN ('pendente', 'ativo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'system_settings_link_policy_check'
  ) THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_link_policy_check
      CHECK (link_policy IN ('MANUAL_LINK_ADMIN', 'AUTO_LINK_BY_EMAIL', 'SELF_CLAIM_WITH_APPROVAL'));
  END IF;
END $$;

UPDATE public.system_settings
SET allow_public_registration = (registration_mode = 'PUBLIC_SIGNUP');

DO $$
DECLARE
  users_id_type text;
  professionals_id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO users_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'users'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped
  LIMIT 1;

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO professionals_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'professionals'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped
  LIMIT 1;

  IF users_id_type IS NULL OR professionals_id_type IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel inferir tipos de ID para professional_link_requests';
  END IF;

  EXECUTE format(
    '
      CREATE TABLE IF NOT EXISTS public.professional_link_requests (
        id uuid PRIMARY KEY,
        user_id %s NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        professional_id %s NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT ''pending'',
        notes text NULL,
        decided_at timestamptz NULL,
        decided_by_user_id %s NULL REFERENCES public.users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT professional_link_requests_status_check
          CHECK (status IN (''pending'', ''approved'', ''rejected''))
      )
    ',
    users_id_type,
    professionals_id_type,
    users_id_type
  );
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_link_requests_user_pending
  ON public.professional_link_requests (user_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_link_requests_professional_pending
  ON public.professional_link_requests (professional_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_professional_link_requests_status_created_at
  ON public.professional_link_requests (status, created_at DESC);

COMMIT;
