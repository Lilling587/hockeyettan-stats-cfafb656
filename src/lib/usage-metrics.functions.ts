import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EndpointRow = {
  endpoint: string;
  total: number;
  errors: number;
  cacheHits: number;
  avgLatencyMs: number;
};

export type JobRow = {
  name: string;
  total: number;
  errors: number;
};

export type RecentEvent = {
  at: string;
  kind: "scrape" | "email" | "error" | "vmix";
  label: string;
  status: string;
  detail?: string;
};

export type UsageSnapshot = {
  windowHours: number;
  generatedAt: string;
  endpoints: EndpointRow[];
  emailJobs: JobRow[];
  errorSources: JobRow[];
  vmixActions: JobRow[];
  totals: {
    scrapeCalls: number;
    scrapeErrors: number;
    emailsSent: number;
    emailsFailed: number;
    errorEvents: number;
    vmixEvents: number;
  };
  recent: RecentEvent[];
};

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const getUsageSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { windowHours?: number }) => ({
    windowHours: Math.max(1, Math.min(input?.windowHours ?? 24, 24 * 30)),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();

    const [scrapeRes, emailRes, errorRes, vmixRes] = await Promise.all([
      supabase
        .from("scrape_metrics")
        .select("endpoint,status,latency_ms,cache_hit,error,fetched_at")
        .gte("fetched_at", since)
        .order("fetched_at", { ascending: false })
        .limit(5000),
      supabase
        .from("email_send_log")
        .select("template_name,status,recipient_email,error_message,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("error_log")
        .select("source,level,message,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("vmix_audit_log")
        .select("action,home_team,away_team,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    const scrape = scrapeRes.data ?? [];
    const emails = emailRes.data ?? [];
    const errors = errorRes.data ?? [];
    const vmix = vmixRes.data ?? [];

    // Aggregate endpoints
    const epMap = new Map<string, EndpointRow>();
    for (const r of scrape) {
      const cur = epMap.get(r.endpoint) ?? {
        endpoint: r.endpoint,
        total: 0,
        errors: 0,
        cacheHits: 0,
        avgLatencyMs: 0,
      };
      cur.total += 1;
      if (r.status === "error") cur.errors += 1;
      if (r.cache_hit) cur.cacheHits += 1;
      cur.avgLatencyMs += r.latency_ms ?? 0;
      epMap.set(r.endpoint, cur);
    }
    const endpoints = [...epMap.values()]
      .map((r) => ({ ...r, avgLatencyMs: Math.round(r.avgLatencyMs / Math.max(r.total, 1)) }))
      .sort((a, b) => b.total - a.total);

    // Email jobs by template
    const emailMap = new Map<string, JobRow>();
    for (const r of emails) {
      const cur = emailMap.get(r.template_name) ?? { name: r.template_name, total: 0, errors: 0 };
      cur.total += 1;
      if (r.status === "failed" || r.status === "bounced" || r.status === "dlq") cur.errors += 1;
      emailMap.set(r.template_name, cur);
    }
    const emailJobs = [...emailMap.values()].sort((a, b) => b.total - a.total);

    // Error sources
    const srcMap = new Map<string, JobRow>();
    for (const r of errors) {
      const cur = srcMap.get(r.source) ?? { name: r.source, total: 0, errors: 0 };
      cur.total += 1;
      if (r.level === "error" || r.level === "fatal") cur.errors += 1;
      srcMap.set(r.source, cur);
    }
    const errorSources = [...srcMap.values()].sort((a, b) => b.total - a.total);

    // vMix actions
    const vmixMap = new Map<string, JobRow>();
    for (const r of vmix) {
      const cur = vmixMap.get(r.action) ?? { name: r.action, total: 0, errors: 0 };
      cur.total += 1;
      vmixMap.set(r.action, cur);
    }
    const vmixActions = [...vmixMap.values()].sort((a, b) => b.total - a.total);

    // Recent unified feed (top 60)
    const recent: RecentEvent[] = [
      ...scrape.slice(0, 30).map((r): RecentEvent => ({
        at: r.fetched_at,
        kind: "scrape",
        label: r.endpoint,
        status: r.status,
        detail: r.error ?? `${r.latency_ms}ms${r.cache_hit ? " · cache" : ""}`,
      })),
      ...emails.slice(0, 30).map((r): RecentEvent => ({
        at: r.created_at,
        kind: "email",
        label: r.template_name,
        status: r.status,
        detail: r.recipient_email,
      })),
      ...errors.slice(0, 30).map((r): RecentEvent => ({
        at: r.created_at,
        kind: "error",
        label: r.source,
        status: r.level,
        detail: r.message?.slice(0, 140),
      })),
      ...vmix.slice(0, 30).map((r): RecentEvent => ({
        at: r.created_at,
        kind: "vmix",
        label: r.action,
        status: "ok",
        detail: r.home_team && r.away_team ? `${r.home_team} vs ${r.away_team}` : undefined,
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 60);

    const snapshot: UsageSnapshot = {
      windowHours: data.windowHours,
      generatedAt: new Date().toISOString(),
      endpoints,
      emailJobs,
      errorSources,
      vmixActions,
      totals: {
        scrapeCalls: scrape.length,
        scrapeErrors: scrape.filter((r: any) => r.status === "error").length,
        emailsSent: emails.filter((r: any) => r.status === "sent").length,
        emailsFailed: emails.filter((r: any) => ["failed", "bounced", "dlq"].includes(r.status)).length,
        errorEvents: errors.length,
        vmixEvents: vmix.length,
      },
      recent,
    };

    return snapshot;
  });
