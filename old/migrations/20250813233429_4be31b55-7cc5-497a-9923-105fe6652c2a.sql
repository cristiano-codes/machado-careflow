-- Configurações de segurança para autenticação
-- Estas configurações serão aplicadas via SQL quando possível

-- 1. Configurar tempo de expiração de OTP mais seguro (6 minutos = 360 segundos)
UPDATE auth.config 
SET 
  otp_expiry = 360,
  password_min_length = 8
WHERE true;

-- 2. Configurar políticas de senha mais rígidas
-- Isto será feito via interface do Supabase, mas vamos criar uma função para validar senhas fortes
CREATE OR REPLACE FUNCTION public.validate_password_strength(password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verificar se a senha tem pelo menos 8 caracteres
  IF LENGTH(password) < 8 THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar se tem pelo menos uma letra maiúscula
  IF password !~ '[A-Z]' THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar se tem pelo menos uma letra minúscula
  IF password !~ '[a-z]' THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar se tem pelo menos um número
  IF password !~ '[0-9]' THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar se tem pelo menos um caractere especial
  IF password !~ '[^A-Za-z0-9]' THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- 3. Configurar taxa limite para tentativas de login
-- Esta função pode ser usada para implementar rate limiting
CREATE OR REPLACE FUNCTION public.check_login_attempts(user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attempt_count INTEGER;
BEGIN
  -- Contar tentativas de login nos últimos 15 minutos
  SELECT COUNT(*)
  INTO attempt_count
  FROM auth.audit_log_entries
  WHERE 
    payload->>'email' = user_email
    AND event_name = 'user_signedin_failed'
    AND created_at > NOW() - INTERVAL '15 minutes';
  
  -- Permitir apenas 5 tentativas por 15 minutos
  RETURN attempt_count < 5;
END;
$$;

-- 4. Função para limpar tokens expirados
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Esta função pode ser chamada periodicamente para limpar tokens expirados
  -- A limpeza real dos tokens é gerenciada pelo Supabase automaticamente
  -- Mas podemos registrar a ação
  INSERT INTO public.system_settings (instituicao_nome, updated_by) 
  VALUES ('Token cleanup executed', NULL) 
  ON CONFLICT (id) DO NOTHING;
END;
$$;