"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { cn } from "@/lib/utils";
import { Bolt, CircleEllipsis, FolderKanban, Loader2, Mail, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { BackgroundOptions } from "./background-options";
import ColorScheme from "./color-scheme";

type SettingsUser = {
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

export default function SettingsPage() {
  const [users, setUsers] = useState<SettingsUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/airtable/users", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar os usuários.");

        return (await response.json()) as { users?: SettingsUser[] };
      })
      .then((data) => {
        if (isMounted) setUsers(data.users ?? []);
      })
      .catch((error) => {
        if (isMounted) setUsersError(error instanceof Error ? error.message : "Não foi possível carregar os usuários.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingUsers(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const sortedUsers = useMemo(() => users.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [users]);

  return (
    <div className="flex h-full w-full flex-col bg-background p-6 md:p-10">
      <div className="space-y-1 pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie as preferências do sistema, usuários e aparência</p>
      </div>

      <Tabs defaultValue="geral" className="mx-auto w-full max-w-7xl space-y-6">
        <TabsList className="w-full gap-2 rounded-full px-1 h-10!">
          <TabsTrigger value="geral" className="group relative data-[state=active]:bg-card">
            <Bolt className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Geral</span>
          </TabsTrigger>

          <TabsTrigger value="usuarios" className=" group relative data-[state=active]:bg-card">
            <Users className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Usuários</span>
          </TabsTrigger>

          <TabsTrigger value="opção 3" className=" group relative data-[state=active]:bg-card">
            <CircleEllipsis className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Opção 3</span>
          </TabsTrigger>

          <TabsTrigger value="opção 4" className=" group relative data-[state=active]:bg-card">
            <CircleEllipsis className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Opção 4</span>
          </TabsTrigger>

          <TabsTrigger value="opção 5" className=" group relative data-[state=active]:bg-card">
            <CircleEllipsis className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Opção 5</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6 outline-none">
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">Aparência</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Personalize o esquema de cores do sistema para o seu conforto visual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 flex flex-row gap-4">
              <ColorScheme />
              <BackgroundOptions />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usuarios" className="outline-none">
          {isLoadingUsers ? (
            <div className="flex min-h-64 flex-col gap-3 items-center justify-center rounded-2xl border border-dashed bg-card/50 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--sidebar-custom-primary)]" />
              <span>Carregando usuários...</span>
            </div>
          ) : usersError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              {usersError}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {sortedUsers.map((user) => {
                return (
                  <Card key={user.email} className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs hover:shadow-md hover:border-border transition-all duration-200 group py-0 gap-2">
                    <CardHeader className="p-5 pb-3 flex flex-col">
                      <div className="w-full h-16 rounded-md bg-linear-to-tr to-theme-primary/80"></div>
                      <div className="flex flex-row items-center gap-4 space-y-0 px-4 -mt-7.5">
                        <Avatar className="h-11 w-11 rounded-full bg-[var(--sidebar-custom-primary)] text-[var(--sidebar-custom-primary-fg)] font-semibold shadow-xs">
                          <AvatarFallback className="rounded-xl bg-transparent">{getAvatarInitials(user.name)}</AvatarFallback>
                        </Avatar>
                        <CardTitle className="text-base font-semibold leading-tight text-foreground truncate">{user.name}</CardTitle>
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

                    <div className="mt-auto border-t border-border/60 bg-muted/10 px-5 py-4 space-y-3 h-[86px]">
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
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
