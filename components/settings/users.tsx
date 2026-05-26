"use client";

import { Loader2 } from "lucide-react";
import { SettingsUser, UserCard } from "./user-card";

interface UsersGridProps {
  sortedUsers: SettingsUser[];
  isLoadingUsers: boolean;
  usersError: string | null;
}

export function UsersGrid({ sortedUsers, isLoadingUsers, usersError }: UsersGridProps) {
  if (isLoadingUsers) {
    return (
      <div className="flex min-h-64 flex-col gap-3 items-center justify-center rounded-2xl border border-dashed bg-card/50 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--sidebar-custom-primary)]" />
        <span>Carregando usuários...</span>
      </div>
    );
  }

  if (usersError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
        {usersError}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {sortedUsers.map((user) => (
        <UserCard key={user.email} user={user} />
      ))}
    </div>
  );
}
