import type { Json } from "@/integrations/supabase/types";

export function toJsonValue(value: unknown): Json | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map(toJsonValue).filter((v): v is Json => v !== undefined);
  }
  if (typeof value === "object") {
    const out: { [key: string]: Json | undefined } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toJsonValue(v);
    }
    return out;
  }
  return String(value);
}

export function detailsToJson(details: Record<string, unknown> | undefined): Json | null {
  if (!details) return null;
  const out: { [key: string]: Json | undefined } = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = toJsonValue(value);
  }
  return out;
}

/** Assert that a runtime-validated value is JSON-serializable before writing to a Json column. */
export function asJson<T>(value: T): Json {
  return value as unknown as Json;
}
