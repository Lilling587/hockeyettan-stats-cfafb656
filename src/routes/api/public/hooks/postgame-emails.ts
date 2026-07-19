import { createFileRoute } from "@tanstack/react-router";
import { renderPostgameEmail } from "@/lib/email-templates";

// Daily cron-driven endpoint. Run in the evening (after typical puck drop).
// For each enabled notification pref, check if the favorite team played today
// and the game is final; if so, send a postgame recap email.

export const Route = createFileRoute("/api/public/hooks/postgame-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require a shared secret Bearer token so only the configured cron
        // caller can trigger mass email sends. The Supabase publishable key
        // is public and MUST NOT be used to gate this endpoint.
        const expected = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.toLowerCase().startsWith("bearer ")
          ? auth.slice(7).trim()
          : "";
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        const resendKey = process.env.RESEND_API_KEY;
        if (!lovableKey || !resendKey) {
          return Response.json(
            { error: "Email provider not configured" },
            { status: 500 },
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { findMatchupOnDate, fetchLastMeetingRecap } = await import(
          "@/lib/stats.server"
        );
        const { DEFAULT_SEASON } = await import("@/lib/seasons.config");
        const { signUnsubscribeToken } = await import(
          "@/lib/unsubscribe-token.server"
        );


        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Stockholm",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        // Early exit: no matches today = no postgame work.
        const globalMatch = await findMatchupOnDate(DEFAULT_SEASON, today);
        if (!globalMatch) {
          return Response.json({ date: today, total: 0, results: [], reason: "no-games-today" });
        }

        const { data: prefs, error } = await supabaseAdmin
          .from("notification_prefs")
          .select("user_id, email, favorite_team, enabled")
          .eq("enabled", true);
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }


        const origin = new URL(request.url).origin;
        const results: Array<{
          email: string;
          status: "sent" | "skipped" | "failed";
          reason?: string;
        }> = [];

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
          // Only count as postgame if recap is from today (i.e. final result is in).
          const valid = recap && recap.date === today ? recap : null;
          recapCache.set(team, valid);
          return valid;
        }

        for (const pref of prefs ?? []) {
          try {
            const recap = await recapFor(pref.favorite_team);
            if (!recap) {
              results.push({ email: pref.email, status: "skipped", reason: "no-final-game" });
              continue;
            }

            // Aggregate top scorers from goal events.
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
              const body = await res.text();
              results.push({
                email: pref.email,
                status: "failed",
                reason: `${res.status}: ${body.slice(0, 200)}`,
              });
            } else {
              results.push({ email: pref.email, status: "sent" });
            }
          } catch (err) {
            results.push({
              email: pref.email,
              status: "failed",
              reason: (err as Error).message,
            });
          }
        }

        return Response.json({
          date: today,
          total: prefs?.length ?? 0,
          results,
        });
      },
    },
  },
});
