import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

export type SupabaseHealthReport = {
  checkedAt: string;
  env: {
    name: string;
    present: boolean;
    // Only booleans and lengths — never the value.
    length: number | null;
  }[];
  connectivity: {
    publishable: { ok: boolean; latencyMs: number; error: string | null };
    serviceRole: { ok: boolean; latencyMs: number; error: string | null };
  };
  overall: "ok" | "degraded" | "down";
};

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export const checkSupabaseHealth = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async (): Promise<SupabaseHealthReport> => {
    const env = REQUIRED_ENV.map((name) => {
      const value = process.env[name];
      return {
        name,
        present: typeof value === "string" && value.length > 0,
        length: typeof value === "string" ? value.length : null,
      };
    });

    const url = process.env.SUPABASE_URL;
    const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    async function ping(key: string | undefined) {
      const start = Date.now();
      if (!url || !key) {
        return {
          ok: false,
          latencyMs: 0,
          error: "Missing URL or key",
        };
      }
      try {
        const res = await fetch(`${url}/auth/v1/health`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        return {
          ok: res.ok,
          latencyMs: Date.now() - start,
          error: res.ok ? null : `HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const [publishableRes, serviceRes] = await Promise.all([
      ping(publishable),
      ping(serviceRole),
    ]);

    const allEnvOk = env.every((e) => e.present);
    const allConnOk = publishableRes.ok && serviceRes.ok;
    const overall: SupabaseHealthReport["overall"] =
      allEnvOk && allConnOk
        ? "ok"
        : !allEnvOk && !allConnOk
          ? "down"
          : "degraded";

    return {
      checkedAt: new Date().toISOString(),
      env,
      connectivity: {
        publishable: publishableRes,
        serviceRole: serviceRes,
      },
      overall,
    };
  });
