revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke execute on function public.cache_team_logo(text, text, text) from public, anon, authenticated;

-- Ensure service_role retains access to internal helpers.
grant execute on function public.create_profile_for_new_user() to service_role;
grant execute on function public.cache_team_logo(text, text, text) to service_role;