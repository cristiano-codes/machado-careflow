BEGIN;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS funcao text,
  ADD COLUMN IF NOT EXISTS horas_semanais integer,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS tipo_contrato text,
  ADD COLUMN IF NOT EXISTS escala_semanal jsonb;

-- Default operacional do MVP: disponibilidade de segunda a sexta habilitada.
ALTER TABLE public.professionals
  ALTER COLUMN escala_semanal SET DEFAULT
    '{"seg": true, "ter": true, "qua": true, "qui": true, "sex": true}'::jsonb;

UPDATE public.professionals
SET escala_semanal = '{"seg": true, "ter": true, "qua": true, "qui": true, "sex": true}'::jsonb
WHERE escala_semanal IS NULL;

-- Compatibiliza status legado sem bloquear dados existentes.
UPDATE public.professionals
SET status = CASE
  WHEN status IS NULL THEN 'ATIVO'
  WHEN upper(status) IN ('ATIVO', 'INATIVO') THEN upper(status)
  WHEN lower(status) IN ('active', 'ativo', 'plantao', 'onboarding') THEN 'ATIVO'
  WHEN lower(status) IN ('inactive', 'inativo', 'afastado') THEN 'INATIVO'
  ELSE 'ATIVO'
END;

ALTER TABLE public.professionals
  ALTER COLUMN status SET DEFAULT 'ATIVO';

COMMIT;
