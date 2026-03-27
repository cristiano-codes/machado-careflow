BEGIN;

INSERT INTO public.modules (name, display_name, description)
VALUES (
  'fila_espera',
  'Fila de Espera',
  'Entrada inicial da demanda e controle operacional da fila de espera institucional'
)
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

WITH legacy_module AS (
  SELECT id
  FROM public.modules
  WHERE LOWER(name) = 'pre_agendamento'
  LIMIT 1
),
canonical_module AS (
  SELECT id
  FROM public.modules
  WHERE LOWER(name) = 'fila_espera'
  LIMIT 1
)
INSERT INTO public.user_permissions (user_id, module_id, permission_id, granted_by)
SELECT
  up.user_id,
  canonical_module.id,
  up.permission_id,
  up.granted_by
FROM public.user_permissions up
JOIN legacy_module ON legacy_module.id = up.module_id
CROSS JOIN canonical_module
ON CONFLICT (user_id, module_id, permission_id) DO NOTHING;

COMMIT;
