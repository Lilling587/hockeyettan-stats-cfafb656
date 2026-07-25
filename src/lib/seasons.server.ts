import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SEASONS } from "./seasons.config";

const STANDINGS_INDEX_URL =
  "https://stats.swehockey.se/ScheduleAndResults/Standings/18271";

// Parse the season selector <option> tags on the standings page. Each option
// looks like:
//   <option ... value="/ScheduleAndResults/Schedule/16095">2024-25</option>
// The competition ID encoded there is the "schedule" ID for that season; in
// practice it is the same ID swehockey uses across standings / roster / etc.
export function parseSeasonOptions(html: string): Array<{
  label: string;
  competitionId: string;
}> {
  const out: Array<{ label: string; competitionId: string }> = [];
  const re =
    /<option[^>]*value="\/ScheduleAndResults\/Schedule\/(\d+)"[^>]*>\s*(20\d{2}-\d{2})\s*<\/option>/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const competitionId = m[1];
    const label = m[2];
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, competitionId });
  }
  return out;
}

export async function fetchSeasonOptions(): Promise<
  Array<{ label: string; competitionId: string }>
> {
  const { fetchWithTimeout, withRetry } = await import("./stats.server");
  const res = await withRetry(() =>
    fetchWithTimeout(STANDINGS_INDEX_URL, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    }),
  );
  if (!res.ok) throw new Error(`Source returned ${res.status}`);
  const html = await res.text();
  return parseSeasonOptions(html);
}

export type ScanResult = {
  checkedAt: string;
  newCount: number;
  pending: Array<{
    id: string;
    label: string;
    competitionId: string;
    detectedAt: string;
  }>;
  error?: string;
};

const SCAN_TTL_MS = 6 * 60 * 60 * 1000;

function seasonAdmin(): SupabaseClient<Database> | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function runSeasonScan(
  opts: { force?: boolean } = {},
): Promise<ScanResult> {
  const supabaseAdmin = seasonAdmin();
  if (!supabaseAdmin) {
    return {
      checkedAt: new Date().toISOString(),
      newCount: 0,
      pending: [],
      error: "Season detection storage is unavailable in this environment.",
    };
  }

  // Throttle: skip if a recent successful check ran, unless forced.
  if (!opts.force) {
    const { data: meta } = await supabaseAdmin
      .from("season_check_meta")
      .select("last_checked_at, last_status")
      .eq("id", 1)
      .maybeSingle();
    const ts = meta?.last_checked_at ? new Date(meta.last_checked_at).getTime() : 0;
    if (meta?.last_status === "ok" && Date.now() - ts < SCAN_TTL_MS) {
      const pending = await listPendingDetections();
      return {
        checkedAt: meta.last_checked_at!,
        newCount: 0,
        pending,
      };
    }
  }

  const checkedAt = new Date().toISOString();
  try {
    const found = await fetchSeasonOptions();
    const configured = new Set(SEASONS.map((s) => s.label));
    // Pull all existing detections + overrides to avoid re-inserting.
    const [{ data: dets }, { data: overrides }] = await Promise.all([
      supabaseAdmin.from("season_detections").select("label, competition_id, status"),
      supabaseAdmin.from("season_overrides").select("label"),
    ]);
    const knownLabels = new Set<string>([
      ...configured,
      ...(overrides ?? []).map((r) => r.label),
      ...(dets ?? []).map((r) => r.label ?? ""),
    ]);

    const novel = found.filter(
      (s) => !knownLabels.has(s.label) && /^20\d{2}-\d{2}$/.test(s.label),
    );

    if (novel.length > 0) {
      const rows = novel.map((s) => ({
        label: s.label,
        competition_id: s.competitionId,
        status: "pending",
        source_url: STANDINGS_INDEX_URL,
      }));
      const { error } = await supabaseAdmin.from("season_detections").insert(rows);
      if (error) throw new Error(`Insert failed: ${error.message}`);
    }

    await supabaseAdmin
      .from("season_check_meta")
      .upsert(
        { id: 1, last_checked_at: checkedAt, last_status: "ok", last_error: null },
        { onConflict: "id" },
      );

    const pending = await listPendingDetections();
    return { checkedAt, newCount: novel.length, pending };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("season_check_meta")
      .upsert(
        { id: 1, last_checked_at: checkedAt, last_status: "error", last_error: message },
        { onConflict: "id" },
      );
    console.warn("[season-scan] failed:", message);
    const pending = await listPendingDetections();
    return { checkedAt, newCount: 0, pending, error: message };
  }
}

export async function listPendingDetections(): Promise<ScanResult["pending"]> {
  const supabaseAdmin = seasonAdmin();
  if (!supabaseAdmin) return [];
  const { data } = await supabaseAdmin
    .from("season_detections")
    .select("id, label, competition_id, detected_at")
    .eq("status", "pending")
    .order("detected_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label ?? "",
    competitionId: r.competition_id,
    detectedAt: r.detected_at,
  }));
}

export async function confirmDetection(input: {
  id: string;
  competitionId?: string;
}): Promise<void> {
  const supabaseAdmin = seasonAdmin();
  if (!supabaseAdmin) throw new Error("Season detection storage is unavailable in this environment.");
  const { data: row, error: selErr } = await supabaseAdmin
    .from("season_detections")
    .select("label, competition_id, status")
    .eq("id", input.id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!row) throw new Error("Detection not found");
  if (!row.label) throw new Error("Detection has no label");

  const competitionId = (input.competitionId ?? row.competition_id).trim();
  if (!/^\d+$/.test(competitionId)) throw new Error("Competition ID must be numeric");

  const { error: upErr } = await supabaseAdmin
    .from("season_overrides")
    .upsert(
      { label: row.label, competition_id: competitionId },
      { onConflict: "label" },
    );
  if (upErr) throw new Error(upErr.message);

  await supabaseAdmin
    .from("season_detections")
    .update({ status: "confirmed", resolved_at: new Date().toISOString() })
    .eq("id", input.id);
}

export async function dismissDetection(id: string): Promise<void> {
  const supabaseAdmin = seasonAdmin();
  if (!supabaseAdmin) throw new Error("Season detection storage is unavailable in this environment.");
  await supabaseAdmin
    .from("season_detections")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", id);
}

// Returns config seasons merged with confirmed overrides. Overrides take
// precedence (so a user-confirmed competition_id wins). Result is sorted by
// label descending so the newest season is first / default.
export async function getMergedSeasons(): Promise<
  Array<{ label: string; competitionId: string }>
> {
  try {
    const supabaseAdmin = seasonAdmin();
    if (!supabaseAdmin) return [...SEASONS];
    const { data } = await supabaseAdmin
      .from("season_overrides")
      .select("label, competition_id");
    const map = new Map<string, string>();
    for (const s of SEASONS) map.set(s.label, s.competitionId);
    for (const r of data ?? []) map.set(r.label, r.competition_id);
    return [...map.entries()]
      .map(([label, competitionId]) => ({ label, competitionId }))
      .sort((a, b) => (a.label < b.label ? 1 : -1));
  } catch {
    return [...SEASONS];
  }
}
