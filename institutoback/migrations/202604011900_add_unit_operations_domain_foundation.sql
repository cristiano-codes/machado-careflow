BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

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
VALUES
  ('salas', 'Salas da Unidade', 'Gestao de salas fisicas da operacao de turmas'),
  ('atividades_unidade', 'Atividades da Unidade', 'Catalogo operacional de atividades da unidade'),
  ('turmas', 'Turmas da Unidade', 'Gestao de turmas e capacidade operacional'),
  ('grade', 'Grade Operacional', 'Gestao de alocacoes e grade semanal de turmas'),
  ('matriculas', 'Matriculas de Turmas', 'Gestao de matriculas de assistidos em turmas')
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

INSERT INTO public.permissions (name, display_name, description)
VALUES
  ('view', 'Visualizar', 'Permite visualizar registros do modulo'),
  ('create', 'Criar', 'Permite criar novos registros no modulo'),
  ('edit', 'Editar', 'Permite editar registros existentes no modulo'),
  ('status', 'Alterar status', 'Permite alterar status operacionais do modulo'),
  ('allocate', 'Alocar grade', 'Permite gerenciar alocacoes e grade operacional'),
  ('enroll', 'Matricular', 'Permite matricular e remanejar assistidos em turmas'),
  ('attendance', 'Registrar frequencia', 'Permite registrar presenca/frequencia'),
  ('report', 'Relatorios', 'Permite gerar relatorios operacionais do modulo')
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

DO $$
DECLARE
  professionals_id_type text;
  patients_id_type text;
