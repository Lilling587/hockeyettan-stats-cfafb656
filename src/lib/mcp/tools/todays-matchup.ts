import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { findMatchupOnDate } from "@/lib/stats.server";
import { DEFAULT_SEASON, getSeason } from "@/lib/seasons.config";

export default defineTool({
  name: "get_todays_matchup",
  title: "Today's HockeyEttan matchup",
  description:
    "Return the HockeyEttan Södra matchup on a given date (defaults to today, Europe/Stockholm) for a given team (defaults to Grästorps IK). Returns null if the team is not playing that date.",
  inputSchema: {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("ISO date YYYY-MM-DD. Defaults to today in Europe/Stockholm."),
    team: z.string().optional().describe("Team name filter. Defaults to Grästorps IK."),
    season: z.string().optional().describe("Season label, e.g. '2025-26'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ date, team, season }) => {
    const dateISO =
      date ??
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Stockholm",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    const teamFilter = team ?? "Grästorps IK";
    const match = await findMatchupOnDate(getSeason(season) ?? DEFAULT_SEASON, dateISO);
    const involved = match && (match.home === teamFilter || match.away === teamFilter) ? match : null;
    return {
      content: [
        {
          type: "text",
          text: involved
            ? `${involved.date}: ${involved.home} vs ${involved.away}`
            : `No ${teamFilter} game on ${dateISO}.`,
        },
      ],
      structuredContent: { date: dateISO, team: teamFilter, match: involved },
    };
  },
});
