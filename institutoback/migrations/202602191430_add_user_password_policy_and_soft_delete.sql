-- Adds user security and lifecycle fields used by user management hardening.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean;

UPDATE public.users
SET must_change_password = COALESCE(must_change_password, false);

ALTER TABLE public.users
  ALTER COLUMN must_change_password SET DEFAULT false,
  ALTER COLUMN must_change_password SET NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deleted_at timestamp NULL;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users (deleted_at);
