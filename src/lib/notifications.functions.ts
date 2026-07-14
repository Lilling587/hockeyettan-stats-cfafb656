import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderPregameEmail } from "@/lib/email-templates";

export type NotificationPrefs = {
  email: string;
  favorite_team: string;
  enabled: boolean;
};

export const getMyNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPrefs | null> => {
    const { supabase, userId, claims } = context;
    const { data, error } = await supabase
      .from("notification_prefs")
      .select("email, favorite_team, enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as NotificationPrefs;
    const email = (claims?.email as string | undefined) ?? "";
    return { email, favorite_team: "Grästorps IK", enabled: false };
  });

export const saveMyNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        favorite_team: z.string().min(1).max(120),
        enabled: z.boolean(),
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
        email: z.string().email(),
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
        to: [data.email],
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
