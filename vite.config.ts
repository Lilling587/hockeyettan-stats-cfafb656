// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { loadEnv } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load server-only env vars (no VITE_ prefix) into process.env for SSR routes.
// Do NOT expose these to the client bundle via define().
Object.assign(process.env, loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""));

function keepPreviewAliveAfterDevServerRestart() {
  return {
    name: "keep-preview-alive-after-dev-server-restart",
    apply: "serve" as const,
    transform(code: string, id: string) {
      if (!id.replace(/\\/g, "/").includes("/vite/dist/client/client.mjs")) return null;

      // Patch the disconnect handler so the page never auto-reloads on a
      // transient websocket drop (server restart, network blip, slow initial
      // bundle). Instead we wait for the server to come back, then silently
      // re-establish the HMR transport with exponential backoff.
      return code.replace(
        /if \(payload\.event === "vite:ws:disconnect"\) \{[\s\S]*?\n\s*}\n\s*break;/,
        `if (payload.event === "vite:ws:disconnect") {
\t\t\t\tif (hasDocument && !willUnload) {
\t\t\t\t\tconsole.info("[vite] server connection lost. Reconnecting without reloading the page...");
\t\t\t\t\tconst socket = payload.data.webSocket;
\t\t\t\t\tconst url = new URL(socket.url);
\t\t\t\t\turl.search = "";
\t\t\t\t\tlet attempt = 0;
\t\t\t\t\twhile (true) {
\t\t\t\t\t\ttry {
\t\t\t\t\t\t\tawait waitForSuccessfulPing(url.href);
\t\t\t\t\t\t\tawait transport.connect(createHMRHandler(handleMessage));
\t\t\t\t\t\t\tconsole.info("[vite] connection restored");
\t\t\t\t\t\t\tbreak;
\t\t\t\t\t\t} catch (err) {
\t\t\t\t\t\t\tattempt++;
\t\t\t\t\t\t\tconst delay = Math.min(1000 * Math.pow(1.5, attempt), 10000);
\t\t\t\t\t\t\tconsole.warn("[vite] reconnect attempt " + attempt + " failed, retrying in " + delay + "ms");
\t\t\t\t\t\t\tawait new Promise((r) => setTimeout(r, delay));
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t\tbreak;`,
      );
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [keepPreviewAliveAfterDevServerRestart(), mcpPlugin()],
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(__dirname, "node_modules/entities"),
      },
    },
    server: {
      // Warm up critical entry points so the initial bundle is ready before
      // the browser opens the page — prevents long first-paint stalls that
      // can race the HMR websocket handshake on slow cold starts.
      warmup: {
        clientFiles: [
          "./src/router.tsx",
          "./src/routes/__root.tsx",
          "./src/routes/index.tsx",
          "./src/routes/_authenticated/route.tsx",
        ],
      },
      watch: {
        // Ignore noisy paths so the dev server doesn't churn through HMR
        // updates triggered by build artifacts, logs, or sandbox state.
        ignored: [
          "**/.git/**",
          "**/node_modules/**",
          "**/dist/**",
          "**/.output/**",
          "**/.nitro/**",
          "**/.tanstack/**",
          "**/coverage/**",
          "**/tmp/**",
          "**/.workspace/**",
        ],
      },
      hmr: {
        // Be generous on the handshake — slow initial bundling on a cold
        // start can otherwise time out the websocket before it opens.
        // Leave clientPort/protocol to the sandbox defaults so the preview
        // works on both desktop and mobile browsers behind the HTTPS proxy.
        timeout: 120_000,
        overlay: true,
      },
    },
    optimizeDeps: {
      // Disable late dependency discovery: after a cold dev-server restart Vite can
      // discover route-only dependencies several seconds after the page opens and
      // force a full browser reload. Keep the needed browser deps explicit instead.
      noDiscovery: true,
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "@tanstack/router-core",
        "@tanstack/router-core/ssr/client",
        "@tanstack/zod-adapter",
        "@radix-ui/react-accordion",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-aspect-ratio",
        "@radix-ui/react-avatar",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-collapsible",
        "@radix-ui/react-context-menu",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-hover-card",
        "@radix-ui/react-label",
        "@radix-ui/react-menubar",
        "@radix-ui/react-navigation-menu",
        "@radix-ui/react-popover",
        "@radix-ui/react-progress",
        "@radix-ui/react-radio-group",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-select",
        "@radix-ui/react-separator",
        "@radix-ui/react-slider",
        "@radix-ui/react-slot",
        "@radix-ui/react-switch",
        "@radix-ui/react-tabs",
        "@radix-ui/react-toggle",
        "@radix-ui/react-toggle-group",
        "@radix-ui/react-tooltip",
        "@supabase/supabase-js",
        "class-variance-authority",
        "clsx",
        "cmdk",
        "embla-carousel-react",
        "html-to-image",
        "input-otp",
        "lucide-react",
        "react-day-picker",
        "react-hook-form",
        "react-resizable-panels",
        "recharts",
        "seroval",
        "sonner",
        "tailwind-merge",
        "vaul",
        "zod",
      ],
    },
  },
});
