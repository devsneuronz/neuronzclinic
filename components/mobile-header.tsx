import { useCurrentUser } from "@/hooks/use-current-user";
import { getRoleLabel } from "@/lib/user-roles";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NoteMentionNotifications } from "./chat/note-mention-notifications";
import { navItems } from "./sidebar";
import { Avatar } from "./ui/avatar";
import { Logo } from "./ui/logo";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./ui/sheet";

export function MobileHeader() {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();
  const role = user?.role ?? "user";
  const userName = user?.name ?? "Usuário";
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U";

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <header className="md:hidden top-0 inset-x-0 h-14 flex items-center justify-between px-4 z-50 bg-[var(--sidebar-custom-bg)] border-b border-border shadow-xs">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <button type="button" className="p-2 rounded-md text-[var(--sidebar-custom-fg)] hover:bg-[var(--sidebar-custom-accent)] transition-colors cursor-pointer" aria-label="Abrir menu">
            <Menu className="h-6 w-6" />
          </button>
        </SheetTrigger>

        <SheetContent side="left" className="w-full h-full p-4 pt-16 bg-[var(--sidebar-custom-bg)] border-none text-[var(--sidebar-custom-fg)] flex flex-col justify-between">
          <SheetTitle className="sr-only">Navegação Principal</SheetTitle>

          <Logo isCollapsed={false} className="absolute top-0" />

          <nav className="flex-1 space-y-2.5 overflow-y-auto pt-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-4 rounded-xl px-4 py-3.5 text-sm font-medium transition-all border border-transparent",
                    isActive ? "bg-[var(--sidebar-custom-primary)] text-[var(--sidebar-custom-primary-fg)] shadow-xs" : "bg-[var(--sidebar-custom-fg)]/5 text-[var(--sidebar-custom-fg)] hover:bg-[var(--sidebar-custom-accent)]",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0 opacity-80" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="pt-2">
            <NoteMentionNotifications user={user} isCollapsed={false} />
          </div>

          <div className="border-t border-[var(--sidebar-custom-border)] pt-4 pb-2">
            <div className="flex items-center gap-3 px-2">
              <Avatar className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar-custom-primary)] text-sm font-semibold text-[var(--sidebar-custom-primary-fg)]">{isLoading ? "" : userInitial}</Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-[var(--sidebar-custom-fg)]">{isLoading ? "Carregando..." : userName}</p>
                <p className="truncate text-xs text-[var(--sidebar-custom-fg)]/60">{isLoading ? "" : getRoleLabel(role)}</p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Logo isCollapsed={false} />
    </header>
  );
}
