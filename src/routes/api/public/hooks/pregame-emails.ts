import { createFileRoute } from "@tanstack/react-router";
import { renderPregameEmail } from "@/lib/email-templates";

// Daily cron-driven endpoint. For each enabled notification pref, check if the
// favorite team plays today and send a pre-game email via the Resend connector.
// Authenticated by a shared CRON_SECRET (Bearer token) known only to the
// scheduler. The /api/public/* prefix bypasses the platform auth gate, so all
// checks happen here.

export const Route = createFileRoute("/api/public/hooks/pregame-emails")({
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
        const { findMatchupOnDate } = await import("@/lib/stats.server");
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

        // Early exit: skip all DB / email work on days with no matches at all.
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

        // Cache matchup lookups by team to avoid repeated network calls.
        const matchupCache = new Map<
          string,
          { date: string; home: string; away: string } | null
        >();
        async function matchupFor(team: string) {
          if (matchupCache.has(team)) return matchupCache.get(team)!;
          const match = await findMatchupOnDate(DEFAULT_SEASON, today);
          const involved =
            match && (match.home === team || match.away === team)
              ? match
              : null;
          matchupCache.set(team, involved);
          return involved;
        }

        for (const pref of prefs ?? []) {
          try {
            const match = await matchupFor(pref.favorite_team);
            if (!match) {
              results.push({ email: pref.email, status: "skipped", reason: "no-game" });
              continue;
            }
            const briefingUrl = `${origin}/?home=${encodeURIComponent(match.home)}&away=${encodeURIComponent(match.away)}`;
            const token = signUnsubscribeToken(pref.user_id);
            const { subject, html, text } = renderPregameEmail({
              favoriteTeam: pref.favorite_team,
              home: match.home,
              away: match.away,
              dateISO: today,
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
          total: prefs?.length ?? 0,
          results,
        });
      },
    },
  },
});
