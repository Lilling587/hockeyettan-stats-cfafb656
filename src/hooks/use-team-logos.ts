import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  ensureTeamLogo,
  getTeamLogos,
} from "@/lib/team-logos.functions";

const STORAGE_KEY = "lovable.teamlogos.v2";
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const GC_MS = 7 * 24 * 60 * 60 * 1000;
const QUERY_KEY = ["team-logos"] as const;

type LogoMap = Record<string, string>;
type StoredCache = { fetchedAt: number; logos: LogoMap };

function readStored(): StoredCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCache;
    if (!parsed || typeof parsed !== "object" || !parsed.logos) return null;
    if (Date.now() - parsed.fetchedAt > STORAGE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(logos: LogoMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), logos } satisfies StoredCache),
    );
  } catch {
    // ignore quota errors
  }
}

/**
 * Returns a memo of team name -> logo URL. The first call loads the cached
 * map from the server (which is itself backed by a Postgres cache). The map
 * is mirrored to localStorage so subsequent page loads hydrate instantly
 * without a network roundtrip.
 */
export function useTeamLogos(): LogoMap {
  const fetcher = useServerFn(getTeamLogos);
  const queryClient = useQueryClient();
  const seed = readStored();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await fetcher()).logos,
    initialData: seed?.logos,
    initialDataUpdatedAt: seed?.fetchedAt,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (query.data) writeStored(query.data);
  }, [query.data]);

  // Lazy-fetch unknown teams; result is merged into the cached map.
  useEffect(() => {
    const inflight = new Map<string, Promise<void>>();
    const tried = new Set<string>();
    (window as unknown as { __resolveTeamLogo?: (t: string) => Promise<void> })
      .__resolveTeamLogo = async (team: string) => {
      const current = queryClient.getQueryData<LogoMap>(QUERY_KEY) ?? {};
      if (current[team]) return;
      if (tried.has(team)) return;
      const existing = inflight.get(team);
      if (existing) return existing;
      const p = (async () => {
        try {
          const { url } = await ensureTeamLogo({ data: { team } });
          tried.add(team);
          if (!url) return;
          queryClient.setQueryData<LogoMap>(QUERY_KEY, (prev) => ({
            ...(prev ?? {}),
            [team]: url,
          }));
        } catch {
          tried.add(team);
        } finally {
          inflight.delete(team);
        }
      })();
      inflight.set(team, p);
      return p;
    };
  }, [queryClient]);

  return query.data ?? {};
}

export function useTeamLogo(team: string): string | undefined {
  const logos = useTeamLogos();
  const url = logos[team];

  useEffect(() => {
    if (url || typeof window === "undefined") return;
    const resolver = (
      window as unknown as {
        __resolveTeamLogo?: (t: string) => Promise<void>;
      }
    ).__resolveTeamLogo;
    void resolver?.(team);
  }, [team, url]);

  return url;
}
