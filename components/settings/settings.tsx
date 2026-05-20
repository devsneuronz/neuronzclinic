import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bolt, CircleEllipsis, Sparkle } from "lucide-react";
import Pallete from "./color-scheme";

export default function SettingsPage() {
  return (
    <div className="flex h-full w-full flex-col bg-background p-6 md:p-10">
      {/* Cabeçalho Principal da Tela */}
      <div className="space-y-1 pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie as preferências do sistema, integrações e aparência</p>
      </div>

      {/* Navegação por Abas (Tabs) */}
      <Tabs defaultValue="geral" className="mx-auto w-7xl space-y-6">
        <TabsList className="w-full gap-2 rounded-full px-1 h-10!">
          <TabsTrigger value="geral" className="group relative data-[state=active]:bg-card">
            <Bolt className="w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Geral</span>
          </TabsTrigger>

          <TabsTrigger value="integracoes" className=" group relative data-[state=active]:bg-card">
            <Sparkle className="text-blue-400 w-0! opacity-0 transition-all duration-200 ease-out group-data-[state=active]:w-4! group-data-[state=active]:opacity-100" />
            <span className="truncate">Integrações</span>
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

        {/* Conteúdo da Aba Geral */}
        <TabsContent value="geral" className="space-y-6 outline-none">
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">Aparência</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Personalize o esquema de cores do sistema para o seu conforto visual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 flex flex-row gap-4">
              <Pallete />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

