import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { IaRequest } from "@/lib/ia-request";
import { cn } from "@/lib/utils";
import { AlertCircle, Bot, CalendarCheck, CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";

import { canConfirmIaRequest, formatIaRequestDate, getIaRequestActionConfig, getIaRequestStatusLabel, isIaRequestCompleted } from "./ia-request-utils";

interface IaRequestDialogProps {
  request: IaRequest | null;
  open: boolean;
  errorMessage: string;
  deletingRequestId: string;
  confirmingRequestId: string;
  completingRequestId: string;
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmAppointment: (request: IaRequest) => void;
  onComplete: (request: IaRequest) => void;
  onDelete: (request: IaRequest) => void;
}

export function IaRequestDialog({ request, open, errorMessage, deletingRequestId, confirmingRequestId, completingRequestId, isAdmin, onOpenChange, onConfirmAppointment, onComplete, onDelete }: IaRequestDialogProps) {
  const actionConfig = request ? getIaRequestActionConfig(request.action) : null;
  const ActionIcon = actionConfig?.icon;
  const isBusy = Boolean(deletingRequestId || confirmingRequestId || completingRequestId);
  const isCompleted = request ? isIaRequestCompleted(request.status) : false;
  const isPending = request ? getIaRequestStatusLabel(request.status) === "Pendente" : false;
  const shouldShowChosenDate = actionConfig?.kind !== "aviso";
  const shouldShowProfessional = Boolean(isAdmin && request?.professionalName && actionConfig?.kind !== "aviso");
  const shouldShowConfirmButton = request ? canConfirmIaRequest(request) : false;
  const statusBadgeClassName = isCompleted ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : isPending ? "border-amber-500/25 bg-amber-500/10 text-amber-700" : actionConfig?.badgeClassName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col p-0 overflow-hidden">
        {request && actionConfig && ActionIcon ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <DialogHeader className="p-6 pb-2 shrink-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("h-6 w-6 justify-center rounded-md p-0", isCompleted ? "border-border/50 bg-muted text-muted-foreground/80" : actionConfig.iconClassName)}
                  title={getIaRequestStatusLabel(request.status)}
                >
                  <Bot className="h-3.5 w-3.5" />
                </Badge>
                <Badge variant="outline" className={cn("text-[11px] font-medium", isCompleted ? "border-border/50 bg-muted text-muted-foreground/80" : actionConfig.badgeClassName)}>
                  {actionConfig.label}
                </Badge>
                <Badge variant="outline" className={cn("text-[11px] font-medium", statusBadgeClassName)}>
                  {getIaRequestStatusLabel(request.status)}
                </Badge>
              </div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ActionIcon className={cn("h-4 w-4", isCompleted ? "text-muted-foreground" : actionConfig.kind === "agendamento" ? "text-emerald-600 " : actionConfig.kind === "intencao" ? "text-amber-500 " : "text-sky-500 ")} />
                {actionConfig.title}
              </DialogTitle>
              <DialogDescription>{actionConfig.description}</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 min-h-0 custom-scrollbar">
              <div className="grid gap-4 sm:grid-cols-2">
                {shouldShowProfessional && (
                  <div className={cn("rounded-md border p-3", isCompleted ? "border-border/60 bg-muted/30" : actionConfig.panelClassName)}>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Profissional</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{request.professionalName}</p>
                  </div>
                )}

                {shouldShowChosenDate && (
                  <div className={cn("rounded-md border p-3", isCompleted ? "border-border/60 bg-muted/30" : actionConfig.panelClassName)}>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">{actionConfig.dateLabel}</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{formatIaRequestDate(request.chosenDate) || actionConfig.emptyDateText}</p>
                  </div>
                )}

                {shouldShowChosenDate && (
                  <div className="rounded-md border border-border bg-card p-3 sm:col-span-2">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Procedimento</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{request.procedureName || "Procedimento não informado"}</p>
                  </div>
                )}

                <div className="rounded-md border border-border bg-card p-3 sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Situação</label>
                  <p className="mt-1 text-sm font-medium leading-6 text-foreground">{request.situation || "Sem situação registrada."}</p>
                </div>
              </div>

              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Contexto</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{request.context || "Sem contexto registrado."}</p>
              </div>

              {errorMessage ? (
                <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {errorMessage}
                </div>
              ) : null}
            </div>

            <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/20 shrink-0 flex items-center sm:justify-between gap-2">
              <div className="text-[11px] text-muted-foreground mr-auto">Criado em {formatIaRequestDate(request.createdAt) || "-"}</div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="destructive" onClick={() => onDelete(request)} disabled={isBusy} className="gap-1.5 h-9 text-xs">
                  {deletingRequestId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {deletingRequestId ? "Excluindo..." : "Excluir"}
                </Button>
                {!isCompleted ? (
                  <Button type="button" variant="outline" onClick={() => onComplete(request)} disabled={isBusy} className="gap-1.5 h-9 text-xs">
                    {completingRequestId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : actionConfig.kind === "agendamento" ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {completingRequestId ? "Concluindo..." : actionConfig.kind === "agendamento" ? "Não confirmar" : "Concluir"}
                  </Button>
                ) : null}
                {shouldShowConfirmButton ? (
                  <Button type="button" onClick={() => onConfirmAppointment(request)} disabled={isBusy} className="gap-1.5 h-9 text-xs bg-emerald-800 text-white hover:bg-emerald-900">
                    {confirmingRequestId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
                    {confirmingRequestId ? "Confirmando..." : "Confirmar agendamento"}
                  </Button>
                ) : null}
              </div>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
