import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resultPoints, type TeamData } from "@/lib/dashboard-utils";

type Split = NonNullable<TeamData["venueForm"]>["home"];

function splitStats(split: Split | null | undefined) {
  if (!split || split.results.length === 0) {
    return { games: 0, ppg: null as number | null, winPct: null as number | null };
  }
  const games = split.results.length;
  const pts = split.results.reduce((a, r) => a + resultPoints(r), 0);
  const wins = split.results.filter((r) => r === "W" || r === "OTW").length;
  return {
    games,
    ppg: pts / games,
    winPct: (wins / games) * 100,
  };
}

function SplitRow({
  label,
  split,
}: {
  label: string;
  split: Split | null | undefined;
}) {
  const { games, ppg, winPct } = splitStats(split);
  return (
    <div className="grid grid-cols-4 items-baseline gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="text-right font-mono tabular-nums text-muted-foreground">
        {games || "—"}
      </span>
      <span className="text-right font-mono tabular-nums">
        {ppg != null ? ppg.toFixed(2) : "—"}
      </span>
      <span className="text-right font-mono tabular-nums">
        {winPct != null ? `${winPct.toFixed(0)}%` : "—"}
      </span>
    </div>
  );
}

function TeamBlock({ team }: { team: TeamData }) {
  return (
    <div className="space-y-2">
      <div className="truncate text-sm font-semibold">{team.name}</div>
      <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
      
        <span className="text-right">Matcher</span>
        <span className="text-right">Poäng/match</span>
        <span className="text-right">Vinst%</span>
      </div>
      <SplitRow label="Hemma" split={team.venueForm?.home} />
      <SplitRow label="Borta" split={team.venueForm?.away} />
    </div>
  );
}

export function HomeAwaySplitCard({
  home,
  away,
}: {
  home: TeamData;
  away: TeamData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Hemma/borta-split</CardTitle>
        <p className="text-xs text-muted-foreground">
          Vinstprocent och poäng per match fördelat på hemma- och bortamatcher.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <TeamBlock team={home} />
        <TeamBlock team={away} />
      </CardContent>
    </Card>
  );
}
