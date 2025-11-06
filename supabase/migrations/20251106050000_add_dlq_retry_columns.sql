-- Add missing columns to dead_letter_queue for auto-retry functionality
ALTER TABLE public.dead_letter_queue
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS replayed_at TIMESTAMP WITH TIME ZONE;

-- Update status check constraint to include new statuses
ALTER TABLE public.dead_letter_queue
  DROP CONSTRAINT IF EXISTS dead_letter_queue_status_check;

ALTER TABLE public.dead_letter_queue
  ADD CONSTRAINT dead_letter_queue_status_check
  CHECK (status IN ('pending', 'retrying', 'failed', 'resolved', 'replayed', 'permanently_failed'));

-- Add index for retry queries
CREATE INDEX IF NOT EXISTS idx_dlq_retry_eligible 
ON public.dead_letter_queue(status, retry_count, last_retry_at)
WHERE status = 'failed' AND retry_count < max_retries;


