BEGIN;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS is_stage_consolidation boolean;

UPDATE public.evaluations
SET is_stage_consolidation = false
WHERE is_stage_consolidation IS NULL;

ALTER TABLE public.evaluations
  ALTER COLUMN is_stage_consolidation SET DEFAULT false,
  ALTER COLUMN is_stage_consolidation SET NOT NULL;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS checklist_ready_for_vaga boolean;

UPDATE public.evaluations
SET checklist_ready_for_vaga = false
WHERE checklist_ready_for_vaga IS NULL;

ALTER TABLE public.evaluations
  ALTER COLUMN checklist_ready_for_vaga SET DEFAULT false,
  ALTER COLUMN checklist_ready_for_vaga SET NOT NULL;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS devolutiva_date date;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS sent_to_vaga_at timestamptz;

ALTER TABLE public.evaluations
  ALTER COLUMN professional_id DROP NOT NULL;

ALTER TABLE public.social_interviews
  ADD COLUMN IF NOT EXISTS payload jsonb;

UPDATE public.social_interviews
SET payload = '{}'::jsonb
WHERE payload IS NULL;

ALTER TABLE public.social_interviews
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN payload SET NOT NULL;

COMMIT;
