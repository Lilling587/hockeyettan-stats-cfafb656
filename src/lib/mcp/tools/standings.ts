import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchFullStandings } from "@/lib/stats.server";
import { DEFAULT_SEASON, getSeason } from "@/lib/seasons.config";

export default defineTool({
  name: "get_standings",
  title: "HockeyEttan Södra standings",
  description: "Return the current league standings for HockeyEttan Södra for the given season (defaults to current).",
  inputSchema: {
    season: z.string().optional().describe("Season label, e.g. '2025-26'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ season }) => {
    const rows = await fetchFullStandings(getSeason(season) ?? DEFAULT_SEASON);
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { standings: rows },
    };
  },
});
