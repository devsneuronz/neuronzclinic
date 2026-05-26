"use client";

import { Button } from "@/components/ui/button";
import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
import { formatBoldText } from "@/utils/utils";
import { Check, CheckSquare, Download, FileImage, FileText, Forward, Mic, PenLine, Reply, Trash2, Video } from "lucide-react";
import Image from "next/image";
import { memo } from "react";
import { MessageAudioPlayer } from "./message-audio-player";
import { MessageStatusIcon } from "./message-status-icon";
import { getDisplayName, getFileName, getMediaKind, getMediaUrl, getMessagePreviewText, getMessageText, getQuotedMessage, getTimeLabel, isDeletedMessage } from "./message-utils";

export type MessageBubbleProps = {
  message: MessageRecord;
  chat: ChatRecord;
  messagesByRemoteId: Map<string, MessageRecord>;
  selected: boolean;
  isHighlighted?: boolean;
  isSelectionMode: boolean;
  onToggleSelection: (m: MessageRecord) => void;
  onReply: (m: MessageRecord) => void;
  onForward: (m: MessageRecord) => void;
  onDelete: (m: MessageRecord) => void;
  onCreateNote: (m: MessageRecord) => void;
  onExpandImage: (url: string, alt: string) => void;
  onScrollToMessage?: (id: string) => void;
};

