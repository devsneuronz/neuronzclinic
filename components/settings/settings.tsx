"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bolt, Bot, CalendarClock, CopyPlus, Tags, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BackgroundOptions } from "./background-options";
import ColorScheme from "./color-scheme";
import { ScheduledMessagesManager } from "./scheduled-messages-manager";
import { TagsManager } from "./tags-manager";
import { UsersGrid } from "./users";

type SettingsUser = {
  email: string;
  name: string;
  role: "admin" | "manager" | "user";
  tags?: string[];
};

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
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex min-h-15.25 items-center justify-between border-b border-border bg-card px-6">
        <h1 className="text-xl font-semibold text-foreground">Configurações</h1>
      </header>

      <Tabs defaultValue="geral" className="mx-auto w-full max-w-7xl gap-6 p-6">
        <TabsList className="h-auto! min-h-10 w-full flex-wrap gap-2 rounded-full px-1 py-1">
          <TabsTrigger value="geral" className="group relative data-[state=active]:bg-card">
            <Bolt className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Geral</span>
          </TabsTrigger>

          <TabsTrigger value="usuarios" className=" group relative data-[state=active]:bg-card">
            <Users className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Usuários</span>
          </TabsTrigger>

          <TabsTrigger value="tags" className=" group relative data-[state=active]:bg-card">
            <Tags className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Tags</span>
          </TabsTrigger>

          <TabsTrigger value="agendadas" className=" group relative data-[state=active]:bg-card">
            <CalendarClock className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Agendadas</span>
          </TabsTrigger>

          <TabsTrigger value="anexos" className=" group relative data-[state=active]:bg-card">
            <CopyPlus className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Anexos</span>
          </TabsTrigger>

          <TabsTrigger value="informacoes" className=" group relative data-[state=active]:bg-card">
            <Bot className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Informações</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6 outline-none">
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">Aparência</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Personalize o esquema de cores do sistema para o seu conforto visual.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 lg:grid-cols-[6fr_4fr] gap-4">
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

        <TabsContent value="tags" className="outline-none">
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">Gerenciamento de Tags</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Crie, edite cores e mantenha as tags usadas nos contatos e chats.</CardDescription>
            </CardHeader>
            <CardContent>
              <TagsManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agendadas" className="outline-none">
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">Mensagens Agendadas</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Acompanhe e cancele mensagens pendentes agrupadas por contato.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScheduledMessagesManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anexos" className="outline-none">
          <SettingsEmptySection icon={CopyPlus} title="Nenhum anexo configurado." />
        </TabsContent>

        <TabsContent value="informacoes" className="outline-none">
          <SettingsEmptySection icon={Bot} title="Nenhuma informação cadastrada." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingsEmptySection({ icon: Icon, title }: { icon: typeof Bot; title: string }) {
  return (
    <section className="flex h-64 flex-col items-center justify-center gap-3 rounded-md border border-border bg-card text-sm text-muted-foreground shadow-sm">
      <Icon className="h-8 w-8" />
      {title}
    </section>
  );
}
