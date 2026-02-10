-- Down migration: remove normalizacao de funcoes
-- Esta reversao remove role_id de professionals e a tabela professional_roles.

BEGIN;

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_role_id_fkey;

ALTER TABLE public.professionals
  DROP COLUMN IF EXISTS role_id;

DROP INDEX IF EXISTS public.professional_roles_nome_unique_idx;
DROP TABLE IF EXISTS public.professional_roles;

COMMIT;
