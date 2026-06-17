"use client";

import { Avatar } from "@radix-ui/react-avatar";
import { Calendar, CheckSquare, ChevronLeft, ChevronRight, ClipboardList, LayoutDashboard, LogOut, MessageSquare, Settings, Users, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { useCurrentUser } from "@/hooks/use-current-user";
import { getRoleLabel, UserRole } from "@/lib/user-roles";
import { cn } from "@/lib/utils";
import { NoteMentionNotifications } from "./chat/note-mention-notifications";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Logo } from "./ui/logo";

export const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/", roles: ["admin", "manager", "user"] },
  { icon: MessageSquare, label: "Chats", href: "/chats", roles: ["admin", "manager", "user"] },
  { icon: Calendar, label: "Agendas", href: "/agendas", roles: ["admin", "manager", "user"] },
  { icon: CheckSquare, label: "Tarefas", href: "/tarefas", roles: ["admin", "manager", "user"] },
  { icon: Users, label: "Contatos", href: "/contatos", roles: ["admin", "manager", "user"] },
  { icon: Workflow, label: "Automação", href: "/rotinas", roles: ["admin", "manager"] },
  { icon: ClipboardList, label: "Prontuários", href: "/prontuarios", roles: ["admin", "manager"] },
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
  onLogout: () => void;
}

export function Sidebar({ isCollapsed, setIsCollapsed, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();
  const role = user?.role ?? "user";
  const userName = user?.name ?? "Usuário";
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U";
  const visibleNavItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className={cn("relative flex h-full flex-col transition-all duration-300 ease-in-out", "bg-[var(--sidebar-custom-bg)] border-r border-border", isCollapsed ? "w-[68px]" : "w-[200px]")}>
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
                "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all outline-0",
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

      <div className="border-t border-[var(--sidebar-custom-border)] p-4 transition-all duration-300">
        <div className={cn("flex items-center gap-3")}>
          {isCollapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="group relative focus:outline-hidden select-none outline-hidden">
                  <Avatar className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--sidebar-custom-primary)] text-sm font-semibold text-[var(--sidebar-custom-primary-fg)] transition-transform group-hover:scale-105 group-hover:brightness-110 shadow-xs cursor-pointer">
                    {isLoading ? "" : userInitial}
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-48 ml-2 bg-popover border border-border rounded-lg shadow-md">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-1.5 px-2">
                  <p className="font-medium text-foreground truncate">{userName}</p>
                  <p className="text-[10px] truncate">{getRoleLabel(role)}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border/60" />
                <DropdownMenuItem onClick={onLogout} className="flex items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer text-sm font-medium py-2 rounded-md">
                  <LogOut className="h-4 w-4" />
                  Sair da conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--sidebar-custom-primary)] text-sm font-semibold text-[var(--sidebar-custom-primary-fg)]">{isLoading ? "" : userInitial}</Avatar>

                <div className="flex-1 overflow-hidden pr-1">
                  <p className="text-sm font-semibold text-[var(--sidebar-custom-fg)] truncate">{isLoading ? "Carregando..." : userName}</p>
                  <p className="text-xs text-[var(--sidebar-custom-fg)]/60 truncate">{isLoading ? "" : getRoleLabel(role)}</p>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onLogout}
                disabled={isLoading}
                className="h-8 w-8 text-[var(--sidebar-custom-fg)]/60 hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-md transition-colors"
                title="Sair da conta"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
