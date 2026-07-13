import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

export const getScrapeHealth = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ windowHours: z.number().min(1).max(168).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { getScrapeMetricsSummary } = await import("./scrape-metrics.server");
    return getScrapeMetricsSummary(data.windowHours ?? 24, context.supabase);
  });
