import { fetchWithTimeout } from "./stats.server";

const FROM = "HockeyEttan Briefing <onboarding@resend.dev>";

function appUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.VITE_APP_URL ??
    "https://spdproduktion.se"
  );
}

async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) {
    console.warn("[admin-notify] Email provider not configured — skipping");
    return;
  }
  const res = await fetchWithTimeout(
    "https://connector-gateway.lovable.dev/resend/emails",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({ from: FROM, ...opts }),
    },
    15_000,
  );
  if (!res.ok) {
    console.warn("[admin-notify] Email send failed:", res.status);
  }
}

/** Fetch all admin emails via service role. Returns [] if Supabase is unavailable. */
async function getAdminEmails(): Promise<string[]> {
  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (!roles || roles.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .in(
        "id",
        roles.map((r) => r.user_id),
      );
    return (profiles ?? [])
      .map((p) => p.email)
      .filter((e): e is string => !!e);
  } catch (err) {
    console.warn("[admin-notify] Could not fetch admin emails:", (err as Error).message);
    return [];
  }
}

/**
 * Notify all admins that a new user is waiting for approval.
 * Non-blocking — caller should not await if they don't want to delay the response.
 */
export async function notifyAdminsNewSignup(newUserEmail: string): Promise<void> {
  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) return;
  const url = appUrl();
  await sendEmail({
    to: adminEmails,
    subject: "Ny användare väntar på godkännande – HockeyEttan Södra",
    html: `<p>En ny användare har registrerat sig och väntar på godkännande:</p>
<p><strong>${newUserEmail}</strong></p>
<p><a href="${url}/admin/users">Öppna admin-sidan för att godkänna →</a></p>`,
    text: `Ny användare väntar på godkännande: ${newUserEmail}\n\nGå till ${url}/admin/users för att godkänna.`,
  });
}

/**
 * Notify a user that they have been granted admin access.
 * Non-blocking — caller should not await if they don't want to delay the response.
 */
export async function notifyUserAdminGranted(userEmail: string): Promise<void> {
  const url = appUrl();
  await sendEmail({
    to: [userEmail],
    subject: "Du har fått admin-behörighet – HockeyEttan Södra",
    html: `<p>Hej,</p>
<p>Du har tilldelats admin-behörighet i HockeyEttan Södra matchbriefing.</p>
<p><a href="${url}/auth">Logga in här →</a></p>`,
    text: `Du har fått admin-behörighet i HockeyEttan Södra matchbriefing.\n\nLogga in på ${url}/auth`,
  });
}
