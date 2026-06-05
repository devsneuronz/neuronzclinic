"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ScheduledMessageRecord } from "@/lib/supabase-rest";
import { AlertCircle, Clock, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

interface EditingScheduledDialogProps {
  message: ScheduledMessageRecord | null;
  onClose: () => void;
  onUpdate: (input: { id: string; text: string; scheduledAt: string }) => Promise<void>;
}

export function EditingScheduledDialog({ message, onClose, onUpdate }: EditingScheduledDialogProps) {
  const [editText, setEditText] = useState("");
  const [editDateTime, setEditDateTime] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (message) {
      setEditText(message.text || message.content || message.caption || "");
      setEditDateTime(toLocalDateTimeValue(message.scheduled_at));
      setEditError(null);
    }
  }, [message]);

  if (!message) return null;

  async function handleSaveEdit() {
    const text = editText.trim();
    const date = new Date(editDateTime);

    if (!text) {
      setEditError("Informe o texto da mensagem.");
      return;
    }

    if (Number.isNaN(date.getTime())) {
      setEditError("Escolha uma data válida.");
      return;
    }

    if (date.getTime() < Date.now() + 30000) {
      setEditError("Escolha um horário futuro.");
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      await onUpdate({ id: message!.id, text, scheduledAt: date.toISOString() });
      onClose();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Não foi possível editar.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={!!message} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] overflow-hidden border-border bg-card p-6 shadow-2xl backdrop-blur-md">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <SquarePen className="h-4 w-4 text-teal-500" />
            Editar Mensagem Agendada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Conteúdo da Mensagem</label>
            <Textarea
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              className="min-h-24 w-full resize-none rounded-lg border border-border bg-input/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 transition-all focus-visible:border-teal-500/50 focus-visible:ring-1 focus-visible:ring-teal-500/30 focus-visible:ring-offset-0 outline-none overflow-hidden"
              placeholder="Digite o texto que será enviado automaticamente..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Data e Hora
            </label>
            <div className="relative">
              <Input
                type="datetime-local"
                value={editDateTime}
                onChange={(event) => setEditDateTime(event.target.value)}
                className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-sm text-foreground transition-all focus-visible:border-teal-500/50 focus-visible:ring-1 focus-visible:ring-teal-500/30 focus-visible:ring-offset-0 outline-none scheme-dark:dark"
              />
            </div>
          </div>

          {editError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{editError}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5 transition-colors" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSaving}
            onClick={handleSaveEdit}
            className="bg-teal-500 text-white hover:bg-teal-600 active:scale-[0.98] transition-all rounded-lg shadow-sm shadow-teal-500/10 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
