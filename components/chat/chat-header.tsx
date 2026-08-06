"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getAvatarInitials } from "@/lib/avatar-initials";
import type { ChatRecord } from "@/lib/supabase-rest";
import { Bot, Check, CheckCircle2, ChevronLeft, Copy, Forward, Info, Play, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
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
  onOpenContactPhoto?: () => void;
  isMobile?: boolean;
  onCloseChat?: () => void;
  onOpenIATraining: () => void;
  onOpenManualRoutines: () => void;
  isAssistantChat?: boolean;
};

export function ChatHeader({
  chat,
  isSelectionMode,
  selectedMessagesCount,
  canDeleteSelectedMessages,
  onClearSelection,
  onForwardSelected,
  onDeleteSelected,
  onToggleDetails,
  onToggleStatus,
  onOpenContactPhoto,
  isMobile,
  onCloseChat,
  onOpenIATraining,
  onOpenManualRoutines,
  isAssistantChat = false,
}: ChatHeaderProps) {
  const hasContactPhoto = !!chat.url_foto_perfil;
  const { user } = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const [isNameCopied, setIsNameCopied] = useState(false);
  const displayName = getDisplayName(chat);

  async function handleCopyName() {
    try {
      await navigator.clipboard.writeText(displayName);
      setIsNameCopied(true);
      setTimeout(() => setIsNameCopied(false), 2000);
    } catch (error) {
      console.error("Falha ao copiar o nome do contato:", error);
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-4 min-h-15.25">
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
          <div className="flex items-center gap-3">
            {isMobile && onCloseChat && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onCloseChat}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <button
              type="button"
              className="cursor-pointer rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={hasContactPhoto ? "Ampliar foto do contato" : "Abrir detalhes do contato"}
              onClick={(event) => {
                event.stopPropagation();
                if (isAssistantChat) return;
                if (hasContactPhoto) {
                  onOpenContactPhoto?.();
                  return;
                }

                onToggleDetails();
              }}
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={chat.url_foto_perfil ?? undefined} alt={displayName} />
                <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-semibold text-white">{getAvatarInitials(displayName, "C")}</AvatarFallback>
              </Avatar>
            </button>
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 items-center gap-1">
                <span className="select-text truncate font-medium leading-none text-foreground">{displayName}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => void handleCopyName()}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Copiar nome do contato"
                      >
                        {isNameCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{isNameCopied ? "Nome copiado" : "Copiar nome"}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className="mt-1 text-[10px] text-muted-foreground">{isAssistantChat ? "Chat interno" : chat.finalizada ? "Finalizada" : chat.ia_responde ? "IA responde" : "Atendimento aberto"}</span>
            </div>
          </div>

          {!isAssistantChat && (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <Button type="button" variant="outline" className="h-9 w-9 border-2 px-0 text-xs text-foreground shadow-sm transition-all md:w-auto md:px-4" onClick={onOpenManualRoutines} aria-label="Executar automacao manual">
                    <span className="hidden md:inline">Rotinas</span>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" className="w-9 h-9 md:w-fit md:px-4 md:py-2 border-2 shadow-sm transition-all text-xs text-foreground cursor-pointer gap-1.5" onClick={onOpenIATraining}>
                    <span className="hidden md:inline">Treinar IA</span>
                    <Bot className="h-4 w-4" />
                  </Button>
                </>
              )}

              <Button onClick={onToggleStatus} className="cursor-pointer bg-theme-primary font-medium text-white hover:bg-theme-primary/80 h-9 w-9 px-0 md:h-9 md:w-auto md:px-4">
                <div className="md:hidden">{chat.finalizada ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div>

                <span className="hidden md:inline">{chat.finalizada ? "Reabrir" : "Finalizar"}</span>
              </Button>
              <Button onClick={onToggleDetails} variant="ghost" size="icon" className="cursor-pointer text-muted-foreground hover:text-foreground">
                <Info className="h-5 w-5" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
