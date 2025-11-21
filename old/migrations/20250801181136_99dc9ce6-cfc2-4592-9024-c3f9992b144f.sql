-- Criar tabela de módulos do sistema
CREATE TABLE public.modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de permissões
CREATE TABLE public.permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de usuários (migrar do sistema atual)
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) DEFAULT 'Usuário',
  status VARCHAR(20) DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de permissões de usuários
CREATE TABLE public.user_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_id, permission_id)
);

-- Habilitar RLS
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para modules (todos podem ver)
CREATE POLICY "Everyone can view modules" ON public.modules FOR SELECT USING (true);
CREATE POLICY "Only admins can manage modules" ON public.modules FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'Coordenador Geral'
  )
);

-- Políticas RLS para permissions (todos podem ver)
CREATE POLICY "Everyone can view permissions" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "Only admins can manage permissions" ON public.permissions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'Coordenador Geral'
  )
);

-- Políticas RLS para users
CREATE POLICY "Users can view their own data" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all users" ON public.users FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'Coordenador Geral'
  )
);
CREATE POLICY "Only admins can manage users" ON public.users FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'Coordenador Geral'
  )
);

-- Políticas RLS para user_permissions
CREATE POLICY "Users can view their own permissions" ON public.user_permissions FOR SELECT USING (
  auth.uid() = user_id
);
CREATE POLICY "Admins can view all permissions" ON public.user_permissions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'Coordenador Geral'
  )
);
CREATE POLICY "Only admins can manage user permissions" ON public.user_permissions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'Coordenador Geral'
  )
);

-- Inserir módulos padrão
INSERT INTO public.modules (name, display_name, description) VALUES
('dashboard', 'Dashboard', 'Painel principal do sistema'),
('pre_agendamento', 'Pré-Agendamento', 'Gestão de pré-agendamentos'),
('agenda', 'Agenda', 'Controle de agenda'),
('pre_cadastro', 'Pré-Cadastro', 'Gestão de pré-cadastros'),
('entrevistas', 'Entrevistas', 'Controle de entrevistas'),
('avaliacoes', 'Avaliações', 'Sistema de avaliações'),
('analise_vagas', 'Análise de Vagas', 'Análise e controle de vagas'),
('usuarios', 'Gerenciar Usuários', 'Administração de usuários'),
('configuracoes', 'Configurações', 'Configurações do sistema');

-- Inserir permissões padrão
INSERT INTO public.permissions (name, display_name, description) VALUES
('view', 'Visualizar', 'Pode visualizar registros'),
('create', 'Criar', 'Pode criar novos registros'),
('edit', 'Editar', 'Pode editar registros existentes'),
('delete', 'Excluir', 'Pode excluir registros');

-- Criar função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at na tabela users
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();