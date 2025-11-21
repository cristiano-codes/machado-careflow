-- Criar usuário admin no banco de dados
INSERT INTO public.users (
  email,
  username, 
  name,
  role,
  status
) VALUES (
  'admin@instituto.com.br',
  'admin',
  'Administrador Geral',
  'Coordenador Geral',
  'ativo'
) ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  status = EXCLUDED.status;