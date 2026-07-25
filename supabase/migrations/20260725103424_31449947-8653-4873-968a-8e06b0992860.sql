create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  approval_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "Admins can manage all profiles"
  on public.profiles for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb default null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

grant select, insert on public.audit_events to authenticated;
grant all on public.audit_events to service_role;

alter table public.audit_events enable row level security;

create policy "Admins can read all audit events"
  on public.audit_events for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Users can insert own audit events"
  on public.audit_events for insert
  to authenticated
  with check (user_id = auth.uid());

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, approval_status)
  values (new.id, new.email, 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- Backfill existing users as approved so they are not locked out.
insert into public.profiles (id, email, approval_status)
select id, email, 'approved'
from auth.users
on conflict (id) do nothing;