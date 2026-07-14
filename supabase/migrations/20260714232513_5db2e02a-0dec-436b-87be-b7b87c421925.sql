ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS digest_dow smallint NOT NULL DEFAULT 1;
COMMENT ON COLUMN public.notification_prefs.digest_dow IS 'ISO day-of-week for weekly digest (1=Mon..7=Sun)';