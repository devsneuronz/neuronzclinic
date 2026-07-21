"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";
import { Bolt, Building2, CalendarClock, CopyPlus, Loader2, Sparkles, Stethoscope, Tags, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ProfessionalAgendaPreview } from "../agenda/professional-agenda-preview";
import { BackgroundOptions } from "./background-options";
import { ClinicInfoManager, SupabaseProcedure } from "./clinic-info-manager";
import ColorScheme from "./color-scheme";
import { Expertise, Professionals, SettingsProfessional } from "./professionals";
import { SavedAttachmentsManager } from "./saved-attachments-manager";
import { ScheduledMessagesManager } from "./scheduled-messages-manager";
import { SectorsManager, type Sector } from "./sectors-manager";
import { TagsManager } from "./tags-manager";
import type { SettingsUser as UserCardSettingsUser } from "./user-card";
import { UsersGrid } from "./users";

type SettingsUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "user";
  tags?: string[];
  sectorIds: string[];
  tagIds: string[];
};

export type ProfessionalUserOption = {
  id: string;
  name: string;
  email: string;
  source: "supabase" | "airtable";
};

export default function SettingsPage() {
  const [users, setUsers] = useState<SettingsUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);

  const [professionals, setProfessionals] = useState<SettingsProfessional[]>([]);
  const [professionalUsers, setProfessionalUsers] = useState<ProfessionalUserOption[]>([]);
  const [isLoadingProfessionals, setIsLoadingProfessionals] = useState(true);
  const [professionalError, setProfessionalError] = useState<string | null>(null);
  const [expertises, setExpertises] = useState<Expertise[]>([]);
  const [procedures, setProcedures] = useState<SupabaseProcedure[]>([]);

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

  useEffect(() => {
    let isMounted = true;

    fetch("/api/professionals", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar os profissionais.");
        return (await response.json()) as { professionals?: SettingsProfessional[]; users?: ProfessionalUserOption[] };
      })
      .then((data) => {
        if (isMounted) {
          setProfessionals(data.professionals ?? []);
          setProfessionalUsers(data.users ?? []);
        }
      })
      .catch((error) => {
        if (isMounted) setProfessionalError(error instanceof Error ? error.message : "Não foi possível carregar os profissionais.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingProfessionals(false);
      });

    fetch("/api/expertise", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (isMounted) setExpertises(data.expertises ?? []);
        }
      })
      .catch(() => {});

    fetch("/api/procedures", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (isMounted) setProcedures(data.procedures ?? []);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    fetch("/api/airtable/sectors", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Não foi possível carregar os setores."))))
      .then((data: { sectorRecords?: Sector[] }) => setSectors(data.sectorRecords ?? []))
      .catch(() => setSectors([]));
  }, []);

  const handleProfessionalAdded = () => {
    fetch("/api/professionals", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { professionals?: SettingsProfessional[]; users?: ProfessionalUserOption[] }) => {
        setProfessionals(data.professionals ?? []);
        setProfessionalUsers(data.users ?? []);
      })
      .catch(() => {});
  };

  const handleExpertiseAdded = (newExpertise: Expertise) => {
    setExpertises((current) => [...current, newExpertise].sort((a, b) => a.especialidade.localeCompare(b.especialidade, "pt-BR")));
  };

  const handleExpertiseDeleted = (expertiseId: string) => {
    setExpertises((current) => current.filter((expertise) => expertise.id !== expertiseId));
    setProfessionals((current) =>
      current.map((professional) => ({
        ...professional,
        expertises: professional.expertises.filter((expertise) => expertise.id !== expertiseId),
      })),
    );
  };

  const sortedUsers = useMemo(() => users.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [users]);
  const sortedProfessionals = useMemo(() => professionals.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [professionals]);

  const { user, isLoading } = useCurrentUser();
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex h-screen w-full flex-col bg-background overflow-hidden">
      <header className="flex min-h-15.25 items-center justify-between border-b border-border bg-card px-6 shrink-0">
        <h1 className="text-xl font-semibold text-foreground">Configurações</h1>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="w-full flex flex-col flex-1 overflow-hidden">
          <Tabs defaultValue="geral" className="flex flex-col flex-1 overflow-hidden gap-0">
            <div className="bg-card py-3 px-4 border-b border-border shrink-0 flex justify-start md:justify-center w-full overflow-x-auto no-scrollbar">
              <TabsList className="flex w-max md:w-fit gap-1.5 rounded-full h-11! bg-secondary/50 border border-border/40 px-1.5 py-1.5">
                {isLoading ? (
                  <TabsTrigger value="" className="group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Carregando</span>
                  </TabsTrigger>
                ) : (
                  <>
                    <TabsTrigger value="geral" className={cn("group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full", !isAdmin && "border-0! bg-transparent!")}>
                      <Bolt className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100 mr-0 group-data-[state=active]:mr-2" />
                      <span>Geral</span>
                    </TabsTrigger>

                    {!isAdmin && (
                      <TabsTrigger value="minha-agenda" className="group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full">
                        <CalendarClock className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100 mr-0 group-data-[state=active]:mr-2" />
                        <span>Minha agenda</span>
                      </TabsTrigger>
                    )}

                    {isAdmin && (
                      <>
                        <TabsTrigger value="usuarios" className="group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full">
                          <Users className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100 mr-0 group-data-[state=active]:mr-2" />
                          <span>Usuários</span>
                        </TabsTrigger>
                        {false && (
                          <TabsTrigger value="profissionais" className="group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full">
                            <Stethoscope className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100 mr-0 group-data-[state=active]:mr-2" />
                            <span>Profissionais</span>
                          </TabsTrigger>
                        )}
                        <TabsTrigger value="tags" className="group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full">
                          <Tags className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100 mr-0 group-data-[state=active]:mr-2" />
                          <span>Tags</span>
                        </TabsTrigger>
                        <TabsTrigger value="setores" className="group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full">
                          <Building2 className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100 mr-0 group-data-[state=active]:mr-2" />
                          <span>Setores</span>
                        </TabsTrigger>
                        <TabsTrigger value="agendadas" className="group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full">
                          <CalendarClock className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100 mr-0 group-data-[state=active]:mr-2" />
                          <span>Agendadas</span>
                        </TabsTrigger>
                        <TabsTrigger value="anexos" className="group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full">
                          <CopyPlus className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100 mr-0 group-data-[state=active]:mr-2" />
                          <span>Anexos</span>
                        </TabsTrigger>
                        {false && (
                          <TabsTrigger value="informacoes" className="group relative data-[state=active]:bg-card shrink-0 px-4 py-2 rounded-full">
                            <Sparkles className="text-blue-500 w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100 mr-0 group-data-[state=active]:mr-2" />
                            <span>IA</span>
                          </TabsTrigger>
                        )}
                      </>
                    )}
                  </>
                )}
              </TabsList>
            </div>
            {!isLoading && (
              <>
                <TabsContent value="geral" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! data-[state=active]:flex">
                  <Card className="w-full max-w-7xl border border-border bg-card shadow-sm flex flex-col">
                    <CardHeader className="space-y-1 shrink-0 px-4 sm:px-6">
                      <CardTitle className="text-xl font-semibold text-foreground">Aparência</CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">Personalize o esquema de cores do sistema para o seu conforto visual.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto custom-scrollbar">
                      <div className="flex flex-col md:flex-row gap-6">
                        <ColorScheme />
                        <BackgroundOptions />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                {!isAdmin && (
                  <TabsContent value="minha-agenda" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! data-[state=active]:flex">
                    <Card className="w-full max-w-7xl border border-border bg-card shadow-sm flex flex-col">
                      <CardHeader className="space-y-1 shrink-0">
                        <CardTitle className="text-xl font-semibold text-foreground">Minha agenda</CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">Configure seus horários e veja os procedimentos vinculados ao seu cadastro profissional.</CardDescription>
                      </CardHeader>
                      <CardContent className="flex min-h-0 flex-1 overflow-hidden">
                        <ProfessionalAgendaPreview />
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}
                <TabsContent value="usuarios" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! data-[state=active]:flex">
                  <Card className="w-full max-w-7xl border border-border bg-card shadow-sm flex flex-col min-h-0 overflow-hidden">
                    <CardHeader className="space-y-1 shrink-0">
                      <CardTitle className="text-xl font-semibold text-foreground">Equipe e Permissões</CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">Visualize os usuários cadastrados na plataforma, seus e-mails e setores de atuação.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto custom-scrollbar">
                      <UsersGrid
                        sortedUsers={sortedUsers}
                        isLoadingUsers={isLoadingUsers}
                        usersError={usersError}
                        sectors={sectors}
                        onUserUpdated={(updated: UserCardSettingsUser) => setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)))}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="profissionais" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! data-[state=active]:flex">
                  <Card className="w-full max-w-7xl border border-border bg-card shadow-sm flex flex-col min-h-0 overflow-hidden">
                    <CardHeader className="space-y-1 shrink-0 flex flex-row justify-between items-center">
                      <div className="space-y-1">
                        <CardTitle className="text-xl font-semibold text-foreground">Profissionais cadastrados no sistema</CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">Visualize os médicos cadastrados na plataforma, suas informações e agenda</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto custom-scrollbar">
                      <Professionals
                        sortedProfessionals={sortedProfessionals}
                        isLoadingProfessionals={isLoadingProfessionals}
                        professionalError={professionalError}
                        procedures={procedures}
                        expertises={expertises}
                        users={professionalUsers}
                        onProfessionalAdded={handleProfessionalAdded}
                        onExpertiseAdded={handleExpertiseAdded}
                        onExpertiseDeleted={handleExpertiseDeleted}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="setores" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! data-[state=active]:flex">
                  <Card className="w-full max-w-7xl border border-border bg-card shadow-sm flex flex-col min-h-0 overflow-hidden">
                    <CardHeader className="space-y-1 shrink-0">
                      <CardTitle className="text-xl font-semibold text-foreground">Gerenciamento de Setores</CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">Crie setores e defina quais tags de contatos pertencem a cada um.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto custom-scrollbar">
                      <SectorsManager onSectorsChanged={setSectors} />
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="tags" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! data-[state=active]:flex">
                  <Card className="w-full max-w-7xl border border-border bg-card shadow-sm flex flex-col min-h-0 overflow-hidden">
                    <CardHeader className="space-y-1 shrink-0">
                      <CardTitle className="text-xl font-semibold text-foreground">Gerenciamento de Tags</CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">Crie, edite cores e mantenha as tags usadas nos contatos e chats.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto custom-scrollbar">
                      <TagsManager />
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="agendadas" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! data-[state=active]:flex">
                  <Card className="w-full max-w-7xl border border-border bg-card shadow-sm flex flex-col min-h-0 overflow-hidden">
                    <CardHeader className="space-y-1 shrink-0">
                      <CardTitle className="text-xl font-semibold text-foreground">Mensagens Agendadas</CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">Acompanhe e cancele mensagens pendentes agrupadas por contato.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto custom-scrollbar">
                      <ScheduledMessagesManager />
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="anexos" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! data-[state=active]:flex">
                  <Card className="w-full max-w-7xl border border-border bg-card shadow-sm flex flex-col min-h-0 overflow-hidden">
                    <CardHeader className="space-y-1 shrink-0">
                      <CardTitle className="text-xl font-semibold text-foreground">Anexos Rápidos</CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">Gerencie mensagens, imagens, vídeos e áudios reutilizáveis no menu de clipe dos chats.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto custom-scrollbar">
                      <SavedAttachmentsManager />
                    </CardContent>
                  </Card>
                </TabsContent>
                <div className="overflow-y-auto ">
                  <TabsContent value="informacoes" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! data-[state=active]:flex">
                    <Card className="w-full max-w-7xl border border-border bg-card shadow-sm flex flex-col min-h-0">
                      <CardHeader className="space-y-1 shrink-0">
                        <CardTitle className="text-xl font-semibold text-foreground">Configurações da IA</CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">Gerencie as diretrizes de comportamento da assistente virtual e a tabela de procedimentos.</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 overflow-y-auto no-scrollbar">
                        <ClinicInfoManager />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </div>
              </>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
}
