"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bolt, CircleEllipsis, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BackgroundOptions } from "./background-options";
import ColorScheme from "./color-scheme";
import { UsersGrid } from "./users";

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

      <Tabs defaultValue="geral" className="mx-auto w-full max-w-7xl space-y-3">
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
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">Equipe e Permissões</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Visualize os profissionais cadastrados na plataforma, seus e-mails e setores de atuação.</CardDescription>
            </CardHeader>
            <CardContent>
              <UsersGrid sortedUsers={sortedUsers} isLoadingUsers={isLoadingUsers} usersError={usersError} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
