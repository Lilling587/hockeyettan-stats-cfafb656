import { useState } from "react";
import { Check, ClipboardCopy, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Briefing } from "@/lib/stats.functions";
import { copyToClipboard } from "@/lib/briefing-export";
import { storylinesToText, topStorylines } from "@/lib/storylines";

export function StorylinesCard({ briefing }: { briefing: Briefing }) {
  const [copied, setCopied] = useState(false);
  const lines = topStorylines(briefing);

  const handleCopy = async () => {
    const ok = await copyToClipboard(storylinesToText(lines));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">Kommentatorns snackisar</span>
        </CardTitle>
        {lines.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            data-export-hide="true"
            title="Kopiera snackisarna som punktlista"
          >
            {copied ? (
              <Check className="mr-2 h-4 w-4 text-primary" />
            ) : (
              <ClipboardCopy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Kopierat" : "Kopiera"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga tydliga snackisar just nu — lagen ligger jämnt på de mätvärden vi följer.
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.id} className="flex gap-2 text-sm leading-relaxed">
                <span aria-hidden="true" className="text-primary">
                  •
                </span>
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
