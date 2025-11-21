-- Atualizar usuário admin existente
UPDATE public.users 
SET 
  email = 'admin@admin.com',
  name = 'Administrador',
  role = 'Coordenador Geral',
  status = 'ativo',
  updated_at = now()
WHERE username = 'admin';

-- Inserir na tabela auth.users se não existir
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
SELECT 
  (SELECT id FROM public.users WHERE username = 'admin'),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'admin@admin.com',
  crypt('admin', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'admin@admin.com'
);