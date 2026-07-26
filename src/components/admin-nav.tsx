import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, FolderUp, Gauge, Home, Info, Mail, ScrollText, Star, Tv, Users } from "lucide-react";

import { Button } from "@/components/ui/button";

const items = [
  { label: "Hem", to: "/", icon: Home },
  { label: "Notiser", to: "/notifications", icon: Star },
  { label: "Hälsa", to: "/admin/health", icon: Activity },
  { label: "Loggbok", to: "/admin/logs", icon: ScrollText },
  { label: "Användning", to: "/admin/usage", icon: Gauge },
  { label: "Lagring", to: "/admin/assets", icon: FolderUp },
  { label: "vMix", to: "/admin/vmix", icon: Tv },
  { label: "Användare", to: "/admin/users", icon: Users },
  { label: "Mejllogg", to: "/admin/auth-emails", icon: Mail },
  { label: "Anslut AI", to: "/connect", icon: Info },
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
