import { useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Dev-only floating button that forces the Lovable sandbox HMR gate to flush
 * buffered `src/` edits so the preview updates instantly. Only rendered when
 * `import.meta.env.DEV` is true, so it never ships to production.
 */
export function FlushHmrButton() {
  const [state, setState] = useState<"idle" | "flushing" | "ok" | "error">("idle");

  if (!import.meta.env.DEV) return null;

  async function flush() {
    setState("flushing");
    try {
      const res = await fetch("/__hmr_flush", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setState("ok");
      setTimeout(() => window.location.reload(), 150);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  const label =
    state === "flushing"
      ? "Flushing…"
      : state === "ok"
        ? "Flushed"
        : state === "error"
          ? "Flush failed"
          : "Flush HMR";

  return (
    <button
      type="button"
      onClick={flush}
      title="Force buffered src edits to render instantly (dev only)"
      className="fixed bottom-3 right-3 z-[9999] flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-background"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${state === "flushing" ? "animate-spin" : ""}`}
      />
      {label}
    </button>
  );
}
