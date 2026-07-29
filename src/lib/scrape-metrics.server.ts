// Server-only helper. Records every external scrape so /admin/health can show
// success-rate, latency p95 and recent errors. Failures here must NEVER break
// the caller — we only log.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { asJson, detailsToJson } from "./json";

type RecordOpts = {
  endpoint: string;
  season?: string | null;
  cacheHit?: boolean;
  context?: Record<string, unknown>;
};

export async function recordScrape<T>(
  opts: RecordOpts,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  let status: "ok" | "error" = "ok";
  let errorMsg: string | null = null;
  try {
    const out = await fn();
    return out;
  } catch (e) {
    status = "error";
    errorMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    const latency = Date.now() - start;
    void logRow({
      endpoint: opts.endpoint,
      season: opts.season ?? null,
      status,
      latency_ms: latency,
      cache_hit: Boolean(opts.cacheHit),
      error: errorMsg,
      context: detailsToJson(opts.context),
    });
  }
}

async function logRow(row: Database["public"]["Tables"]["scrape_metrics"]["Insert"]) {
  // Service role key is not exposed at runtime on Lovable Cloud, so we
  // can't write scrape metrics from anonymous/unauthenticated scrape paths.
  // Skip silently instead of throwing on every scrape.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("scrape_metrics").insert(row);
  } catch (e) {
    console.warn("[scrape-metrics] insert failed:", (e as Error).message);
  }
}

export type ScrapeMetricsSummary = {
  windowHours: number;
  total: number;
  okCount: number;
  errorCount: number;
  successRate: number;
  cacheHitRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  byEndpoint: Array<{
    endpoint: string;
    total: number;
    okCount: number;
    errorCount: number;
    p95LatencyMs: number;
    cacheHitRate: number;
  }>;
  recent: Array<{
    id: string;
    endpoint: string;
    season: string | null;
    status: "ok" | "error";
    latency_ms: number;
    cache_hit: boolean;
    error: string | null;
    fetched_at: string;
  }>;
};

export async function getScrapeMetricsSummary(
  windowHours = 24,
  client?: SupabaseClient<Database>,
): Promise<ScrapeMetricsSummary> {
  const supabaseAdmin =
    client ??
    (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const [{ data: rows }, { data: recent }] = await Promise.all([
    supabaseAdmin
      .from("scrape_metrics")
      .select("endpoint, status, latency_ms, cache_hit")
      .gte("fetched_at", since)
      .limit(5000),
    supabaseAdmin
      .from("scrape_metrics")
      .select("id, endpoint, season, status, latency_ms, cache_hit, error, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(50),
  ]);

  const all = (rows ?? []) as Array<{
    endpoint: string;
    status: "ok" | "error";
    latency_ms: number;
    cache_hit: boolean;
  }>;
  const total = all.length;
  const okCount = all.filter((r) => r.status === "ok").length;
  const errorCount = total - okCount;
  const successRate = total === 0 ? 1 : okCount / total;
  const cacheHits = all.filter((r) => r.cache_hit).length;
  const cacheHitRate = total === 0 ? 0 : cacheHits / total;

  const lat = all.map((r) => r.latency_ms).sort((a, b) => a - b);
  const pct = (p: number) => {
    if (lat.length === 0) return 0;
    const idx = Math.min(lat.length - 1, Math.floor((p / 100) * lat.length));
    return lat[idx];
  };

  const groups = new Map<
    string,
    { total: number; ok: number; lat: number[]; cache: number }
  >();
  for (const r of all) {
    const g = groups.get(r.endpoint) ?? { total: 0, ok: 0, lat: [], cache: 0 };
    g.total += 1;
    if (r.status === "ok") g.ok += 1;
    g.lat.push(r.latency_ms);
    if (r.cache_hit) g.cache += 1;
    groups.set(r.endpoint, g);
  }
  const byEndpoint = [...groups.entries()]
    .map(([endpoint, g]) => {
      const sorted = g.lat.sort((a, b) => a - b);
      const p95 =
        sorted.length === 0
          ? 0
          : sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))];
      return {
        endpoint,
        total: g.total,
        okCount: g.ok,
        errorCount: g.total - g.ok,
        p95LatencyMs: p95,
        cacheHitRate: g.total === 0 ? 0 : g.cache / g.total,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    windowHours,
    total,
    okCount,
    errorCount,
    successRate,
    cacheHitRate,
    p50LatencyMs: pct(50),
    p95LatencyMs: pct(95),
    byEndpoint,
    recent: (recent ?? []) as ScrapeMetricsSummary["recent"],
  };
}
