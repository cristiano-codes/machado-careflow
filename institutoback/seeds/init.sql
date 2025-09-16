-- Seeds iniciais para desenvolvimento (idempotente)

-- Inserir serviços básicos
INSERT INTO public.services (name, description, price, duration, active, created_at, updated_at)
SELECT 'Psicoterapia Individual', 'Atendimento psicológico individual para adultos', 200.00, 50, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Psicoterapia Individual');

INSERT INTO public.services (name, description, price, duration, active, created_at, updated_at)
SELECT 'Avaliação Psicológica', 'Avaliação psicológica completa com relatório', 300.00, 60, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Avaliação Psicológica');

INSERT INTO public.services (name, description, price, duration, active, created_at, updated_at)
SELECT 'Psicoterapia de Casal', 'Atendimento psicológico para casais', 250.00, 60, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Psicoterapia de Casal');

-- Inserir profissionais básicos
INSERT INTO public.professionals (email, specialty, status, created_at, updated_at)
SELECT 'pro@inst.local', 'Psicologia Clínica', 'active', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.professionals WHERE email = 'pro@inst.local');

INSERT INTO public.professionals (email, specialty, status, created_at, updated_at)
SELECT 'pro2@inst.local', 'Psicologia Infantil', 'active', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.professionals WHERE email = 'pro2@inst.local');

INSERT INTO public.professionals (email, specialty, status, created_at, updated_at)
SELECT 'pro3@inst.local', 'Psicologia Organizacional', 'active', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.professionals WHERE email = 'pro3@inst.local');