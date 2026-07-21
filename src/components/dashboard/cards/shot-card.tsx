import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamData } from "@/lib/dashboard-utils";
import type { GameFlowResultDto } from "@/lib/game-flow.functions";

const RECENT_N = 10;

const fmt = (n: number | null | undefined, digits = 1) =>
  n != null && Number.isFinite(n) ? n.toFixed(digits) : "—";

function aggregateGoalies(team: TeamData) {
  const goalies = team.goalies ?? [];
  let shots = 0;
  let gp = 0;
  let valid = false;
  for (const g of goalies) {
    if (
      g.shotsAgainst != null &&
      g.gamesPlayed != null &&
      Number.isFinite(g.shotsAgainst) &&
      Number.isFinite(g.gamesPlayed) &&
      g.gamesPlayed > 0
    ) {
      shots += g.shotsAgainst;
      gp += g.gamesPlayed;
      valid = true;
    }
  }
  if (!valid || gp === 0) return { saPerGame: null as number | null };
  return { saPerGame: shots / gp };
}

function aggregateRecentShots(games: GameFlowResultDto["games"]) {
  const recent = games.slice(0, RECENT_N);
  const withFor = recent.filter(
    (g) => g.teamShots != null && Number.isFinite(g.teamShots),
  );
  const withAgainst = recent.filter(
    (g) => g.oppShots != null && Number.isFinite(g.oppShots),
  );
  return {
    avgFor: withFor.length
      ? withFor.reduce((s, g) => s + (g.teamShots ?? 0), 0) / withFor.length
      : null,
    avgAgainst: withAgainst.length
      ? withAgainst.reduce((s, g) => s + (g.oppShots ?? 0), 0) / withAgainst.length
      : null,
    n: recent.length,
  };
}

function Dot() {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle"
      aria-label="bättre"
    />
  );
}

function StatRow({
  label,
  homeVal,
  awayVal,
  higherIsBetter,
}: {
  label: string;
  homeVal: number | null;
  awayVal: number | null;
  higherIsBetter: boolean;
}) {
  const homeWins =
    homeVal != null && awayVal != null
      ? higherIsBetter
        ? homeVal > awayVal
        : homeVal < awayVal
      : false;
  const awayWins =
    homeVal != null && awayVal != null
      ? higherIsBetter
        ? awayVal > homeVal
        : awayVal < homeVal
      : false;

  return (
    <tr className="border-t border-border">
      <td className="py-2 text-right font-mono text-xl tabular-nums">
        <span className={homeWins ? "text-emerald-500" : "text-foreground"}>
          {fmt(homeVal)}
        </span>
        {homeWins && <span className="ml-1.5"><Dot /></span>}
      </td>
      <td className="px-4 py-2 text-center text-xs text-muted-foreground whitespace-nowrap">
        {label}
      </td>
      <td className="py-2 text-left font-mono text-xl tabular-nums">
        {awayWins && <span className="mr-1.5"><Dot /></span>}
        <span className={awayWins ? "text-emerald-500" : "text-foreground"}>
          {fmt(awayVal)}
        </span>
      </td>
    </tr>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={3}
        className="pb-1 pt-4 text-center text-xs uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </td>
    </tr>
  );
}

export function ShotCard({
  home,
  away,
  homeFlow,
  awayFlow,
}: {
  home: TeamData;
  away: TeamData;
  homeFlow: GameFlowResultDto | null | undefined;
  awayFlow: GameFlowResultDto | null | undefined;
}) {
  const homeRecent = aggregateRecentShots(homeFlow?.games ?? []);
  const awayRecent = aggregateRecentShots(awayFlow?.games ?? []);
  const homeGoalie = aggregateGoalies(home);
  const awayGoalie = aggregateGoalies(away);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skott</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="pb-2 text-right text-xs font-medium text-foreground">
                {home.name}
              </th>
              <th className="px-4 pb-2" />
              <th className="pb-2 text-left text-xs font-medium text-foreground">
                {away.name}
              </th>
            </tr>
          </thead>
          <tbody>
            <SectionHead label={`Senaste ${RECENT_N} matcher`} />
            <StatRow
              label="SF / match"
              homeVal={homeRecent.avgFor}
              awayVal={awayRecent.avgFor}
              higherIsBetter={true}
            />
            <StatRow
              label="SA / match"
              homeVal={homeRecent.avgAgainst}
              awayVal={awayRecent.avgAgainst}
              higherIsBetter={false}
            />
            <SectionHead label="Säsong" />
            <StatRow
              label="SF / match"
              homeVal={home.shotsForPerGame ?? null}
              awayVal={away.shotsForPerGame ?? null}
              higherIsBetter={true}
            />
            <StatRow
              label="SA / match"
              homeVal={homeGoalie.saPerGame}
              awayVal={awayGoalie.saPerGame}
              higherIsBetter={false}
            />
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
