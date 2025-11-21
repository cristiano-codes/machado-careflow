-- Create system_settings table for institutional configurations
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instituicao_nome text NOT NULL DEFAULT 'Instituto Lauir Machado',
  instituicao_email text NOT NULL DEFAULT 'contato@institutolauir.com.br',
  instituicao_telefone text DEFAULT '(11) 3456-7890',
  instituicao_endereco text DEFAULT 'Rua das Flores, 123 - São Paulo, SP',
  email_notifications boolean NOT NULL DEFAULT true,
  sms_notifications boolean NOT NULL DEFAULT false,
  push_notifications boolean NOT NULL DEFAULT true,
  weekly_reports boolean NOT NULL DEFAULT true,
  two_factor_auth boolean NOT NULL DEFAULT false,
  password_expiry_days integer NOT NULL DEFAULT 90,
  max_login_attempts integer NOT NULL DEFAULT 3,
  session_timeout integer NOT NULL DEFAULT 60,
  backup_frequency text NOT NULL DEFAULT 'daily',
  data_retention_days integer NOT NULL DEFAULT 365,
  auto_updates boolean NOT NULL DEFAULT true,
  debug_mode boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Create policies - only admins can manage system settings
CREATE POLICY "Admins can view system settings" 
ON public.system_settings 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.users 
  WHERE users.id = auth.uid() 
  AND users.role = 'Coordenador Geral'
));

CREATE POLICY "Admins can update system settings" 
ON public.system_settings 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.users 
  WHERE users.id = auth.uid() 
  AND users.role = 'Coordenador Geral'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users 
  WHERE users.id = auth.uid() 
  AND users.role = 'Coordenador Geral'
));

CREATE POLICY "Admins can insert system settings" 
ON public.system_settings 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users 
  WHERE users.id = auth.uid() 
  AND users.role = 'Coordenador Geral'
));

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings row (singleton pattern)
INSERT INTO public.system_settings (instituicao_nome, instituicao_email) 
VALUES ('Instituto Lauir Machado', 'contato@institutolauir.com.br');