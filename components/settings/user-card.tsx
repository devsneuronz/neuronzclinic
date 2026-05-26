"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { cn } from "@/lib/utils";
import { FolderKanban, HardHat, Mail, Shield, User } from "lucide-react";

export type SettingsUser = {
  email: string;
  name: string;
  role: "admin" | "manager" | "user";
  tags?: string[];
};

const tagStyles = ["bg-emerald-600 text-white", "bg-violet-600 text-white", "bg-yellow-600 text-white", "bg-sky-600 text-white", "bg-indigo-500 text-white", "bg-rose-600 text-white"];

function getTagClass(tag: string) {
  const value = tag.toLowerCase();

  if (value.includes("venda")) return tagStyles[0];
  if (value.includes("compra")) return tagStyles[1];
  if (value.includes("financeiro")) return tagStyles[2];
  if (value.includes("adm") || value.includes("admin")) return tagStyles[3];
  if (value.includes("clínica") || value.includes("clinica")) return tagStyles[4];

  const index = Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0) % tagStyles.length;
  return tagStyles[index];
}
interface UserCardProps {
  user: SettingsUser;
}

export function UserCard({ user }: UserCardProps) {
  return (
    <Card className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs hover:shadow-md hover:border-border transition-all duration-200 group pt-6 pb-0 gap-2">
      <CardHeader className="flex flex-col">
        <div className="w-full h-16 rounded-md bg-linear-to-tr to-theme-primary/80"></div>
        <div className="flex flex-row items-center gap-2 space-y-0 -mt-8 w-full px-2">
          <Avatar className="h-11 w-11 rounded-full bg-[var(--sidebar-custom-primary)] text-[var(--sidebar-custom-primary-fg)] font-semibold shadow-xs">
            <AvatarFallback className="rounded-xl bg-transparent">{getAvatarInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="overflow-hidden flex flex-row justify-between w-full">
            <CardTitle title={user.name} className="text-base font-semibold text-foreground truncate transition-colors">
              {user.name}
            </CardTitle>
            <div className="flex items-center px-2 text-[11px] font-medium text-muted-foreground bg-muted rounded-md">
              {user.role === "admin" && (
                <div className="inline-flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Admin
                </div>
              )}
              {user.role === "manager" && (
                <div className="inline-flex items-center gap-1">
                  <HardHat className="h-3 w-3" />
                  Manager
                </div>
              )}
              {user.role === "user" && (
                <div className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Usuário
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-2 space-y-3 flex-1">
        <div className="rounded-xl bg-muted/30 p-3 border border-border/40 space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Mail className="h-3 w-3" />
            E-mail
          </span>
          <p className="break-all text-xs font-medium text-foreground/90">{user.email}</p>
        </div>
      </CardContent>

      <div className="mt-auto border-t border-border/60 bg-muted/30 px-5 py-4 space-y-3 h-[86px]">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase flex items-center gap-1.5">
          <FolderKanban className="h-3.5 w-3.5 opacity-70" />
          Setores sob responsabilidade
        </span>

        {user.tags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {user.tags.map((tag) => (
              <Badge key={`${user.email}-${tag}`} className={cn(getTagClass(tag), "border-transparent px-2.5 py-1 text-xs font-medium rounded-lg transition-opacity hover:opacity-90 shadow-2xs")}>
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/80 italic">Nenhum setor atribuído até o momento</p>
        )}
      </div>
    </Card>
  );
}
