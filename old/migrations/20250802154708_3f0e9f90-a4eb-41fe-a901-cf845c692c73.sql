-- Criar usuário admin nativo automaticamente
INSERT INTO public.users (
  id,
  email,
  username,
  name,
  role,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@lovable.ia',
  'admin',
  'Administrador do Sistema',
  'Coordenador Geral',
  'ativo',
  now(),
  now()
) ON CONFLICT (email) DO NOTHING;

-- Garantir que o admin tenha todas as permissões
INSERT INTO public.user_permissions (user_id, module_id, permission_id, granted_by)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  m.id,
  p.id,
  '00000000-0000-0000-0000-000000000001'
FROM public.modules m
CROSS JOIN public.permissions p
ON CONFLICT (user_id, module_id, permission_id) DO NOTHING;

-- Criar função para proteger o usuário admin contra deleção
CREATE OR REPLACE FUNCTION public.protect_admin_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevenir deleção do usuário admin nativo
  IF OLD.id = '00000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'O usuário administrador do sistema não pode ser deletado';
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para proteger admin
DROP TRIGGER IF EXISTS protect_admin_deletion ON public.users;
CREATE TRIGGER protect_admin_deletion
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_admin_user();

-- Atualizar função para conceder permissões automáticas aos admins
CREATE OR REPLACE FUNCTION public.grant_admin_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Se o usuário é Coordenador Geral, dar todas as permissões
  IF NEW.role = 'Coordenador Geral' AND NEW.status = 'ativo' THEN
    -- Inserir todas as combinações de módulo + permissão para este admin
    INSERT INTO public.user_permissions (user_id, module_id, permission_id, granted_by)
    SELECT 
      NEW.id,
      m.id,
      p.id,
      COALESCE(NEW.id, '00000000-0000-0000-0000-000000000001')
    FROM public.modules m
    CROSS JOIN public.permissions p
    ON CONFLICT (user_id, module_id, permission_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;