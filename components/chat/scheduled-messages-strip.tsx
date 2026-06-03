"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ScheduledMessageRecord } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
import { CalendarClock, ChevronDown, ChevronUp, Clock, PenLine, Trash2 } from "lucide-react";
import { useState } from "react";

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

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
  const [editingMessage, setEditingMessage] = useState<ScheduledMessageRecord | null>(null);
  const [editText, setEditText] = useState("");
  const [editDateTime, setEditDateTime] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (visibleMessages.length === 0) return null;

  function beginEdit(message: ScheduledMessageRecord) {
    setEditingMessage(message);
    setEditText(message.text || message.content || message.caption || "");
    setEditDateTime(toLocalDateTimeValue(message.scheduled_at));
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editingMessage) return;

    const text = editText.trim();
    const date = new Date(editDateTime);

    if (!text) {
      setEditError("Informe o texto da mensagem.");
      return;
    }

    if (Number.isNaN(date.getTime())) {
      setEditError("Escolha uma data valida.");
      return;
    }

    if (date.getTime() < Date.now() + 30000) {
      setEditError("Escolha um horario futuro.");
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      await onUpdate({ id: editingMessage.id, text, scheduledAt: date.toISOString() });
      setEditingMessage(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Nao foi possivel editar.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="sticky bottom-1 max-w-[440px] ml-auto translate-x-4.5 z-20">
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-teal-400/80 bg-card/60 shadow-lg backdrop-blur-md">
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
                    <Button type="button" size="icon-sm" variant="ghost" className="h-7 w-7 rounded-full text-muted-foreground hover:text-teal-500 hover:bg-teal-500/10" onClick={() => beginEdit(message)} aria-label="Editar agendamento">
                      <PenLine className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" className="h-7 w-7 rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-500/10" onClick={() => onCancel(message.id)} aria-label="Cancelar agendamento">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div
                    className={cn(
                      "group relative max-w-[85%] rounded-lg px-3 py-1.5 shadow-sm transition-all text-left pr-3.5 border-dashed border-teal-500/40 border",
                      "rounded-tr-none bg-(--chat-me)",
                      "after:absolute after:right-[-8px] after:top-0 after:h-0 after:w-0",
                      "after:border-t-[10px] after:border-r-[10px]",
                      "after:border-t-(--chat-me) after:border-r-transparent after:content-['']",
                    )}
                  >
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

      <Dialog open={!!editingMessage} onOpenChange={(open) => !open && setEditingMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar mensagem agendada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3  overflow-hidden">
            <Textarea value={editText} onChange={(event) => setEditText(event.target.value)} className="min-h-28 resize-y ring-0!" placeholder="Mensagem" />
            <Input type="datetime-local" value={editDateTime} onChange={(event) => setEditDateTime(event.target.value)} className="ring-0!" />
            {editError && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{editError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingMessage(null)}>
              Cancelar
            </Button>
            <Button type="button" className="bg-teal-500 text-white hover:bg-teal-600" onClick={handleSaveEdit} disabled={isSaving}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
