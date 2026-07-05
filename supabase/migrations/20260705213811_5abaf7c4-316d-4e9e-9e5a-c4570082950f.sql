ALTER TABLE public.vmix_publications ALTER COLUMN game_date DROP NOT NULL;
ALTER TABLE public.vmix_publications ALTER COLUMN game_date SET DEFAULT NULL;