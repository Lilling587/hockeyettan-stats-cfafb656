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

export function ScorersCard({ team }: { team: TeamData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base min-w-0 truncate">{team.name} · Poängliga</CardTitle>
      </CardHeader>
      <CardContent>
        {team.topScorers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Spelare</TableHead>
                  <TableHead className="text-right">M</TableHead>
                  <TableHead className="text-right">A</TableHead>
                  <TableHead className="text-right">P</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.topScorers.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right font-mono">{p.goals ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{p.assists ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {p.points ?? "—"}
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
