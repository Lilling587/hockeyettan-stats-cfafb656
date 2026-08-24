import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import {
  getActivePublication,
  readVmixSettings,
  SLOT_KEYS,
  type SlotPlayer,
  type VmixLineupSlots,
} from "@/lib/vmix.functions";
import { getVmixLogoUrl, resolveVmixAssetBaseUrl } from "@/lib/vmix-assets";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=5",
  "Content-Type": "application/json; charset=utf-8",
};

function buildSlotFields(
  prefix: "H" | "A",
  slots: VmixLineupSlots,
  assetBaseUrl: string,
): Record<string, string | number> {
  const PLATE = `${assetBaseUrl}/resources/lineup-PLATE.png`;
  const TRANSPARENT = `${assetBaseUrl}/resources/transparent.png`;
  const out: Record<string, string | number> = {};
  for (const key of SLOT_KEYS) {
    const player = slots[key] as SlotPlayer;
    const filled = !!(player && player.name);
    out[`${prefix}_${key}_name.Text`] = filled ? player!.name : "";
    out[`${prefix}_${key}_number.Text`] = filled ? player!.number : "";
    out[`${prefix}_${key}_plate.Source`] = filled ? PLATE : "";
    out[`${prefix}_${key}_picture.Source`] = TRANSPARENT;
  }
  return out;
}

export const Route = createFileRoute("/api/public/vmix/lineup/$version")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        if (!checkRateLimit(getClientIp(request)).allowed) {
          return new Response(
            JSON.stringify([{ "Error.Text": "Rate limit exceeded – try again in a minute" }]),
            { status: 429, headers: { ...CORS_HEADERS, "Retry-After": "60" } },
          );
        }
        const url = new URL(request.url);
        const clubId = url.searchParams.get("ClubId") ?? "";

        const settings = await readVmixSettings();
        const assetBaseUrl = resolveVmixAssetBaseUrl(
          settings.asset_base_url,
          process.env.SUPABASE_URL!,
        );

        if (clubId !== settings.club_id) {
          return new Response(
            JSON.stringify([
              "ClubId inte konfigurerad för denna backuptjänst",
            ]),
            { status: 200, headers: CORS_HEADERS },
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

        const away = pub.awaySlots;
        const home = pub.homeSlots;

        const payload = {
          "A_TeamName.Text": (away.team || pub.awayTeam).toUpperCase(),
          "A_TeamLogo.Source": getVmixLogoUrl(assetBaseUrl, away.teamCode, "small"),
          "A_LogoTeam.Source": getVmixLogoUrl(assetBaseUrl, away.teamCode, "large"),
          "HeadlineGoalies.Text": "MÅLVAKTER",
          "HeadlineDef.Text": "BACKPAR",
          "HeadlineForw.Text": "FORWARDS",
          "BG.Source": `${assetBaseUrl}/resources/lineupBG.png`,
          "Divider1.Source": `${assetBaseUrl}/resources/lineup-DIVISION.png`,
          "Divider2.Source": `${assetBaseUrl}/resources/lineup-DIVISION.png`,
          "Divider3.Source": `${assetBaseUrl}/resources/lineup-DIVISION.png`,
          ...buildSlotFields("A", away, assetBaseUrl),
          "H_TeamName.Text": (home.team || pub.homeTeam).toUpperCase(),
          "H_TeamLogo.Source": getVmixLogoUrl(assetBaseUrl, home.teamCode, "small"),
          "H_LogoTeam.Source": getVmixLogoUrl(assetBaseUrl, home.teamCode, "large"),
          ...buildSlotFields("H", home, assetBaseUrl),
        };

        return new Response(JSON.stringify([payload]), {
          status: 200,
          headers: CORS_HEADERS,
        });
      },
    },
  },
});
