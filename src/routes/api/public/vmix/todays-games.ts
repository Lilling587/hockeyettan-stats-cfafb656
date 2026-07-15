import { createFileRoute } from "@tanstack/react-router";
import { fetchTodaysGames } from "@/lib/vmix.functions";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
  "Content-Type": "application/json; charset=utf-8",
};

export const Route = createFileRoute("/api/public/vmix/todays-games")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),

      GET: async ({ request }: { request: Request }) => {
        if (!checkRateLimit(getClientIp(request)).allowed) {
          return new Response(
            JSON.stringify([{ "Error.Text": "Rate limit exceeded – try again in a minute" }]),
            { status: 429, headers: { ...CORS_HEADERS, "Retry-After": "60" } },
          );
        }
        try {
          const games = await fetchTodaysGames();

          const payload: Record<string, string> = {
            "GamesCount.Text": String(games.length),
          };

          games.forEach((g, i) => {
            const nn = String(i + 1).padStart(2, "0");
            payload[`Game${nn}Home.Text`] = g.homeTeam;
            payload[`Game${nn}Away.Text`] = g.awayTeam;
            payload[`Game${nn}Score.Text`] =
              g.homeGoals != null && g.awayGoals != null
                ? `${g.homeGoals} - ${g.awayGoals}`
                : "";
            payload[`Game${nn}Status.Text`] = g.status;
          });

          return new Response(JSON.stringify([payload]), {
            status: 200,
            headers: CORS_HEADERS,
          });
        } catch (e) {
          return new Response(
            JSON.stringify([{ "Error.Text": (e as Error).message }]),
            { status: 500, headers: CORS_HEADERS },
          );
        }
      },
    },
  },
});
