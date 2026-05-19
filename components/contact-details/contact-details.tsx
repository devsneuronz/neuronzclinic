"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { X, ChevronDown, Phone, CheckCheck, MessageSquareDashed, Bot, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChatRecord } from "@/lib/supabase-rest";
import type { ChatTag } from "@/lib/chat-tags";
import { getChatStatusColor, type ChatStatusOption } from "@/lib/chat-status";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { IATrainingView } from "./ia-training-view";
import { ProfileView } from "./profile-view";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";

interface ContactDetailsProps {
  chat?: ChatRecord;
  onClose?: () => void;
  onToggleStatus: () => void;
  onToggleIA: () => void;
  statusOptions?: ChatStatusOption[];
  tagOptions?: ChatTag[];
  onChangeStatus?: (status: ChatStatusOption) => void;
  onToggleTag?: (tag: ChatTag) => void;
  onMarkAsRead?: () => void;
  onMarkAsUnread?: () => void;
  onReorderTags?: (tags: ChatTag[]) => void;
  onCommitTagOrder?: (tags: ChatTag[]) => void;
}

function getDisplayName(chat?: ChatRecord) {
  return chat?.nome_contato || chat?.pushname || chat?.chat_id?.replace("@s.whatsapp.net", "") || "Contato sem nome";
}

function getContactPhone(chat?: ChatRecord) {
  const candidates = [chat?.phone_contact, chat?.chat_id, chat?.lid_id];
  const phone = candidates.map((value) => value?.replace(/@.+$/, "").replace(/\D/g, "")).find((value) => value && value.length >= 8);

  return phone || chat?.phone_contact?.trim() || chat?.chat_id?.replace(/@.+$/, "") || "Sem telefone";
}

export function ContactDetails({ chat, onClose, onToggleStatus, onToggleIA, statusOptions, tagOptions, onChangeStatus, onToggleTag, onMarkAsRead, onMarkAsUnread, onReorderTags, onCommitTagOrder }: ContactDetailsProps) {
  const [view, setView] = useState<"profile" | "training">("profile");
  const contactPhone = getContactPhone(chat);
  const hasUnreadMessages = !!chat?.unread_count;
  const activeView = chat?.ia_responde === false ? "profile" : view;

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  function handleEditNameToggle() {
    if (isEditingName) {
      setIsEditingName(false);
    } else {
      setEditNameValue(getDisplayName(chat));
      setIsEditingName(true);
    }

    //adicionar persistencia de dados
  }

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
        <div className="w-full h-18 rounded-b-3xl bg-radial-[80%_480%_at_17%_100%] from-transparent to-white/60 dark:to-black/60" style={{ backgroundColor: getChatStatusColor(chat) }}></div>
        <div className="flex flex-col p-4">
          <div className="flex flex-col w-full -mt-12">
            {/* Avatar e Status */}
            <div className="flex flex-row gap-3 items-center ">
              {/* AVatar */}
              <div className="bg-neutral-800 rounded-full">
                <Avatar className={cn("h-16 w-16 shrink-0 shadow-sm", chat?.finalizada ? "opacity-30" : "ring-2 ring-blue-500")}>
                  <AvatarImage src={chat?.url_foto_perfil ?? undefined} alt={chat?.nome_contato || ""} className="rounded-full" />
                  <AvatarFallback className="bg-(--chat-muted) text-(--chat-muted-foreground)">{chat?.nome_contato?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
              </div>
              {/* Status */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-fit items-center justify-between rounded-full px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
                    style={{ backgroundColor: chat?.finalizada ? "#6b7280" : "#2b7fff" }}
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
            </div>
          </div>
          {/* (Nome, telefone) e IA */}
          <div className="flex flex-row justify-between gap-4 pb-4 w-full min-w-0">
            {/* Nome e telefone */}
            <div className="flex flex-col justify-between gap-4 flex-1 min-w-0">
              {/* Nome */}
              <div className="group flex items-center gap-2">
                {!isEditingName ? (
                  <span onClick={handleEditNameToggle} title={getDisplayName(chat)} className="h-9 text-lg font-bold text-foreground cursor-pointer truncate select-none py-1.25">
                    {getDisplayName(chat)}
                  </span>
                ) : (
                  <Input
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    autoFocus
                    className="font-bold text-lg!"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditNameToggle();
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("h-7 w-7 shrink-0", "opacity-0 group-hover:opacity-100 focus:opacity-100", isEditingName && "opacity-100 text-green-500 hover:text-green-600 hover:bg-green-500/10")}
                  onClick={handleEditNameToggle}
                >
                  {isEditingName ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </Button>
              </div>

              {/* Telefone */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-[-12px]">
                <Phone className="h-3.5 w-3.5" />
                <span className="text-xs"> {contactPhone}</span>
              </div>
            </div>
            {/* IA */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <Button
                variant="outline"
                disabled={!chat?.ia_responde}
                className={cn(
                  "border-2 shadow-sm transition-all text-xs",
                  activeView === "profile" ? "bg-(--chat-primary) text-white border-(--chat-primary)" : "border-(--chat-primary) text-(--chat-primary) hover:bg-(--chat-primary)/10",
                  !chat?.ia_responde && "opacity-50",
                )}
                onClick={() => setView((prev) => (prev === "profile" ? "training" : "profile"))}
              >
                Treine sua IA
                <Bot />
              </Button>

              <div className="flex flex-row items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wider">IA neste contato</span>
                <Switch checked={!!chat?.ia_responde} onCheckedChange={onToggleIA} className="data-[state=checked]:bg-[#22c55e]" />
              </div>
            </div>
          </div>
          {/* Funcoes */}
          <div className="grid grid-cols-2 gap-2.5 w-full">
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 p-3 text-xs font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground active:scale-[0.97]"
              onClick={onMarkAsRead}
            >
              <CheckCheck className="h-4 w-4 text-blue-500" />
              <span>Marcar como lido</span>
            </button>

            <button
              type="button"
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 p-3 text-xs font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground active:scale-[0.97]"
              onClick={onMarkAsUnread}
            >
              <MessageSquareDashed className="h-4 w-4 text-muted-foreground/40" />
              <span>Marcar como não lido</span>
            </button>
          </div>
        </div>

        <Separator></Separator>

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
              onReorderTags={onReorderTags}
              onCommitTagOrder={onCommitTagOrder}
            />
          ) : (
            <IATrainingView />
          )}
        </div>
      </div>
    </div>
  );
}
