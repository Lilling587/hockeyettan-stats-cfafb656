import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resultLabel, resultPoints, resultVariant, type TeamData } from "@/lib/dashboard-utils";

type Game = TeamData["lastFive"][number];

function stats(games: Game[]) {
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
  const s = stats(games);
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

function TeamBlock({ team }: { team: TeamData }) {
  const games = team.lastFive ?? [];
  const home = games.filter((g) => g.isHome === true);
  const away = games.filter((g) => g.isHome === false);
  return (
    <div className="space-y-3">
      <div className="truncate text-sm font-semibold">{team.name}</div>
      <SplitRow label="Hemma (senaste 5)" games={home} />
      <SplitRow label="Borta (senaste 5)" games={away} />
    </div>
  );
}

export function LastFiveFormCard({
  home,
  away,
}: {
  home: TeamData;
  away: TeamData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Senaste fem · hemma/borta</CardTitle>
        <p className="text-xs text-muted-foreground">
          Poäng och vinstprocent från de fem senaste matcherna, uppdelat på hemma och borta.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <TeamBlock team={home} />
        <TeamBlock team={away} />
      </CardContent>
    </Card>
  );
}
