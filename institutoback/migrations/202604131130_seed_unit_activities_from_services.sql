BEGIN;

DO $$
DECLARE
  has_unit_activities_table boolean := false;
  has_services_table boolean := false;
  has_active_activities boolean := false;
  candidates_count integer := 0;
  final_active_count integer := 0;
  seed_actor constant text := 'migration:202604131130_seed_unit_activities_from_services';
BEGIN
  SELECT to_regclass('public.unit_activities') IS NOT NULL INTO has_unit_activities_table;

  IF NOT has_unit_activities_table THEN
    RAISE NOTICE '[seed_unit_activities] tabela public.unit_activities inexistente. Seed ignorado.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.unit_activities
    WHERE ativo = true
  ) INTO has_active_activities;

  IF has_active_activities THEN
    RAISE NOTICE '[seed_unit_activities] ja existem atividades ativas. Nenhuma alteracao aplicada.';
    RETURN;
  END IF;

  CREATE TEMP TABLE _seed_unit_activities_candidates (
    nome text NOT NULL,
    nome_normalizado text PRIMARY KEY,
    categoria text NOT NULL,
    descricao text,
    duracao_padrao_minutos integer NOT NULL,
    modalidade text NOT NULL,
    atendimento_tipo text NOT NULL,
    observacoes text
  ) ON COMMIT DROP;

  SELECT to_regclass('public.services') IS NOT NULL INTO has_services_table;

  IF has_services_table THEN
    INSERT INTO _seed_unit_activities_candidates (
      nome,
      nome_normalizado,
      categoria,
      descricao,
      duracao_padrao_minutos,
      modalidade,
      atendimento_tipo,
      observacoes
    )
    SELECT DISTINCT ON (LOWER(BTRIM(s.name)))
      BTRIM(s.name) AS nome,
      LOWER(BTRIM(s.name)) AS nome_normalizado,
      'assistencial' AS categoria,
      NULLIF(BTRIM(COALESCE(s.description, '')), '') AS descricao,
      GREATEST(COALESCE(s.duration, 50), 1) AS duracao_padrao_minutos,
      'presencial' AS modalidade,
      'grupo' AS atendimento_tipo,
      FORMAT('Seed inicial via public.services (service_id=%s)', s.id::text) AS observacoes
    FROM public.services s
    WHERE s.active = true
      AND BTRIM(COALESCE(s.name, '')) <> ''
    ORDER BY LOWER(BTRIM(s.name)), s.id
    ON CONFLICT (nome_normalizado) DO NOTHING;
  END IF;

  SELECT COUNT(*)
    INTO candidates_count
  FROM _seed_unit_activities_candidates;

  IF candidates_count = 0 THEN
    INSERT INTO _seed_unit_activities_candidates (
      nome,
      nome_normalizado,
      categoria,
      descricao,
      duracao_padrao_minutos,
      modalidade,
      atendimento_tipo,
      observacoes
    )
    VALUES
      (
        'Acolhimento Social',
        LOWER('Acolhimento Social'),
        'assistencial',
        'Atendimento inicial e escuta qualificada.',
        50,
        'presencial',
        'individual',
        'Seed inicial padrao sem services ativas.'
      ),
      (
        'Oficina Pedagogica',
        LOWER('Oficina Pedagogica'),
        'pedagogica',
        'Atividade em grupo para desenvolvimento pedagogico.',
        60,
        'presencial',
        'grupo',
        'Seed inicial padrao sem services ativas.'
      ),
      (
        'Grupo de Convivencia',
        LOWER('Grupo de Convivencia'),
        'expressiva',
        'Dinamicas coletivas para socializacao e convivencia.',
        60,
        'presencial',
        'grupo',
        'Seed inicial padrao sem services ativas.'
      ),
      (
        'Praticas de Autonomia',
        LOWER('Praticas de Autonomia'),
        'autonomia',
        'Praticas orientadas para autonomia no cotidiano.',
        50,
        'presencial',
        'grupo',
        'Seed inicial padrao sem services ativas.'
      )
    ON CONFLICT (nome_normalizado) DO NOTHING;
  END IF;

  UPDATE public.unit_activities ua
     SET ativo = true,
         status = 'ativa',
         updated_at = NOW(),
         updated_by = seed_actor
    FROM _seed_unit_activities_candidates c
   WHERE LOWER(ua.nome) = c.nome_normalizado
     AND (ua.ativo IS DISTINCT FROM true OR ua.status IS DISTINCT FROM 'ativa');

  INSERT INTO public.unit_activities (
    nome,
    categoria,
    descricao,
    duracao_padrao_minutos,
    modalidade,
    atendimento_tipo,
    status,
    observacoes,
    ativo,
    created_by,
    updated_by
  )
  SELECT
    c.nome,
    c.categoria,
    c.descricao,
    c.duracao_padrao_minutos,
    c.modalidade,
    c.atendimento_tipo,
    'ativa' AS status,
    c.observacoes,
    true AS ativo,
    seed_actor AS created_by,
    seed_actor AS updated_by
  FROM _seed_unit_activities_candidates c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.unit_activities ua
    WHERE LOWER(ua.nome) = c.nome_normalizado
  );

  SELECT COUNT(*)
    INTO final_active_count
  FROM public.unit_activities
  WHERE ativo = true;

  RAISE NOTICE '[seed_unit_activities] seed concluido. atividades ativas apos execucao: %', final_active_count;
END $$;

COMMIT;
