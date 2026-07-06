drop function if exists public.get_vmix_public_settings();

grant select on public.vmix_settings to anon;

create policy "Public can read whitelisted vmix settings"
on public.vmix_settings
for select
to anon
using (key in ('asset_base_url', 'club_id', 'lineup_version'));