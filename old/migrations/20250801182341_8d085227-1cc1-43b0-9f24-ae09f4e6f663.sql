-- Criar função para dar permissões totais ao admin automaticamente
CREATE OR REPLACE FUNCTION public.grant_admin_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Se o usuário é Coordenador Geral, dar todas as permissões
  IF NEW.role = 'Coordenador Geral' AND NEW.status = 'ativo' THEN
    -- Inserir todas as combinações de módulo + permissão para este admin
    INSERT INTO public.user_permissions (user_id, module_id, permission_id, granted_by)
    SELECT 
      NEW.id,
      m.id,
      p.id,
      NEW.id
    FROM public.modules m
    CROSS JOIN public.permissions p
    ON CONFLICT (user_id, module_id, permission_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para aplicar permissões automáticas
CREATE TRIGGER auto_grant_admin_permissions
  AFTER INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_admin_permissions();

-- Aplicar permissões para admins existentes
INSERT INTO public.user_permissions (user_id, module_id, permission_id, granted_by)
SELECT 
  u.id,
  m.id,
  p.id,
  u.id
FROM public.users u
CROSS JOIN public.modules m
CROSS JOIN public.permissions p
WHERE u.role = 'Coordenador Geral' AND u.status = 'ativo'
ON CONFLICT (user_id, module_id, permission_id) DO NOTHING;