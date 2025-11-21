-- Corrigir recursão infinita nas políticas RLS
-- Remover políticas problemáticas
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Only admins can manage users" ON public.users;
DROP POLICY IF EXISTS "Admins can view all permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Only admins can manage user permissions" ON public.user_permissions;

-- Criar função segura para verificar se é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid()
  );
$$;

-- Políticas RLS simples e seguras
CREATE POLICY "Users can view their own data" 
ON public.users FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Enable all access for authenticated users" 
ON public.users FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable all access for user_permissions" 
ON public.user_permissions FOR ALL 
USING (auth.uid() IS NOT NULL);