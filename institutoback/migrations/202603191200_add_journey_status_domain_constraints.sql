BEGIN;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS status_jornada text;

DO $$
DECLARE
  valid_journey_statuses text[] := ARRAY[
    'em_fila_espera',
    'entrevista_realizada',
    'em_avaliacao',
    'em_analise_vaga',
    'aprovado',
    'encaminhado',
    'matriculado',
    'ativo',
    'inativo_assistencial',
    'desligado'
  ];
BEGIN
  UPDATE public.patients
  SET status_jornada = CASE
    WHEN status_jornada IS NULL
      OR BTRIM(status_jornada) = ''
      OR NOT (LOWER(BTRIM(status_jornada)) = ANY (valid_journey_statuses))
      THEN 'em_fila_espera'
    ELSE LOWER(BTRIM(status_jornada))
  END
  WHERE status_jornada IS NULL
     OR BTRIM(status_jornada) = ''
     OR status_jornada <> LOWER(BTRIM(status_jornada))
     OR NOT (LOWER(BTRIM(status_jornada)) = ANY (valid_journey_statuses));

  ALTER TABLE public.patients
    ALTER COLUMN status_jornada SET DEFAULT 'em_fila_espera',
    ALTER COLUMN status_jornada SET NOT NULL;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'assistido_status_history'
  ) THEN
    UPDATE public.assistido_status_history
    SET status_novo = CASE
      WHEN status_novo IS NULL
        OR BTRIM(status_novo) = ''
        OR NOT (LOWER(BTRIM(status_novo)) = ANY (valid_journey_statuses))
        THEN 'em_fila_espera'
      ELSE LOWER(BTRIM(status_novo))
    END
    WHERE status_novo IS NULL
       OR BTRIM(status_novo) = ''
       OR status_novo <> LOWER(BTRIM(status_novo))
       OR NOT (LOWER(BTRIM(status_novo)) = ANY (valid_journey_statuses));

    UPDATE public.assistido_status_history
    SET status_anterior = CASE
      WHEN status_anterior IS NULL
        OR BTRIM(status_anterior) = ''
        OR NOT (LOWER(BTRIM(status_anterior)) = ANY (valid_journey_statuses))
        THEN NULL
      ELSE LOWER(BTRIM(status_anterior))
    END
    WHERE status_anterior IS NOT NULL
      AND (
        BTRIM(status_anterior) = ''
        OR status_anterior <> LOWER(BTRIM(status_anterior))
        OR NOT (LOWER(BTRIM(status_anterior)) = ANY (valid_journey_statuses))
      );

    ALTER TABLE public.assistido_status_history
      ALTER COLUMN status_novo SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.patients.status IS
  'Legacy operational status kept for compatibility.';

COMMENT ON COLUMN public.patients.status_jornada IS
  'Official institutional journey status. Source of truth for the care flow.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_status_jornada_domain_check'
      AND conrelid = 'public.patients'::regclass
  ) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_status_jornada_domain_check
      CHECK (
        status_jornada IN (
          'em_fila_espera',
          'entrevista_realizada',
          'em_avaliacao',
          'em_analise_vaga',
          'aprovado',
          'encaminhado',
          'matriculado',
          'ativo',
          'inativo_assistencial',
          'desligado'
        )
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'assistido_status_history'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'assistido_status_history_status_novo_domain_check'
        AND conrelid = 'public.assistido_status_history'::regclass
    ) THEN
      ALTER TABLE public.assistido_status_history
        ADD CONSTRAINT assistido_status_history_status_novo_domain_check
        CHECK (
          status_novo IN (
            'em_fila_espera',
            'entrevista_realizada',
            'em_avaliacao',
            'em_analise_vaga',
            'aprovado',
            'encaminhado',
            'matriculado',
            'ativo',
            'inativo_assistencial',
            'desligado'
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'assistido_status_history_status_anterior_domain_check'
        AND conrelid = 'public.assistido_status_history'::regclass
    ) THEN
      ALTER TABLE public.assistido_status_history
        ADD CONSTRAINT assistido_status_history_status_anterior_domain_check
        CHECK (
          status_anterior IS NULL
          OR status_anterior IN (
            'em_fila_espera',
            'entrevista_realizada',
            'em_avaliacao',
            'em_analise_vaga',
            'aprovado',
            'encaminhado',
            'matriculado',
            'ativo',
            'inativo_assistencial',
            'desligado'
          )
        );
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_patients_status_jornada
  ON public.patients (status_jornada);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'assistido_status_history'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_assistido_status_history_assistido
      ON public.assistido_status_history (assistido_id, changed_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_assistido_status_history_changed_by
      ON public.assistido_status_history (changed_by)';
  END IF;
END $$;

COMMIT;
