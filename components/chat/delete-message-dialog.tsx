"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest";
import { getDisplayName, getMessagePreviewText } from "./message-utils";

type DeleteMessageDialogProps = {
  chat: ChatRecord;
  messages: MessageRecord[];
  messageActionError: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteMessageDialog({ chat, messages, messageActionError, onClose, onConfirm }: DeleteMessageDialogProps) {
  if (messages.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Apagar {messages.length === 1 ? "mensagem?" : `${messages.length} mensagens?`}</p>
            <p className="text-xs text-muted-foreground">A acao sera enviada ao webhook de apagar. O banco nao sera alterado diretamente.</p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border-l-4 border-red-500 bg-secondary px-3 py-2">
            {messages.map((message) => (
              <div key={message.id} className="min-w-0">
                <p className="text-xs font-semibold text-red-500">{message.from_me ? "Voce" : getDisplayName(chat)}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{getMessagePreviewText(message)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">Depois da confirmacao, as mensagens ficam marcadas visualmente como apagadas e o webhook recebe os dados originais para processar o apagamento.</p>
          {messageActionError && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{messageActionError}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            <Trash2 className="h-4 w-4" />
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
