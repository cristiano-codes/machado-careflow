-- Inserir o usuário admin na tabela auth.users
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
  email_change,
  aud,
  role
) VALUES (
  'd1aa940b-2c48-4d29-bdfa-9b4ec08fe409'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'admin@admin.com',
  crypt('admin', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  '',
  '',
  '',
  'authenticated',
  'authenticated'
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  updated_at = now();