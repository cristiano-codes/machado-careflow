-- Remover TODAS as políticas problemáticas da tabela users
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Only admins can manage users" ON public.users;
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.users;

-- Remover políticas problemáticas da tabela user_permissions
DROP POLICY IF EXISTS "Admins can view all permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Only admins can manage user permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Enable all access for user_permissions" ON public.user_permissions;

-- Criar função simples para verificar se usuário está autenticado
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

-- Política simples para usuários: permitir tudo para usuários autenticados
CREATE POLICY "Authenticated users have full access" 
ON public.users 
FOR ALL 
USING (public.is_authenticated());

-- Política simples para permissões: permitir tudo para usuários autenticados
CREATE POLICY "Authenticated users have full access to permissions" 
ON public.user_permissions 
FOR ALL 
USING (public.is_authenticated());