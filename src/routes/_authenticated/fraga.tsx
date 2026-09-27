import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";

export const Route = createFileRoute("/_authenticated/fraga")({
  head: () => ({
    meta: [
      { title: "Fråga statistiken — Grästorps IK" },
      { name: "description", content: "Ställ frågor om spelar- och målvaktsstatistik i HockeyEttan Södra." },
      { property: "og:title", content: "Fråga statistiken — Grästorps IK" },
      { property: "og:description", content: "Ställ frågor om spelar- och målvaktsstatistik i HockeyEttan Södra." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FragaPage,
});

const TOOL_LABELS: Record<string, string> = {
  "tool-search_players": "Hämtade spelarstatistik",
  "tool-list_teams": "Hämtade lagkoder",
};

const EXAMPLES = [
  "Vilken målvakt har bäst SV% i ligan?",
  "Vem har flest poäng i Grästorp?",
  "Topp 5 backar på utvisningsminuter",
];

function PuckIcon() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <ellipse cx="12" cy="10" rx="8" ry="3" />
        <path d="M4 10v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4c0 1.7-3.6 3-8 3s-8-1.3-8-3z" opacity=".7" />
      </svg>
    </div>
  );
}

function FragaPage() {
  const [initial, setInitial] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    void supabase
      .from("stats_chat_messages")
      .select("role, parts, message_id, id")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error("Kunde inte läsa tidigare frågor.");
        setInitial(
          (data ?? []).map((r) => ({
            id: r.message_id ?? r.id,
            role: r.role as UIMessage["role"],
            parts: (r.parts ?? []) as unknown as UIMessage["parts"],
          })),
        );
      });
  }, []);

  if (!initial) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  return <ChatWindow initialMessages={initial} />;
}

function ChatWindow({ initialMessages }: { initialMessages: UIMessage[] }) {
  const [input, setInput] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/stats-chat",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [],
  );
  const { messages, sendMessage, status, setMessages, stop } = useChat({
    id: "stats-chat",
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message || "Något gick fel."),
  });
  const busy = status === "submitted" || status === "streaming";

  function ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput("");
  }

  async function reset() {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    const { error } = await supabase.from("stats_chat_messages").delete().eq("user_id", uid);
    if (error) return toast.error("Kunde inte rensa konversationen.");
    setMessages([]);
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-4">
        <div className="flex items-center gap-3">
          <Link to="/spelare" className="text-muted-foreground hover:text-foreground" aria-label="Tillbaka">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <PuckIcon />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Fråga statistiken</h1>
            <p className="text-xs text-muted-foreground">Spelare och målvakter i HockeyEttan Södra</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} disabled={busy || messages.length === 0}>
          <RotateCcw className="h-4 w-4" /> Börja om
        </Button>
      </header>

      <Conversation className="mx-auto w-full max-w-3xl flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<PuckIcon />}
              title="Vad vill du veta?"
              description="Fråga om mål, poäng, utvisningar eller målvakters SV%, GAA och nollor."
            >
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((e) => (
                  <Button key={e} variant="outline" size="sm" onClick={() => ask(e)}>
                    {e}
                  </Button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message from={m.role} key={m.id}>
                <MessageContent>
                  {m.parts.map((p, i) => {
                    if (p.type === "text") {
                      return m.role === "assistant" ? (
                        <MessageResponse key={i}>{p.text}</MessageResponse>
                      ) : (
                        <span key={i}>{p.text}</span>
                      );
                    }
                    if (isToolUIPart(p)) {
                      return (
                        <Tool key={i} defaultOpen={false}>
                          <ToolHeader
                            title={TOOL_LABELS[p.type] ?? "Verktyg"}
                            type={p.type === "dynamic-tool" ? "tool-dynamic" : p.type}
                            state={p.state}
                          />
                          <ToolContent>
                            <ToolInput input={p.input} />
                            <ToolOutput output={p.output} errorText={p.errorText} />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Letar i statistiken…
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <PromptInput onSubmit={(msg) => ask(msg.text ?? "")}>
          <PromptInputTextarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="T.ex. Vilken målvakt har flest hållna nollor?"
          />
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit
              status={status}
              disabled={!busy && !input.trim()}
              onClick={(e) => {
                if (busy) {
                  e.preventDefault();
                  void stop();
                }
              }}
            />
          </PromptInputFooter>
        </PromptInput>
        <p className="mt-2 text-center text-xs text-muted-foreground">Max 30 frågor per dygn.</p>
      </div>
    </div>
  );
}
