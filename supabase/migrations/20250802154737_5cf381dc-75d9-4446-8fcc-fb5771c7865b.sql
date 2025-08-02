-- Atualizar o usuário admin existente para o novo email
UPDATE public.users 
SET 
  email = 'admin@lovable.ia',
  id = '00000000-0000-0000-0000-000000000001'
WHERE username = 'admin';

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
  IF OLD.id = '00000000-0000-0000-0000-000000000001' OR OLD.username = 'admin' THEN
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