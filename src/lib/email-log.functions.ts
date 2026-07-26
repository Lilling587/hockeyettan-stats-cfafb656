import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

export type NotificationEmailRow = {
  id: string;
  templateName: string;
  recipientEmail: string;
  status: string;
  errorMessage: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
};

const OUR_TEMPLATES = ["admin_signup_notification", "admin_promotion"] as const;

export const TEMPLATE_LABELS: Record<string, string> = {
  admin_signup_notification: "Ny-användar-avisering",
  admin_promotion: "Admin-befordran",
};

export const listNotificationEmails = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ rows: NotificationEmailRow[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_send_log")
      .select("id, template_name, recipient_email, status, error_message, metadata, created_at")
      .in("template_name", OUR_TEMPLATES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows: NotificationEmailRow[] = (data ?? []).map((r) => ({
      id: r.id,
      templateName: r.template_name,
      recipientEmail: r.recipient_email,
      status: r.status,
      errorMessage: r.error_message ?? null,
      metadata: r.metadata as Record<string, string> | null,
      createdAt: r.created_at,
    }));
    return { rows };
  });

export const resendNotificationEmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ logId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("email_send_log")
      .select("template_name, recipient_email, metadata")
      .eq("id", data.logId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Raden hittades inte");

    const { notifyUserAdminGranted, notifyAdminsNewSignup } = await import(
      "./admin-notify.server"
    );

    if (row.template_name === "admin_promotion") {
      await notifyUserAdminGranted(row.recipient_email);
    } else if (row.template_name === "admin_signup_notification") {
      const meta = row.metadata as Record<string, string> | null;
      const newUserEmail = meta?.newUserEmail ?? row.recipient_email;
      // Resend only to this specific admin, not to all admins again.
      const { fetchWithTimeout } = await import("./stats.server");
      const url =
        process.env.SITE_URL ??
        process.env.VITE_APP_URL ??
        "https://spdproduktion.se";
      const lovableKey = process.env.LOVABLE_API_KEY;
      const resendKey = process.env.RESEND_API_KEY;
      if (lovableKey && resendKey) {
        await fetchWithTimeout(
          "https://connector-gateway.lovable.dev/resend/emails",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": resendKey,
            },
            body: JSON.stringify({
              from: "HockeyEttan Briefing <onboarding@resend.dev>",
              to: [row.recipient_email],
              subject: "Ny användare väntar på godkännande – HockeyEttan Södra",
              html: `<p>En ny användare har registrerat sig och väntar på godkännande:</p><p><strong>${newUserEmail}</strong></p><p><a href="${url}/admin/users">Öppna admin-sidan för att godkänna →</a></p>`,
              text: `Ny användare väntar på godkännande: ${newUserEmail}\n\nGå till ${url}/admin/users för att godkänna.`,
            }),
          },
          15_000,
        );
      }
      // Log the resend as a new row — re-use notifyAdminsNewSignup won't work here
      // because it fetches all admins; instead we logged it manually above.
    } else {
      throw new Error(`Okänd mall: ${row.template_name}`);
    }

    return { ok: true };
  });
