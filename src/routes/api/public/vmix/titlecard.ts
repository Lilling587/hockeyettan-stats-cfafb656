import { createFileRoute } from "@tanstack/react-router";
import { getActivePublication } from "@/lib/vmix.functions";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=5",
  "Content-Type": "application/json; charset=utf-8",
};

const SWEDISH_MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAJ", "JUN",
  "JUL", "AUG", "SEP", "OKT", "NOV", "DEC",
];

function formatGameDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    return `${d.getUTCDate()} ${SWEDISH_MONTHS[d.getUTCMonth()]}`;
  } catch (_e) {
    return dateStr;
  }
}

export const Route = createFileRoute("/api/public/vmix/titlecard")({
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
        const pub = await getActivePublication();

        if (!pub) {
          return new Response(
            JSON.stringify([
              "Ingen aktiv publicering – publicera via admin-sidan",
            ]),
            { status: 200, headers: CORS_HEADERS },
          );
        }

        const payload = {
          "HomeTeam.Text": pub.homeTeam.toUpperCase(),
          "AwayTeam.Text": pub.awayTeam.toUpperCase(),
          "HomeTeamShort.Text": pub.homeSlots.teamCode,
          "AwayTeamShort.Text": pub.awaySlots.teamCode,
          "GameDate.Text": formatGameDate(pub.gameDate),
          "Venue.Text": "Åse & Viste Arena",
          "League.Text": "HOCKEYETTAN SÖDRA",
        };

        return new Response(JSON.stringify([payload]), {
          status: 200,
          headers: CORS_HEADERS,
        });
      },
    },
  },
});
