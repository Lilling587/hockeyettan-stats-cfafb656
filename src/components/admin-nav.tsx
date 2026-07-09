import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, FolderUp, Home, Image, ScrollText, Tv, Users } from "lucide-react";

import { Button } from "@/components/ui/button";

const items = [
  { label: "Hem", to: "/", icon: Home },
  { label: "Hälsa", to: "/admin/health", icon: Activity },
  { label: "Loggbok", to: "/admin/logs", icon: ScrollText },
  { label: "Logotyper", to: "/admin/logos", icon: Image },
  { label: "Lagring", to: "/admin/assets", icon: FolderUp },
  { label: "vMix", to: "/admin/vmix", icon: Tv },
  { label: "Användare", to: "/admin/users", icon: Users },
];

export function AdminNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Admin-navigation" className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const isActive = pathname === item.to;
        const Icon = item.icon;
        return (
          <Button
            key={item.to}
            asChild
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5"
          >
            <Link to={item.to}>
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
