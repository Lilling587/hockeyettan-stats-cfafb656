-- Security fix: drop the "Users can update own profile" RLS policy.
--
-- The policy allowed any authenticated user to UPDATE their own profiles row
-- without restricting which columns, meaning a pending user could set
-- approval_status = 'approved' on themselves and bypass the approval gate.
--
-- No legitimate app code uses this policy:
--   - Profile creation happens via INSERT (covered by "Users can insert own profile")
--   - approval_status changes only happen in admin server functions that use
--     the service-role client or the "Admins can manage all profiles" policy.

drop policy if exists "Users can update own profile" on public.profiles;
