import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamData } from "@/lib/dashboard-utils";

export function DisciplineCard({ home, away }: { home: TeamData; away: TeamData }) {
  const fmt = (n: number | null | undefined, digits = 1) =>
    n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
  const edge: "home" | "away" | "even" | null =
    home.discipline && away.discipline
      ? home.discipline.perGame === away.discipline.perGame
        ? "even"
        : home.discipline.perGame < away.discipline.perGame
          ? "home"
          : "away"
      : null;
  const renderTeam = (team: TeamData, side: "home" | "away") => {
    const d = team.discipline;
    const disciplined = edge === side;
    return (
      <div className={disciplined ? "font-semibold" : ""}>
        <div className="text-xs text-muted-foreground">{team.name}</div>
        <div className="font-mono text-2xl">{fmt(d?.perGame ?? null)}</div>
        <div className="text-[11px] text-muted-foreground">
          {d ? `${d.totalPim} PIM / ${d.gamesPlayed} GP` : "Saknar data"}
        </div>
        {d && d.topOffenders.length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-xs">
            {d.topOffenders.map((p) => (
              <li key={p.name} className="flex justify-between gap-2">
                <span className="truncate">{p.name}</span>
                <span className="font-mono text-muted-foreground">{p.pim}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base min-w-0 truncate">Utvisningsminuter</CardTitle>
        <p className="text-xs text-muted-foreground">
          Utvisningsminuter per match.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {renderTeam(home, "home")}
          {renderTeam(away, "away")}
        </div>
        {edge == null && (
          <div className="mt-3 text-center">
            <Badge variant="outline">Saknar data</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
