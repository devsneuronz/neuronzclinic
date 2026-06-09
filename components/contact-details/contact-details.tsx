"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getChatStatusColor, type ChatStatusOption } from "@/lib/chat-status";
import type { ChatTag } from "@/lib/chat-tags";
import { ChatRecord } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
import { Bot, Check, CheckCheck, ChevronDown, ChevronLeft, Copy, MessageSquareDashed, Pencil, Phone, X } from "lucide-react";
import { useState } from "react";
import { ExpandedImageModal } from "../chat/expanded-image-modal";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { IATrainingView } from "./ia-training-view";
import { ProfileView, type ContactInfoValues } from "./profile-view";

interface ContactDetailsProps {
  chat?: ChatRecord;
  onClose?: () => void;
  onToggleStatus: () => void;
  onToggleIA: () => void;
  statusOptions?: ChatStatusOption[];
  tagOptions?: ChatTag[];
  interestOptions?: ChatTag[];
  onChangeStatus?: (status: ChatStatusOption) => void;
  onToggleTag?: (tag: ChatTag) => void;
  onToggleInterest?: (tag: ChatTag) => void;
  onChangeName?: (name: string) => Promise<void> | void;
  onChangeContactInfo?: (info: ContactInfoValues) => Promise<void> | void;
  onMarkAsRead?: () => void;
  onMarkAsUnread?: () => void;
  onReorderTags?: (tags: ChatTag[]) => void;
  onCommitTagOrder?: (tags: ChatTag[]) => void;
  isMobile?: boolean;
}

function getDisplayName(chat?: ChatRecord) {
  return chat?.nome_contato || chat?.pushname || chat?.chat_id?.replace("@s.whatsapp.net", "") || "Contato sem nome";
}

function getContactPhone(chat?: ChatRecord) {
  const candidates = [chat?.phone_contact, chat?.chat_id, chat?.lid_id];
  const phone = candidates.map((value) => value?.replace(/@.+$/, "").replace(/\D/g, "")).find((value) => value && value.length >= 8);

  return phone || chat?.phone_contact?.trim() || chat?.chat_id?.replace(/@.+$/, "") || "Sem telefone";
}

