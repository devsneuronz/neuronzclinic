"use client";

import { Check, Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { cn } from "@/lib/utils";
import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest";
import { getDisplayName, getMessagePreviewText } from "./message-utils";

type ForwardMessageDialogProps = {
  chat: ChatRecord;
  messages: MessageRecord[];
  selectedForwardTarget: string;
  selectedForwardTargetRecord?: ChatRecord;
  forwardSearch: string;
  forwardTargetResults: ChatRecord[];
  isLoadingForwardTargets: boolean;
  isLoadingMoreForwardTargets: boolean;
  hasMoreForwardTargets: boolean;
  isForwarding: boolean;
  messageActionError: string | null;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onSelectTarget: (chatId: string) => void;
  onLoadMore: () => void;
  onSubmit: () => void;
};

export function ForwardMessageDialog({
  chat,
  messages,
  selectedForwardTarget,
  selectedForwardTargetRecord,
  forwardSearch,
  forwardTargetResults,
  isLoadingForwardTargets,
  isLoadingMoreForwardTargets,
  hasMoreForwardTargets,
  isForwarding,
  messageActionError,
  onClose,
  onSearchChange,
  onSelectTarget,
  onLoadMore,
  onSubmit,
}: ForwardMessageDialogProps) {
  if (messages.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Encaminhar {messages.length === 1 ? "mensagem" : `${messages.length} mensagens`}</p>
            <p className="truncate text-xs text-muted-foreground">{selectedForwardTargetRecord ? `Para ${getDisplayName(selectedForwardTargetRecord)}` : "Escolha um contato"}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fechar encaminhamento">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={forwardSearch} onChange={(event) => onSearchChange(event.target.value)} placeholder="Pesquisar todos os chats" className="border-border bg-secondary pl-9" />
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {isLoadingForwardTargets ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Buscando chats...</p>
            ) : forwardTargetResults.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum chat encontrado.</p>
            ) : (
              forwardTargetResults.map((target) => {
                const isSelectedTarget = selectedForwardTarget === target.chat_id;

                return (
                  <button
                    key={target.id}
                    type="button"
                    className={cn("flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-secondary", isSelectedTarget && "bg-teal-500/10")}
                    onClick={() => onSelectTarget(target.chat_id)}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={target.url_foto_perfil ?? undefined} alt={getDisplayName(target)} />
                      <AvatarFallback className="bg-teal-500 text-xs font-semibold text-white">{getAvatarInitials(getDisplayName(target), "C")}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{getDisplayName(target)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{target.phone_contact || target.chat_id}</span>
                    </span>
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", isSelectedTarget ? "border-teal-500 bg-teal-500 text-white" : "border-muted-foreground/30 text-transparent")}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {hasMoreForwardTargets && (
            <Button type="button" variant="ghost" className="w-full" onClick={onLoadMore} disabled={isLoadingMoreForwardTargets}>
              {isLoadingMoreForwardTargets ? "Carregando..." : "Carregar mais chats"}
            </Button>
          )}

          <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border-l-4 border-teal-500 bg-secondary px-3 py-2">
            {messages.map((message) => (
              <div key={message.id} className="min-w-0">
                <p className="text-xs font-semibold text-teal-600 dark:text-teal-300">{message.from_me ? "Você" : getDisplayName(chat)}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{getMessagePreviewText(message)}</p>
              </div>
            ))}
          </div>

          {messageActionError && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{messageActionError}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" className="bg-teal-500 text-white hover:bg-teal-600" onClick={onSubmit} disabled={!selectedForwardTarget || isForwarding}>
            {isForwarding ? (
              "Encaminhando..."
            ) : (
              <>
                <Check className="h-4 w-4" />
                Encaminhar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
