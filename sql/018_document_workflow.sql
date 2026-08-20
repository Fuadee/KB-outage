-- Physical document hand-off workflow.
-- All columns are nullable so existing rows remain valid. Legacy rows that have
-- already reached Social/Notice are handled as completed by the application
-- workflow helper and therefore do not need a destructive data backfill.
ALTER TABLE public.outage_jobs
ADD COLUMN IF NOT EXISTS document_received_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS document_received_by text NULL,
ADD COLUMN IF NOT EXISTS document_delivered_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS document_delivered_by text NULL,
ADD COLUMN IF NOT EXISTS document_delivery_note text NULL;

COMMENT ON COLUMN public.outage_jobs.document_received_at IS
  'When the approved physical document was received by operations.';
COMMENT ON COLUMN public.outage_jobs.document_received_by IS
  'Operator name recorded at physical document receipt.';
COMMENT ON COLUMN public.outage_jobs.document_delivered_at IS
  'When the physical document was delivered to the responsible party.';
COMMENT ON COLUMN public.outage_jobs.document_delivered_by IS
  'Name of the person who delivered the physical document.';
COMMENT ON COLUMN public.outage_jobs.document_delivery_note IS
  'Optional delivery details.';

