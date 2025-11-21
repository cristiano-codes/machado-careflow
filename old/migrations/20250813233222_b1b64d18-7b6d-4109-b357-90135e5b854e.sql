-- Corrigir search_path para todas as funções existentes
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, username)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name'),
    NEW.email
  );
  RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.protect_admin_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Prevenir deleção do usuário admin nativo
  IF OLD.username = 'admin' OR OLD.email = 'admin@lovable.ia' THEN
    RAISE EXCEPTION 'O usuário administrador do sistema não pode ser deletado';
  END IF;
  
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_user()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_json(u.*) 
  FROM public.users u 
  WHERE u.username = 'admin' 
  LIMIT 1;
$$;