"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ScheduledMessageRecord } from "@/lib/supabase-rest";
import { CalendarClock, ChevronDown, ChevronUp, PenLine, Trash2 } from "lucide-react";
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
    <>
      <div className="pointer-events-auto absolute inset-x-3 bottom-20 z-20 overflow-hidden rounded-md border border-teal-400/80 bg-card/95 shadow-lg backdrop-blur">
        <button type="button" className="flex w-full items-center gap-2 border-b border-teal-400/40 px-3 py-2 text-left text-xs font-semibold uppercase text-foreground transition hover:bg-teal-500/5" onClick={() => setIsCollapsed((current) => !current)} aria-expanded={!isCollapsed}>
          <CalendarClock className="h-4 w-4 text-teal-500" />
          <span>Agendadas</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-500 px-1.5 text-[11px] font-bold text-white">{visibleMessages.length}</span>
          {isCollapsed ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
        </button>
        {!isCollapsed && (
          <div className="max-h-32 overflow-y-auto p-2">
            {visibleMessages.slice(0, 5).map((message) => {
              const [date, time] = formatScheduledDate(message.scheduled_at).split(",");

              return (
                <div key={message.id} className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm">
                  <div className="flex w-24 shrink-0 flex-col items-center justify-center rounded-md border border-teal-400 bg-teal-500/10 px-2 py-1 text-center text-xs font-medium text-foreground">
                    <span>{date}</span>
                    <span>{time?.trim()}</span>
                  </div>
                  <p className="min-w-0 flex-1 truncate text-foreground">{getScheduledPreview(message)}</p>
                  <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-teal-500" onClick={() => beginEdit(message)} aria-label="Editar agendamento">
                    <PenLine className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon-sm" variant="destructive" onClick={() => onCancel(message.id)} aria-label="Cancelar agendamento">
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
          <div className="space-y-3">
            <Textarea value={editText} onChange={(event) => setEditText(event.target.value)} className="min-h-28 resize-y" placeholder="Mensagem" />
            <Input type="datetime-local" value={editDateTime} onChange={(event) => setEditDateTime(event.target.value)} />
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
    </>
  );
}