BEGIN
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

  IF professionals_id_type IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel inferir o tipo de public.professionals.id';
  END IF;

  IF patients_id_type IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel inferir o tipo de public.patients.id';
  END IF;

  EXECUTE '
    CREATE TABLE IF NOT EXISTS public.institution_units (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      codigo text,
      nome text NOT NULL,
      ativo boolean NOT NULL DEFAULT true,
      observacoes text,
      created_by text,
      updated_by text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT institution_units_nome_not_blank CHECK (btrim(nome) <> '''')
    )
  ';

  EXECUTE '
    CREATE TABLE IF NOT EXISTS public.unit_rooms (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      unit_id text NOT NULL,
      codigo text NOT NULL,
      nome text NOT NULL,
      nome_conhecido text,
      descricao text,
      tipo text NOT NULL,
      capacidade_total integer NOT NULL,
      capacidade_recomendada integer NOT NULL,
      localizacao_interna text,
      especialidade_principal text,
      uso_preferencial text,
      permite_uso_compartilhado boolean NOT NULL DEFAULT true,
      status text NOT NULL DEFAULT ''ativa'',
      acessibilidade text,
      equipamentos jsonb NOT NULL DEFAULT ''[]''::jsonb,
      observacoes text,
      ativo boolean NOT NULL DEFAULT true,
      created_by text,
      updated_by text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT unit_rooms_unit_fk
        FOREIGN KEY (unit_id) REFERENCES public.institution_units(id) ON DELETE RESTRICT,
      CONSTRAINT unit_rooms_codigo_not_blank CHECK (btrim(codigo) <> ''''),
      CONSTRAINT unit_rooms_nome_not_blank CHECK (btrim(nome) <> ''''),
      CONSTRAINT unit_rooms_tipo_check
        CHECK (tipo IN (''terapia'', ''multifuncional'', ''pedagogica'', ''sensorial'', ''movimento'', ''apoio'')),
      CONSTRAINT unit_rooms_status_check
        CHECK (status IN (''ativa'', ''manutencao'', ''inativa'')),
      CONSTRAINT unit_rooms_capacity_total_check CHECK (capacidade_total > 0),
      CONSTRAINT unit_rooms_capacity_recommended_check
        CHECK (capacidade_recomendada > 0 AND capacidade_recomendada <= capacidade_total),
      CONSTRAINT unit_rooms_equipamentos_array_check CHECK (jsonb_typeof(equipamentos) = ''array'')
    )
  ';

  EXECUTE '
    CREATE TABLE IF NOT EXISTS public.unit_activities (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      nome text NOT NULL,
      categoria text NOT NULL,
      descricao text,
      duracao_padrao_minutos integer NOT NULL,
      modalidade text NOT NULL,
      faixa_etaria_sugerida text,
      atendimento_tipo text NOT NULL,
      exige_sala_especifica boolean NOT NULL DEFAULT false,
      exige_equipamento boolean NOT NULL DEFAULT false,
      cor_identificacao text NOT NULL DEFAULT ''#1d4ed8'',
      status text NOT NULL DEFAULT ''ativa'',
      observacoes text,
      ativo boolean NOT NULL DEFAULT true,
      created_by text,
      updated_by text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT unit_activities_nome_not_blank CHECK (btrim(nome) <> ''''),
      CONSTRAINT unit_activities_categoria_check
        CHECK (categoria IN (''terapeutica'', ''pedagogica'', ''assistencial'', ''expressiva'', ''autonomia'')),
      CONSTRAINT unit_activities_modalidade_check
        CHECK (modalidade IN (''presencial'', ''hibrido'', ''externo'')),
      CONSTRAINT unit_activities_atendimento_tipo_check
        CHECK (atendimento_tipo IN (''individual'', ''grupo'')),
      CONSTRAINT unit_activities_status_check
        CHECK (status IN (''ativa'', ''inativa'', ''em_revisao'')),
      CONSTRAINT unit_activities_duracao_check CHECK (duracao_padrao_minutos > 0)
    )
  ';

  EXECUTE format(
    '
      CREATE TABLE IF NOT EXISTS public.unit_classes (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        unit_id text NOT NULL,
        nome text NOT NULL,
        activity_id text NOT NULL,
        descricao text,
        objetivo text,
        publico_alvo text,
        faixa_etaria text,
        capacidade_minima integer NOT NULL,
        capacidade_ideal integer NOT NULL,
        capacidade_maxima integer NOT NULL,
        status text NOT NULL DEFAULT ''planejada'',
        data_inicio date NOT NULL,
        data_termino date,
        professional_principal_id %1$s NOT NULL,
        professional_apoio_id %1$s,
        exige_sala_especifica boolean NOT NULL DEFAULT false,
        projeto_convenio text,
        observacoes text,
        ativo boolean NOT NULL DEFAULT true,
        created_by text,
        updated_by text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT unit_classes_unit_fk
          FOREIGN KEY (unit_id) REFERENCES public.institution_units(id) ON DELETE RESTRICT,
        CONSTRAINT unit_classes_activity_fk
          FOREIGN KEY (activity_id) REFERENCES public.unit_activities(id) ON DELETE RESTRICT,
        CONSTRAINT unit_classes_professional_principal_fk
          FOREIGN KEY (professional_principal_id) REFERENCES public.professionals(id) ON DELETE RESTRICT,
        CONSTRAINT unit_classes_professional_apoio_fk
          FOREIGN KEY (professional_apoio_id) REFERENCES public.professionals(id) ON DELETE SET NULL,
        CONSTRAINT unit_classes_nome_not_blank CHECK (btrim(nome) <> ''''),
        CONSTRAINT unit_classes_status_check
          CHECK (status IN (''ativa'', ''planejada'', ''pausada'', ''encerrada'')),
        CONSTRAINT unit_classes_capacity_check
          CHECK (
            capacidade_minima > 0
            AND capacidade_ideal >= capacidade_minima
            AND capacidade_maxima >= capacidade_ideal
          ),
        CONSTRAINT unit_classes_date_window_check
          CHECK (data_termino IS NULL OR data_termino >= data_inicio)
      )
    ',
    professionals_id_type
  );

  EXECUTE format(
    '
      CREATE TABLE IF NOT EXISTS public.unit_class_staff (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        class_id text NOT NULL,
        professional_id %1$s NOT NULL,
        papel text NOT NULL,
        status text NOT NULL DEFAULT ''ativo'',
        data_inicio date NOT NULL DEFAULT CURRENT_DATE,
        data_fim date,
        observacoes text,
        created_by text,
        updated_by text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT unit_class_staff_class_fk
          FOREIGN KEY (class_id) REFERENCES public.unit_classes(id) ON DELETE CASCADE,
        CONSTRAINT unit_class_staff_professional_fk
          FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE RESTRICT,
        CONSTRAINT unit_class_staff_papel_check
          CHECK (papel IN (''principal'', ''apoio'', ''auxiliar'', ''coordenador'')),
        CONSTRAINT unit_class_staff_status_check
          CHECK (status IN (''ativo'', ''inativo'')),
        CONSTRAINT unit_class_staff_date_window_check
          CHECK (data_fim IS NULL OR data_fim >= data_inicio)
      )
    ',
    professionals_id_type
  );

  EXECUTE format(
    '
      CREATE TABLE IF NOT EXISTS public.unit_class_schedule_slots (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        class_id text NOT NULL,
        weekday text NOT NULL,
        hora_inicial time NOT NULL,
        hora_final time NOT NULL,
        room_id text NOT NULL,
        professional_id %1$s NOT NULL,
        recorrencia text NOT NULL DEFAULT ''semanal'',
        status text NOT NULL DEFAULT ''planejada'',
        vigencia_inicio date NOT NULL,
        vigencia_fim date,
        observacao text,
        ativo boolean NOT NULL DEFAULT true,
        created_by text,
        updated_by text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT unit_class_schedule_slots_class_fk
          FOREIGN KEY (class_id) REFERENCES public.unit_classes(id) ON DELETE CASCADE,
        CONSTRAINT unit_class_schedule_slots_room_fk
          FOREIGN KEY (room_id) REFERENCES public.unit_rooms(id) ON DELETE RESTRICT,
        CONSTRAINT unit_class_schedule_slots_professional_fk
          FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE RESTRICT,
        CONSTRAINT unit_class_schedule_slots_weekday_check
          CHECK (weekday IN (''seg'', ''ter'', ''qua'', ''qui'', ''sex'', ''sab'', ''dom'')),
        CONSTRAINT unit_class_schedule_slots_time_window_check
          CHECK (hora_final > hora_inicial),
        CONSTRAINT unit_class_schedule_slots_recurrence_check
          CHECK (recorrencia IN (''semanal'', ''quinzenal'', ''mensal'')),
        CONSTRAINT unit_class_schedule_slots_status_check
          CHECK (status IN (''ativa'', ''planejada'', ''suspensa'')),
        CONSTRAINT unit_class_schedule_slots_date_window_check
          CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
      )
    ',
    professionals_id_type
  );

  EXECUTE format(
    '
      CREATE TABLE IF NOT EXISTS public.unit_class_enrollments (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        class_id text NOT NULL,
        patient_id %1$s NOT NULL,
        status text NOT NULL DEFAULT ''ativo'',
        data_entrada date NOT NULL,
        data_saida date,
        prioridade text NOT NULL DEFAULT ''media'',
        origem_encaminhamento text,
        observacao text,
        ativo boolean NOT NULL DEFAULT true,
        created_by text,
        updated_by text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT unit_class_enrollments_class_fk
          FOREIGN KEY (class_id) REFERENCES public.unit_classes(id) ON DELETE CASCADE,
        CONSTRAINT unit_class_enrollments_patient_fk
          FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT,
        CONSTRAINT unit_class_enrollments_status_check
          CHECK (status IN (''ativo'', ''aguardando_vaga'', ''suspenso'', ''desligado'', ''concluido'')),
        CONSTRAINT unit_class_enrollments_prioridade_check
          CHECK (prioridade IN (''alta'', ''media'', ''baixa'')),
        CONSTRAINT unit_class_enrollments_date_window_check
          CHECK (data_saida IS NULL OR data_saida >= data_entrada)
      )
    ',
    patients_id_type
  );
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_units_nome_unique
  ON public.institution_units (LOWER(nome));

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_rooms_unit_codigo_unique
  ON public.unit_rooms (unit_id, LOWER(codigo));

CREATE INDEX IF NOT EXISTS idx_unit_rooms_unit
  ON public.unit_rooms (unit_id);

CREATE INDEX IF NOT EXISTS idx_unit_rooms_status
  ON public.unit_rooms (status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_activities_nome_unique
  ON public.unit_activities (LOWER(nome));

CREATE INDEX IF NOT EXISTS idx_unit_activities_status
  ON public.unit_activities (status);

CREATE INDEX IF NOT EXISTS idx_unit_activities_categoria
  ON public.unit_activities (categoria);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_classes_unit_nome_data_inicio_unique
  ON public.unit_classes (unit_id, LOWER(nome), data_inicio);

CREATE INDEX IF NOT EXISTS idx_unit_classes_unit
  ON public.unit_classes (unit_id);

CREATE INDEX IF NOT EXISTS idx_unit_classes_activity
  ON public.unit_classes (activity_id);

CREATE INDEX IF NOT EXISTS idx_unit_classes_prof_principal
  ON public.unit_classes (professional_principal_id);

CREATE INDEX IF NOT EXISTS idx_unit_class_staff_class
  ON public.unit_class_staff (class_id);

CREATE INDEX IF NOT EXISTS idx_unit_class_staff_professional
  ON public.unit_class_staff (professional_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_class_staff_active_unique
  ON public.unit_class_staff (class_id, professional_id, papel)
  WHERE status = 'ativo' AND data_fim IS NULL;

CREATE INDEX IF NOT EXISTS idx_unit_class_schedule_slots_class
  ON public.unit_class_schedule_slots (class_id);

CREATE INDEX IF NOT EXISTS idx_unit_class_schedule_slots_room
  ON public.unit_class_schedule_slots (room_id);

CREATE INDEX IF NOT EXISTS idx_unit_class_schedule_slots_professional
  ON public.unit_class_schedule_slots (professional_id);

CREATE INDEX IF NOT EXISTS idx_unit_class_schedule_slots_weekday_starts
  ON public.unit_class_schedule_slots (weekday, hora_inicial);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unit_class_schedule_slots_room_conflict_excl'
  ) THEN
    ALTER TABLE public.unit_class_schedule_slots
      ADD CONSTRAINT unit_class_schedule_slots_room_conflict_excl
      EXCLUDE USING gist (
        weekday WITH =,
        room_id WITH =,
        daterange(vigencia_inicio, COALESCE(vigencia_fim, 'infinity'::date), '[]') WITH &&,
        int4range(
          (EXTRACT(HOUR FROM hora_inicial)::int * 60 + EXTRACT(MINUTE FROM hora_inicial)::int),
          (EXTRACT(HOUR FROM hora_final)::int * 60 + EXTRACT(MINUTE FROM hora_final)::int),
          '[)'
        ) WITH &&
      )
      WHERE (ativo = true AND status IN ('ativa', 'planejada'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unit_class_schedule_slots_prof_conflict_excl'
  ) THEN
    ALTER TABLE public.unit_class_schedule_slots
      ADD CONSTRAINT unit_class_schedule_slots_prof_conflict_excl
      EXCLUDE USING gist (
        weekday WITH =,
        professional_id WITH =,
        daterange(vigencia_inicio, COALESCE(vigencia_fim, 'infinity'::date), '[]') WITH &&,
        int4range(
          (EXTRACT(HOUR FROM hora_inicial)::int * 60 + EXTRACT(MINUTE FROM hora_inicial)::int),
          (EXTRACT(HOUR FROM hora_final)::int * 60 + EXTRACT(MINUTE FROM hora_final)::int),
          '[)'
        ) WITH &&
      )
      WHERE (ativo = true AND status IN ('ativa', 'planejada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_unit_class_enrollments_class
  ON public.unit_class_enrollments (class_id);

CREATE INDEX IF NOT EXISTS idx_unit_class_enrollments_patient
  ON public.unit_class_enrollments (patient_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_class_enrollments_active_unique
  ON public.unit_class_enrollments (class_id, patient_id)
  WHERE ativo = true
    AND status IN ('ativo', 'aguardando_vaga')
    AND data_saida IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_institution_units_updated_at'
  ) THEN
    CREATE TRIGGER update_institution_units_updated_at
      BEFORE UPDATE ON public.institution_units
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_unit_rooms_updated_at'
  ) THEN
    CREATE TRIGGER update_unit_rooms_updated_at
      BEFORE UPDATE ON public.unit_rooms
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_unit_activities_updated_at'
  ) THEN
    CREATE TRIGGER update_unit_activities_updated_at
      BEFORE UPDATE ON public.unit_activities
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_unit_classes_updated_at'
  ) THEN
    CREATE TRIGGER update_unit_classes_updated_at
      BEFORE UPDATE ON public.unit_classes
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_unit_class_staff_updated_at'
  ) THEN
    CREATE TRIGGER update_unit_class_staff_updated_at
      BEFORE UPDATE ON public.unit_class_staff
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_unit_class_schedule_slots_updated_at'
  ) THEN
    CREATE TRIGGER update_unit_class_schedule_slots_updated_at
      BEFORE UPDATE ON public.unit_class_schedule_slots
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_unit_class_enrollments_updated_at'
  ) THEN
    CREATE TRIGGER update_unit_class_enrollments_updated_at
      BEFORE UPDATE ON public.unit_class_enrollments
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

INSERT INTO public.institution_units (id, codigo, nome, ativo, observacoes)
SELECT 'u-centro', 'CENTRO', 'Unidade Centro', true, 'Unidade base inicial da operacao de turmas.'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.institution_units
  WHERE LOWER(nome) = LOWER('Unidade Centro')
);

INSERT INTO public.institution_units (id, codigo, nome, ativo, observacoes)
SELECT 'u-norte', 'NORTE', 'Unidade Norte', true, 'Unidade secundaria para expansao operacional.'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.institution_units
  WHERE LOWER(nome) = LOWER('Unidade Norte')
);

INSERT INTO public.user_permissions (user_id, module_id, permission_id, granted_by)
SELECT
  u.id,
  m.id,
  p.id,
  NULL
FROM public.users u
JOIN public.modules m
  ON LOWER(m.name) IN ('salas', 'atividades_unidade', 'turmas', 'grade', 'matriculas')
JOIN public.permissions p
  ON LOWER(p.name) IN ('view', 'create', 'edit', 'status', 'allocate', 'enroll', 'report')
WHERE LOWER(COALESCE(u.role, '')) IN ('coordenador geral', 'administrador', 'admin', 'gestao', 'gestão', 'gestor')
ON CONFLICT (user_id, module_id, permission_id) DO NOTHING;

COMMIT;

