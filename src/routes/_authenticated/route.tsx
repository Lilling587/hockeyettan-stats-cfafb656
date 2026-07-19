import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const ALLOWED_NEXT = new Set(["/", "/notifications", "/admin/vmix", "/admin/health", "/admin/logs", "/admin/usage", "/admin/users", "/admin/assets", "/connect"]);

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // getSession reads from localStorage first (fast, no network) and lets
    // autoRefreshToken keep the session alive silently.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) return { user: sessionData.session.user };

    // Fallback: revalidate with the auth server in case storage was cleared
    // mid-flight or the refresh token was just rotated.
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return { user: data.user };

    const next = ALLOWED_NEXT.has(location.pathname) ? location.pathname : undefined;
    throw redirect({ to: "/auth", search: next ? { next } : {} });
  },
  component: () => <Outlet />,
});
