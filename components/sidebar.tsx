"use client";

import { Avatar } from "@radix-ui/react-avatar";
import { Calendar, CheckSquare, ChevronLeft, ChevronRight, LayoutDashboard, MessageSquare, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { useCurrentUser } from "@/hooks/use-current-user";
import { getRoleLabel, UserRole } from "@/lib/user-roles";
import { cn } from "@/lib/utils";
import { NoteMentionNotifications } from "./chat/note-mention-notifications";
import { Button } from "./ui/button";
import { Logo } from "./ui/logo";

export const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/", roles: ["admin", "manager", "user"] },
  { icon: MessageSquare, label: "Chats", href: "/chats", roles: ["admin", "manager", "user"] },
  { icon: Calendar, label: "Agendas", href: "/agendas", roles: ["admin", "manager", "user"] },
  { icon: CheckSquare, label: "Tarefas", href: "/tarefas", roles: ["admin", "manager", "user"] },
  { icon: Users, label: "Contatos", href: "/contatos", roles: ["admin", "manager", "user"] },
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
    <aside className={cn("relative flex h-dvh flex-col transition-all duration-300 ease-in-out", "bg-[var(--sidebar-custom-bg)] border-r border-border", isCollapsed ? "w-[68px]" : "w-[200px]")}>
      <div className="max-w-full overflow-clip">
        <Logo isCollapsed={isCollapsed} />
      </div>

      <Button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-1/2 right-0 h-14 w-4 translate-x-[50%] translate-y-[50%] rounded-sm p-0! shadow-md z-41 bg-[var(--sidebar-custom-primary)] text-[var(--sidebar-custom-primary-fg)] border border-[var(--sidebar-custom-border)] hover:bg-(--sidebar-custom-primary)/70"
      >
        {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
      </Button>

      <nav className="flex-1 space-y-1 px-3 py-4 w-full overflow-clip">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              title={isCollapsed ? item.label : ""}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
                isActive ? "bg-[var(--sidebar-custom-primary)] text-[var(--sidebar-custom-primary-fg)]" : "text-[var(--sidebar-custom-fg)] hover:bg-[var(--sidebar-custom-accent)] hover:text-[var(--sidebar-custom-fg)]",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className={cn("transition-all whitespace-nowrap", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 w-full overflow-clip">
        <NoteMentionNotifications user={user} isCollapsed={isCollapsed} />
      </div>

      <div className="border-t border-[var(--sidebar-custom-border)] p-4">
        <div className="flex items-center gap-3">
          <Avatar className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-[var(--sidebar-custom-primary)] text-sm font-semibold text-[var(--sidebar-custom-primary-fg)]">{isLoading ? "" : userInitial}</Avatar>

          <div className="flex-1 overflow-hidden">
            <p className={cn("transition-all whitespace-nowraptext-sm font-medium text-[var(--sidebar-custom-fg)]", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>{isLoading ? "Carregando usuário..." : userName}</p>
            <p className={cn("transition-all whitespace-nowrap text-xs text-[var(--sidebar-custom-fg)]/70", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>{isLoading ? "" : getRoleLabel(role)}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
