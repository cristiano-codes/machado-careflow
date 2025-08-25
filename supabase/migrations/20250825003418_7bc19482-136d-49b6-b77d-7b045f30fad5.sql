-- Inserir dados de demonstração nas tabelas existentes

-- Inserir serviços de demonstração
INSERT INTO public.services (name, description, duration, price, active) VALUES
('Avaliação Psicológica', 'Avaliação psicológica completa para crianças e adolescentes', 90, 250.00, true),
('Terapia Individual', 'Sessões individuais de psicoterapia', 50, 150.00, true),
('Terapia em Grupo', 'Sessões de terapia em grupo para socialização', 60, 100.00, true),
('Orientação Profissional', 'Orientação para escolha profissional e de carreira', 60, 180.00, true),
('Psicopedagogia', 'Atendimento psicopedagógico para dificuldades de aprendizagem', 50, 120.00, true)
ON CONFLICT DO NOTHING;

-- Inserir profissionais de demonstração
INSERT INTO public.professionals (crp, specialty, email, phone, bio, status) VALUES
('CRP 06/123456', 'Psicologia Clínica', 'ana.silva@instituto.com', '(11) 99999-1111', 'Especialista em psicologia infantil com 10 anos de experiência', 'active'),
('CRP 06/789012', 'Psicopedagogia', 'carlos.santos@instituto.com', '(11) 99999-2222', 'Psicopedagogo com foco em dificuldades de aprendizagem', 'active'),
('CRP 06/345678', 'Orientação Profissional', 'maria.oliveira@instituto.com', '(11) 99999-3333', 'Especialista em orientação profissional para adolescentes', 'active')
ON CONFLICT DO NOTHING;

-- Inserir algumas pré-agendamentos de demonstração
INSERT INTO public.pre_appointments (name, phone, email, service_type, preferred_date, preferred_time, status, notes) VALUES
('João Silva', '(11) 98765-4321', 'joao.silva@email.com', 'Avaliação Psicológica', '2024-03-15', 'Manhã (8h às 12h)', 'pending', 'Criança de 8 anos com dificuldades escolares'),
('Maria Santos', '(11) 97654-3210', 'maria.santos@email.com', 'Terapia Individual', '2024-03-18', 'Tarde (13h às 17h)', 'pending', 'Adolescente com ansiedade'),
('Pedro Costa', '(11) 96543-2109', 'pedro.costa@email.com', 'Orientação Profissional', '2024-03-20', 'Manhã (8h às 12h)', 'approved', 'Estudante do 3º ano do ensino médio')
ON CONFLICT DO NOTHING;

-- Inserir alguns pacientes (alunos) de demonstração
INSERT INTO public.patients (name, email, phone, mobile, cpf, rg, date_of_birth, address, number, neighborhood, city, state, zip_code, profession, education, marital_status, status, notes) VALUES
('Ana Clara Silva', 'ana.clara@email.com', '(11) 3456-7890', '(11) 98765-4321', '123.456.789-00', '12.345.678-9', '2015-05-10', 'Rua das Flores', '123', 'Centro', 'São Paulo', 'SP', '01234-567', 'Estudante', 'Ensino Fundamental', 'Solteiro', 'ativo', 'Aluna participativa e dedicada'),
('Bruno Henrique Santos', 'bruno.henrique@email.com', '(11) 3456-7891', '(11) 98765-4322', '234.567.890-11', '23.456.789-0', '2012-08-15', 'Avenida Paulista', '456', 'Bela Vista', 'São Paulo', 'SP', '01311-000', 'Estudante', 'Ensino Fundamental', 'Solteiro', 'ativo', 'Necessita acompanhamento em matemática'),
('Carla Fernanda Oliveira', 'carla.fernanda@email.com', '(11) 3456-7892', '(11) 98765-4323', '345.678.901-22', '34.567.890-1', '2010-12-03', 'Rua Augusta', '789', 'Consolação', 'São Paulo', 'SP', '01305-100', 'Estudante', 'Ensino Fundamental', 'Solteiro', 'ativo', 'Destaque em atividades artísticas')
ON CONFLICT DO NOTHING;

-- Inserir algumas vagas de trabalho de demonstração
INSERT INTO public.job_vacancies (title, company, description, requirements, salary_range, type, level, status) VALUES
('Desenvolvedor Frontend Júnior', 'TechCorp', 'Desenvolvimento de interfaces web modernas com React e TypeScript', ARRAY['React', 'TypeScript', 'CSS', 'HTML'], 'R$ 4.000 - R$ 6.000', 'clt', 'junior', 'active'),
('Analista de Dados', 'DataSoft', 'Análise e interpretação de dados empresariais usando Python e SQL', ARRAY['Python', 'SQL', 'Power BI', 'Excel'], 'R$ 5.000 - R$ 7.500', 'clt', 'pleno', 'active'),
('Gerente de Projetos Sênior', 'InnovaCorp', 'Gestão de projetos de tecnologia e liderança de equipes', ARRAY['PMP', 'Scrum', 'Liderança', 'Gestão'], 'R$ 10.000 - R$ 15.000', 'clt', 'senior', 'active'),
('Estagiário de Marketing', 'MarketPlus', 'Apoio nas atividades de marketing digital e redes sociais', ARRAY['Marketing Digital', 'Redes Sociais', 'Adobe Creative'], 'R$ 1.200 - R$ 1.800', 'estagio', 'junior', 'active')
ON CONFLICT DO NOTHING;

