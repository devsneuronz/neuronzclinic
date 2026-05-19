"use client";

import { ChevronLeft, Forward, Info, Trash2, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getAvatarInitials } from "@/lib/avatar-initials";
import type { ChatRecord } from "@/lib/supabase-rest";
import { getDisplayName } from "./message-utils";

type ChatHeaderProps = {
  chat: ChatRecord;
  isSelectionMode: boolean;
  selectedMessagesCount: number;
  canDeleteSelectedMessages: boolean;
  onClearSelection: () => void;
  onForwardSelected: () => void;
  onDeleteSelected: () => void;
  onToggleDetails: () => void;
  onToggleStatus: () => void;
  isMobile?: boolean;
  onCloseChat?: () => void;
};

export function ChatHeader({ chat, isSelectionMode, selectedMessagesCount, canDeleteSelectedMessages, onClearSelection, onForwardSelected, onDeleteSelected, onToggleDetails, onToggleStatus, isMobile, onCloseChat }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-4 h-15.25">
      {isSelectionMode ? (
        <>
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="ghost" size="icon" onClick={onClearSelection} aria-label="Cancelar selecao">
              <X className="h-5 w-5" />
            </Button>
            <span className="truncate text-sm font-semibold text-foreground">
              {selectedMessagesCount} {selectedMessagesCount === 1 ? "mensagem selecionada" : "mensagens selecionadas"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={onForwardSelected} aria-label="Encaminhar selecionadas">
              <Forward className="h-5 w-5" />
            </Button>
            {canDeleteSelectedMessages && (
              <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500" onClick={onDeleteSelected} aria-label="Apagar selecionadas">
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div onClick={onToggleDetails} className="flex cursor-pointer items-center gap-3">
            {isMobile && onCloseChat && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onCloseChat}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <button className="cursor-pointer rounded-full transition-opacity hover:opacity-90" aria-label="Abrir detalhes do contato">
              <Avatar className="h-10 w-10">
                <AvatarImage src={chat.url_foto_perfil ?? undefined} alt={getDisplayName(chat)} />
                <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-semibold text-white">{getAvatarInitials(getDisplayName(chat), "C")}</AvatarFallback>
              </Avatar>
            </button>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium leading-none text-foreground">{getDisplayName(chat)}</span>
              <span className="mt-1 text-[10px] text-muted-foreground">{chat.finalizada ? "Finalizada" : chat.ia_responde ? "IA responde" : "Atendimento aberto"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={onToggleStatus} className="cursor-pointer bg-teal-500 font-medium text-white hover:bg-teal-600">
              {chat.finalizada ? "Reabrir" : "Finalizar"}
            </Button>
            <Button onClick={onToggleDetails} variant="ghost" size="icon" className="cursor-pointer text-muted-foreground hover:text-foreground">
              <Info className="h-5 w-5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