export function ContactDetails({
  chat,
  onClose,
  onToggleStatus,
  onToggleIA,
  statusOptions,
  tagOptions,
  interestOptions,
  onChangeStatus,
  onToggleTag,
  onToggleInterest,
  onMarkAsRead,
  onMarkAsUnread,
  onReorderTags,
  onCommitTagOrder,
  onChangeName,
  onChangeContactInfo,
  isMobile,
}: ContactDetailsProps) {
  const [view, setView] = useState<"profile" | "training">("profile");
  const contactPhone = getContactPhone(chat);
  const activeView = chat?.ia_responde === false ? "profile" : view;

  const [isSavingName, setIsSavingName] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [expandedContactPhoto, setExpandedContactPhoto] = useState<{ url: string; alt: string } | null>(null);
  const hasContactPhoto = !!chat?.url_foto_perfil;

  const [copied, setCopied] = useState(false);

  async function handleEditNameToggle() {
    if (!isEditingName) {
      setEditNameValue(getDisplayName(chat));
      setIsEditingName(true);
      return;
    }

    const nextName = editNameValue.trim();
    const currentName = chat?.nome_contato?.trim() || "";

    if (nextName === currentName) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);

    try {
      await onChangeName?.(nextName);
      setIsEditingName(false);
    } finally {
      setIsSavingName(false);
    }
  }

  const handleCopyPhone = async () => {
    if (!contactPhone) return;

    try {
      await navigator.clipboard.writeText(contactPhone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reseta o ícone após 2 segundos
    } catch (err) {
      console.error("Falha ao copiar o telefone: ", err);
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card">
      <div className="flex items-center gap-4 border-b border-border px-4 py-3 h-15.25">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onClose}>
          {isMobile ? <ChevronLeft className="h-5 w-5" /> : <X className="h-4 w-4" />}
        </Button>
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium transition-colors text-foreground">Detalhes do contato</label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="w-full h-18 rounded-b-3xl bg-radial-[80%_480%_at_17%_100%] from-transparent to-background/60" style={{ backgroundColor: getChatStatusColor(chat) }}></div>
        <div className="flex flex-col p-4">
          <div className="flex flex-row justify-between w-full -mt-12">
            {/* Avatar e Status */}
            <div className="flex flex-row gap-3 items-center ">
              {/* AVatar */}
              <button
                type="button"
                className={cn("rounded-full bg-neutral-800", hasContactPhoto && "cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}
                aria-label={hasContactPhoto ? `Ampliar foto de ${getDisplayName(chat)}` : "Foto do contato"}
                disabled={!hasContactPhoto}
                onClick={() => {
                  if (!chat?.url_foto_perfil) return;
                  setExpandedContactPhoto({ url: chat.url_foto_perfil, alt: `Foto de ${getDisplayName(chat)}` });
                }}
              >
                <Avatar className={cn("h-16 w-16 shrink-0 shadow-sm", chat?.finalizada ? "opacity-30" : "ring-2 ring-blue-500")}>
                  <AvatarImage src={chat?.url_foto_perfil ?? undefined} alt={chat?.nome_contato || ""} className="rounded-full" />
                  <AvatarFallback className="bg-(--chat-muted) text-(--chat-muted-foreground)">{chat?.nome_contato?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
              </button>
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
            <div className="flex items-center gap-1.5 shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      type="button"
                      onClick={onMarkAsRead}
                      aria-label="Marcar conversa como lida"
                      className=" border border-border/50  p-3 text-xs font-medium text-muted-foreground transition-all hover:bg-background hover:text-foreground active:scale-[0.97]"
                    >
                      <CheckCheck className="h-4 w-4 text-blue-500" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center">
                    <p className="text-xs font-medium">Marcar como lido</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      type="button"
                      onClick={onMarkAsUnread}
                      aria-label="Marcar conversa como não lida"
                      className=" border border-border/50  p-3 text-xs font-medium text-muted-foreground transition-all hover:bg-background hover:text-foreground active:scale-[0.97]"
                    >
                      <MessageSquareDashed className="h-4 w-4 text-muted-foreground/60" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="end">
                    <p className="text-xs font-medium">Marcar como não lido</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          {/* (Nome, telefone) e IA */}
          <div className="flex flex-row justify-between gap-4w-full min-w-0">
            {/* Nome e telefone */}
            <div className="flex flex-col justify-between gap-4 flex-1 min-w-0">
              {/* Nome */}

              <div className="group flex items-center gap-2">
                {isEditingName ? (
                  <Input
                    value={editNameValue}
                    disabled={isSavingName}
                    autoFocus
                    onChange={(e) => setEditNameValue(e.target.value)}
                    className="font-bold text-lg!"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleEditNameToggle();
                      if (e.key === "Escape" && !isSavingName) setIsEditingName(false);
                    }}
                  />
                ) : (
                  <span onClick={handleEditNameToggle} title={getDisplayName(chat)} className="h-9 text-lg font-bold text-foreground cursor-pointer truncate select-none py-1.25">
                    {getDisplayName(chat)}
                  </span>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0" onClick={() => void handleEditNameToggle()} disabled={isSavingName}>
                  {isEditingName ? <Check className="h-4 w-4 text-green-500" /> : <Pencil className="h-4 w-4" />}
                </Button>
              </div>

              {/* Telefone */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-[-12px] select-none">
                <div className="flex items-center gap-2 min-w-0">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs truncate">{contactPhone}</span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="flex h-5 w-5 items-center justify-center rounded bg-muted/40 text-muted-foreground/60 border border-border/20 transition-all hover:bg-muted hover:text-foreground active:scale-95 shrink-0 "
                  aria-label="Copiar número de telefone"
                >
                  {copied ? <Check className="h-3 w-3 text-green-500 animate-in fade-in zoom-in-75 duration-150" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
            {/* IA */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <Button
                variant="outline"
                disabled={!chat?.ia_responde}
                className={cn("border-2 shadow-sm transition-all text-xs text-foreground", activeView !== "profile" && "text-(--chat-primary)", !chat?.ia_responde && "opacity-50")}
                onClick={() => setView((prev) => (prev === "profile" ? "training" : "profile"))}
              >
                Treine sua IA
                <Bot />
              </Button>

              <div className="flex flex-row items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wider">IA neste contato</span>
                <Switch checked={!!chat?.ia_responde} onCheckedChange={onToggleIA} />
              </div>
            </div>
          </div>
        </div>

        <Separator></Separator>

        {/* ================================================= */}

        <div className="flex-1 overflow-y-auto">
          {activeView === "profile" ? (
            <ProfileView
              key={chat?.id || "empty-contact"}
              chat={chat}
              contactPhone={contactPhone}
              statusOptions={statusOptions}
              tagOptions={tagOptions}
              interestOptions={interestOptions}
              onChangeStatus={onChangeStatus}
              onToggleTag={onToggleTag}
              onToggleInterest={onToggleInterest}
              onChangeName={onChangeName}
              onChangeContactInfo={onChangeContactInfo}
              onReorderTags={onReorderTags}
              onCommitTagOrder={onCommitTagOrder}
            />
          ) : (
            <IATrainingView chat={chat} contactPhone={contactPhone} />
          )}
        </div>
      </div>
      {expandedContactPhoto && <ExpandedImageModal image={expandedContactPhoto} onClose={() => setExpandedContactPhoto(null)} />}
    </div>
  );
}
