import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, ClipboardCopy, FileText, ImageDown, Loader2, Printer, RefreshCw, Tv } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  briefingToMarkdown,
  briefingToTvText,
  copyToClipboard,
} from "@/lib/briefing-export";
import type { Briefing } from "@/lib/stats.functions";
import { getGameFlowForMatchup } from "@/lib/game-flow.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { TeamHeader } from "./cards/team-header";
import { FormCard } from "./cards/form-card";
import { VenueStreakCard } from "./cards/venue-streak-card";
import { PeriodGoalsCard } from "./cards/period-goals-card";
import { ScorersCard } from "./cards/scorers-card";
import { GoaliesCard } from "./cards/goalies-card";
import { ShotCard } from "./cards/shot-card";
import { SpecialTeamsCard } from "./cards/special-teams-card";
import { LineupDiffCard } from "./cards/lineup-diff-card";
import { WinProbabilityCard } from "./cards/win-probability-card";
import { HottestPlayerCard } from "./cards/hottest-player-card";
import { StreakAlertsCard } from "./cards/streak-alerts-card";
import { RestDaysCard } from "./cards/rest-days-card";
import { DisciplineCard } from "./cards/discipline-card";
import { FaceoffsCard } from "./briefing/FaceoffsCard";

import { HomeAwaySplitCard } from "./cards/home-away-split-card";
import { SeasonRecordCard } from "./cards/season-record-card";


