import { createFileRoute } from "@tanstack/react-router";

// Public one-click unsubscribe. Verifies an HMAC token bound to the user id
// and flips notification_prefs.enabled = false. Returns a small HTML page.

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";

        const { verifyUnsubscribeToken } = await import(
          "@/lib/unsubscribe-token.server"
        );
        const userId = verifyUnsubscribeToken(token);
        if (!userId) {
          return htmlPage(
            "Invalid link",
            "This unsubscribe link is invalid or has expired. Sign in and update your notification settings instead.",
            400,
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { error } = await supabaseAdmin
          .from("notification_prefs")
          .update({ enabled: false })
          .eq("user_id", userId);
        if (error) {
          return htmlPage(
            "Something went wrong",
            "We couldn't update your preferences right now. Please try again in a moment.",
            500,
          );
        }

        return htmlPage(
          "You're unsubscribed",
          "You will no longer receive game-day emails. You can re-enable them anytime from your notification settings.",
          200,
        );
      },
    },
  },
});

function htmlPage(title: string, body: string, status: number): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:48px 20px;background:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb">
  <div style="max-width:520px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 12px;font-size:22px;color:#f8fafc">${escapeHtml(title)}</h1>
    <p style="margin:0 0 20px;color:#cbd5e1;font-size:14px;line-height:1.55">${escapeHtml(body)}</p>
    <a href="/notifications" style="display:inline-block;background:#22d3ee;color:#0b1220;font-weight:600;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Manage notifications</a>
  </div>
</body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
