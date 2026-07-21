import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

// Public endpoint — clients (signed-in or not) push structured errors here.
// Writes use supabaseAdmin (service role) so we never expose INSERT via RLS.
// Reads are admin-only and go through a separate, authenticated server fn.

const payloadSchema = z.object({
  source: z.string().min(1).max(120),
  message: z.string().min(1).max(4000),
  level: z.enum(["error", "warn", "info"]).optional().default("error"),
  stack: z.string().max(20_000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  route: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  userId: z.string().uuid().optional(),
});

export const logError = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => payloadSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; id: string | null }> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data: row, error } = await supabaseAdmin
        .from("error_log")
        .insert({
          source: data.source,
          level: data.level ?? "error",
          message: data.message.slice(0, 4000),
          stack: data.stack ?? null,
          context: (data.context ?? null) as never,
          route: data.route ?? null,
          user_agent: data.userAgent ?? null,
          user_id: data.userId ?? null,
        })
        .select("id")
        .single();
      if (error) {
        console.error("[error_log insert failed]", error.message);
        return { ok: true, id: null };
      }
      return { ok: true, id: row?.id ?? null };
    } catch (err) {
      // Never let the logger itself throw — that would mask the original error.
      console.error("[error_log fatal]", err);
      return { ok: true, id: null };
    }
  });

export type ErrorLogRow = {
  id: string;
  created_at: string;
  source: string;
  level: string;
  message: string;
  route: string | null;
  stack: string | null;
  context: string | null;
  user_agent: string | null;
  user_id: string | null;
};

export const listErrorLogs = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().min(1).max(500).optional(),
        level: z.enum(["error", "warn", "info"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: ErrorLogRow[] }> => {
    let q = context.supabase
      .from("error_log")
      .select(
        "id, created_at, source, level, message, route, stack, context, user_agent, user_id",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.level) q = q.eq("level", data.level);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const mapped: ErrorLogRow[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      created_at: r.created_at as string,
      source: r.source as string,
      level: r.level as string,
      message: r.message as string,
      route: (r.route as string | null) ?? null,
      stack: (r.stack as string | null) ?? null,
      context: r.context == null ? null : JSON.stringify(r.context),
      user_agent: (r.user_agent as string | null) ?? null,
      user_id: (r.user_id as string | null) ?? null,
    }));
    return { rows: mapped };
  });