export function BriefingView({
  data,
  fetchedAt,
  cached,
  refreshing,
  refreshError,
  onRefresh,
}: {
  data: Briefing;
  fetchedAt: string;
  cached: boolean;
  refreshing: boolean;
  refreshError: string | null;
  onRefresh: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState<null | "text" | "markdown">(null);

  const fetchGameFlow = useServerFn(getGameFlowForMatchup);
  const gameFlowQuery = useQuery({
    queryKey: ["gameFlow", data.home.name, data.away.name],
    queryFn: () =>
      fetchGameFlow({ data: { home: data.home.name, away: data.away.name, n: 10 } }),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
  const homeFlow = gameFlowQuery.data?.home;
  const awayFlow = gameFlowQuery.data?.away;

  const handleCopy = async (kind: "text" | "markdown") => {
    const payload =
      kind === "text" ? briefingToTvText(data) : briefingToMarkdown(data);
    const ok = await copyToClipboard(payload);
    if (ok) {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    }
  };
  const handleShareImage = async () => {
    if (typeof window === "undefined") return;
    const node = document.getElementById("briefing-capture");
    if (!node) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        cacheBust: true,
        filter: (el) =>
          !(el instanceof HTMLElement && el.dataset.exportHide === "true"),
      });
      const filename = `producer-stats-${data.home.name}-vs-${data.away.name}-${new Date(fetchedAt).toISOString().slice(0, 10)}.png`
        .replace(/\s+/g, "_");
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
      try {
        const blob = await (await fetch(dataUrl)).blob();
        if ("ClipboardItem" in window) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
        }
      } catch {
        // clipboard not available — download still worked
      }
    } catch (err) {
      console.error("[share-image] failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div className="space-y-6" id="briefing-capture">
      <div className="print-only mb-2 border-b border-black pb-2">
        <h1 className="text-lg font-bold">
          {data.home.name} vs {data.away.name}
        </h1>
        <p className="text-xs">
          Producent-briefing · utskriven {new Date().toLocaleString("sv-SE")}
        </p>
      </div>

      {data.warnings && data.warnings.length > 0 && (
        <div className="rounded-md border border-yellow-400 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-600 dark:bg-yellow-950 dark:text-yellow-300" data-export-hide="true">
          {data.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between" data-export-hide="true">
        <div className="text-xs text-muted-foreground">
          {cached ? "Cached" : "Fresh"} · fetched{" "}
          {new Date(fetchedAt).toLocaleString("sv-SE")}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareImage}
            disabled={exporting}
            title="Download briefing as PNG (also copies to clipboard when supported)"
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImageDown className="mr-2 h-4 w-4" />
            )}
            Share as image
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" title="Kopiera briefingen som text">
                {copied ? (
                  <Check className="mr-2 h-4 w-4 text-green-500" />
                ) : (
                  <ClipboardCopy className="mr-2 h-4 w-4" />
                )}
                {copied === "text"
                  ? "Text kopierad"
                  : copied === "markdown"
                    ? "Markdown kopierad"
                    : "Kopiera"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleCopy("text")}>
                <FileText className="mr-2 h-4 w-4" />
                Kopiera som text (TV-mall)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCopy("markdown")}>
                <FileText className="mr-2 h-4 w-4" />
                Kopiera som markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            asChild
            variant="outline"
            size="sm"
            title="Öppna TV-läget (auto-roterande matchkort)"
          >
            <Link
              to="/tv/$home/$away"
              params={{
                home: encodeURIComponent(data.home.name),
                away: encodeURIComponent(data.away.name),
              }}
              target="_blank"
            >
              <Tv className="mr-2 h-4 w-4" />
              TV-läge
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            title="Skriv ut briefingen (A4)"
          >
            <Printer className="mr-2 h-4 w-4" />
            Skriv ut
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div id="teams" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TeamHeader team={data.home} side="Hemmalag" />
        <TeamHeader team={data.away} side="Bortalag" />
      </div>

      <div id="season-record">
        <SeasonRecordCard home={data.home} away={data.away} />
      </div>

      <div id="form" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormCard team={data.home} />
        <FormCard team={data.away} />
      </div>

      <div id="hot" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HottestPlayerCard team={data.home} label="Hemmalag" />
        <HottestPlayerCard team={data.away} label="Bortalag" />
      </div>

      <div id="venue" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <VenueStreakCard team={data.home} />
        <VenueStreakCard team={data.away} />
      </div>

      <div id="home-away-split">
        <HomeAwaySplitCard home={data.home} away={data.away} />
      </div>

      <div id="periods" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PeriodGoalsCard team={data.home} refreshing={refreshing} error={refreshError} />
        <PeriodGoalsCard team={data.away} refreshing={refreshing} error={refreshError} />
      </div>

      <Card id="h2h">
        <CardHeader>
          <CardTitle className="text-base">Inbördes möten</CardTitle>
        </CardHeader>
        <CardContent>
          {data.headToHead.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga tidigare möten denna säsong.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Hemma</TableHead>
                    <TableHead>Borta</TableHead>
                    <TableHead className="text-right">Resultat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.headToHead.map((g, i) => (
                    <TableRow key={i}>
                      <TableCell>{g.date || "—"}</TableCell>
                      <TableCell>{g.homeTeam}</TableCell>
                      <TableCell>{g.awayTeam}</TableCell>
                      <TableCell className="text-right font-mono">
                        {g.gameId ? (
                          <a
                            href={`https://stats.swehockey.se/Game/Events/${g.gameId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {g.score} ↗
                          </a>
                        ) : (
                          g.score
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div id="scorers" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ScorersCard team={data.home} />
        <ScorersCard team={data.away} />
      </div>

      <div id="goalies" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GoaliesCard team={data.home} />
        <GoaliesCard team={data.away} />
      </div>

      <div id="shots">
        <ShotCard
          home={data.home}
          away={data.away}
          homeFlow={homeFlow}
          awayFlow={awayFlow}
        />
      </div>

     <div id="special" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SpecialTeamsCard team={data.home} opponent={data.away} />
        <SpecialTeamsCard team={data.away} opponent={data.home} />
      </div>

      <div id="discipline">
        <DisciplineCard home={data.home} away={data.away} />
      </div>

      <div id="faceoffs">
        <FaceoffsCard briefing={data} />
      </div>

      <div id="lineup" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LineupDiffCard teamName={data.home.name} data={homeFlow} />
        <LineupDiffCard teamName={data.away.name} data={awayFlow} />
      </div>

      <div id="probability">
        <WinProbabilityCard home={data.home} away={data.away} />
      </div>

      <div id="streaks">
        <StreakAlertsCard home={data.home} away={data.away} />
      </div>

      <div id="rest">
        <RestDaysCard home={data.home} away={data.away} />
      </div>

      {data.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anteckningar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
