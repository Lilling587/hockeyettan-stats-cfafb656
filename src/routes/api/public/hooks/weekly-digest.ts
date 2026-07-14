import { createFileRoute } from "@tanstack/react-router";
import { renderDigestEmail, type DigestGame } from "@/lib/email-templates";

// Weekly cron-driven endpoint. For each user with digest_enabled=true whose
// digest_dow matches today (Stockholm time), send a summary of the coming
// 7 days of games involving their favorite team.
//
// Authenticated by a shared CRON_SECRET (Bearer token).

export const Route = createFileRoute("/api/public/hooks/weekly-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const { getScheduleGames } = await import("@/lib/stats.server");
        const { DEFAULT_SEASON } = await import("@/lib/seasons.config");
        const { signUnsubscribeToken } = await import(
          "@/lib/unsubscribe-token.server"
        );

        // Compute today's ISO date and ISO day-of-week in Europe/Stockholm.
        const fmt = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Stockholm",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const today = fmt.format(new Date());
        // Compute ISO dow (1=Mon..7=Sun) from the Stockholm-local date string.
        const [y, m, d] = today.split("-").map(Number);
        const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
        const isoDow = jsDow === 0 ? 7 : jsDow;

        // End date (exclusive) = today + 7 days
        const endDate = new Date(Date.UTC(y, m - 1, d + 7));
        const endISO = fmt.format(endDate);

        const { data: prefs, error } = await supabaseAdmin
          .from("notification_prefs")
          .select("user_id, email, favorite_team, digest_enabled, digest_dow")
          .eq("digest_enabled", true)
          .eq("digest_dow", isoDow);
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        const origin = new URL(request.url).origin;
        const results: Array<{
          email: string;
          status: "sent" | "failed";
          reason?: string;
        }> = [];

        let allGames: Awaited<ReturnType<typeof getScheduleGames>> = [];
        try {
          allGames = await getScheduleGames(DEFAULT_SEASON);
        } catch (err) {
          return Response.json(
            { error: `schedule fetch failed: ${(err as Error).message}` },
            { status: 500 },
          );
        }

        const weekLabel = `${today} – ${endISO}`;

        for (const pref of prefs ?? []) {
          try {
            const upcoming: DigestGame[] = allGames
              .filter(
                (g) =>
                  g.date >= today &&
                  g.date < endISO &&
                  (g.homeTeam === pref.favorite_team ||
                    g.awayTeam === pref.favorite_team),
              )
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((g) => {
                const isHome = g.homeTeam === pref.favorite_team;
                return {
                  dateISO: g.date,
                  home: g.homeTeam,
                  away: g.awayTeam,
                  isHome,
                  opponent: isHome ? g.awayTeam : g.homeTeam,
                };
              });

            const briefingHome = upcoming[0]?.home ?? pref.favorite_team;
            const briefingAway = upcoming[0]?.away ?? "";
            const briefingUrl = `${origin}/?home=${encodeURIComponent(briefingHome)}&away=${encodeURIComponent(briefingAway)}`;
            const token = signUnsubscribeToken(pref.user_id);
            const { subject, html, text } = renderDigestEmail({
              favoriteTeam: pref.favorite_team,
              weekLabel,
              games: upcoming,
              briefingUrl,
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
          isoDow,
          weekLabel,
          total: prefs?.length ?? 0,
          results,
        });
      },
    },
  },
});