export const MessageBubble = memo(
  function MessageBubble({ message, chat, messagesByRemoteId, selected, isSelectionMode, onToggleSelection, onReply, onForward, onDelete, onCreateNote, onExpandImage, isHighlighted, onScrollToMessage }: MessageBubbleProps) {
    const fromMe = !!message.from_me;
    const mediaUrl = getMediaUrl(message);
    const mediaKind = getMediaKind(message);
    const hasCaption = !!message.content?.trim();
    const deleted = isDeletedMessage(message);
    const quotedInfo = getQuotedMessage(message);
    const quotedOriginal = quotedInfo?.messageId ? messagesByRemoteId.get(quotedInfo.messageId) : null;
    const quotedMessage = quotedOriginal
      ? {
          content: getMessagePreviewText(quotedOriginal),
          fromMe: Boolean(quotedOriginal.from_me),
        }
      : quotedInfo;
    const quotedKind = quotedOriginal ? getMediaKind(quotedOriginal) : null;

    return (
      <div id={`message-${message.id}`} className={cn("mb-2 flex items-center gap-2", fromMe ? "justify-end" : "justify-start")}>
        {isSelectionMode && !deleted && (
          <button
            type="button"
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
              selected ? "border-teal-500 bg-teal-500 text-white" : "border-(--chat-muted-foreground)/40 bg-(--chat-card)/80 text-transparent hover:border-teal-500",
            )}
            onClick={() => onToggleSelection(message)}
            aria-label={selected ? "Remover mensagem da selecao" : "Selecionar mensagem"}
          >
            <Check className="h-4 w-4" />
          </button>
        )}
        <div
          id={`message-bubble-${message.id}`}
          className={cn(
            "group relative max-w-[72%] rounded-lg px-3 py-2 shadow-sm transition-all",
            fromMe ? "rounded-tr-none bg-(--chat-me)" : "rounded-tl-none bg-(--chat-other)",
            selected && "ring-2 ring-teal-500/70",
            isHighlighted && "ring-2 ring-teal-500/30 bg-teal-500/20 duration-300",
            !isHighlighted && "duration-1000",
            deleted && "border border-dashed border-red-500/45 bg-(--chat-muted)/80 opacity-80 shadow-none saturate-[0.65]",
            mediaKind === "audio" && " w-[320px] ",
          )}
        >
          {message.participant && !fromMe && <p className="mb-1 text-sm font-medium text-(--chat-primary)">{message.participant}</p>}

          {!deleted && !isSelectionMode && (
            <div className={cn("absolute top-1 flex rounded-full bg-(--chat-card)/90 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100", fromMe ? "right-full mr-2" : "left-full ml-2")}>
              <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground" onClick={() => onReply(message)} aria-label="Responder mensagem">
                <Reply className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground" onClick={() => onForward(message)} aria-label="Encaminhar mensagem">
                <Forward className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground" onClick={() => onToggleSelection(message)} aria-label="Selecionar mensagem">
                <CheckSquare className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-full text-muted-foreground hover:text-amber-600" onClick={() => onCreateNote(message)} aria-label="Criar anotação vinculada">
                <PenLine className="h-4 w-4" />
              </Button>
              {fromMe && (
                <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 rounded-full text-muted-foreground hover:text-red-500" onClick={() => onDelete(message)} aria-label="Apagar mensagem">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {deleted && (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-300">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                <Trash2 className="h-3 w-3" />
              </span>
              <span className="min-w-0">
                <span className="block leading-none">Mensagem apagada</span>
                <span className="mt-0.5 block truncate text-[10px] font-normal text-(--chat-muted-foreground)">Conteudo preservado apenas para historico interno</span>
              </span>
            </div>
          )}

          <div className={cn(deleted && "rounded-md bg-(--chat-background)/20 p-2 opacity-70")}>
            {quotedMessage && (
              <div
                onClick={() => {
                  if (!quotedInfo?.messageId || !onScrollToMessage) return;
                  onScrollToMessage(quotedInfo.messageId);
                }}
                className={cn(
                  "mb-2 overflow-hidden rounded-md border-l-4 px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(17,27,33,0.035)] cursor-pointer hover:opacity-80 transition-opacity",
                  fromMe ? "bg-(--chat-reply-me-bg)" : "bg-(--chat-reply-other-bg)",
                  quotedMessage.fromMe ? "border-l-(--chat-reply-me-border) text-(--chat-reply-me-border)" : "border-l-(--chat-reply-other-border) text-(--chat-reply-other-border)",
                )}
              >
                <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-[12px] font-semibold">{quotedMessage.fromMe ? "Você" : getDisplayName(chat)}</p>
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-(--chat-muted-foreground)">
                  {quotedKind === "image" && <FileImage className="h-3.5 w-3.5 shrink-0 opacity-75" />}
                  {quotedKind === "video" && <Video className="h-3.5 w-3.5 shrink-0 opacity-75" />}
                  {quotedKind === "audio" && <Mic className="h-3.5 w-3.5 shrink-0 opacity-75" />}
                  {quotedKind === "file" && <FileText className="h-3.5 w-3.5 shrink-0 opacity-75" />}
                  <p className="line-clamp-2 min-w-0 text-[12px] leading-snug">{quotedMessage.content}</p>
                </div>
              </div>
            )}

            {mediaUrl ? (
              <div className="flex max-w-full flex-col gap-2">
                {mediaKind === "image" && (
                  <button
                    type="button"
                    onClick={() => onExpandImage(mediaUrl, message.content || "Imagem")}
                    className="relative block aspect-[4/3] w-[min(320px,64vw)] max-w-full overflow-hidden rounded-md bg-(--chat-background)/40"
                    aria-label="Expandir imagem"
                  >
                    <Image src={mediaUrl} alt={message.content || "Imagem"} fill sizes="(max-width: 640px) 64vw, 320px" className="object-contain" loading="lazy" />
                  </button>
                )}

                {mediaKind === "sticker" && (
                  <div className="block w-fit">
                    <Image src={mediaUrl} alt={message.content || "Figurinha"} width={128} height={128} className="h-32 w-32 rounded-md object-contain" loading="lazy" />
                  </div>
                )}

                {mediaKind === "video" && (
                  <div className="aspect-video w-[min(320px,64vw)] max-w-full overflow-hidden rounded-md bg-black">
                    <video src={mediaUrl} className="h-full w-full object-contain" controls preload="metadata" />
                  </div>
                )}

                {mediaKind === "audio" && <MessageAudioPlayer mediaUrl={mediaUrl} />}

                {mediaKind === "file" && (
                  <div className="flex items-center gap-3 rounded-lg bg-(--chat-background)/30 p-3">
                    <FileText className="h-8 w-8 shrink-0 text-(--chat-muted-foreground)" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-(--chat-foreground)">{getFileName(message, mediaUrl)}</p>
                      <p className="truncate text-xs text-(--chat-muted-foreground)">{message.media_mime_type || message.message_type || "Arquivo"}</p>
                    </div>
                  </div>
                )}

                {hasCaption && <p className="whitespace-pre-wrap break-words text-sm text-(--chat-foreground)">{message.content}</p>}

                {mediaKind !== "sticker" && (
                  <div className="flex gap-2">
                    <a href={mediaUrl} download className="flex flex-1 items-center justify-center gap-2 rounded bg-(--chat-card)/80 py-2 text-xs font-medium text-(--chat-muted-foreground) transition-colors hover:bg-(--chat-card)">
                      <Download className="h-3.5 w-3.5" />
                      Baixar Arquivo
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm text-(--chat-foreground)">{formatBoldText(getMessageText(message))}</p>
            )}
          </div>

          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-(--chat-muted-foreground) opacity-70">
            <span>{getTimeLabel(message.timestamp_msg)}</span>
            <MessageStatusIcon fromMe={message.from_me} status={message.status} timestamp={message.timestamp_msg} />
          </div>
        </div>
      </div>
    );
  },
  (prevProps: MessageBubbleProps, nextProps: MessageBubbleProps) => {
    return (
      prevProps.message === nextProps.message &&
      prevProps.selected === nextProps.selected &&
      prevProps.isSelectionMode === nextProps.isSelectionMode &&
      prevProps.chat === nextProps.chat &&
      prevProps.isHighlighted === nextProps.isHighlighted
    );
  },
);
