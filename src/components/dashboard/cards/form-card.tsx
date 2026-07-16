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

export function FormCard({ team }: { team: TeamData }) {
  const games = team.lastFive ?? [];
  const home = games.filter((g) => g.isHome === true);
  const away = games.filter((g) => g.isHome === false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · senaste 5</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {games.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <>
            <ul className="space-y-3 sm:space-y-2">
              {games.map((g, i) => (
                <li
                  key={i}
                  className="text-sm border-b border-border pb-2 last:border-0"
                >
                  {/* Mobile: two-line layout */}
                  <div className="flex flex-col gap-1 sm:hidden">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge variant={resultVariant(g.result)}>{resultLabel(g.result)}</Badge>
                        {g.isHome !== null ? (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {g.isHome ? "HEMMA" : "BORTA"}
                          </span>
                        ) : null}
                      </div>
                      <span className="font-mono text-xs shrink-0">{g.score}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate min-w-0">vs {g.opponent}</span>
                      <span className="tabular-nums shrink-0">{g.date || "—"}</span>
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
              <SplitRow label="Hemma (senaste 5)" games={home} />
              <SplitRow label="Borta (senaste 5)" games={away} />
            </div>

            <FormTrendSection team={team} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
