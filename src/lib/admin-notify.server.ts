import { fetchWithTimeout } from "./stats.server";

const FROM = "HockeyEttan Briefing <onboarding@resend.dev>";

function appUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.VITE_APP_URL ??
    "https://spdproduktion.se"
  );
}

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  templateName: string;
  metadata?: Record<string, string>;
};

async function sendAndLog(payload: EmailPayload): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) {
    console.warn("[admin-notify] Email provider not configured — skipping");
    return;
  }

  let status: "sent" | "failed" = "failed";
  let messageId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetchWithTimeout(
      "https://connector-gateway.lovable.dev/resend/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify({
          from: FROM,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      },
      15_000,
    );
    if (res.ok) {
      status = "sent";
      try {
        const json = (await res.json()) as { id?: string };
        messageId = json.id ?? null;
      } catch { /* ignore */ }
    } else {
      errorMessage = `HTTP ${res.status}`;
      console.warn("[admin-notify] Email send failed:", res.status);
    }
  } catch (err) {
    errorMessage = (err as Error).message;
    console.warn("[admin-notify] Email send error:", errorMessage);
  }

  void logEmailSend({
    templateName: payload.templateName,
    recipientEmail: payload.to,
    status,
    messageId,
    errorMessage,
    metadata: { subject: payload.subject, ...payload.metadata },
  });
}

async function logEmailSend(opts: {
  templateName: string;
  recipientEmail: string;
  status: "sent" | "failed";
  messageId: string | null;
  errorMessage: string | null;
  metadata?: Record<string, string>;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("email_send_log").insert({
      template_name: opts.templateName,
      recipient_email: opts.recipientEmail,
      status: opts.status,
      message_id: opts.messageId,
      error_message: opts.errorMessage,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    console.warn("[admin-notify] Log insert failed:", (err as Error).message);
  }
}

async function getAdminEmails(): Promise<string[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (!roles || roles.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .in("id", roles.map((r) => r.user_id));
    return (profiles ?? []).map((p) => p.email).filter((e): e is string => !!e);
  } catch (err) {
    console.warn("[admin-notify] Could not fetch admin emails:", (err as Error).message);
    return [];
  }
}

export async function notifyAdminsNewSignup(newUserEmail: string): Promise<void> {
  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) return;
  const url = appUrl();
  const subject = "Ny användare väntar på godkännande – HockeyEttan Södra";
  const html = `<p>En ny användare har registrerat sig och väntar på godkännande:</p>
<p><strong>${newUserEmail}</strong></p>
<p><a href="${url}/admin/users">Öppna admin-sidan för att godkänna →</a></p>`;
  const text = `Ny användare väntar på godkännande: ${newUserEmail}\n\nGå till ${url}/admin/users för att godkänna.`;

  await Promise.all(
    adminEmails.map((adminEmail) =>
      sendAndLog({
        to: adminEmail,
        subject,
        html,
        text,
        templateName: "admin_signup_notification",
        metadata: { newUserEmail },
      }),
    ),
  );
}

export async function notifyUserAdminGranted(userEmail: string): Promise<void> {
  const url = appUrl();
  await sendAndLog({
    to: userEmail,
    subject: "Du har fått admin-behörighet – HockeyEttan Södra",
    html: `<p>Hej,</p>
<p>Du har tilldelats admin-behörighet i HockeyEttan Södra matchbriefing.</p>
<p><a href="${url}/auth">Logga in här →</a></p>`,
    text: `Du har fått admin-behörighet i HockeyEttan Södra matchbriefing.\n\nLogga in på ${url}/auth`,
    templateName: "admin_promotion",
  });
}
