import { describe, expect, it } from "vitest";
import { SpecialTeamsEntrySchema } from "@/lib/stats.server";

describe("SpecialTeamsEntrySchema", () => {
  it("accepts a valid complete entry", () => {
    const result = SpecialTeamsEntrySchema.safeParse({
      powerPlayPct: 22.5,
      penaltyKillPct: 84.0,
      powerPlayGoals: 12,
      penaltyKillGoalsAgainst: 8,
      powerPlayOpportunities: 53,
      penaltyKillOpportunities: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null values", () => {
    const result = SpecialTeamsEntrySchema.safeParse({
      powerPlayPct: null,
      penaltyKillPct: null,
      powerPlayGoals: null,
      penaltyKillGoalsAgainst: null,
      powerPlayOpportunities: null,
      penaltyKillOpportunities: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects percentages outside 0-100", () => {
    const result = SpecialTeamsEntrySchema.safeParse({
      powerPlayPct: 105,
      penaltyKillPct: -5,
      powerPlayGoals: 0,
      penaltyKillGoalsAgainst: 0,
      powerPlayOpportunities: 0,
      penaltyKillOpportunities: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = SpecialTeamsEntrySchema.safeParse({
      powerPlayPct: 20,
      penaltyKillPct: 80,
    });
    expect(result.success).toBe(false);
  });
});
