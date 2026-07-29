import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { asJson } from "./json";

export const logVmixHeartbeatTransition = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.enum(["ok", "fel"]),
        to: z.enum(["ok", "fel"]),
        okCount: z.number().int().min(0).max(999),
        total: z.number().int().min(0).max(999),
        reason: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const level = data.to === "ok" ? "info" : "warn";
    const message = `vMix heartbeat: ${data.from} → ${data.to} (${data.okCount}/${data.total} endpoints OK)`;
    await context.supabase.from("error_log").insert({
      source: "vmix-heartbeat",
      level,
      message,
      context: asJson({
        from: data.from,
        to: data.to,
        okCount: data.okCount,
        total: data.total,
        reason: data.reason ?? null,
        actorUserId: context.userId,
      }),
      route: "/admin/health",
    });
    return { ok: true };
  });

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
  { name: "Standings", path: "/api/public/vmix/standings" },
  { name: "Lineup", path: `/api/public/vmix/lineup/0?ClubId=${DEFAULT_CLUB_ID}` },
  { name: "Titlecard", path: "/api/public/vmix/titlecard" },
  { name: "Dagens matcher", path: "/api/public/vmix/todays-games" },
];

export const checkVmixHealth = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async (): Promise<VmixHealthReport> => {
    const reqUrl = new URL(getRequestUrl());
    // Local dev serves plain HTTP on localhost; getRequestUrl() may report
    // https which fails with "fetch failed" for the internal roundtrip.
    if (reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1") {
      reqUrl.protocol = "http:";
    }
    const origin = reqUrl.origin;


    // TEMP: simulate a vMix endpoint outage until this timestamp, then auto-revert.
    const SIMULATE_FAILURE_UNTIL = "2026-07-20T07:48:55Z";
    const simulateFailure = Date.now() < Date.parse(SIMULATE_FAILURE_UNTIL);

    const results = await Promise.all(
      ENDPOINTS.map(async ({ name, path }): Promise<VmixEndpointStatus> => {
        const start = Date.now();
        if (simulateFailure && name === "Lineup") {
          return {
            name,
            path,
            ok: false,
            status: 503,
            latencyMs: 42,
            contentType: "text/plain",
            bodyPreview:
              "SIMULATED OUTAGE: upstream vMix lineup service unavailable. This is a temporary test injected from admin/health and will auto-clear within ~1 minute.",
            error: "HTTP 503 (simulated)",
          };
        }
        try {
          const res = await fetch(`${origin}${path}`, {
            headers: { accept: "*/*" },
          });
          const text = await res.text();
          return {
            name,
            path,
            ok: res.ok,
            status: res.status,
            latencyMs: Date.now() - start,
            contentType: res.headers.get("content-type"),
            bodyPreview: text.slice(0, 800),
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
