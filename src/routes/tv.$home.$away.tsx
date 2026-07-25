import { createFileRoute, Link, redirect, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { ArrowLeft } from "lucide-react";

import { getMatchupBriefing } from "@/lib/stats.functions";
import type { Briefing } from "@/lib/stats.functions";
import { TeamLogo } from "@/components/team-logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const tvSearch = z.object({
  season: fallback(z.string(), "").default(""),
  rotate: fallback(z.coerce.number(), 8).default(8),
});

export const Route = createFileRoute("/tv/$home/$away")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) return;
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return;
    throw redirect({ to: "/auth" });
  },
  validateSearch: zodValidator(tvSearch),
  head: ({ params }) => ({
    meta: [
      { title: `${decodeURIComponent(params.home)} vs ${decodeURIComponent(params.away)} · TV` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TvMode,
});

type Card = { title: string; render: (b: Briefing) => React.ReactNode };

const CARDS: Card[] = [
  {
    title: "Form (senaste 5)",
    render: (b) => (
      <div className="grid grid-cols-2 gap-8 w-full max-w-6xl">
        {(["home", "away"] as const).map((side) => {
          const t = b[side];
          return (
            <div key={side} className="text-center">
              <div className="flex justify-center mb-6">
                <TeamLogo team={t.name} size="lg" />
              </div>
              <div className="text-3xl font-semibold mb-6">{t.name}</div>
              <div className="flex justify-center gap-3 text-4xl font-bold">
                {(t.lastFive ?? []).map((g, i) => (
                  <span
                    key={i}
                    className={
                      "h-16 w-16 grid place-items-center rounded-lg " +
                      (g.result === "W" || g.result === "OTW"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : g.result === "L" || g.result === "OTL"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-slate-500/20 text-slate-300")
                    }
                  >
                    {g.result}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    ),
  },
  {
    title: "Toppscorer",
    render: (b) => (
      <div className="grid grid-cols-2 gap-8 w-full max-w-6xl">
        {(["home", "away"] as const).map((side) => {
          const top = b[side].topScorers?.[0];
          return (
            <div key={side} className="text-center">
              <div className="text-2xl text-slate-400 mb-4">{b[side].name}</div>
              <div className="text-5xl font-bold mb-4">{top?.name ?? "—"}</div>
              <div className="text-4xl tabular-nums text-emerald-300">
                {top ? `${top.goals ?? 0}+${top.assists ?? 0}=${top.points ?? 0}` : "—"}
              </div>
              <div className="text-xl text-slate-400 mt-2">
                {top?.gamesPlayed ? `${top.gamesPlayed} matcher` : ""}
              </div>
            </div>
          );
        })}
      </div>
    ),
  },
  {
    title: "Målvakt",
    render: (b) => (
      <div className="grid grid-cols-2 gap-8 w-full max-w-6xl">
        {(["home", "away"] as const).map((side) => {
          const g = b[side].goalies?.[0];
          return (
            <div key={side} className="text-center">
              <div className="text-2xl text-slate-400 mb-4">{b[side].name}</div>
              <div className="text-5xl font-bold mb-6">{g?.name ?? "—"}</div>
              <div className="flex justify-center gap-10 text-3xl tabular-nums">
                <div>
                  <div className="text-emerald-300">{g?.savePct?.toFixed(1) ?? "—"}%</div>
                  <div className="text-base text-slate-400 mt-1">SV%</div>
                </div>
                <div>
                  <div className="text-emerald-300">{g?.gaa?.toFixed(2) ?? "—"}</div>
                  <div className="text-base text-slate-400 mt-1">GAA</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ),
  },
  {
    title: "Special teams",
    render: (b) => (
      <div className="grid grid-cols-2 gap-8 w-full max-w-6xl">
        {(["home", "away"] as const).map((side) => {
          const t = b[side];
          return (
            <div key={side} className="text-center">
              <div className="text-2xl text-slate-400 mb-6">{t.name}</div>
              <div className="flex justify-center gap-12 text-4xl tabular-nums">
                <div>
                  <div className="text-emerald-300 font-bold">
                    {t.powerPlayPct?.toFixed(1) ?? "—"}%
                  </div>
                  <div className="text-lg text-slate-400 mt-2">Powerplay</div>
                </div>
                <div>
                  <div className="text-emerald-300 font-bold">
                    {t.penaltyKillPct?.toFixed(1) ?? "—"}%
                  </div>
                  <div className="text-lg text-slate-400 mt-2">Boxplay</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ),
  },
  {
    title: "Inbördes (senaste 3)",
    render: (b) => {
      const recent = b.headToHead.slice(-3);
      return (
        <div className="w-full max-w-4xl space-y-4 text-2xl">
          {recent.length === 0 ? (
            <div className="text-center text-slate-400 text-3xl">
              Inga möten denna säsong
            </div>
          ) : (
            recent.map((g, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-slate-800/50 px-6 py-4"
              >
                <span className="text-slate-400">{g.date || "—"}</span>
                <span className="font-medium">{g.homeTeam}</span>
                <span className="text-3xl font-bold tabular-nums text-emerald-300">
                  {g.score}
                </span>
                <span className="font-medium">{g.awayTeam}</span>
              </div>
            ))
          )}
        </div>
      );
    },
  },
];

function TvMode() {
  const params = Route.useParams();
  const search = useSearch({ from: "/tv/$home/$away" });
  const home = decodeURIComponent(params.home);
  const away = decodeURIComponent(params.away);
  const fetchBriefing = useServerFn(getMatchupBriefing);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const query = useQuery({
    queryKey: ["tv-briefing", home, away, search.season],
    queryFn: () => fetchBriefing({ data: { home, away, season: search.season || undefined } }),
    staleTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (paused) return;
    const ms = Math.max(3, Number(search.rotate) || 8) * 1000;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % CARDS.length);
    }, ms);
    return () => window.clearInterval(id);
  }, [paused, search.rotate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % CARDS.length);
      if (e.key === "ArrowLeft")
        setIndex((i) => (i - 1 + CARDS.length) % CARDS.length);
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const data = query.data?.briefing as Briefing | undefined;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="absolute top-4 left-4 z-10 flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
        <Button asChild variant="ghost" size="sm" className="text-slate-300">
          <Link to="/" search={{ home, away }}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Tillbaka
          </Link>
        </Button>
        <span className="text-xs text-slate-500">
          ← → byt · Space pausa · F fullskärm
        </span>
      </header>

      <div className="flex-1 grid place-items-center px-12 py-16">
        {query.isLoading ? (
          <div className="text-3xl text-slate-400">Laddar briefing…</div>
        ) : query.isError ? (
          <div className="text-3xl text-rose-400">
            Kunde inte ladda: {(query.error as Error).message}
          </div>
        ) : !data ? (
          <div className="text-3xl text-slate-400">Ingen data</div>
        ) : (
          <div className="flex flex-col items-center gap-12 w-full">
            <div className="text-center">
              <div className="text-lg uppercase tracking-[0.3em] text-emerald-400 mb-4">
                {CARDS[index].title}
              </div>
              <div className="text-5xl font-bold tracking-tight">
                {data.home.name} <span className="text-slate-500">vs</span>{" "}
                {data.away.name}
              </div>
            </div>
            {CARDS[index].render(data)}
          </div>
        )}
      </div>

      <footer className="absolute bottom-6 left-0 right-0 flex justify-center gap-2">
        {CARDS.map((_, i) => (
          <span
            key={i}
            className={
              "h-2 w-12 rounded-full transition-colors " +
              (i === index ? "bg-emerald-400" : "bg-slate-700")
            }
          />
        ))}
      </footer>
    </div>
  );
}
