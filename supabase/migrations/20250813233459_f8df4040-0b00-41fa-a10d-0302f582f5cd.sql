-- Funções auxiliares de segurança (sem modificar configurações do auth)

-- Função para validar força de senha
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

-- Tabela para log de tentativas de login
CREATE TABLE public.login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Política para admins visualizarem logs
CREATE POLICY "Admins can view login attempts" 
ON public.login_attempts 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.users 
  WHERE users.id = auth.uid() 
  AND users.role = 'Coordenador Geral'
));

-- Índice para performance
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts(email, attempt_time);

-- Função para verificar tentativas de login
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(user_email TEXT, client_ip TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attempt_count INTEGER;
BEGIN
  -- Contar tentativas falhadas nos últimos 15 minutos
  SELECT COUNT(*)
  INTO attempt_count
  FROM public.login_attempts
  WHERE 
    email = user_email
    AND success = FALSE
    AND attempt_time > NOW() - INTERVAL '15 minutes';
  
  -- Permitir apenas 5 tentativas falhadas por 15 minutos
  RETURN attempt_count < 5;
END;
$$;

-- Função para registrar tentativa de login
CREATE OR REPLACE FUNCTION public.log_login_attempt(user_email TEXT, is_success BOOLEAN, client_ip TEXT DEFAULT NULL, client_user_agent TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.login_attempts (email, ip_address, user_agent, success, attempt_time)
  VALUES (user_email, client_ip::INET, client_user_agent, is_success, NOW());
  
  -- Limpar tentativas antigas (mais de 24 horas)
  DELETE FROM public.login_attempts 
  WHERE attempt_time < NOW() - INTERVAL '24 hours';
END;
$$;