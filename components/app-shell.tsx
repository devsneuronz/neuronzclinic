"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { AUTH_SESSION_EVENT, hasValidSession } from "@/lib/auth-session";
import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(getSavedSidebarState);

  const pathname = usePathname();
  const router = useRouter();
  const isHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const isAuthenticated = useSyncExternalStore(subscribeToAuthSession, hasValidSession, () => false);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (pathname === "/login" && isAuthenticated) {
      router.replace("/");
      return;
    }

    if (pathname !== "/login" && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isHydrated, pathname, router]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("sidebar-collapsed", JSON.stringify(isCollapsed));
    }
  }, [isCollapsed, isHydrated]);

  if (!isHydrated) {
    return <div className="flex h-screen bg-background" />;
  }

  if (pathname === "/login") {
    return isAuthenticated ? (
      <main className="flex min-h-screen w-full bg-background" />
    ) : (
      <main className="flex min-h-screen w-full bg-background">{children}</main>
    );
  }

  if (!isAuthenticated) {
    return <main className="flex min-h-screen w-full bg-background" />;
  }

  return (
    <>
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </>
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
