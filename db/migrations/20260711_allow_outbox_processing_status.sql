BEGIN;

ALTER TABLE public.outbox_events
DROP CONSTRAINT IF EXISTS outbox_events_status_check;

ALTER TABLE public.outbox_events
ADD CONSTRAINT outbox_events_status_check
CHECK (
  status = ANY (
    ARRAY[
      'pending'::text,
      'processing'::text,
      'processed'::text,
      'failed'::text
    ]
  )
);

COMMIT;
