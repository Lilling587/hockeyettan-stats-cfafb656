import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamData } from "@/lib/dashboard-utils";

function fmt1(n: number | null) {
  return n != null ? n.toFixed(1) : "—";
}

function record(t: TeamData): string | null {
  if (t.wins == null && t.otWins == null && t.otLosses == null) return null;
  const gp = t.gamesPlayed ?? 0;
  const w = t.wins ?? 0;
  const otw = t.otWins ?? 0;
  const otl = t.otLosses ?? 0;
  const l = Math.max(0, gp - w - otw - otl);
  return `${w}-${otw}-${otl}-${l}`;
}

function TeamCol({ team }: { team: TeamData }) {
  const gp = team.gamesPlayed ?? 0;
  const gfpg = team.goalsFor != null && gp > 0 ? team.goalsFor / gp : null;
  const gapg = team.goalsAgainst != null && gp > 0 ? team.goalsAgainst / gp : null;
  const diff =
    team.goalsFor != null && team.goalsAgainst != null
      ? team.goalsFor - team.goalsAgainst
      : null;
  const rec = record(team);

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium truncate">{team.name}</div>
      {rec && (
        <div>
          <div className="text-xl font-semibold tabular-nums">{rec}</div>
          <div className="text-xs text-muted-foreground">W–OTW–OTL–L</div>
        </div>
      )}
      <div className="flex gap-4">
        <div>
          <div className="text-base font-semibold tabular-nums">{fmt1(gfpg)}</div>
          <div className="text-xs text-muted-foreground">GF/GP</div>
        </div>
        <div>
          <div className="text-base font-semibold tabular-nums">{fmt1(gapg)}</div>
          <div className="text-xs text-muted-foreground">GA/GP</div>
        </div>
        {diff != null && (
          <div>
            <div
              className={`text-base font-semibold tabular-nums ${
                diff > 0 ? "text-emerald-600" : diff < 0 ? "text-destructive" : ""
              }`}
            >
              {diff > 0 ? `+${diff}` : diff}
            </div>
            <div className="text-xs text-muted-foreground">+/–</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SeasonRecordCard({ home, away }: { home: TeamData; away: TeamData }) {
  const noData =
    home.goalsFor == null && home.wins == null && away.goalsFor == null && away.wins == null;
  if (noData) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Säsongsrekord & mål</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <TeamCol team={home} />
          <TeamCol team={away} />
        </div>
      </CardContent>
    </Card>
  );
}
