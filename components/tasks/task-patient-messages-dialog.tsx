import { getAvatarInitials } from "@/lib/avatar-initials";
import type { MessageRecord } from "@/lib/supabase-rest";
import type { Task } from "@/lib/task";
import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { getMediaKind, getMediaUrl, getMessagePreviewText, getMessageText, isDeletedMessage } from "../chat/message-utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

interface TaskPatientMessagesDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: MessageRecord[];
  isLoading: boolean;
  errorMessage: string;
}

function getMessageDateTimeLabel(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function getSenderLabel(message: MessageRecord, task: Task) {
  if (message.from_me) return "Equipe";
  return message.participant || task.patient || "Paciente";
}

function TaskMessageBubble({ message, task }: { message: MessageRecord; task: Task }) {
  const fromMe = Boolean(message.from_me);
  const deleted = isDeletedMessage(message);
  const mediaUrl = deleted ? null : getMediaUrl(message);
  const mediaKind = mediaUrl ? getMediaKind(message) : null;
  const text = deleted ? "Mensagem apagada" : getMessageText(message);

  return (
    <div className={cn("flex", fromMe ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[82%] rounded-lg border px-3 py-2 text-sm shadow-xs", fromMe ? "rounded-tr-sm bg-primary/10" : "rounded-tl-sm bg-muted/60", deleted && "border-dashed opacity-75")}>
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className={cn("truncate text-[11px] font-semibold", fromMe ? "text-primary" : "text-foreground")}>{getSenderLabel(message, task)}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{getMessageDateTimeLabel(message.timestamp_msg)}</span>
        </div>

        {mediaUrl ? (
          <div className="space-y-1.5">
            {mediaKind === "audio" ? <audio src={mediaUrl} controls className="w-full max-w-[280px]" /> : null}
            {mediaKind === "video" ? <video src={mediaUrl} controls className="max-h-48 w-full max-w-[320px] rounded-md bg-black" /> : null}
            {mediaKind !== "audio" && mediaKind !== "video" ? (
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted">
                <ExternalLink className="h-3.5 w-3.5" />
                {getMessagePreviewText(message)}
              </a>
            ) : null}
            {message.content?.trim() ? <p className="whitespace-pre-wrap break-words text-sm text-foreground">{message.content}</p> : null}
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{text}</p>
        )}
      </div>
    </div>
  );
}

export function TaskPatientMessagesDialog({ task, open, onOpenChange, messages, isLoading, errorMessage }: TaskPatientMessagesDialogProps) {
  const orderedMessages = [...messages].reverse();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-2xl">
        {task ? (
          <div className="flex max-h-[88vh] flex-col">
            <DialogHeader className="border-b px-5 py-4">
              <div className="flex items-center gap-3 pr-6">
                <Avatar className="h-10 w-10 border">
                  <AvatarImage src={task.patientPhotoUrl || undefined} alt={task.patient} />
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{getAvatarInitials(task.patient || "Paciente")}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base">{task.patient || "Paciente"}</DialogTitle>
                  <DialogDescription className="truncate">{task.patientPhone || task.patientChatId || "Contato vinculado à tarefa"}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4">
              {isLoading ? (
                <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-theme-primary" />
                  Carregando mensagens
                </div>
              ) : errorMessage ? (
                <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{errorMessage}</div>
              ) : orderedMessages.length > 0 ? (
                <div className="space-y-2">
                  {orderedMessages.map((message) => (
                    <TaskMessageBubble key={message.id} message={message} task={task} />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center text-sm text-muted-foreground">
                  <MessageCircle className="h-5 w-5" />
                  Nenhuma mensagem encontrada para este paciente.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
