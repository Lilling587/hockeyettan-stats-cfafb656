import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamData } from "@/lib/dashboard-utils";
import type { GameFlowResultDto } from "@/lib/game-flow.functions";

const RECENT_N = 10;

const fmt = (n: number | null | undefined, digits = 1) =>
  n != null && Number.isFinite(n) ? n.toFixed(digits) : "—";


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
      <td className="py-2 pr-2 text-right font-mono text-xl tabular-nums">
        <span className={homeWins ? "text-emerald-500" : "text-foreground"}>
          {fmt(homeVal)}
        </span>
        {homeWins && <span className="ml-1.5"><Dot /></span>}
      </td>
      <td className="py-2 text-center text-xs text-muted-foreground">
        {label}
      </td>
      <td className="py-2 pl-2 text-left font-mono text-xl tabular-nums">
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
        className="pb-1 pt-3 text-center text-xs uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </td>
    </tr>
  );
}

function SectionDivider() {
  return (
    <tr>
      <td colSpan={3} className="py-3">
        <div className="h-[3px] rounded-full bg-foreground/20" />
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
  

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skott</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: "38%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "38%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="pb-3 text-right text-base font-semibold text-foreground">
                {home.name}
              </th>
              <th className="pb-3 text-center" />
              <th className="pb-3 text-left text-base font-semibold text-foreground">
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
            <SectionDivider />
            <SectionHead label="Säsong" />
            <StatRow
              label="SF / match"
              homeVal={home.shotsForPerGame ?? null}
              awayVal={away.shotsForPerGame ?? null}
              higherIsBetter={true}
            />
            <StatRow
              label="SA / match"
              homeVal={home.shotsAgainstPerGame ?? null}
              awayVal={away.shotsAgainstPerGame ?? null}
              higherIsBetter={false}
            />
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
