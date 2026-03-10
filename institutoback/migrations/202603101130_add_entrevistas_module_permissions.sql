BEGIN;

INSERT INTO public.modules (name, display_name, description)
SELECT
  'entrevistas',
  'Entrevistas Sociais',
  'Etapa institucional de entrevista social e consolidacao do dossie socioassistencial'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.modules
  WHERE LOWER(name) = 'entrevistas'
);

INSERT INTO public.permissions (name, display_name, description)
SELECT
  'view',
  'Visualizar',
  'Permite visualizar registros do modulo'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.permissions
  WHERE LOWER(name) = 'view'
);

INSERT INTO public.permissions (name, display_name, description)
SELECT
  'create',
  'Criar',
  'Permite criar novos registros no modulo'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.permissions
  WHERE LOWER(name) = 'create'
);

INSERT INTO public.permissions (name, display_name, description)
SELECT
  'edit',
  'Editar',
  'Permite editar registros existentes no modulo'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.permissions
  WHERE LOWER(name) = 'edit'
);

COMMIT;
