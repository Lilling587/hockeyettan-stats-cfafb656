import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const ALLOWED_NEXT = new Set([
  "/",
  "/notifications",
  "/admin/vmix",
  "/admin/health",
  "/admin/logs",
  "/admin/usage",
  "/admin/users",
  "/admin/assets",
  "/admin/audit",
  "/connect",
]);

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // getSession reads from localStorage first (fast, no network) and lets
    // autoRefreshToken keep the session alive silently.
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    // Fallback: revalidate with the auth server in case storage was cleared
    // mid-flight or the refresh token was just rotated.
    let resolvedUser = user ?? null;
    if (!resolvedUser) {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) resolvedUser = data.user;
    }

    if (!resolvedUser) {
      const next = ALLOWED_NEXT.has(location.pathname) ? location.pathname : undefined;
      throw redirect({ to: "/auth", search: next ? { next } : {} });
    }

    // Enforce admin approval: the trigger creates a profile on signup with
    // status "pending". Rejected or missing profiles are also blocked.
    const { data: profile } = await supabase
      .from("profiles")
      .select("approval_status")
      .eq("id", resolvedUser.id)
      .maybeSingle();

    const status = (profile as { approval_status?: string } | null)?.approval_status;
    if (status !== "approved") {
      throw redirect({
        to: "/auth",
        search: { pending: status ?? "missing" },
      });
    }

    return { user: resolvedUser };
  },
  component: () => <Outlet />,
});
