import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamData } from "@/lib/dashboard-utils";

function fmt1(n: number | null) {
  return n != null ? n.toFixed(1) : "—";
}

function TeamCol({ team }: { team: TeamData }) {
  const gp = team.gamesPlayed ?? 0;
  const gfpg = team.goalsFor != null && gp > 0 ? team.goalsFor / gp : null;
  const gapg = team.goalsAgainst != null && gp > 0 ? team.goalsAgainst / gp : null;
  const diff =
    team.goalsFor != null && team.goalsAgainst != null
      ? team.goalsFor - team.goalsAgainst
      : null;

  const w = team.wins ?? 0;
  const otw = team.otWins ?? 0;
  const otl = team.otLosses ?? 0;
  const gwsw = team.gwsw ?? 0;
  const gwsl = team.gwsl ?? 0;
  const l = Math.max(0, gp - w - otw - gwsw - gwsl - otl);
  const hasRecord = team.wins != null || team.otWins != null || team.otLosses != null;

  const recordCols = [
    { val: w,    label: "V"    },
    { val: otw,  label: "OTW"  },
    { val: gwsw, label: "GWSW" },
    { val: gwsl, label: "GWSL" },
    { val: otl,  label: "OTL"  },
    { val: l,    label: "F"    },
  ];

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium truncate">{team.name}</div>
      {hasRecord && (
        <div className="flex flex-wrap gap-3">
          {recordCols.map(({ val, label }) => (
            <div key={label} className="flex flex-col items-center">
              <div className="text-xl font-semibold tabular-nums">{val}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
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
        <CardTitle className="text-base">Vunna/Förlorade & målsnitt</CardTitle>
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
