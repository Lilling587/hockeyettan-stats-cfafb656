import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { renderPregameEmail } from "@/lib/email-templates";

export type NotificationPrefs = {
  email: string;
  favorite_team: string;
  enabled: boolean;
  digest_enabled: boolean;
  digest_dow: number;
};

export const getMyNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPrefs | null> => {
    const { supabase, userId, claims } = context;
    const { data, error } = await supabase
      .from("notification_prefs")
      .select("email, favorite_team, enabled, digest_enabled, digest_dow")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as NotificationPrefs;
    const email = (claims?.email as string | undefined) ?? "";
    return {
      email,
      favorite_team: "Grästorps IK",
      enabled: false,
      digest_enabled: false,
      digest_dow: 1,
    };
  });

export const saveMyNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        favorite_team: z.string().min(1).max(120),
        enabled: z.boolean(),
        digest_enabled: z.boolean(),
        digest_dow: z.number().int().min(1).max(7),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("notification_prefs")
      .upsert(
        {
          user_id: userId,
          email: data.email,
          favorite_team: data.favorite_team,
          enabled: data.enabled,
          digest_enabled: data.digest_enabled,
          digest_dow: data.digest_dow,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestPregameEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        favorite_team: z.string().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!lovableKey || !resendKey) {
      throw new Error("Email provider not configured");
    }

    // Recipient is always the caller's own verified account email — never a
    // client-supplied address — so the test-send feature can't be used to
    // deliver branded mail to third parties.
    const recipient = (context.claims?.email as string | undefined) ?? "";
    if (!recipient) {
      throw new Error("Your account has no verified email address");
    }


    const { findMatchupOnDate } = await import("@/lib/stats.server");
    const { DEFAULT_SEASON } = await import("@/lib/seasons.config");
    const { signUnsubscribeToken } = await import("@/lib/unsubscribe-token.server");

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Stockholm",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // Try to find a real matchup today for their team; fall back to a sample
    // so the test email always shows what a real briefing will look like.
    let home = data.favorite_team;
    let away = "Sample Opponent IK";
    try {
      const match = await findMatchupOnDate(DEFAULT_SEASON, today);
      if (match && (match.home === data.favorite_team || match.away === data.favorite_team)) {
        home = match.home;
        away = match.away;
      }
    } catch {
      // ignore — use sample
    }

    const origin = "https://hockeyettan.lovable.app";
    const briefingUrl = `${origin}/?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
    const token = signUnsubscribeToken(context.userId);
    const { subject, html, text } = renderPregameEmail({
      favoriteTeam: data.favorite_team,
      home,
      away,
      dateISO: today,
      briefingUrl,
      manageUrl: `${origin}/notifications`,
      unsubscribeUrl: `${origin}/api/public/unsubscribe?t=${encodeURIComponent(token)}`,
    });


    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: "HockeyEttan Briefing <onboarding@resend.dev>",
        to: [recipient],
        subject: `[TEST] ${subject}`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
    }
    return { ok: true };
  });

export const triggerPostgameEmailsNow = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ sent: number; skipped: number }> => {
    const { sendPostgameEmails } = await import("./postgame-email-sender.server");
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.VITE_APP_URL ?? "https://hockeyettan-stats.spdproduktion.se";
    const result = await sendPostgameEmails(origin);
    return { sent: result.sent, skipped: result.skipped };
  });

