-- Corrigir função para definir search_path seguro
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;