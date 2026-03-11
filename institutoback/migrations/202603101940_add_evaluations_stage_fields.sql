BEGIN;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS notes text;

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
  ADD COLUMN IF NOT EXISTS sent_to_vaga_at timestamptz;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS devolutiva_date date;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.evaluations
SET created_at = NOW()
WHERE created_at IS NULL;

ALTER TABLE public.evaluations
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.evaluations
SET updated_at = NOW()
WHERE updated_at IS NULL;

ALTER TABLE public.evaluations
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.evaluations
  ALTER COLUMN professional_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evaluations_stage_consolidation
  ON public.evaluations (patient_id, is_stage_consolidation);

CREATE INDEX IF NOT EXISTS idx_evaluations_sent_to_vaga_at
  ON public.evaluations (sent_to_vaga_at);

COMMIT;
