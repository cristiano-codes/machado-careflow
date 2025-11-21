-- Inserir o usuário admin na tabela public.users
INSERT INTO public.users (
  id,
  username,
  email,
  name,
  role,
  status,
  created_at,
  updated_at
) VALUES (
  'd1aa940b-2c48-4d29-bdfa-9b4ec08fe409'::uuid,
  'admin',
  'admin@admin.com',
  'Administrador',
  'Coordenador Geral',
  'ativo',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  updated_at = now();