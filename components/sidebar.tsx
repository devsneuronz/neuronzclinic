"use client";

import type { ComponentType } from "react";
import { BarChart3, Calendar, CheckSquare, ChevronLeft, ChevronRight, LayoutDashboard, MessageSquare, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@radix-ui/react-avatar";

import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";
import { getRoleLabel, UserRole } from "@/lib/user-roles";
import { Button } from "./ui/button";
import { Logo } from "./ui/logo";
import { NoteMentionNotifications } from "./chat/note-mention-notifications";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/", roles: ["admin", "manager", "user"] },
  { icon: MessageSquare, label: "Chats", href: "/chats", roles: ["admin", "manager", "user"] },
  { icon: Calendar, label: "Agendas", href: "/agendas", roles: ["admin", "manager", "user"] },
  { icon: CheckSquare, label: "Tarefas", href: "/tarefas", roles: ["admin", "manager", "user"] },
  { icon: Users, label: "Pacientes", href: "/pacientes", roles: ["admin", "manager", "user"] },
  { icon: BarChart3, label: "Relatórios", href: "/relatorios", roles: ["admin", "manager"] },
  { icon: Settings, label: "Configurações", href: "/configuracoes", roles: ["admin"] },
] satisfies Array<{
  icon: ComponentType<{ className?: string }>;
  label: string;
  href: string;
  roles: UserRole[];
}>;

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
}

export function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();
  const role = user?.role ?? "user";
  const userName = user?.name ?? "Usuário";
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U";
  const visibleNavItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className={cn("relative flex h-screen flex-col transition-all duration-300 ease-in-out border-r", isCollapsed ? "w-[68px]" : "w-[200px]")}>
      <Logo isCollapsed={isCollapsed} />

      <Button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute top-1/2 right-0 h-14 w-4 translate-x-[50%] translate-y-[-50%] rounded-sm !p-0 shadow-md">
        {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
      </Button>

      <nav className="flex-1 space-y-1 px-3 py-4 w-full">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              title={isCollapsed ? item.label : ""}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className={cn("transition-all whitespace-nowrap", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>{item.label}</span>
            </Link>
          );
        })}
        <NoteMentionNotifications user={user} isCollapsed={isCollapsed} />
      </nav>

      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <Avatar className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-primary-foreground">
            {isLoading ? "" : userInitial}
          </Avatar>
          {!isCollapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{isLoading ? "Carregando usuário..." : userName}</p>
              <p className="truncate text-xs text-muted-foreground">{isLoading ? "" : getRoleLabel(role)}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
