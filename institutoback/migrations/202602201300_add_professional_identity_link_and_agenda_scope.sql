BEGIN;

DO $$
DECLARE
  users_id_type text;
  professionals_user_id_int_type text;
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
    AND NOT a.attisdropped;

  IF users_id_type IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel localizar o tipo de public.users.id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'professionals'
      AND column_name = 'user_id_int'
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.professionals ADD COLUMN user_id_int %s',
      users_id_type
    );
  ELSE
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO professionals_user_id_int_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'professionals'
      AND a.attname = 'user_id_int'
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF professionals_user_id_int_type IS DISTINCT FROM users_id_type THEN
      EXECUTE format(
        'ALTER TABLE public.professionals
           ALTER COLUMN user_id_int TYPE %s
           USING user_id_int::text::%s',
        users_id_type,
        users_id_type
      );
    END IF;
  END IF;
END $$;

-- Remove vinculos invalidos para permitir FK consistente.
UPDATE public.professionals p
SET user_id_int = NULL
WHERE p.user_id_int IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p.user_id_int
  );

-- Garante 1:1 profissional <-> usuario.
WITH ranked_links AS (
  SELECT
    id,
    user_id_int,
    ROW_NUMBER() OVER (
      PARTITION BY user_id_int
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.professionals
  WHERE user_id_int IS NOT NULL
)
UPDATE public.professionals p
SET user_id_int = NULL
FROM ranked_links r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_user_id_int_unique
  ON public.professionals (user_id_int)
  WHERE user_id_int IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'professionals_user_id_int_fkey'
  ) THEN
    ALTER TABLE public.professionals
      ADD CONSTRAINT professionals_user_id_int_fkey
      FOREIGN KEY (user_id_int) REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS allow_professional_view_others boolean;

UPDATE public.system_settings
SET allow_professional_view_others = COALESCE(allow_professional_view_others, false);

ALTER TABLE public.system_settings
  ALTER COLUMN allow_professional_view_others SET DEFAULT false,
  ALTER COLUMN allow_professional_view_others SET NOT NULL;

INSERT INTO public.modules (name, display_name, description)
VALUES (
  'agenda',
  'Agenda',
  'Controle de agenda e visualizacao de agenda por profissional'
)
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

INSERT INTO public.permissions (name, display_name, description)
VALUES (
  'view_all_professionals',
  'Visualizar agenda de todos os profissionais',
  'Permite visualizar agenda de outros profissionais quando liberado por configuracao'
)
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

COMMIT;
