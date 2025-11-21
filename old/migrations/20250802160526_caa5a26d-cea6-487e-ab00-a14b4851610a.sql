-- Função para buscar admin sem restrições RLS
CREATE OR REPLACE FUNCTION public.get_admin_user()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_json(u.*) 
  FROM public.users u 
  WHERE u.username = 'admin' 
  LIMIT 1;
$$;