-- Tabela para pacientes (pré-cadastros e cadastros completos)
CREATE TABLE public.patients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT UNIQUE,
  rg TEXT,
  date_of_birth DATE,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  address TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  profession TEXT,
  marital_status TEXT,
  education TEXT,
  insurance_plan TEXT,
  insurance_number TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pre_cadastro', -- 'pre_cadastro', 'ativo', 'inativo'
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para pré-agendamentos
CREATE TABLE public.pre_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  service_type TEXT NOT NULL,
  preferred_date DATE,
  preferred_time TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'canceled'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para serviços oferecidos
CREATE TABLE public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER, -- em minutos
  price DECIMAL(10,2),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para profissionais
CREATE TABLE public.professionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  crp TEXT, -- CRP para psicólogos
  specialty TEXT,
  bio TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para agendamentos
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  professional_id UUID NOT NULL REFERENCES public.professionals(id),
  service_id UUID REFERENCES public.services(id),
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'confirmed', 'completed', 'canceled', 'no_show'
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para entrevistas
CREATE TABLE public.interviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  professional_id UUID NOT NULL REFERENCES public.professionals(id),
  interview_date DATE NOT NULL,
  interview_time TIME NOT NULL,
  type TEXT NOT NULL, -- 'inicial', 'retorno', 'avaliacao', 'seguimento'
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'completed', 'canceled', 'pending'
  notes TEXT,
  report TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para avaliações
CREATE TABLE public.evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  professional_id UUID NOT NULL REFERENCES public.professionals(id),
  type TEXT NOT NULL, -- 'psicologica', 'neuropsicologica', 'vocacional', 'personalidade', 'cognitiva'
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'canceled'
  result TEXT,
  report TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para vagas de emprego
CREATE TABLE public.job_vacancies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT[],
  salary_range TEXT,
  type TEXT NOT NULL, -- 'clt', 'pj', 'estagio', 'temporario'
  level TEXT NOT NULL, -- 'junior', 'pleno', 'senior'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'filled', 'canceled'
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para candidatos de vagas
CREATE TABLE public.job_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vacancy_id UUID NOT NULL REFERENCES public.job_vacancies(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'in_analysis', 'approved', 'rejected'
  score INTEGER CHECK (score >= 0 AND score <= 100),
  notes TEXT,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para frequência/presença
CREATE TABLE public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  appointment_id UUID REFERENCES public.appointments(id),
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL, -- 'present', 'absent', 'justified', 'late'
  notes TEXT,
  recorded_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para transações financeiras
CREATE TABLE public.financial_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES public.patients(id),
  appointment_id UUID REFERENCES public.appointments(id),
  type TEXT NOT NULL, -- 'income', 'expense'
  category TEXT NOT NULL, -- 'consultation', 'evaluation', 'material', 'equipment', etc.
  amount DECIMAL(10,2) NOT NULL,
  description TEXT NOT NULL,
  payment_method TEXT, -- 'cash', 'card', 'pix', 'transfer', 'check'
  payment_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'canceled'
  due_date DATE,
  payment_date DATE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para relatórios
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL, -- 'attendance', 'financial', 'evaluations', 'custom'
  content JSONB, -- JSON com os dados do relatório
  file_url TEXT, -- URL do arquivo se exportado
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security em todas as tabelas
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para usuários autenticados
CREATE POLICY "Authenticated users have full access to patients" 
ON public.patients FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to pre_appointments" 
ON public.pre_appointments FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to services" 
ON public.services FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to professionals" 
ON public.professionals FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to appointments" 
ON public.appointments FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to interviews" 
ON public.interviews FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to evaluations" 
ON public.evaluations FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to job_vacancies" 
ON public.job_vacancies FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to job_candidates" 
ON public.job_candidates FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to attendance" 
ON public.attendance FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to financial_transactions" 
ON public.financial_transactions FOR ALL USING (is_authenticated());

CREATE POLICY "Authenticated users have full access to reports" 
ON public.reports FOR ALL USING (is_authenticated());

-- Triggers para updated_at
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pre_appointments_updated_at BEFORE UPDATE ON public.pre_appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_professionals_updated_at BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_evaluations_updated_at BEFORE UPDATE ON public.evaluations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_job_vacancies_updated_at BEFORE UPDATE ON public.job_vacancies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_job_candidates_updated_at BEFORE UPDATE ON public.job_candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_financial_transactions_updated_at BEFORE UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para melhorar performance
CREATE INDEX idx_patients_cpf ON public.patients(cpf);
CREATE INDEX idx_patients_status ON public.patients(status);
CREATE INDEX idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX idx_appointments_professional ON public.appointments(professional_id);
CREATE INDEX idx_interviews_date ON public.interviews(interview_date);
CREATE INDEX idx_evaluations_patient ON public.evaluations(patient_id);
CREATE INDEX idx_financial_transactions_date ON public.financial_transactions(due_date);
CREATE INDEX idx_financial_transactions_status ON public.financial_transactions(payment_status);
CREATE INDEX idx_attendance_date ON public.attendance(attendance_date);
CREATE INDEX idx_job_candidates_vacancy ON public.job_candidates(vacancy_id);

-- Inserir dados básicos de serviços
INSERT INTO public.services (name, description, duration, price) VALUES
('Avaliação Psicológica', 'Avaliação psicológica completa', 120, 200.00),
('Terapia Individual', 'Sessão de terapia individual', 50, 80.00),
('Terapia em Grupo', 'Sessão de terapia em grupo', 60, 50.00),
('Orientação Profissional', 'Orientação vocacional e profissional', 90, 120.00),
('Avaliação Neuropsicológica', 'Avaliação neuropsicológica completa', 180, 300.00),
('Avaliação Vocacional', 'Avaliação para orientação profissional', 90, 150.00);