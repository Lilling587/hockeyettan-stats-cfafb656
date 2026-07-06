create or replace function public.get_vmix_public_settings()
returns table(key text, value text)
language sql
stable
security definer
set search_path = public
as $$
  select key, value
  from public.vmix_settings
  where key in ('asset_base_url', 'club_id', 'lineup_version')
$$;

grant execute on function public.get_vmix_public_settings() to anon, authenticated;