BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'update_updated_at_column'
  ) THEN
    CREATE FUNCTION public.update_updated_at_column()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

INSERT INTO public.modules (name, display_name, description)
VALUES ('pias', 'PIA', 'Plano Individual de Atendimento dos assistidos matriculados')
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

INSERT INTO public.permissions (name, display_name, description)
VALUES
  ('view', 'Visualizar', 'Permite visualizar registros do modulo'),
  ('create', 'Criar', 'Permite criar novos registros no modulo'),
  ('edit', 'Editar', 'Permite editar registros existentes no modulo')
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

DO $$
DECLARE
  users_id_type text;
  patients_id_type text;
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
    INTO patients_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'patients'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped
  LIMIT 1;

  IF users_id_type IS NULL OR patients_id_type IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel inferir os tipos de public.users.id/public.patients.id';
  END IF;

  EXECUTE format(
    '
      CREATE TABLE IF NOT EXISTS public.patient_pias (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id %1$s NOT NULL,
        status text NOT NULL DEFAULT ''ativo'',
        data_inicio date NOT NULL,
        data_revisao date,
        objetivos text NOT NULL DEFAULT '''',
        intervencoes text NOT NULL DEFAULT '''',
        metas text NOT NULL DEFAULT '''',
        created_by %2$s NULL,
        updated_by %2$s NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT patient_pias_patient_fk
          FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
        CONSTRAINT patient_pias_created_by_fk
          FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
        CONSTRAINT patient_pias_updated_by_fk
          FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL,
        CONSTRAINT patient_pias_status_check
          CHECK (status IN (''rascunho'', ''ativo'', ''em_revisao'', ''encerrado'')),
        CONSTRAINT patient_pias_date_window_check
          CHECK (data_revisao IS NULL OR data_revisao >= data_inicio)
      )
    ',
    patients_id_type,
    users_id_type
  );

  EXECUTE format(
    '
      CREATE TABLE IF NOT EXISTS public.patient_pia_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pia_id uuid NOT NULL,
        patient_id %1$s NOT NULL,
        action text NOT NULL,
        status text NOT NULL,
        data_inicio date NOT NULL,
        data_revisao date,
        objetivos text NOT NULL DEFAULT '''',
        intervencoes text NOT NULL DEFAULT '''',
        metas text NOT NULL DEFAULT '''',
        changed_by %2$s NULL,
        changed_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT patient_pia_history_pia_fk
          FOREIGN KEY (pia_id) REFERENCES public.patient_pias(id) ON DELETE CASCADE,
        CONSTRAINT patient_pia_history_patient_fk
          FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
        CONSTRAINT patient_pia_history_changed_by_fk
          FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL,
        CONSTRAINT patient_pia_history_action_check
          CHECK (action IN (''criado'', ''revisado''))
      )
    ',
    patients_id_type,
    users_id_type
  );
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_pias_patient_unique
  ON public.patient_pias (patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_pias_status
  ON public.patient_pias (status);

CREATE INDEX IF NOT EXISTS idx_patient_pia_history_patient_changed
  ON public.patient_pia_history (patient_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_pia_history_pia_changed
  ON public.patient_pia_history (pia_id, changed_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_patient_pias_updated_at'
  ) THEN
    CREATE TRIGGER update_patient_pias_updated_at
      BEFORE UPDATE ON public.patient_pias
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

INSERT INTO public.user_permissions (user_id, module_id, permission_id, granted_by)
SELECT
  u.id,
  m.id,
  p.id,
  u.id
FROM public.users u
JOIN public.modules m
  ON LOWER(m.name) = 'pias'
JOIN public.permissions p
  ON LOWER(p.name) IN ('view', 'create', 'edit')
WHERE LOWER(COALESCE(u.role, '')) IN ('coordenador geral', 'administrador', 'admin', 'gestao', 'gestão', 'gestor')
ON CONFLICT (user_id, module_id, permission_id) DO NOTHING;

WITH matricula_scope_map AS (
  SELECT *
  FROM (
    VALUES
      ('view', 'view'),
      ('create', 'view'),
      ('create', 'create'),
      ('edit', 'view'),
      ('edit', 'edit'),
      ('enroll', 'view'),
      ('enroll', 'create'),
      ('enroll', 'edit')
  ) AS mapping(source_permission, target_permission)
)
INSERT INTO public.user_permissions (user_id, module_id, permission_id, granted_by)
SELECT DISTINCT
  up.user_id,
  target_module.id,
  target_permission.id,
  COALESCE(up.granted_by, up.user_id)
FROM public.user_permissions up
JOIN public.modules source_module
  ON source_module.id = up.module_id
JOIN public.permissions source_permission
  ON source_permission.id = up.permission_id
JOIN matricula_scope_map scope_map
  ON scope_map.source_permission = LOWER(source_permission.name)
JOIN public.modules target_module
  ON LOWER(target_module.name) = 'pias'
JOIN public.permissions target_permission
  ON LOWER(target_permission.name) = scope_map.target_permission
WHERE LOWER(source_module.name) = 'matriculas'
ON CONFLICT (user_id, module_id, permission_id) DO NOTHING;

COMMIT;
