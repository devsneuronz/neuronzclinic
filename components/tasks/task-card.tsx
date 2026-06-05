import { getAvatarInitials } from "@/lib/avatar-initials";
import { formatDateTime } from "@/lib/date";
import { isOverdue, Task } from "@/lib/task";
import { cn } from "@/lib/utils";
import { AvatarImage } from "@radix-ui/react-avatar";
import { AlertCircle, Clock3, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";

export function TaskCard({ task, onSelect, onOpenPatientMessages }: { task: Task; onSelect: (task: Task) => void; onOpenPatientMessages: (task: Task) => void }) {
  const overdue = isOverdue(task);
  const dueDate = formatDateTime(task.dueDate, { day: "2-digit", month: "short", year: "numeric" });
  const createdAt = formatDateTime(task.createdAt, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  function getTaskTypeBadgeClassName(type: string) {
    const normalizedType = type
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (normalizedType.includes("aviso")) {
      return "border-sky-400/20 bg-sky-400/10 text-sky-400";
    }

    if (normalizedType.includes("pendencia")) {
      return "border-rose-400/25 bg-rose-400/10 text-rose-400";
    }

    if (normalizedType.includes("tarefa")) {
      return "border-violet-400/20 bg-violet-400/10 text-violet-400";
    }

    return "border-primary/20 bg-primary/5 text-primary";
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(task);
        }
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("max-w-full truncate text-[11px]", getTaskTypeBadgeClassName(task.type))}>
              {task.type || "Encaminhamento"}
            </Badge>
            {overdue ? (
              <Badge className="border-destructive/25 bg-destructive/5 text-[11px] text-destructive" variant="outline">
                <AlertCircle className="h-3 w-3" />
                Atrasada
              </Badge>
            ) : null}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{task.subject || "Encaminhamento sem assunto"}</h3>
        </div>
        <Avatar className="h-8 w-8 shrink-0 border border-primary/15">
          <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">{task.responsibleInitials}</AvatarFallback>
        </Avatar>
      </div>

      {task.description ? <p className="mb-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{task.description}</p> : <p className="mb-4 text-sm italic leading-6 text-muted-foreground">Sem observações registradas.</p>}

      <div className="space-y-3 border-t pt-3">
        {task.patient ? (
          <button
            type="button"
            className={cn(
              "group flex max-w-full items-center gap-2 rounded-md text-left text-xs text-muted-foreground transition-colors",
              task.patientChatId ? "-mx-1 px-1.5 py-1 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" : "cursor-default",
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (task.patientChatId) onOpenPatientMessages(task);
            }}
            disabled={!task.patientChatId}
          >
            <Avatar className="h-7 w-7 shrink-0 border">
              <AvatarImage src={task.patientPhotoUrl || undefined} alt={task.patient} />
              <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">{getAvatarInitials(task.patient)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate font-medium text-foreground">{task.patient}</span>
            {task.patientChatId ? <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-70" /> : null}
          </button>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Responsável</p>
            <p className="truncate text-xs font-medium text-foreground">{task.responsible}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prazo</p>
            <p className={cn("text-xs font-medium", overdue ? "text-destructive" : "text-foreground")}>{dueDate || "Sem prazo"}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="truncate">Criado por {task.creator}</span>
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
