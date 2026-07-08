import { auth, defineMcp } from "@lovable.dev/mcp-js";
import todaysMatchupTool from "./tools/todays-matchup";
import standingsTool from "./tools/standings";
import headToHeadTool from "./tools/head-to-head";

// Supabase GoTrue issues user JWTs with `aud: "authenticated"`. Require a
// verified bearer for every MCP call so the server is not open to the world
// once published.
const supabaseUrl =
  process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;

export default defineMcp({
  name: "grastorps-ik-mcp",
  title: "Grästorps IK HockeyEttan MCP",
  version: "0.1.0",
  instructions:
    "Read-only tools for HockeyEttan Södra data used by the Grästorps IK broadcast app. Use `get_todays_matchup` to check if a team plays on a given date, `get_standings` for the league table, and `get_head_to_head` for all-time meetings between two teams.",
  auth: auth.oauth.issuer({
    issuer: `${supabaseUrl}/auth/v1`,
    jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    acceptedAudiences: ["authenticated"],
    resourceName: "Grästorps IK HockeyEttan MCP",
  }),
  tools: [todaysMatchupTool, standingsTool, headToHeadTool],
});
