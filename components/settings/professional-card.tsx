"use client";

import { ProfessionalAgendaPreview } from "@/components/agenda/professional-agenda-preview";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { FolderRoot, Mail, Pencil, Stethoscope, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { SettingsProfessional } from "./professionals";

interface ProfessionalCardProps {
  professional: SettingsProfessional;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProfessionalCard({ professional, onEdit, onDelete }: ProfessionalCardProps) {
  const proceduresList = professional.procedures || [];
  const visibleProcedures = proceduresList.slice(0, 2);
  const hiddenProcedures = proceduresList.slice(2);

  return (
    <Card className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/60 shadow-2xs hover:shadow-sm hover:border-border transition-all duration-200 group p-4 gap-3">
      <CardHeader className="flex flex-row items-center gap-3 p-0 space-y-0 w-full">
        <Avatar className="h-10 w-10 shrink-0 rounded-lg bg-[var(--sidebar-custom-primary)]/10 text-[var(--sidebar-custom-primary)] font-bold text-sm shadow-2xs">
          <AvatarFallback className="rounded-lg bg-transparent">{getAvatarInitials(professional.name)}</AvatarFallback>
        </Avatar>

        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
          <CardTitle title={professional.name} className="truncate text-sm font-semibold text-foreground tracking-tight">
            {professional.name}
          </CardTitle>

          {professional.expertises?.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-theme-primary truncate">
              <Stethoscope className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {(professional.expertises || [])
                  .map((exp) => (typeof exp === "string" ? exp : exp.especialidade))
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 opacity-60 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Excluir Profissional"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Editar Profissional"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex flex-col gap-1.5 justify-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground/90">
          <Mail className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <span className="truncate font-medium selection:bg-theme-primary/20">{professional.email}</span>
        </div>
      </CardContent>

      <div className="border-t border-border/40 my-0.5" />

      <div className="flex flex-col gap-1.5 w-full">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase flex items-center gap-1">
            <FolderRoot className="h-3 w-3 opacity-60" />
            Procedimentos
          </span>
        </div>

        {professional.procedures?.length ? (
          <div className="flex flex-wrap gap-1">
            {visibleProcedures.map((procedure) => (
              <span key={procedure.id} className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/80 max-w-[140px] truncate">
                {procedure.nome}
              </span>
            ))}

            {hiddenProcedures.length > 0 && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="rounded-md px-1.5 py-0 h-4 text-[10px] font-bold border border-border/30 cursor-help">
                      +{hiddenProcedures.length}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="p-2 rounded-xl border border-border bg-popover shadow-md">
                    <div className="flex gap-1 flex-wrap max-w-xs">
                      {hiddenProcedures.map((procedure) => (
                        <Badge key={procedure.id} variant="outline" className="rounded-md bg-muted text-[10px]">
                          {procedure.nome}
                        </Badge>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/60 italic">Nenhum procedimento atribuído</p>
        )}
      </div>

      <ProfessionalAgendaPreview professionalId={professional.id} />
    </Card>
  );
}
