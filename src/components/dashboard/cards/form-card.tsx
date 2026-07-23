import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  lastFivePpg,
  resultLabel,
  resultPoints,
  resultVariant,
  teamPpg,
  type TeamData,
} from "@/lib/dashboard-utils";

type Game = TeamData["lastFive"][number];

function splitStats(games: Game[]) {
  if (games.length === 0) {
    return { games: 0, points: 0, maxPoints: 0, winPct: null as number | null };
  }
  const points = games.reduce((a, g) => a + resultPoints(g.result), 0);
  const wins = games.filter((g) => g.result === "W" || g.result === "OTW").length;
  return {
    games: games.length,
    points,
    maxPoints: games.length * 3,
    winPct: (wins / games.length) * 100,
  };
}

function SplitRow({ label, games }: { label: string; games: Game[] }) {
  const s = splitStats(games);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {s.games === 0
            ? "inga matcher"
            : `${s.points}/${s.maxPoints} p · ${s.winPct!.toFixed(0)}%`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {games.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          games.map((g, i) => (
            <Badge
              key={i}
              variant={resultVariant(g.result)}
              className="h-4 px-1.5 text-[10px]"
              title={`${g.date || ""} vs ${g.opponent || ""} ${g.score || ""}`}
            >
              {resultLabel(g.result)}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

function FormTrendSection({ team }: { team: TeamData }) {
  const recent = lastFivePpg(team);
  const season = teamPpg(team);
  const diff = recent != null && season != null ? recent - season : null;
  const arrow = diff == null ? "→" : diff > 0.15 ? "▲" : diff < -0.15 ? "▼" : "→";
  const tone =
    diff == null
      ? "text-muted-foreground"
      : diff > 0.15
        ? "text-emerald-500"
        : diff < -0.15
          ? "text-rose-500"
          : "text-muted-foreground";
  const label =
    diff == null
      ? "Saknar data"
      : diff > 0.15
        ? "Stigande form"
        : diff < -0.15
          ? "Sjunkande form"
          : "Stabil form";

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Senaste 5 (p/match)</div>
          <div className="font-mono text-xl tabular-nums">
            {recent != null ? recent.toFixed(2) : "—"}
          </div>
        </div>
        <div className={`text-2xl ${tone}`}>{arrow}</div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Säsong (p/match)</div>
          <div className="font-mono text-xl tabular-nums">
            {season != null ? season.toFixed(2) : "—"}
          </div>
        </div>
      </div>
      <div className="mt-2 text-center">
        <Badge
          variant={
            diff == null ? "outline" : Math.abs(diff) > 0.15 ? "default" : "secondary"
          }
        >
          {label}
        </Badge>
      </div>
    </div>
  );
}

export function FormCard({ team }: { team: TeamData }) {
  const games = team.lastFive ?? [];
  const home = games.filter((g) => g.isHome === true);
  const away = games.filter((g) => g.isHome === false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · Senaste 5</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {games.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {games.map((g, i) => (
                <li key={i} className="py-2 first:pt-0 last:pb-0 text-sm">
                  {/* Mobile: compact two-line layout */}
                  <div className="sm:hidden">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                      <Badge variant={resultVariant(g.result)} className="shrink-0">
                        {resultLabel(g.result)}
                      </Badge>
                      <span className="truncate min-w-0 font-medium">
                        vs {g.opponent}
                      </span>
                      <span className="font-mono tabular-nums text-sm shrink-0">
                        {g.score}
                      </span>
                    </div>
                    <div className="mt-1 pl-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {g.isHome !== null ? (
                        <span className="font-medium uppercase tracking-wide">
                          {g.isHome ? "Hemma" : "Borta"}
                        </span>
                      ) : null}
                      {g.isHome !== null && g.date ? <span aria-hidden>·</span> : null}
                      {g.date ? <span className="tabular-nums">{g.date}</span> : null}
                    </div>
                  </div>

                  {/* Desktop: single-line layout */}
                  <div className="hidden sm:flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <Badge variant={resultVariant(g.result)}>{resultLabel(g.result)}</Badge>
                      {g.isHome !== null ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 h-4 whitespace-nowrap"
                          title={g.isHome ? "Hemmamatch" : "Bortamatch"}
                        >
                          {g.isHome ? "Hemma" : "Borta"}
                        </Badge>
                      ) : null}
                      <span className="text-muted-foreground tabular-nums whitespace-nowrap shrink-0 text-xs">
                        {g.date || "—"}
                      </span>
                      <span className="truncate min-w-0">vs {g.opponent}</span>
                    </div>
                    <span className="font-mono whitespace-nowrap shrink-0 text-xs">{g.score}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-border pt-3 space-y-3">
              <SplitRow label="Hemma (av senaste 5)" games={home} />
              <SplitRow label="Borta (av senaste 5)" games={away} />
            </div>

            <FormTrendSection team={team} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
