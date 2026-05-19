"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { X, ChevronDown, Phone, CheckCheck, MessageSquareDashed, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChatRecord } from "@/lib/supabase-rest";
import type { ChatTag } from "@/lib/chat-tags";
import type { ChatStatusOption } from "@/lib/chat-status";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { IATrainingView } from "./ia-training-view";
import { ProfileView } from "./profile-view";

interface ContactDetailsProps {
  chat?: ChatRecord;
  onClose?: () => void;
  onToggleStatus: () => void;
  onToggleIA: () => void;
  statusOptions?: ChatStatusOption[];
  tagOptions?: ChatTag[];
  onChangeStatus?: (status: ChatStatusOption) => void;
  onToggleTag?: (tag: ChatTag) => void;
  onChangeName?: (name: string) => Promise<void> | void;
  onMarkAsRead?: () => void;
  onMarkAsUnread?: () => void;
  onReorderTags?: (tags: ChatTag[]) => void;
  onCommitTagOrder?: (tags: ChatTag[]) => void;
}

function getContactPhone(chat?: ChatRecord) {
  const candidates = [chat?.phone_contact, chat?.chat_id, chat?.lid_id];
  const phone = candidates
    .map((value) => value?.replace(/@.+$/, "").replace(/\D/g, ""))
    .find((value) => value && value.length >= 8);

  return phone || chat?.phone_contact?.trim() || chat?.chat_id?.replace(/@.+$/, "") || "Sem telefone";
}

export function ContactDetails({
  chat,
  onClose,
  onToggleStatus,
  onToggleIA,
  statusOptions,
  tagOptions,
  onChangeStatus,
  onToggleTag,
  onChangeName,
  onMarkAsRead,
  onMarkAsUnread,
  onReorderTags,
  onCommitTagOrder,
}: ContactDetailsProps) {
  const [view, setView] = useState<"profile" | "training">("profile");
  const contactPhone = getContactPhone(chat);
  const hasUnreadMessages = !!chat?.unread_count;
  const activeView = chat?.ia_responde === false ? "profile" : view;

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium transition-colors text-foreground">Detalhes do contato</label>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex items-start gap-4 p-4">
          <Avatar className="h-16 w-16 shrink-0 shadow-sm">
            <AvatarImage src={chat?.url_foto_perfil ?? undefined} alt={chat?.nome_contato || ""} className="rounded-full" />
            <AvatarFallback className="bg-(--chat-muted) text-(--chat-muted-foreground)">{chat?.nome_contato?.charAt(0) || "U"}</AvatarFallback>
          </Avatar>

          <div className="flex flex-1 flex-col gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
                  style={{ backgroundColor: chat?.finalizada ? "#00c950" : "#2b7fff" }}
                >
                  {chat?.finalizada ? "Finalizada" : "Aberta"}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" className="w-48 shadow-xl z-[100]">
                <DropdownMenuItem className="cursor-pointer" onClick={() => onToggleStatus()}>
                  {chat?.finalizada ? "Reabrir Conversa" : "Finalizar Conversa"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="space-y-1.5">
              <button
                type="button"
                className={cn("flex items-center gap-2 text-xs transition-colors hover:text-foreground", hasUnreadMessages ? "text-muted-foreground" : "text-blue-500")}
                onClick={onMarkAsRead}
              >
                <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
                <span>Marcar como lido</span>
              </button>
              <button
                type="button"
                className={cn("flex items-center gap-2 text-xs transition-colors hover:text-foreground", hasUnreadMessages ? "text-blue-500" : "text-muted-foreground")}
                onClick={onMarkAsUnread}
              >
                <MessageSquareDashed className="h-3.5 w-3.5" />
                <span>Marcar como não lido</span>
              </button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>{contactPhone}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={!chat?.ia_responde}
                    className={cn(
                      "h-10 w-10 border-2 shadow-sm transition-all",
                      activeView === "profile" ? "bg-(--chat-primary) text-white border-(--chat-primary)" : "border-(--chat-primary) text-(--chat-primary) hover:bg-(--chat-primary)/10",
                      !chat?.ia_responde && "opacity-50",
                    )}
                    onClick={() => setView((prev) => (prev === "profile" ? "training" : "profile"))}
                  >
                    <Bot className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>{chat?.ia_responde ? "Treinar sua IA" : "Ative a IA para treinar"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="flex flex-col items-center gap-1">
              <Switch
                checked={!!chat?.ia_responde}
                onCheckedChange={onToggleIA}
                className="data-[state=checked]:bg-[#22c55e]"
              />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">IA</span>
            </div>
          </div>
        </div>

        {/* ================================================= */}

        <div className="flex-1 overflow-y-auto">
          {activeView === "profile" ? (
            <ProfileView
              chat={chat}
              contactPhone={contactPhone}
              statusOptions={statusOptions}
              tagOptions={tagOptions}
              onChangeStatus={onChangeStatus}
              onToggleTag={onToggleTag}
              onChangeName={onChangeName}
              onReorderTags={onReorderTags}
              onCommitTagOrder={onCommitTagOrder}
            />
          ) : (
            <IATrainingView/>
          )}
        </div>
      </div>
    </div>
  );
}
