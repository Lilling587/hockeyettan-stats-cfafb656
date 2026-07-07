## Goal

Only people you approve can become admins. Public signup gets removed; you invite admins from a new admin page.

## Changes

### 1. Disable public signup in Supabase Auth
Turn off open sign-ups at the auth provider level so no one can create an account from anywhere — not the UI, not a direct API call.

### 2. Remove signup UI from `/auth`
In `src/routes/auth.tsx`:
- Remove the "No account? Create one" toggle and the `signup` mode entirely.
- Keep only `signin` and `forgot` modes.
- Simplify the title to just "Sign in" / "Reset password".

### 3. New admin invite page: `/admin/users`
A new route `src/routes/_authenticated/admin.users.tsx` where you can:
- See the list of current admins (email + granted date).
- Invite a new admin by entering their email → sends a Supabase invite email (they set their own password via the link) and grants them the `admin` role on acceptance.
- Revoke admin from an existing user.

Add a link to it from the existing admin nav.

### 4. Server functions (admin-gated)
New file `src/lib/admin-users.functions.ts` with three functions, all using `requireAdmin` middleware:
- `listAdmins()` — reads `user_roles` joined with auth user emails.
- `inviteAdmin({ email })` — calls Supabase Auth Admin `inviteUserByEmail`, then inserts `(user_id, 'admin')` into `user_roles`. Loads `supabaseAdmin` inside the handler.
- `revokeAdmin({ userId })` — deletes the admin row from `user_roles`. Prevents self-revoke.

The invite email redirects to `/reset-password` so the invitee sets a password on first use.

### 5. Grant admin role on invite acceptance
Since `inviteUserByEmail` creates the auth user immediately, the `user_roles` insert happens right after invite in the same server function — the role is ready before they even click the email link.

## Technical notes

- Auth config: `disable_signup: true` via `supabase--configure_auth`.
- `requireAdmin` middleware already exists at `src/integrations/supabase/admin-middleware.ts`.
- `/admin/users` lives under `_authenticated/`, so route access is gated by session; the server functions additionally enforce the admin role — UI hiding is not the security boundary.
- No schema migration needed; `user_roles` and `has_role()` already exist.
- The transient Supabase 522 in the runtime error is unrelated network flake, not something to fix in code.

## Out of scope

- No email-domain allowlist (you picked manual invite).
- No changes to how existing admins sign in.
