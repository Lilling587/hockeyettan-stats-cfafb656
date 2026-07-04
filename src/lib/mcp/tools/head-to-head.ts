import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { computeAllTimeHeadToHead } from "@/lib/stats.server";

export default defineTool({
  name: "get_head_to_head",
  title: "All-time head-to-head",
  description: "Return all-time HockeyEttan head-to-head record between two teams across known seasons.",
  inputSchema: {
    home: z.string().min(1).describe("Home team name, e.g. 'Grästorps IK'."),
    away: z.string().min(1).describe("Away team name."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ home, away }) => {
    const result = await computeAllTimeHeadToHead(home, away);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: { headToHead: result },
    };
  },
});
