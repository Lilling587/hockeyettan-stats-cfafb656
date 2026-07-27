import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { reportError } from "../lib/error-reporter";
import { installReloadDiagnostics } from "../lib/reload-diagnostics";
import { installPreviewKeepalive } from "../lib/preview-keepalive";
import { registerServiceWorker } from "../lib/register-sw";
import { Toaster } from "../components/ui/sonner";
import { ThemeProvider, themeBootScript } from "../components/theme-provider";
import { FlushHmrButton } from "../components/dev/flush-hmr-button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Sidan hittades inte</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sidan du letar efter finns inte eller har flyttats.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Till startsidan
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    reportError("root.errorComponent", error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Sidan laddades inte
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Något gick fel. Du kan prova att ladda om sidan eller gå tillbaka till startsidan.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Försök igen
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Till startsidan
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Grästorps IK" },
      { name: "description", content: "Matchstatistik för HockeyEttan Södra-sändningar. Välj två lag och få statistik på sekunder." },
      { name: "theme-color", content: "#0F172A" },
      { property: "og:title", content: "Grästorps IK" },
      { property: "og:description", content: "Matchstatistik för HockeyEttan Södra-sändningar. Välj två lag och få statistik på sekunder." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Grästorps IK" },
      { name: "twitter:description", content: "Matchstatistik för HockeyEttan Södra-sändningar. Välj två lag och få statistik på sekunder." },
      { property: "og:image", content: "https://thzytrtjhsaqwtbqlwyi.supabase.co/storage/v1/object/public/icons/android/ic_launcher-playstore-512.png" },
      { name: "twitter:image", content: "https://thzytrtjhsaqwtbqlwyi.supabase.co/storage/v1/object/public/icons/android/ic_launcher-playstore-512.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "https://thzytrtjhsaqwtbqlwyi.supabase.co/storage/v1/object/public/icons/android/ic_launcher-xxxhdpi-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "https://thzytrtjhsaqwtbqlwyi.supabase.co/storage/v1/object/public/icons/android/ic_launcher-playstore-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "https://thzytrtjhsaqwtbqlwyi.supabase.co/storage/v1/object/public/icons/ios/icon-60@3x-180.png" },
      { rel: "apple-touch-icon", sizes: "167x167", href: "https://thzytrtjhsaqwtbqlwyi.supabase.co/storage/v1/object/public/icons/ios/icon-83.5@2x-167.png" },
      { rel: "apple-touch-icon", sizes: "152x152", href: "https://thzytrtjhsaqwtbqlwyi.supabase.co/storage/v1/object/public/icons/ios/icon-76@2x-152.png" },
      { rel: "apple-touch-icon", sizes: "120x120", href: "https://thzytrtjhsaqwtbqlwyi.supabase.co/storage/v1/object/public/icons/ios/icon-60@2x-120.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    installReloadDiagnostics();
    installPreviewKeepalive();
    registerServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster />
        <FlushHmrButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
