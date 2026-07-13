import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

export type VmixEndpointStatus = {
  name: string;
  path: string;
  ok: boolean;
  status: number | null;
  latencyMs: number;
  contentType: string | null;
  bodyPreview: string | null;
  error: string | null;
};

export type VmixHealthReport = {
  checkedAt: string;
  origin: string;
  endpoints: VmixEndpointStatus[];
  overall: "ok" | "degraded" | "down";
};

const DEFAULT_CLUB_ID = "570";

const ENDPOINTS: { name: string; path: string }[] = [
  { name: "Current match", path: "/api/public/vmix/current" },
  { name: "Lineup v0", path: `/api/public/vmix/lineup/0?ClubId=${DEFAULT_CLUB_ID}` },
  { name: "Lineup v1", path: `/api/public/vmix/lineup/1?ClubId=${DEFAULT_CLUB_ID}` },
  { name: "Standings", path: `/api/public/vmix/standings?ClubId=${DEFAULT_CLUB_ID}` },
];

export const checkVmixHealth = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async (): Promise<VmixHealthReport> => {
    const reqUrl = new URL(getRequestUrl());
    const origin = reqUrl.origin;

    const results = await Promise.all(
      ENDPOINTS.map(async ({ name, path }): Promise<VmixEndpointStatus> => {
        const start = Date.now();
        try {
          const res = await fetch(`${origin}${path}`, {
            headers: { accept: "application/xml, text/xml, application/json" },
          });
          const text = await res.text();
          return {
            name,
            path,
            ok: res.ok,
            status: res.status,
            latencyMs: Date.now() - start,
            contentType: res.headers.get("content-type"),
            bodyPreview: text.slice(0, 160),
            error: res.ok ? null : `HTTP ${res.status}`,
          };
        } catch (err) {
          return {
            name,
            path,
            ok: false,
            status: null,
            latencyMs: Date.now() - start,
            contentType: null,
            bodyPreview: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const okCount = results.filter((r) => r.ok).length;
    const overall: VmixHealthReport["overall"] =
      okCount === results.length ? "ok" : okCount === 0 ? "down" : "degraded";

    return {
      checkedAt: new Date().toISOString(),
      origin,
      endpoints: results,
      overall,
    };
  });
