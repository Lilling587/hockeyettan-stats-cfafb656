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

function formatPm(pm: number | null): string {
  if (pm == null) return "—";
  return pm > 0 ? `+${pm}` : String(pm);
}

export function PlusMinusCard({ team }: { team: TeamData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base min-w-0 truncate">{team.name} · Plus/minus</CardTitle>
      </CardHeader>
      <CardContent>
        {team.topPlusMinus.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Spelare</TableHead>
                  <TableHead className="text-right">GP</TableHead>
                  <TableHead className="text-right">+/-</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.topPlusMinus.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right font-mono">{p.gamesPlayed ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatPm(p.plusMinus)}
                    </TableCell>
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
