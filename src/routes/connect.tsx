import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Copy, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Anslut AI-assistent — Grästorps IK" },
      {
        name: "description",
        content:
          "Anslut ChatGPT eller Claude till Grästorps IK-statistiken via MCP.",
      },
    ],
  }),
  component: ConnectPage,
});

function ConnectPage() {
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMcpUrl(new URL("/mcp", window.location.origin).toString());
  }, []);

  async function copy() {
    if (!mcpUrl) return;
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Link>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Anslut en AI-assistent
        </h1>
        <p className="mt-2 text-muted-foreground">
          Anslut ChatGPT eller Claude så kan de hämta matchstatistik, tabeller
          och head-to-head direkt från den här appen.
        </p>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">Serverns URL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:flex-row">
              <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-sm">
                {mcpUrl || "…"}
              </code>
              <Button onClick={copy} disabled={!mcpUrl} variant="secondary">
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Kopierad
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Kopiera
                  </>
                )}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Klistra in den här adressen i din AI-assistent enligt stegen nedan.
            </p>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">ChatGPT</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>
                Öppna{" "}
                <a
                  className="underline underline-offset-2"
                  href="https://chatgpt.com/#settings/Connectors/Advanced"
                  target="_blank"
                  rel="noreferrer"
                >
                  Inställningar → Connectors → Advanced
                </a>{" "}
                och slå på <b>Developer mode</b> (läs varningen som visas).
              </li>
              <li>
                I chattens <b>+</b>-meny, aktivera <b>Developer mode</b>.
              </li>
              <li>
                Klicka på <b>Add sources</b>, sedan <b>Connect more</b>.
              </li>
              <li>Namnge kopplingen och klistra in URL:en ovan.</li>
              <li>Be ChatGPT använda Grästorps IK-statistiken.</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Claude</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>
                Öppna{" "}
                <a
                  className="underline underline-offset-2"
                  href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                  target="_blank"
                  rel="noreferrer"
                >
                  Claudes anpassade connectors
                </a>
                .
              </li>
              <li>Namnge kopplingen och klistra in URL:en ovan.</li>
              <li>
                Aktivera kopplingen från chattens komponerings­meny och be Claude
                använda den.
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
