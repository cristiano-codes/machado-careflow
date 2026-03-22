BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS instituicao_cnpj text,
  ADD COLUMN IF NOT EXISTS instituicao_cep text,
  ADD COLUMN IF NOT EXISTS instituicao_cidade text,
  ADD COLUMN IF NOT EXISTS instituicao_estado text;

INSERT INTO public.modules (name, display_name, description)
VALUES (
  'convenios',
  'Convenios',
  'Cadastro administrativo de convenios e projetos da instituicao'
)
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

INSERT INTO public.permissions (name, display_name, description)
VALUES
  ('view', 'Visualizar', 'Permite visualizar registros do modulo'),
  ('create', 'Criar', 'Permite criar novos registros no modulo'),
  ('edit', 'Editar', 'Permite editar registros existentes no modulo')
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.convenios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  numero_projeto text,
  data_inicio date,
  data_fim date,
  status text NOT NULL DEFAULT 'ativo',
  quantidade_atendidos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_by text,
  updated_by text,
  CONSTRAINT convenios_status_check
    CHECK (status IN ('ativo', 'inativo')),
  CONSTRAINT convenios_quantidade_atendidos_check
    CHECK (quantidade_atendidos >= 0),
  CONSTRAINT convenios_intervalo_datas_check
    CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_convenios_status
  ON public.convenios (status);

CREATE INDEX IF NOT EXISTS idx_convenios_nome
  ON public.convenios (LOWER(nome));

CREATE INDEX IF NOT EXISTS idx_convenios_data_inicio
  ON public.convenios (data_inicio);

COMMIT;
