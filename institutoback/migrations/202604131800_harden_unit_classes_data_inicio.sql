-- Auditoria e hardening seguro de public.unit_classes.data_inicio
-- Objetivo:
-- 1) evidenciar turmas ativas sem data_inicio
-- 2) permitir saneamento manual dos dados
-- 3) aplicar NOT NULL apenas quando nao houver pendencias

SELECT
  COUNT(*) AS total_turmas_ativas,
  COUNT(*) FILTER (WHERE data_inicio IS NULL) AS turmas_ativas_sem_data_inicio
FROM public.unit_classes
WHERE ativo = true;

SELECT
  id,
  unit_id,
  nome,
  status,
  data_inicio,
  data_termino,
  created_at,
  updated_at
FROM public.unit_classes
WHERE ativo = true
  AND data_inicio IS NULL
ORDER BY nome ASC;

-- Exemplo de saneamento manual (aplicar por turma apos validacao funcional):
-- UPDATE public.unit_classes
-- SET data_inicio = DATE '2026-01-01',
--     updated_at = NOW()
-- WHERE id = '<class-id>'
--   AND data_inicio IS NULL;

DO $$
DECLARE
  missing_total integer := 0;
  nullable_column boolean := false;
BEGIN
  IF to_regclass('public.unit_classes') IS NULL THEN
    RAISE NOTICE 'Tabela public.unit_classes nao encontrada. Hardening ignorado.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO missing_total
  FROM public.unit_classes
  WHERE data_inicio IS NULL;

  IF missing_total > 0 THEN
    RAISE NOTICE 'Hardening nao aplicado: % registro(s) em unit_classes ainda sem data_inicio.', missing_total;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'unit_classes'
      AND column_name = 'data_inicio'
      AND is_nullable = 'YES'
  )
  INTO nullable_column;

  IF nullable_column THEN
    EXECUTE 'ALTER TABLE public.unit_classes ALTER COLUMN data_inicio SET NOT NULL';
    RAISE NOTICE 'Hardening aplicado: public.unit_classes.data_inicio agora e NOT NULL.';
  ELSE
    RAISE NOTICE 'Hardening ja aplicado: public.unit_classes.data_inicio ja e NOT NULL.';
  END IF;
END
$$;