-- Associar candidatos às vagas (assumindo que temos alguns alunos cadastrados)
INSERT INTO public.job_candidates (patient_id, vacancy_id, status, score, notes) 
SELECT 
    p.id,
    v.id,
    'new' as status,
    FLOOR(RANDOM() * 30) + 70 as score, -- Score entre 70-100
    'Candidato com potencial para a vaga' as notes
FROM public.patients p 
CROSS JOIN public.job_vacancies v 
WHERE p.name IN ('Ana Clara Silva', 'Bruno Henrique Santos')
  AND v.title IN ('Estagiário de Marketing', 'Desenvolvedor Frontend Júnior')
LIMIT 4
ON CONFLICT DO NOTHING;

-- Inserir algumas entrevistas de demonstração
INSERT INTO public.interviews (patient_id, professional_id, interview_date, interview_time, type, status, notes, report)
SELECT 
    p.id,
    pr.id,
    CURRENT_DATE + INTERVAL '7 days' as interview_date,
    '14:00:00' as interview_time,
    'inicial' as type,
    'scheduled' as status,
    'Entrevista inicial para avaliação' as notes,
    NULL as report
FROM public.patients p
CROSS JOIN public.professionals pr
WHERE p.name = 'Ana Clara Silva' 
  AND pr.specialty = 'Psicologia Clínica'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Inserir algumas avaliações de demonstração
INSERT INTO public.evaluations (patient_id, professional_id, type, start_date, end_date, status, notes, report, result)
SELECT 
    p.id,
    pr.id,
    'psicologica' as type,
    CURRENT_DATE - INTERVAL '30 days' as start_date,
    CURRENT_DATE - INTERVAL '15 days' as end_date,
    'completed' as status,
    'Avaliação completa realizada' as notes,
    'Relatório detalhado da avaliação psicológica realizada.' as report,
    'Desenvolvimento adequado para a idade' as result
FROM public.patients p
CROSS JOIN public.professionals pr
WHERE p.name = 'Bruno Henrique Santos' 
  AND pr.specialty = 'Psicologia Clínica'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Inserir alguns agendamentos de demonstração
INSERT INTO public.appointments (patient_id, professional_id, service_id, appointment_date, appointment_time, status, notes)
SELECT 
    p.id,
    pr.id,
    s.id,
    CURRENT_DATE + INTERVAL '3 days' as appointment_date,
    '10:00:00' as appointment_time,
    'scheduled' as status,
    'Consulta de acompanhamento' as notes
FROM public.patients p
CROSS JOIN public.professionals pr
CROSS JOIN public.services s
WHERE p.name = 'Carla Fernanda Oliveira' 
  AND pr.specialty = 'Psicologia Clínica'
  AND s.name = 'Terapia Individual'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Inserir algumas presenças de demonstração
INSERT INTO public.attendance (patient_id, appointment_id, attendance_date, status, notes)
SELECT 
    a.patient_id,
    a.id,
    a.appointment_date,
    'present' as status,
    'Aluno compareceu pontualmente' as notes
FROM public.appointments a
WHERE a.appointment_date < CURRENT_DATE
LIMIT 1
ON CONFLICT DO NOTHING;

-- Inserir algumas transações financeiras de demonstração
INSERT INTO public.financial_transactions (patient_id, appointment_id, amount, type, category, description, payment_status, payment_method, payment_date, due_date, notes)
SELECT 
    a.patient_id,
    a.id,
    s.price,
    'income' as type,
    'service' as category,
    'Pagamento de ' || s.name as description,
    'paid' as payment_status,
    'card' as payment_method,
    a.appointment_date as payment_date,
    a.appointment_date as due_date,
    'Pagamento realizado' as notes
FROM public.appointments a
JOIN public.services s ON a.service_id = s.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Inserir relatórios de demonstração
INSERT INTO public.reports (title, type, content, file_url) VALUES
('Relatório Mensal de Atendimentos', 'monthly', '{"total_appointments": 45, "new_patients": 12, "completed_evaluations": 8}', NULL),
('Relatório de Frequência', 'attendance', '{"attendance_rate": 92, "total_sessions": 38, "missed_sessions": 3}', NULL),
('Relatório Financeiro', 'financial', '{"total_revenue": 15750.00, "pending_payments": 2300.00, "expenses": 4200.00}', NULL)
ON CONFLICT DO NOTHING;