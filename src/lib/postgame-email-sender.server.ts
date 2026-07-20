// Shared postgame email sender used by both the scheduled cron endpoint
// and the admin-triggered "Match avslutad – uppdatera" flow. A per-user
// `last_postgame_email_date` column on `notification_prefs` prevents any
// recipient from getting the same day's postgame email twice.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { findMatchupOnDate, fetchLastMeetingRecap } from "@/lib/stats.server";
import { DEFAULT_SEASON } from "@/lib/seasons.config";
import { signUnsubscribeToken } from "@/lib/unsubscribe-token.server";
import { renderPostgameEmail } from "@/lib/email-templates";

export async function sendPostgameEmails(
  origin: string,
): Promise<{ total: number; sent: number; skipped: number; failed: number }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) {
    throw new Error("Email provider not configured");
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const globalMatch = await findMatchupOnDate(DEFAULT_SEASON, today);
  if (!globalMatch) {
    return { total: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const { data: prefs, error } = await supabaseAdmin
    .from("notification_prefs")
    .select("user_id, email, favorite_team, enabled, last_postgame_email_date")
    .eq("enabled", true);
  if (error) throw new Error(error.message);

  type Recap = Awaited<ReturnType<typeof fetchLastMeetingRecap>>;
  const recapCache = new Map<string, Recap>();
  async function recapFor(team: string): Promise<Recap> {
    if (recapCache.has(team)) return recapCache.get(team)!;
    const match = await findMatchupOnDate(DEFAULT_SEASON, today);
    if (!match || (match.home !== team && match.away !== team)) {
      recapCache.set(team, null);
      return null;
    }
    const recap = await fetchLastMeetingRecap(match.home, match.away);
    const valid = recap && recap.date === today ? recap : null;
    recapCache.set(team, valid);
    return valid;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const total = prefs?.length ?? 0;

  for (const pref of prefs ?? []) {
    try {
      if (pref.last_postgame_email_date === today) {
        skipped += 1;
        continue;
      }
      const recap = await recapFor(pref.favorite_team);
      if (!recap) {
        skipped += 1;
        continue;
      }

      type Tally = { goals: number; assists: number; teamCode: string };
      const tally = new Map<string, Tally>();
      for (const g of recap.goals) {
        const sc = tally.get(g.scorer) ?? { goals: 0, assists: 0, teamCode: g.teamCode };
        sc.goals += 1;
        sc.teamCode = g.teamCode;
        tally.set(g.scorer, sc);
        for (const a of g.assists) {
          const ac = tally.get(a) ?? { goals: 0, assists: 0, teamCode: g.teamCode };
          ac.assists += 1;
          ac.teamCode = g.teamCode;
          tally.set(a, ac);
        }
      }
      const topScorers = [...tally.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) =>
          b.goals + b.assists !== a.goals + a.assists
            ? b.goals + b.assists - (a.goals + a.assists)
            : b.goals - a.goals,
        )
        .slice(0, 5);

      const recapUrl = `${origin}/?home=${encodeURIComponent(recap.homeTeam)}&away=${encodeURIComponent(recap.awayTeam)}`;
      const token = signUnsubscribeToken(pref.user_id);
      const { subject, html, text } = renderPostgameEmail({
        favoriteTeam: pref.favorite_team,
        home: recap.homeTeam,
        away: recap.awayTeam,
        homeGoals: recap.homeGoals,
        awayGoals: recap.awayGoals,
        dateISO: today,
        recapUrl,
        gameUrl: recap.gameUrl,
        topScorers,
        manageUrl: `${origin}/notifications`,
        unsubscribeUrl: `${origin}/api/public/unsubscribe?t=${encodeURIComponent(token)}`,
      });

      const res = await fetch(
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
            to: [pref.email],
            subject,
            html,
            text,
          }),
        },
      );
      if (!res.ok) {
        failed += 1;
        continue;
      }
      sent += 1;
      await supabaseAdmin
        .from("notification_prefs")
        .update({ last_postgame_email_date: today })
        .eq("user_id", pref.user_id);
    } catch {
      failed += 1;
    }
  }

  return { total, sent, skipped, failed };
}
