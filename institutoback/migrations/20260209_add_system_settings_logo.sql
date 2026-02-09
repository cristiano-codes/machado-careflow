-- Add persistent institutional logo fields to singleton settings
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS instituicao_logo_base64 text,
  ADD COLUMN IF NOT EXISTS instituicao_logo_updated_at timestamptz DEFAULT now();
