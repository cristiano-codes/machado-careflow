-- Atualizar apenas o email do admin existente
UPDATE public.users 
SET email = 'admin@lovable.ia'
WHERE username = 'admin';

-- Criar função para proteger o usuário admin contra deleção
CREATE OR REPLACE FUNCTION public.protect_admin_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevenir deleção do usuário admin nativo
  IF OLD.username = 'admin' OR OLD.email = 'admin@lovable.ia' THEN
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