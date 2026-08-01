-- Performance indexes for admin/health/usage queries and briefing cache reads.
-- Created as part of Phase 3 ops improvements.

CREATE INDEX IF NOT EXISTS idx_scrape_metrics_endpoint_fetched_at
  ON public.scrape_metrics (endpoint, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at
  ON public.error_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at
  ON public.email_send_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
  ON public.audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cached_briefings_fetched_at
  ON public.cached_briefings (fetched_at DESC);