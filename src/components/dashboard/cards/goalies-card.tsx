import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TeamData } from "@/lib/dashboard-utils";

export function GoaliesCard({ team }: { team: TeamData }) {
  const goalies = [...(team.goalies ?? [])].sort((a, b) => {
    const aHas = a.savePct != null ? 1 : 0;
    const bHas = b.savePct != null ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return (b.savePct ?? 0) - (a.savePct ?? 0);
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · Målvakter</CardTitle>
      </CardHeader>
      <CardContent>
        {goalies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Målvakt</TableHead>
                  <TableHead className="text-right">GP</TableHead>
                  <TableHead className="text-right">SV%</TableHead>
                  <TableHead className="text-right">GAA</TableHead>
                  <TableHead className="text-right">SO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goalies.map((g, i) => (
                  <TableRow key={i}>
                    <TableCell>{g.name}</TableCell>
                    <TableCell className="text-right font-mono">{g.gamesPlayed ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {g.savePct != null ? g.savePct.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {g.gaa != null ? g.gaa.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{g.shutouts ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
