import { defineMcp } from "@lovable.dev/mcp-js";
import todaysMatchupTool from "./tools/todays-matchup";
import standingsTool from "./tools/standings";
import headToHeadTool from "./tools/head-to-head";

export default defineMcp({
  name: "grastorps-ik-mcp",
  title: "Grästorps IK HockeyEttan MCP",
  version: "0.1.0",
  instructions:
    "Read-only tools for HockeyEttan Södra data used by the Grästorps IK broadcast app. Use `get_todays_matchup` to check if a team plays on a given date, `get_standings` for the league table, and `get_head_to_head` for all-time meetings between two teams.",
  tools: [todaysMatchupTool, standingsTool, headToHeadTool],
});
