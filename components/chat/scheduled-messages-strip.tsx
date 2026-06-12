"use client";

import { Button } from "@/components/ui/button";
import type { ScheduledMessageRecord } from "@/lib/supabase-rest";
import { CalendarClock, ChevronDown, ChevronUp, Clock, SquarePen, Trash2 } from "lucide-react";
import { useState } from "react";
import { EditingScheduledDialog } from "./edit-scheduled-dialog";

function formatScheduledDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getScheduledPreview(message: ScheduledMessageRecord) {
  const text = message.text || message.content || message.caption;
  if (text?.trim()) return text.trim();
  if (message.filename) return message.filename;
  if (message.media_type) return "Anexo";
  return "Mensagem agendada";
}

export function ScheduledMessagesStrip({
  messages,
  onCancel,
  onUpdate,
}: {
  messages: ScheduledMessageRecord[];
  onCancel: (messageId: string) => Promise<void>;
  onUpdate: (input: { id: string; text: string; scheduledAt: string }) => Promise<void>;
  className?: string | undefined;
}) {
  const visibleMessages = messages.filter((message) => message.status === "scheduled" || message.status === "processing" || message.status === "failed");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const editingMessage = visibleMessages.find((message) => message.id === editingMessageId) ?? null;

  if (visibleMessages.length === 0) return null;

  return (
    <div className="w-full sticky bottom-1 flex justify-end pr-4">
      <div className=" max-w-[440px] pointer-events-auto overflow-hidden rounded-lg border border-teal-400/80 bg-card/60 shadow-lg backdrop-blur-md">
        <button
          type="button"
          className="flex w-full items-center gap-2 border-b border-teal-400/30 px-3 py-2 text-left text-xs font-semibold uppercase text-foreground transition hover:bg-teal-500/5"
          onClick={() => setIsCollapsed((current) => !current)}
          aria-expanded={!isCollapsed}
        >
          <CalendarClock className="h-4 w-4 text-teal-500" />
          <span>Agendadas</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-500 px-1.5 text-[11px] font-bold text-white">{visibleMessages.length}</span>
          {isCollapsed ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
        </button>
        {!isCollapsed && (
          <div className="max-h-60 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-background/20">
            {visibleMessages.slice(0, 5).map((message) => {
              const [date, time] = formatScheduledDate(message.scheduled_at).split(",");
              const scheduledLabel = `${date.trim()} às ${time?.trim()}`;
              return (
                <div key={message.id} className="flex items-start justify-end gap-2 group/item w-full min-h-0">
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0 mt-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="h-7 w-7 rounded-full text-muted-foreground hover:text-teal-500 hover:bg-teal-500/10"
                      onClick={() => setEditingMessageId(message.id)}
                      aria-label="Editar agendamento"
                    >
                      <SquarePen className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" className="h-7 w-7 rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-500/10" onClick={() => onCancel(message.id)} aria-label="Cancelar agendamento">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="group relative max-w-[85%] rounded-lg px-3 py-1.5 shadow-sm transition-all text-left pr-3.5 border-dashed border-teal-500/40 border rounded-tr-none bg-(--chat-scheduled) after:absolute after:-right-2.5 after:top-0 after:h-0 after:w-0 after:border-t-10 after:border-r-10 after:border-(--chat-scheduled) after:border-r-transparent after:content-['']">
                    <div>
                      <p className="whitespace-pre-wrap break-words text-sm text-(--chat-foreground)">{getScheduledPreview(message)}</p>
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-(--chat-muted-foreground) opacity-80 select-none">
                      <span>Agendado para: {scheduledLabel}</span>
                      <Clock className="h-3 w-3 text-(--chat-muted-foreground) shrink-0" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <EditingScheduledDialog message={editingMessage} onClose={() => setEditingMessageId(null)} onUpdate={onUpdate} />
    </div>
  );
}
