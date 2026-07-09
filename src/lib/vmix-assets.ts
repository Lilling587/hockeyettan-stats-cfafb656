// Resolves the base URL for vMix broadcast assets served from Lovable Cloud
// Storage (the `vmix-assets` public bucket). Layout inside the bucket:
//   logos/<CODE>_small.png
//   logos/<CODE>_large.png
//   resources/lineup-PLATE.png
//   resources/transparent.png
//   resources/lineupBG.png
//   resources/lineup-DIVISION.png

export const VMIX_BUCKET = "vmix-assets";

export const VMIX_RESOURCE_FILES = [
  "lineup-PLATE.png",
  "transparent.png",
  "lineupBG.png",
  "lineup-DIVISION.png",
] as const;

export type VmixResourceFile = (typeof VMIX_RESOURCE_FILES)[number];

/** Public base URL for the vmix-assets bucket, without trailing slash. */
export function getVmixAssetBaseUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${VMIX_BUCKET}`;
}

/**
 * Preferred resolver: use the configured setting only if it looks like a
 * real HTTPS URL the operator explicitly picked (rare); otherwise fall back
 * to the Storage public URL. The old default was the local vMix machine
 * (`http://192.168.1.235:...`) which cannot be reached from outside the
 * broadcast studio.
 */
export function resolveVmixAssetBaseUrl(
  configured: string | null | undefined,
  supabaseUrl: string,
): string {
  const trimmed = (configured ?? "").trim().replace(/\/+$/, "");
  const isReachable =
    trimmed.length > 0 &&
    /^https?:\/\//i.test(trimmed) &&
    !/^https?:\/\/192\.168\./i.test(trimmed) &&
    !/^https?:\/\/10\./i.test(trimmed) &&
    !/^https?:\/\/localhost/i.test(trimmed);
  return isReachable ? trimmed : getVmixAssetBaseUrl(supabaseUrl);
}
