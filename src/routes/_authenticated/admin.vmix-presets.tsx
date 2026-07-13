import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Save, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

import { checkIsAdmin } from "@/lib/roles.functions";
import {
  listLineupPresets,
  saveLineupPreset,
  updateLineupPreset,
  deleteLineupPreset,
  emptySlots,
  type LineupPreset,
  type VmixLineupSlots,
} from "@/lib/vmix.functions";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/vmix-presets")({
  head: () => ({
    meta: [
      { title: "vMix Lineup-presets · Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PresetsPage,
});

type Draft = {
  id: number | null;
  label: string;
  homeTeam: string;
  awayTeam: string;
  homeSlotsText: string;
  awaySlotsText: string;
};

function makeDraft(preset?: LineupPreset): Draft {
  if (preset) {
    return {
      id: preset.id,
      label: preset.label,
      homeTeam: preset.homeTeam,
      awayTeam: preset.awayTeam,
      homeSlotsText: JSON.stringify(preset.homeSlots, null, 2),
      awaySlotsText: JSON.stringify(preset.awaySlots, null, 2),
    };
  }
  return {
    id: null,
    label: "",
    homeTeam: "",
    awayTeam: "",
    homeSlotsText: JSON.stringify(emptySlots("", ""), null, 2),
    awaySlotsText: JSON.stringify(emptySlots("", ""), null, 2),
  };
}

function PresetsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isAdminFn = useServerFn(checkIsAdmin);
  const listFn = useServerFn(listLineupPresets);
  const saveFn = useServerFn(saveLineupPreset);
  const updateFn = useServerFn(updateLineupPreset);
  const deleteFn = useServerFn(deleteLineupPreset);

  const adminCheck = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
  });

  useEffect(() => {
    if (adminCheck.data && !adminCheck.data.isAdmin) {
      navigate({ to: "/" });
    }
  }, [adminCheck.data, navigate]);

  const presetsQuery = useQuery({
    queryKey: ["vmix-lineup-presets"],
    queryFn: () => listFn(),
    enabled: adminCheck.data?.isAdmin === true,
  });

  const [draft, setDraft] = useState<Draft>(() => makeDraft());
  const [jsonError, setJsonError] = useState<string | null>(null);

  function parseSlots(text: string, field: string): VmixLineupSlots | null {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error(`${field} måste vara ett JSON-objekt`);
      }
      return parsed as VmixLineupSlots;
    } catch (err) {
      setJsonError(
        `${field}: ${err instanceof Error ? err.message : "ogiltig JSON"}`,
      );
      return null;
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      setJsonError(null);
      const homeSlots = parseSlots(draft.homeSlotsText, "Home slots");
      const awaySlots = parseSlots(draft.awaySlotsText, "Away slots");
      if (!homeSlots || !awaySlots) throw new Error("Ogiltig JSON");
      const payload = {
        label: draft.label.trim(),
        homeTeam: draft.homeTeam.trim(),
        awayTeam: draft.awayTeam.trim(),
        homeSlots: homeSlots as Record<string, unknown>,
        awaySlots: awaySlots as Record<string, unknown>,
      };
      if (draft.id == null) {
        await saveFn({ data: payload });
      } else {
        await updateFn({ data: { id: draft.id, ...payload } });
      }
    },
    onSuccess: () => {
      toast.success(draft.id == null ? "Preset skapad" : "Preset uppdaterad");
      queryClient.invalidateQueries({ queryKey: ["vmix-lineup-presets"] });
      setDraft(makeDraft());
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Kunde inte spara");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await deleteFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Preset borttagen");
      queryClient.invalidateQueries({ queryKey: ["vmix-lineup-presets"] });
      setDraft((d) => (d.id != null ? makeDraft() : d));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Kunde inte ta bort");
    },
  });

  if (adminCheck.isLoading || !adminCheck.data?.isAdmin) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const presets = presetsQuery.data ?? [];
  const isEditing = draft.id != null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">vMix Lineup-presets</h1>
          <p className="text-sm text-muted-foreground">
            Hantera sparade lineup-presets med rå JSONB för home- och away-slots.
          </p>
        </div>
        <AdminNav />
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{isEditing ? `Redigera preset #${draft.id}` : "Ny preset"}</CardTitle>
          {isEditing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(makeDraft())}
            >
              <Plus className="mr-1 h-4 w-4" /> Ny
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preset-label">Etikett</Label>
              <Input
                id="preset-label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="t.ex. Grästorp vs Kalix 2026-01-14"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preset-home">Hemmalag</Label>
              <Input
                id="preset-home"
                value={draft.homeTeam}
                onChange={(e) => setDraft({ ...draft, homeTeam: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preset-away">Bortalag</Label>
              <Input
                id="preset-away"
                value={draft.awayTeam}
                onChange={(e) => setDraft({ ...draft, awayTeam: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="home-slots">Home slots (JSONB)</Label>
              <Textarea
                id="home-slots"
                value={draft.homeSlotsText}
                onChange={(e) =>
                  setDraft({ ...draft, homeSlotsText: e.target.value })
                }
                className="min-h-[320px] font-mono text-xs"
                spellCheck={false}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="away-slots">Away slots (JSONB)</Label>
              <Textarea
                id="away-slots"
                value={draft.awaySlotsText}
                onChange={(e) =>
                  setDraft({ ...draft, awaySlotsText: e.target.value })
                }
                className="min-h-[320px] font-mono text-xs"
                spellCheck={false}
              />
            </div>
          </div>

          {jsonError ? (
            <p className="text-sm text-destructive" role="alert">
              {jsonError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                !draft.label.trim() ||
                !draft.homeTeam.trim() ||
                !draft.awayTeam.trim()
              }
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              {isEditing ? "Spara ändringar" : "Skapa preset"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sparade presets ({presets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {presetsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Läser in…
            </div>
          ) : presets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga presets ännu.</p>
          ) : (
            <ul className="divide-y divide-border">
              {presets.map((preset) => (
                <li
                  key={preset.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{preset.label}</p>
                    <p className="text-xs text-muted-foreground">
                      #{preset.id} · {preset.homeTeam} vs {preset.awayTeam} ·{" "}
                      {new Date(preset.createdAt).toLocaleString("sv-SE")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDraft(makeDraft(preset));
                        setJsonError(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Redigera
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Ta bort preset?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{preset.label}" tas bort permanent.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Avbryt</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(preset.id)}
                          >
                            Ta bort
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
