"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { FolderKanban, Mail, Stethoscope } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { SupabaseProcedure } from "./clinic-info-manager";

export type SettingsProfessional = {
  id: string;
  email: string;
  name: string;
  expertises: string[];
  procedures: SupabaseProcedure[];
};

interface ProfessionalCardProps {
  professional: SettingsProfessional;
}

export function ProfessionalCard({ professional }: ProfessionalCardProps) {
  // const [isOpen, setIsOpen] = useState(false);
  // const [isSaving, setIsSaving] = useState(false);
  // const [error, setError] = useState<string | null>(null);

  const proceduresList = professional.procedures || [];
  const visibleProcedures = proceduresList.slice(0, 3);
  const hiddenProcedures = proceduresList.slice(3);

  // async function save() {
  //   setIsSaving(true);
  //   setError(null);
  //   try {
  //     const response = await fetch("/api/airtable/professionals", {
  //       method: "PATCH",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ id: professional.id, sectorIds: selectedIds }),
  //     });
  //     const data = (await response.json().catch(() => null)) as { error?: string } | null;
  //     if (!response.ok) throw new Error(data?.error || "Não foi possível atualizar o usuário.");
  //     onUpdated({ ...professional, sectorIds: selectedIds, tags: sectors.filter((sector) => selectedIds.includes(sector.id)).map((sector) => sector.name) });
  //     setIsOpen(false);
  //   } catch (err) {
  //     setError(err instanceof Error ? err.message : "Não foi possível atualizar o usuário.");
  //   } finally {
  //     setIsSaving(false);
  //   }
  // }

  return (
    <Card className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs hover:shadow-md hover:border-border transition-all duration-200 group pt-6 pb-0 gap-2">
      <CardHeader className="flex flex-col">
        <div className="w-full h-16 rounded-md bg-linear-to-tr to-theme-primary/80"></div>
        <div className="flex flex-row items-center gap-2 space-y-0 -mt-8 w-full px-2">
          <Avatar className="h-11 w-11 rounded-full bg-[var(--sidebar-custom-primary)] text-[var(--sidebar-custom-primary-fg)] font-semibold shadow-xs">
            <AvatarFallback className="rounded-xl bg-transparent">{getAvatarInitials(professional.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 items-center justify-between gap-2 w-full">
            <CardTitle title={professional.name} className="min-w-0 flex-1 truncate text-base font-semibold">
              {professional.name}
            </CardTitle>
            <div className="shrink-0 flex items-center px-2 py-1 text-[11px] font-medium text-muted-foreground bg-muted rounded-md">
              <Stethoscope className="h-3 w-3" />

              <div className="inline-flex items-center gap-1">{(professional.expertises || []).join(", ")}</div>
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
          <p className="break-all text-xs font-medium text-foreground/90">{professional.email}</p>
        </div>
      </CardContent>

      <div className="mt-auto border-t border-border/60 bg-muted/30 px-5 py-4 space-y-3 h-24.75">
        <div className="flex items-center justify-between gap-2 h-7">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase flex items-center gap-1.5">
            <FolderKanban className="h-3.5 w-3.5 opacity-70" />
            Procedimentos
          </span>
          {/* {/^rec[a-zA-Z0-9]+$/.test(user.id) && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={() => {
                setSelectedIds(user.sectorIds);
                setIsOpen(true);
              }}
              aria-label={`Editar setores de ${user.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )} */}
        </div>

        {professional.procedures?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleProcedures.map((procedure) => {
              return (
                <span key={procedure.id} className="inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold border-border bg-card">
                  {procedure.nome}
                </span>
              );
            })}

            {hiddenProcedures.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="rounded-full">
                      +{hiddenProcedures.length}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="p-2 rounded-[20px]">
                    <div className="flex gap-1 flex-wrap justify-between">
                      {hiddenProcedures.map((procedure) => {
                        return (
                          <Badge key={procedure.id} className="rounded-full border border-border bg-muted">
                            {procedure.nome}
                          </Badge>
                        );
                      })}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/80 italic">Nenhum setor atribuído até o momento</p>
        )}
      </div>

      {/* <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setores de {professional.name}</DialogTitle>
            <DialogDescription>Escolha os setores sob responsabilidade deste usuário.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-80 gap-2 overflow-y-auto">
            {sectors.map((sector) => (
              <label key={sector.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(sector.id)}
                  onChange={() => setSelectedIds((current) => (current.includes(sector.id) ? current.filter((id) => id !== sector.id) : [...current, sector.id]))}
                  className="size-4 accent-primary"
                />
                <span className="size-3 rounded-full" style={{ backgroundColor: sector.color }} />
                <span className="text-sm font-medium">{sector.name}</span>
              </label>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog> */}
    </Card>
  );
}

