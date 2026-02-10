BEGIN;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS business_hours jsonb,
  ADD COLUMN IF NOT EXISTS professionals_config jsonb;

ALTER TABLE public.system_settings
  ALTER COLUMN business_hours SET DEFAULT
    '{
      "opening_time": "08:00",
      "closing_time": "17:20",
      "lunch_break_minutes": 60,
      "operating_days": {
        "seg": true,
        "ter": true,
        "qua": true,
        "qui": true,
        "sex": true,
        "sab": false,
        "dom": false
      }
    }'::jsonb,
  ALTER COLUMN professionals_config SET DEFAULT
    '{
      "allowed_contract_types": ["CLT", "PJ", "Voluntário", "Estágio", "Temporário"],
      "suggested_weekly_hours": [20, 30, 40]
    }'::jsonb;

UPDATE public.system_settings
SET
  business_hours = COALESCE(
    business_hours,
    '{
      "opening_time": "08:00",
      "closing_time": "17:20",
      "lunch_break_minutes": 60,
      "operating_days": {
        "seg": true,
        "ter": true,
        "qua": true,
        "qui": true,
        "sex": true,
        "sab": false,
        "dom": false
      }
    }'::jsonb
  ),
  professionals_config = COALESCE(
    professionals_config,
    '{
      "allowed_contract_types": ["CLT", "PJ", "Voluntário", "Estágio", "Temporário"],
      "suggested_weekly_hours": [20, 30, 40]
    }'::jsonb
  );

-- Remove hardcode no schema; default de escala passa a vir de configuracao da instituicao via API.
ALTER TABLE public.professionals
  ALTER COLUMN escala_semanal DROP DEFAULT;

COMMIT;
