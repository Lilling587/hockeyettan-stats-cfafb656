import { createFileRoute } from "@tanstack/react-router";
import { fetchPlayerStats } from "@/lib/vmix.functions";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
  "Content-Type": "application/json; charset=utf-8",
};

export const Route = createFileRoute("/api/public/vmix/player")({
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

        const url = new URL(request.url);
        const playerName = url.searchParams.get("PlayerName") ?? "";

        if (!playerName) {
          return new Response(
            JSON.stringify([{
              "Error.Text": "PlayerName krävs – t.ex. ?PlayerName=SVENSSON,%20ERIK",
            }]),
            { status: 400, headers: CORS_HEADERS },
          );
        }

        try {
          const player = await fetchPlayerStats(playerName);

          if (!player) {
            return new Response(
              JSON.stringify([{ "Error.Text": `Hittades inte: ${playerName}` }]),
              { status: 404, headers: CORS_HEADERS },
            );
          }

          const payload = {
            "Name.Text": player.name,
            "Position.Text": player.position ?? "",
            "Goals.Text": String(player.goals ?? 0),
            "Assists.Text": String(player.assists ?? 0),
            "Points.Text": String(player.points ?? 0),
            "GamesPlayed.Text": String(player.gamesPlayed ?? 0),
            "Team.Text": player.team,
          };

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
