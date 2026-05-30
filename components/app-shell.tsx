"use client";

import { Sidebar } from "@/components/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AUTH_SESSION_EVENT, hasValidSession } from "@/lib/auth-session";
import { getUserHomePath, isDraTatianaUser } from "@/lib/user-access";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MobileHeader } from "./mobile-header";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(getSavedSidebarState);
  const isMobile = useIsMobile();

  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading: isCurrentUserLoading } = useCurrentUser();
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const isAuthenticated = useSyncExternalStore(subscribeToAuthSession, hasValidSession, () => false);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (pathname === "/login" && isAuthenticated) {
      if (isCurrentUserLoading) return;
      router.replace(getUserHomePath(user));
      return;
    }

    if (pathname !== "/login" && !isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (pathname === "/" && isAuthenticated && !isCurrentUserLoading && isDraTatianaUser(user)) {
      router.replace("/tarefas");
    }
  }, [isAuthenticated, isCurrentUserLoading, isHydrated, pathname, router, user]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("sidebar-collapsed", JSON.stringify(isCollapsed));
    }
  }, [isCollapsed, isHydrated]);

  if (!isHydrated) {
    return <div className="flex h-full bg-background" />;
  }

  if (pathname === "/login") {
    return isAuthenticated ? <main className="flex min-h-full w-full bg-background" /> : <main className="flex min-h-dvh w-full bg-background">{children}</main>;
  }

  if (!isAuthenticated) {
    return <main className="flex min-h-full w-full bg-background" />;
  }

  if (pathname === "/" && isCurrentUserLoading) {
    return <main className="flex min-h-dvh w-full bg-background" />;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-full w-full bg-background">
      {isMobile ? <MobileHeader /> : <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />}

      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  );
}

function getSavedSidebarState() {
  if (typeof window === "undefined") {
    return false;
  }

  const saved = window.localStorage.getItem("sidebar-collapsed");

  if (saved === null) {
    return false;
  }

  try {
    return Boolean(JSON.parse(saved));
  } catch {
    return false;
  }
}

function subscribeToHydration() {
  return () => {};
}

function subscribeToAuthSession(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(AUTH_SESSION_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(AUTH_SESSION_EVENT, onStoreChange);
  };
}
