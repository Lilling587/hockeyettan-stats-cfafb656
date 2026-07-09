import { createFileRoute } from "@tanstack/react-router";
import { getActivePublication, readVmixSettings } from "@/lib/vmix.functions";
import { resolveVmixAssetBaseUrl } from "@/lib/vmix-assets";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=15",
  "Content-Type": "application/json; charset=utf-8",
};

/** League title shown in the graphic header. */
const LEAGUE_TITLE = "HOCKEYETTAN SÖDRA";

/** Maximum number of team rows in the standings graphic template. */
const MAX_ROWS = 20;

/**
 * Separator line positions — matching the official config:
 * solid_after: [6]   → direct qualification cutoff within playoffs
 * dotted_after: [10, 18] → playoff cutoff / relegation cutoff
 */
const SOLID_AFTER = new Set([6]);
const DOTTED_AFTER = new Set([10, 18]);

const SOLID_LINE = "_________________________________________";
const DOTTED_LINE =
  "--------------------------------------------------------------------";

/** Zero-pad a number to two digits: 1 → "01", 10 → "10". */
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** URL-encode a logo code for use in file paths (GRÄ → GR%C3%84). */
function encodeCode(code: string): string {
  return encodeURIComponent(code);
}

export const Route = createFileRoute("/api/public/vmix/standings")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),

      GET: async () => {
        const [pub, settings] = await Promise.all([
          getActivePublication(),
          readVmixSettings(),
        ]);

        const standings = ((pub?.standings as Array<{
          position: number;
          team: string;
          gamesPlayed: number;
          goalDiff: number;
          points: number;
          logoCode?: string;
        }>) ?? []).sort((a, b) => a.position - b.position);

        const assetBaseUrl = resolveVmixAssetBaseUrl(
          settings.asset_base_url,
          process.env.SUPABASE_URL!,
        );

        const payload: Record<string, string | number> = {};

        // ---- Header fields ----
        payload["Headline.Text"] = LEAGUE_TITLE;
        payload["Rubrik1.Text"] = LEAGUE_TITLE;
        payload["Mrubrik.Text"] = "M";
        payload["Mrubrik1.Text"] = "+/-";
        payload["Mrubrik2.Text"] = "P";

        // ---- Team rows (01–20, zero-padded) ----
        for (let i = 1; i <= MAX_ROWS; i++) {
          const nn = pad(i);
          const row = standings.find((r) => r.position === i);

          if (row) {
            const logoCode = row.logoCode ?? "";
            const logoUrl = logoCode
              ? `${assetBaseUrl}/logos/${encodeCode(logoCode)}_small.png`
              : "";

            payload[`Pos${nn}.Text`] = row.position;
            payload[`Team${nn}t.Text`] = row.team;
            payload[`M${nn}.Text`] = row.gamesPlayed;
            payload[`D${nn}.Text`] = row.goalDiff;
            payload[`P${nn}.Text`] = row.points;
            payload[`Team${nn}.Source`] = logoUrl;
            payload[`Frame${nn}.Source`] = logoUrl;
          } else {
            // Empty row — position exists but no team data (fewer than
            // 20 teams, or standings not yet published).
            payload[`Pos${nn}.Text`] = "";
            payload[`Team${nn}t.Text`] = "";
            payload[`M${nn}.Text`] = "";
            payload[`D${nn}.Text`] = "";
            payload[`P${nn}.Text`] = "";
            payload[`Team${nn}.Source`] = "";
            payload[`Frame${nn}.Source`] = "";
          }
        }

        // ---- Separator lines (1–20, NOT zero-padded) ----
        // Each position has a solid and a dotted line element. Most are
        // invisible (single space). Active lines use repeated characters
        // that the GT Designer template renders as visual separators.
        for (let i = 1; i <= MAX_ROWS; i++) {
          payload[`SolidLine${i}.Text`] = SOLID_AFTER.has(i)
            ? SOLID_LINE
            : " ";
          payload[`DottedLine${i}.Text`] = DOTTED_AFTER.has(i)
            ? DOTTED_LINE
            : " ";
        }

        return new Response(JSON.stringify([payload]), {
          status: 200,
          headers: CORS_HEADERS,
        });
      },
    },
  },
});
