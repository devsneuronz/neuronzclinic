import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { formatDateTime } from "@/lib/date";
import type { IaRequest } from "@/lib/ia-request";
import type { ChatRecord } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
import { Bot, Clock3, MessageCircle } from "lucide-react";

import { isIaRequestCompleted, type IaRequestActionConfig } from "./ia-request-utils";

interface IaCardProps {
  contactName: string;
  chosenDate: string;
  statusLabel: string;
  actionConfig: IaRequestActionConfig;
  request: IaRequest;
  chat?: ChatRecord;
  isAdmin: boolean;
  onSelect: (request: IaRequest) => void;
  onOpenChat: (request: IaRequest, chat?: ChatRecord) => void;
}

export function IaCard({ contactName, chosenDate, statusLabel, actionConfig, request, chat, isAdmin, onSelect, onOpenChat }: IaCardProps) {
  const createdAt = formatDateTime(request.createdAt, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const procedureLabel = request.procedureName;
  const ActionIcon = actionConfig.icon;
  const shouldShowProfessional = isAdmin && actionConfig.kind !== "aviso" && Boolean(request.professionalName);
  const isCompleted = isIaRequestCompleted(request.status);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(request)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(request);
        }
      }}
      className={cn(
        "cursor-pointer rounded-md border bg-card p-4 text-left shadow-xs transition hover:ring-2 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2",
        isCompleted ? "border-border/60 bg-muted/30 hover:ring-muted-foreground/10 focus-visible:ring-muted-foreground/10" : actionConfig.cardClassName,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("h-6 w-6 justify-center rounded-md p-0", isCompleted ? "border-border/50 bg-muted text-muted-foreground/80" : actionConfig.iconClassName)} title={statusLabel}>
              <Bot className="h-3.5 w-3.5" />
            </Badge>
            <Badge variant="outline" className={cn("text-[11px] font-medium", isCompleted ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : actionConfig.badgeClassName)}>
              {isCompleted ? "Concluído" : actionConfig.label}
            </Badge>
          </div>
          <h3 className={cn("line-clamp-2 text-sm font-semibold leading-5", isCompleted ? "text-muted-foreground" : "text-foreground")}>{request.situation || "Aviso da IA"}</h3>
        </div>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", isCompleted ? "border-border/50 bg-muted text-muted-foreground/80" : actionConfig.iconClassName)}>
          <ActionIcon className="h-4 w-4" />
        </span>
      </div>

      {request.context ? <p className="mb-4 line-clamp-4 text-sm leading-6 text-muted-foreground/70">{request.context}</p> : <p className="mb-4 text-sm italic leading-6 text-muted-foreground/50">Sem contexto registrado.</p>}

      <div className={cn("space-y-3 border-t pt-3", isCompleted ? "border-border/40" : "")}>
        <div className="flex w-full flex-row justify-between">
          {contactName || request.chatId ? (
            <button
              type="button"
              className={cn(
                "group flex max-w-full items-center gap-2 rounded-md text-left text-xs text-muted-foreground transition-colors",
                request.chatId ? "-mx-1 px-1.5 py-1 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" : "cursor-default",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onOpenChat(request, chat);
              }}
              disabled={!request.chatId}
            >
              <Avatar className="h-7 w-7 shrink-0 border border-border/50">
                <AvatarImage src={undefined} alt={contactName || request.chatId} />
                <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground/70">{getAvatarInitials(contactName)}</AvatarFallback>
              </Avatar>
              <span className={cn("min-w-0 truncate font-medium", isCompleted ? "text-muted-foreground" : "text-foreground")}>{contactName || request.chatId}</span>
              {request.chatId ? <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-70" /> : null}
            </button>
          ) : null}
          {shouldShowProfessional ? (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Procedimento</p>
              <p className={cn("text-xs font-medium", isCompleted ? "text-muted-foreground" : "text-foreground")}>{procedureLabel}</p>
            </div>
          ) : null}
        </div>

        {actionConfig.dateLabel && procedureLabel ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{shouldShowProfessional ? "Responsável" : actionConfig.dateLabel}</p>
              <p className={cn("truncate text-xs font-medium", isCompleted ? "text-muted-foreground" : "text-foreground")}>{shouldShowProfessional ? request.professionalName : chosenDate || actionConfig.emptyDateText}</p>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{shouldShowProfessional ? actionConfig.dateLabel : "Procedimento"}</p>
              <p className={cn("text-xs font-medium", isCompleted ? "text-muted-foreground" : "text-foreground")}>{shouldShowProfessional ? chosenDate || actionConfig.emptyDateText : procedureLabel}</p>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground/60">
          <span className="truncate">Criado pela IA</span>
          {createdAt ? (
            <span className="flex shrink-0 items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {createdAt}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
