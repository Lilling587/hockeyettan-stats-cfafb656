import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamData } from "@/lib/dashboard-utils";

export function ShotVolumeCard({
  home,
  away,
}: {
  home: TeamData;
  away: TeamData;
}) {
  const aggregate = (team: TeamData) => {
    const goalies = team.goalies ?? [];
    let shots = 0;
    let saves = 0;
    let gp = 0;
    let valid = false;
    for (const g of goalies) {
      if (g.shotsAgainst != null && g.gamesPlayed != null && g.gamesPlayed > 0) {
        shots += g.shotsAgainst;
        gp += g.gamesPlayed;
        if (g.saves != null) saves += g.saves;
        valid = true;
      }
    }
    if (!valid || gp === 0) {
      return { shotsAgainstPerGame: null, teamSavePct: null };
    }
    return {
      shotsAgainstPerGame: shots / gp,
      teamSavePct: shots > 0 ? (saves / shots) * 100 : null,
    };
  };

  const h = aggregate(home);
  const a = aggregate(away);

  const fmt = (n: number | null, digits = 1) =>
    n != null ? n.toFixed(digits) : "—";

  const defenseEdge: "home" | "away" | "even" | null =
    h.shotsAgainstPerGame == null || a.shotsAgainstPerGame == null
      ? null
      : Math.abs(h.shotsAgainstPerGame - a.shotsAgainstPerGame) < 0.5
        ? "even"
        : h.shotsAgainstPerGame < a.shotsAgainstPerGame
          ? "home"
          : "away";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skott mot sig</CardTitle>
        <p className="text-xs text-muted-foreground">
          Snitt skott på mål per match.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className={`text-right ${defenseEdge === "home" ? "font-semibold" : ""}`}>
            <div className="text-xs text-muted-foreground">{home.name}</div>
            <div className="font-mono text-2xl">{fmt(h.shotsAgainstPerGame)}</div>
            <div className="text-xs text-muted-foreground">
              SV% {fmt(h.teamSavePct, 2)}
            </div>
          </div>
          <div className="text-center text-xs text-muted-foreground">vs</div>
          <div className={defenseEdge === "away" ? "font-semibold" : ""}>
            <div className="text-xs text-muted-foreground">{away.name}</div>
            <div className="font-mono text-2xl">{fmt(a.shotsAgainstPerGame)}</div>
            <div className="text-xs text-muted-foreground">
              SV% {fmt(a.teamSavePct, 2)}
            </div>
          </div>
        </div>
        <div className="mt-3 text-center">
          {defenseEdge === "even" ? (
            <Badge variant="secondary">Jämnt</Badge>
          ) : defenseEdge == null ? (
            <Badge variant="outline">Saknar data</Badge>
          ) : (
            <Badge variant="default">
              Fördel {defenseEdge === "home" ? home.name : away.name}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
