import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

const SWEHOCKEY_BASE = "https://stats.swehockey.se"; // stats base

export type SwehockeyEndpoint = {
  name: string;
  url: string;
  status: "ok" | "degraded" | "down";
  latencyMs: number;
  error?: string;
};

export type SwehockeyHealth = {
  overall: "ok" | "degraded" | "down";
  checkedAt: string;
  endpoints: SwehockeyEndpoint[];
};

async function probe(url: string, timeoutMs = 10_000): Promise<SwehockeyEndpoint> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { name: endpointName(url), url, status: "down", latencyMs, error: `HTTP ${res.status}` };
    }
    // Swehockey sometimes returns 200 with a maintenance or error page.
    const text = await res.text();
    if (text.length < 200 || /underhåll|maintenance|error/i.test(text.slice(0, 500))) {
      return { name: endpointName(url), url, status: "degraded", latencyMs, error: "Maintenance or error page returned" };
    }
    return { name: endpointName(url), url, status: "ok", latencyMs };
  } catch (err) {
    return { name: endpointName(url), url, status: "down", latencyMs: Date.now() - start, error: (err as Error).message };
  }
}

function endpointName(url: string): string {
  if (url.includes("Schedule")) return "Schedule";
  if (url.includes("Standings")) return "Standings";
  if (url.includes("ScoringAndGoalkeeping")) return "Scoring & Goalkeeping";
  if (url.includes("PowerplayAndPenaltyKilling")) return "Special Teams";
  if (url.includes("Game/Events")) return "Game Events";
  return url;
}

export const checkSwehockeyHealth = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<SwehockeyHealth> => {
    const competitionId = 18271; // 2025-26 HockeyEttan Södra
    const endpoints = await Promise.all([
      probe(`${SWEHOCKEY_BASE}/ScheduleAndResults/Schedule/${competitionId}`),
      probe(`${SWEHOCKEY_BASE}/ScheduleAndResults/Standings/${competitionId}`),
      probe(`${SWEHOCKEY_BASE}/Teams/Statistics/ScoringAndGoalkeeping/${competitionId}`),
      probe(`${SWEHOCKEY_BASE}/Teams/Statistics/PowerplayAndPenaltyKilling/${competitionId}`),
    ]);

    const downCount = endpoints.filter((e) => e.status === "down").length;
    const degradedCount = endpoints.filter((e) => e.status === "degraded").length;
    const overall = downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "ok";

    return { overall, checkedAt: new Date().toISOString(), endpoints };
  });
