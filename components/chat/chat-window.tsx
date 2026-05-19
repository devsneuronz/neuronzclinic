"use client";

import Image from "next/image";
import type { FormEvent, MouseEvent, UIEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { ArrowDown, Camera, Check, CheckSquare, Download, FileImage, FileText, Forward, Info, MapPin, Mic, MoreHorizontal, Paperclip, Pause, PenLine, PlayIcon, Reply, Search, Send, Trash2, UserRound, Video, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { extractQuotedMessageInfo } from "@/lib/message-replies";
import { cn } from "@/lib/utils";
import { ChatRecord, MessageRecord, fetchChats } from "@/lib/supabase-rest";
import { MessageStatusIcon } from "./message-status-icon";

type AttachmentPreviewKind = "image" | "video" | "audio" | "document";

const attachmentMenuItemClass = "flex h-[76px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md p-2 text-xs font-medium text-foreground transition-colors focus:bg-muted";
const disabledAttachmentMenuItemClass = "flex h-[76px] cursor-not-allowed flex-col items-center justify-center gap-2 rounded-md p-2 text-xs font-medium text-muted-foreground focus:bg-transparent";
const FORWARD_TARGET_PAGE_SIZE = 50;

interface ChatWindowProps {
  chat?: ChatRecord;
  messages: MessageRecord[];
  isLoading?: boolean;
  isLoadingOlder?: boolean;
  hasMoreMessages?: boolean;
  onLoadOlderMessages?: () => Promise<number>;
  onCloseChat?: () => void;
  onSendMessage?: (input: { text: string; file: File | null }) => Promise<void>;
  onReplyMessage?: (input: { text: string; file: File | null; replyTo: MessageRecord }) => Promise<void>;
  onForwardMessage?: (input: { message: MessageRecord; targetChatId: string }) => Promise<void>;
  onForwardMessages?: (input: { messages: MessageRecord[]; targetChatId: string }) => Promise<void>;
  onDeleteMessage?: (message: MessageRecord) => Promise<void>;
  onDeleteMessages?: (messages: MessageRecord[]) => Promise<void>;
  forwardTargets?: ChatRecord[];
  error?: string;
  onToggleDetails: () => void;
  onToggleStatus: () => void;
  isDetailsOpen: boolean;
}

function getDisplayName(chat?: ChatRecord) {
  return chat?.nome_contato || chat?.pushname || chat?.chat_id?.replace("@s.whatsapp.net", "") || "Selecione um chat";
}

function getDateLabel(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function getTimeLabel(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function getMessageText(message: MessageRecord) {
  if (message.content) return message.content;
  if (message.message_type) return `Midia: ${message.message_type}`;
  return "Mensagem sem conteudo";
}

function getMessagePreviewText(message: MessageRecord) {
  if (message.content?.trim()) return message.content.trim();
  const kind = getMediaKind(message);
  if (kind === "image") return "Foto";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "sticker") return "Figurinha";
  if (kind === "file") return "Arquivo";
  return "Mensagem";
}

function getMessageExtraField(message: MessageRecord, keys: string[]) {
  const record = message as MessageRecord & Record<string, unknown>;
  const value = keys.map((key) => record[key]).find((item) => typeof item === "string" && item.trim());

  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasDeletedMarker(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) return false;

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized.includes("deleted") || normalized.includes("delete") || normalized.includes("revoked") || normalized.includes("revoke") || normalized.includes("apagada");
  }

  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.some((item) => hasDeletedMarker(item, depth + 1));
  }

  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, item]) => {
    const normalizedKey = key.toLowerCase();
    const keyLooksDeleted =
      normalizedKey.includes("deleted") ||
      normalizedKey.includes("delete") ||
      normalizedKey.includes("revoked") ||
      normalizedKey.includes("revoke") ||
      normalizedKey.includes("apagada") ||
      normalizedKey === "messagestubtype" ||
      normalizedKey === "protocolmessage";

    if (keyLooksDeleted && hasDeletedMarker(item, depth + 1)) return true;
    return isRecord(item) || Array.isArray(item) ? hasDeletedMarker(item, depth + 1) : false;
  });
}

function getMessageJsonField(message: MessageRecord, keys: string[]) {
  const record = message as MessageRecord & Record<string, unknown>;
  return keys.map((key) => record[key]).find((value) => value != null);
}

function getQuotedMessage(message: MessageRecord) {
  return extractQuotedMessageInfo(message);
}

function getMediaUrl(message: MessageRecord) {
  if (message.public_media_url) return message.public_media_url;
  if (message.media_url) return message.media_url;

  const path = message.media_path?.replace(/^file\//, "");
  if (!path) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_REST_URL?.replace(/\/rest\/v1\/?$/, "");
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/file/${path}` : null;
}

function getMediaKind(message: MessageRecord) {
  const type = `${message.media_mime_type || ""} ${message.message_type || ""}`.toLowerCase();

  if (type.includes("sticker") || type.includes("figurinha")) return "sticker";
  if (type.includes("image")) return "image";
  if (type.includes("video")) return "video";
  if (type.includes("audio")) return "audio";
  return "file";
}

function getFileName(message: MessageRecord, mediaUrl: string) {
  const source = message.media_path || mediaUrl;
  const name = source.split("?")[0]?.split("/").pop();
  return name ? decodeURIComponent(name) : message.media_mime_type || message.message_type || "Arquivo";
}

function getAttachmentType(file: File | null) {
  if (!file) return null;
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function getAttachmentLabel(file: File) {
  const kind = getAttachmentType(file);

  if (kind === "image") return "Foto";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  return "Documento";
}

function isDeletedMessage(message: MessageRecord) {
  const status = message.status?.toLowerCase() || "";
  const type = message.message_type?.toLowerCase() || "";
  const content = message.content?.toLowerCase() || "";
  const deletedAt = getMessageExtraField(message, ["deleted_at", "deletedAt"]);
  const flags = message as MessageRecord & { deleted?: boolean | null; is_revoked?: boolean | null };
  const nestedData = getMessageJsonField(message, ["metadata", "raw_message", "message", "data", "json", "message_json", "message_data"]);

  return (
    !!deletedAt ||
    !!message.is_deleted ||
    !!message.revoked ||
    !!flags.deleted ||
    !!flags.is_revoked ||
    hasDeletedMarker(nestedData) ||
    status.includes("deleted") ||
    status.includes("revoked") ||
    type.includes("deleted") ||
    type.includes("revoked") ||
    type.includes("protocol") ||
    content.includes("mensagem apagada") ||
    content.includes("message deleted")
  );
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

function getAudioFileExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function formatTime(time: number) {
  if (isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const AudioPlayer = memo(function AudioPlayer({ mediaUrl }: { mediaUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const onTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const total = audioRef.current.duration;
      setCurrentTime(current);
      setProgress((current / total) * 100);
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }, []);

  const handleSeek = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = percentage * audioRef.current.duration;
    }
  }, []);

  return (
    <div className="flex items-end gap-3 bg-(--chat-background)/40 p-2 rounded-xl min-w-[260px]">
      <button onClick={togglePlay} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--chat-primary) text-white hover:scale-105 transition-transform">
        {isPlaying ? <Pause size={20} fill="currentColor" /> : <PlayIcon size={20} className="ml-1" fill="currentColor" />}
      </button>

      <div className="flex flex-1 flex-col gap-1 pr-2">
        <div className="relative h-2 w-full bg-(--chat-muted-foreground)/20 rounded-full cursor-pointer" onClick={handleSeek}>
          <div className="absolute h-full bg-(--chat-primary) rounded-full" style={{ width: `${progress}%` }} />
          <div className="absolute h-4 w-4 bg-(--chat-primary) rounded-full -top-1 shadow-sm" style={{ left: `calc(${progress}% - 6px)` }} />
        </div>
        <div className="flex justify-between text-[10px] text-(--chat-muted-foreground) font-medium">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <audio ref={audioRef} src={mediaUrl} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={() => setIsPlaying(false)} className="hidden" />
    </div>
  );
});

const MessageBubble = memo(
  function MessageBubble({
    message,
    chat,
    messagesByRemoteId,
    selected,
    isSelectionMode,
    onToggleSelection,
    onReply,
    onForward,
    onDelete,
    onExpandImage,
    isHighlighted,
    onScrollToMessage,
  }: {
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
    onExpandImage: (url: string, alt: string) => void;
    onScrollToMessage?: (id: string) => void;
  }) {
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
            "group relative min-w-[168px] max-w-[72%] rounded-lg px-3 py-2 shadow-sm sm:min-w-[196px] transition-all",
            fromMe ? "rounded-tr-none bg-(--chat-me)" : "rounded-tl-none bg-(--chat-other)",
            selected && "ring-2 ring-teal-500/70",
            isHighlighted && "ring-2 ring-teal-500/30 bg-teal-500/20 duration-300",
            !isHighlighted && "duration-1000",
            deleted && "border border-dashed border-red-500/45 bg-(--chat-muted)/80 opacity-80 shadow-none saturate-[0.65]",
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
                  fromMe ? "bg-[#c8f4c2] dark:bg-[#0f3f2d]" : "bg-[#f5f6f6] dark:bg-[#1d1e1e]",
                  quotedMessage.fromMe ? "border-l-[#00a884]" : "border-l-[#53bdeb]",
                )}
              >
                <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
                  <p className={cn("truncate text-[12px] font-semibold", quotedMessage.fromMe ? "text-[#008069] dark:text-[#06cf9c]" : "text-[#3b82c4] dark:text-[#53bdeb]")}>{quotedMessage.fromMe ? "Voce" : getDisplayName(chat)}</p>
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

                {mediaKind === "audio" && <AudioPlayer mediaUrl={mediaUrl} />}

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
              <p className="whitespace-pre-wrap break-words text-sm text-(--chat-foreground)">{getMessageText(message)}</p>
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
  (prevProps: any, nextProps: any) => {
    return (
      prevProps.message === nextProps.message &&
      prevProps.selected === nextProps.selected &&
      prevProps.isSelectionMode === nextProps.isSelectionMode &&
      prevProps.chat === nextProps.chat &&
      prevProps.isHighlighted === nextProps.isHighlighted
    );
  },
);

export function ChatWindow({
  chat,
  messages,
  isLoading,
  isLoadingOlder,
  hasMoreMessages,
  onLoadOlderMessages,
  onCloseChat,
  onSendMessage,
  onReplyMessage,
  onForwardMessage,
  onForwardMessages,
  onDeleteMessage,
  onDeleteMessages,
  forwardTargets = [],
  error,
  onToggleDetails,
  onToggleStatus,
}: ChatWindowProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isAttachmentPreviewOpen, setIsAttachmentPreviewOpen] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ url: string; alt: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageRecord | null>(null);
  const [forwardingMessages, setForwardingMessages] = useState<MessageRecord[]>([]);
  const [deleteConfirmationMessages, setDeleteConfirmationMessages] = useState<MessageRecord[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [selectedForwardTarget, setSelectedForwardTarget] = useState("");
  const [forwardSearch, setForwardSearch] = useState("");
  const [debouncedForwardSearch, setDebouncedForwardSearch] = useState("");
  const [forwardTargetResults, setForwardTargetResults] = useState<ChatRecord[]>(forwardTargets);
  const [isLoadingForwardTargets, setIsLoadingForwardTargets] = useState(false);
  const [isLoadingMoreForwardTargets, setIsLoadingMoreForwardTargets] = useState(false);
  const [hasMoreForwardTargets, setHasMoreForwardTargets] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [messageActionError, setMessageActionError] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const shouldSendRecordingRef = useRef(false);
  const recordingPausedRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleScrollToMessage = useCallback(
    async (targetId: string) => {
      let foundMessage = messagesRef.current.find((m) => m.id === targetId || m.message_id === targetId);

      if (!foundMessage) {
        if (!onLoadOlderMessages || !hasMoreMessages || isLoadingOlder) return;

        let attempts = 0;
        const maxAttempts = 15;

        while (!foundMessage && attempts < maxAttempts) {
          const scrollArea = scrollAreaRef.current;
          if (scrollArea) {
            previousScrollHeightRef.current = scrollArea.scrollHeight;
          }

          const addedCount = await onLoadOlderMessages();
          if (addedCount === 0) {
            if (scrollArea) previousScrollHeightRef.current = null;
            break;
          }
          attempts++;

          await new Promise((resolve) => setTimeout(resolve, 200));

          foundMessage = messagesRef.current.find((m) => m.id === targetId || m.message_id === targetId);
        }
      }

      if (foundMessage) {
        const el = document.getElementById(`message-${foundMessage.id}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightedMessageId(foundMessage.id);
          setTimeout(() => setHighlightedMessageId(null), 1500);
        }
      }
    },
    [onLoadOlderMessages, hasMoreMessages, isLoadingOlder],
  );

  const handleScrollToLastMessage = useCallback(() => {
    const messages = messagesRef.current;

    if (messages && messages.length > 0) {
      // Pegamos a última mensagem do array (a mais recente)
      const lastMessage = messages[messages.length - 1];

      // Passamos o ID dela para o seu método robusto que já faz o scroll e o highlight!
      handleScrollToMessage(lastMessage.id);
    } else {
      // Caso o array em memória esteja estranho por algum motivo, fazemos o scroll nativo pelo ref do container
      const scrollArea = scrollAreaRef.current;
      if (scrollArea) {
        scrollArea.scrollTo({
          top: scrollArea.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [handleScrollToMessage]);

  const groupedMessages = useMemo(() => {
    return messages.reduce<Array<{ date: string; items: MessageRecord[] }>>((groups, message) => {
      const date = getDateLabel(message.timestamp_msg) || "Sem data";
      const lastGroup = groups[groups.length - 1];

      if (lastGroup?.date === date) {
        lastGroup.items.push(message);
      } else {
        groups.push({ date, items: [message] });
      }

      return groups;
    }, []);
  }, [messages]);

  const messagesByRemoteId = useMemo(() => {
    return messages.reduce<Map<string, MessageRecord>>((indexedMessages, message) => {
      if (message.message_id) indexedMessages.set(message.message_id, message);
      indexedMessages.set(message.id, message);
      return indexedMessages;
    }, new Map());
  }, [messages]);

  const selectedMessages = useMemo(() => {
    return messages.filter((message) => selectedMessageIds.has(message.id) && !isDeletedMessage(message));
  }, [messages, selectedMessageIds]);

  const isSelectionMode = selectedMessages.length > 0;
  const canDeleteSelectedMessages = selectedMessages.length > 0 && selectedMessages.every((message) => !!message.from_me);
  const selectedForwardTargetRecord = useMemo(() => {
    return forwardTargetResults.find((target) => target.chat_id === selectedForwardTarget) || forwardTargets.find((target) => target.chat_id === selectedForwardTarget);
  }, [forwardTargetResults, forwardTargets, selectedForwardTarget]);

  const attachmentPreviewUrl = useMemo(() => (attachment ? URL.createObjectURL(attachment) : null), [attachment]);

  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    };
  }, [attachmentPreviewUrl]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedForwardSearch(forwardSearch.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [forwardSearch]);

  useEffect(() => {
    if (forwardingMessages.length === 0) return;

    let isMounted = true;

    async function loadForwardTargets() {
      const term = debouncedForwardSearch.trim();

      setIsLoadingForwardTargets(true);
      try {
        const data = await fetchChats({ limit: FORWARD_TARGET_PAGE_SIZE, offset: 0, search: term || undefined });
        if (!isMounted) return;
        setForwardTargetResults(data);
        setHasMoreForwardTargets(data.length === FORWARD_TARGET_PAGE_SIZE);
        setSelectedForwardTarget((current) => current || chat?.chat_id || data[0]?.chat_id || "");
      } catch (error) {
        if (!isMounted) return;
        setForwardTargetResults([]);
        setHasMoreForwardTargets(false);
        setMessageActionError(error instanceof Error ? error.message : "Nao foi possivel buscar os chats.");
      } finally {
        if (isMounted) setIsLoadingForwardTargets(false);
      }
    }

    void loadForwardTargets();

    return () => {
      isMounted = false;
    };
  }, [chat?.chat_id, debouncedForwardSearch, forwardingMessages.length]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    const previousScrollHeight = previousScrollHeightRef.current;

    if (scrollArea && previousScrollHeight !== null) {
      scrollArea.scrollTop = scrollArea.scrollHeight - previousScrollHeight;
      previousScrollHeightRef.current = null;
      return;
    }

    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, chat?.id]);

  useEffect(() => {
    if (!chat) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      if (selectedMessageIds.size > 0) {
        setSelectedMessageIds(new Set());
        return;
      }
      if (forwardingMessages.length > 0) {
        setForwardingMessages([]);
        return;
      }
      if (deleteConfirmationMessages.length > 0) {
        setDeleteConfirmationMessages([]);
        return;
      }
      setIsDetailsOpen(false);
      onCloseChat?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chat, deleteConfirmationMessages.length, forwardingMessages.length, onCloseChat, selectedMessageIds.size]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSelectedMessageIds(new Set());
      setForwardingMessages([]);
      setDeleteConfirmationMessages([]);
      setMessageActionError(null);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [chat?.id]);

  useEffect(() => {
    return () => {
      shouldSendRecordingRef.current = false;

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else {
        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
    };
  }, [chat?.id]);

  async function handleMessagesScroll(event: UIEvent<HTMLDivElement>) {
    // === LÓGICA DO BOTÃO FLUTUANTE (Adicionada aqui) ===
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;

    // Calcula a distância que falta para chegar ao fundo do chat
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Se o médico subiu mais de 300px, mostra o botão, senão esconde
    if (distanceFromBottom > 300) {
      setShowScrollButton(true);
    } else {
      setShowScrollButton(false);
    }

    if (!onLoadOlderMessages || !hasMoreMessages || isLoadingOlder || isLoading) return;
    if (event.currentTarget.scrollTop > 120) return;

    previousScrollHeightRef.current = event.currentTarget.scrollHeight;
    const addedCount = await onLoadOlderMessages();

    if (addedCount === 0) {
      previousScrollHeightRef.current = null;
    }
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if ((!onSendMessage && !onReplyMessage) || isSending) return;

    const text = draft.trim();
    if (!text && !attachment) return;

    setIsSending(true);

    try {
      if (replyTo && onReplyMessage) {
        await onReplyMessage({ text, file: attachment, replyTo });
      } else {
        await onSendMessage?.({ text, file: attachment });
      }
      setDraft("");
      setReplyTo(null);
      removeAttachment();
    } finally {
      setIsSending(false);
    }
  }

  function handleAttachmentSelected(file?: File | null) {
    const selectedFile = file ?? null;
    setAttachment(selectedFile);
    setIsAttachmentPreviewOpen(!!selectedFile);
  }

  function removeAttachment() {
    setAttachment(null);
    setIsAttachmentPreviewOpen(false);
    clearAttachmentInputs();
  }

  function clearAttachmentInputs() {
    for (const input of [fileInputRef.current, photoInputRef.current, videoInputRef.current, cameraInputRef.current]) {
      if (input) input.value = "";
    }
  }

  function beginReply(message: MessageRecord) {
    if (isDeletedMessage(message)) return;

    setSelectedMessageIds(new Set());
    setReplyTo(message);
    setMessageActionError(null);
  }

  function clearSelectedMessages() {
    setSelectedMessageIds(new Set());
    setMessageActionError(null);
  }

  function toggleMessageSelection(message: MessageRecord) {
    if (isDeletedMessage(message)) return;

    setReplyTo(null);
    setMessageActionError(null);
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(message.id)) {
        next.delete(message.id);
      } else {
        next.add(message.id);
      }
      return next;
    });
  }

  function openForwardMessages(messagesToForward: MessageRecord[]) {
    const validMessages = messagesToForward.filter((message) => !isDeletedMessage(message));
    if (validMessages.length === 0) return;

    setForwardingMessages(validMessages);
    setSelectedForwardTarget(chat?.chat_id || "");
    setForwardSearch("");
    setDebouncedForwardSearch("");
    setForwardTargetResults(forwardTargets);
    setMessageActionError(null);
  }

  function beginForward(message: MessageRecord) {
    openForwardMessages([message]);
  }

  function beginForwardSelected() {
    openForwardMessages(selectedMessages);
  }

  async function loadMoreForwardTargets() {
    if (isLoadingMoreForwardTargets || !hasMoreForwardTargets) return;

    setIsLoadingMoreForwardTargets(true);
    setMessageActionError(null);

    try {
      const data = await fetchChats({
        limit: FORWARD_TARGET_PAGE_SIZE,
        offset: forwardTargetResults.length,
        search: debouncedForwardSearch || undefined,
      });
      setForwardTargetResults((current) => {
        const knownIds = new Set(current.map((target) => target.id));
        return [...current, ...data.filter((target) => !knownIds.has(target.id))];
      });
      setHasMoreForwardTargets(data.length === FORWARD_TARGET_PAGE_SIZE);
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : "Nao foi possivel carregar mais chats.");
    } finally {
      setIsLoadingMoreForwardTargets(false);
    }
  }

  async function handleForwardSubmit() {
    if (forwardingMessages.length === 0 || !selectedForwardTarget || isForwarding) return;

    setIsForwarding(true);
    setMessageActionError(null);

    try {
      if (forwardingMessages.length > 1 && onForwardMessages) {
        await onForwardMessages({ messages: forwardingMessages, targetChatId: selectedForwardTarget });
      } else if (forwardingMessages.length === 1 && onForwardMessage) {
        await onForwardMessage({ message: forwardingMessages[0], targetChatId: selectedForwardTarget });
      } else if (onForwardMessages) {
        await onForwardMessages({ messages: forwardingMessages, targetChatId: selectedForwardTarget });
      } else {
        throw new Error("Encaminhamento indisponivel.");
      }

      setForwardingMessages([]);
      setSelectedForwardTarget("");
      clearSelectedMessages();
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : "Nao foi possivel encaminhar a mensagem.");
    } finally {
      setIsForwarding(false);
    }
  }

  function beginDelete(message: MessageRecord) {
    if (isDeletedMessage(message) || !message.from_me) return;

    setMessageActionError(null);
    setDeleteConfirmationMessages([message]);
  }

  function beginDeleteSelected() {
    if (!canDeleteSelectedMessages) return;

    setMessageActionError(null);
    setDeleteConfirmationMessages(selectedMessages);
  }

  async function handleDeleteMessage() {
    const messagesToDelete = deleteConfirmationMessages.filter((message) => !isDeletedMessage(message) && message.from_me);
    if (messagesToDelete.length === 0) return;

    setMessageActionError(null);

    try {
      if (messagesToDelete.length > 1 && onDeleteMessages) {
        await onDeleteMessages(messagesToDelete);
      } else if (messagesToDelete.length === 1 && onDeleteMessage) {
        await onDeleteMessage(messagesToDelete[0]);
      } else if (onDeleteMessages) {
        await onDeleteMessages(messagesToDelete);
      } else {
        throw new Error("Apagamento indisponivel.");
      }

      setDeleteConfirmationMessages([]);
      clearSelectedMessages();
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : "Nao foi possivel apagar as mensagens.");
    }
  }

  function clearRecordingTimer() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function stopRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  async function startRecording() {
    if (!onSendMessage || isSending || isRecording) return;

    setRecordingError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Seu navegador nao oferece suporte a gravacao de audio.");
      return;
    }

    try {
      removeAttachment();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      shouldSendRecordingRef.current = false;
      recordingPausedRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearRecordingTimer();
        stopRecordingStream();

        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        recordingPausedRef.current = false;
        setIsRecording(false);
        setIsRecordingPaused(false);
        setRecordingSeconds(0);

        if (!shouldSendRecordingRef.current || chunks.length === 0) {
          shouldSendRecordingRef.current = false;
          return;
        }

        shouldSendRecordingRef.current = false;
        const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: recordedMimeType });
        const file = new File([blob], `audio-${Date.now()}.${getAudioFileExtension(recordedMimeType)}`, {
          type: recordedMimeType,
        });

        setIsSending(true);
        try {
          await onSendMessage({ text: "", file });
        } catch (error) {
          setRecordingError(error instanceof Error ? error.message : "Nao foi possivel enviar o audio gravado.");
        } finally {
          setIsSending(false);
        }
      };

      recorder.onerror = () => {
        setRecordingError("Nao foi possivel concluir a gravacao.");
        shouldSendRecordingRef.current = false;
        stopRecording();
      };

      recorder.start();
      setIsRecording(true);
      setIsRecordingPaused(false);
      setRecordingSeconds(0);
      clearRecordingTimer();
      recordingTimerRef.current = window.setInterval(() => {
        if (!recordingPausedRef.current) {
          setRecordingSeconds((seconds) => seconds + 1);
        }
      }, 1000);
    } catch {
      clearRecordingTimer();
      stopRecordingStream();
      setIsRecording(false);
      setIsRecordingPaused(false);
      setRecordingError("Permita o acesso ao microfone para gravar audio.");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    clearRecordingTimer();
    stopRecordingStream();
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingSeconds(0);
  }

  function sendRecording() {
    if (!isRecording || isSending) return;

    shouldSendRecordingRef.current = true;
    stopRecording();
  }

  function cancelRecording() {
    shouldSendRecordingRef.current = false;
    stopRecording();
  }

  function toggleRecordingPause() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (recorder.state === "recording") {
      recorder.pause();
      recordingPausedRef.current = true;
      setIsRecordingPaused(true);
      return;
    }

    if (recorder.state === "paused") {
      recorder.resume();
      recordingPausedRef.current = false;
      setIsRecordingPaused(false);
    }
  }

  if (!chat) {
    return <div className="flex flex-1 items-center justify-center h-full bg-background px-6 text-center text-sm text-muted-foreground">Selecione um contato para visualizar a conversa.</div>;
  }

  const attachmentKind = getAttachmentType(attachment) as AttachmentPreviewKind | null;

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-background">
      <div className="flex flex-1 flex-col border-r border-border relative">
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          {isSelectionMode ? (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <Button type="button" variant="ghost" size="icon" onClick={clearSelectedMessages} aria-label="Cancelar selecao">
                  <X className="h-5 w-5" />
                </Button>
                <span className="truncate text-sm font-semibold text-foreground">
                  {selectedMessages.length} {selectedMessages.length === 1 ? "mensagem selecionada" : "mensagens selecionadas"}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" onClick={beginForwardSelected} aria-label="Encaminhar selecionadas">
                  <Forward className="h-5 w-5" />
                </Button>
                {canDeleteSelectedMessages && (
                  <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500" onClick={beginDeleteSelected} aria-label="Apagar selecionadas">
                    <Trash2 className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div onClick={onToggleDetails} className="flex items-center gap-3 cursor-pointer">
                <button className="rounded-full transition-opacity hover:opacity-90 cursor-pointer" aria-label="Abrir detalhes do contato">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={chat.url_foto_perfil ?? undefined} alt={getDisplayName(chat)} />
                    <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-semibold text-white">{getDisplayName(chat).slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </button>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium leading-none text-foreground">{getDisplayName(chat)}</span>
                  <span className="mt-1 text-[10px] text-muted-foreground">{chat.finalizada ? "Finalizada" : chat.ia_responde ? "IA responde" : "Atendimento aberto"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={() => onToggleStatus()} className="bg-teal-500 px-4 font-medium text-white hover:bg-teal-600 cursor-pointer">
                  {chat.finalizada ? "Reabrir" : "Finalizar"}
                </Button>
                <Button onClick={onToggleDetails} variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground cursor-pointer">
                  <Info className="h-5 w-5" />
                </Button>
              </div>
            </>
          )}
        </div>

        <div
          ref={scrollAreaRef}
          className="flex-1 overflow-y-auto relative"
          onScroll={handleMessagesScroll}
          style={{
            backgroundColor: "var(--chat-background)",
            backgroundImage: "url(/bgs/bgdefault.png)",
            backgroundRepeat: "repeat",
            backgroundSize: "600px",
          }}
        >
          <div className="mx-auto flex min-h-full w-full flex-col px-6 py-4">
            {isLoading ? (
              <div className="m-auto rounded px-4 py-2 text-sm shadow-sm border shadow-x bg-input/30 border-input">Carregando mensagens...</div>
            ) : error ? (
              <div className="m-auto max-w-md rounded bg-red-400/30 px-4 py-3 text-sm text-red-500 shadow-sm">{error}</div>
            ) : groupedMessages.length === 0 ? (
              <div className="m-auto rounded px-4 py-2 text-sm shadow-sm border shadow-x text-foreground/75 bg-input/30 border-input">Esta conversa ainda não tem mensagens visíveis.</div>
            ) : (
              <>
                <div className="mb-2 flex justify-center">
                  {hasMoreMessages ? (
                    <Button
                      variant="ghost"
                      className="h-8 bg-(--chat-muted)/70 px-3 text-xs text-(--chat-muted-foreground) shadow-sm hover:bg-(--chat-muted)"
                      disabled={isLoadingOlder}
                      onClick={async () => {
                        const scrollArea = scrollAreaRef.current;
                        if (scrollArea) previousScrollHeightRef.current = scrollArea.scrollHeight;
                        const addedCount = await onLoadOlderMessages?.();
                        if (!addedCount) previousScrollHeightRef.current = null;
                      }}
                    >
                      {isLoadingOlder ? "Carregando mensagens antigas..." : "Carregar mensagens antigas"}
                    </Button>
                  ) : (
                    <span className="rounded bg-(--chat-muted)/70 px-3 py-1 text-xs text-(--chat-muted-foreground) shadow-sm">Início do histórico carregado</span>
                  )}
                </div>

                {groupedMessages.map((group) => (
                  <div key={group.date}>
                    <div className="my-3 flex justify-center">
                      <span className="rounded bg-(--chat-other)/80 px-3 py-1 text-xs text-(--chat-muted-foreground) shadow-sm">{group.date}</span>
                    </div>

                    {group.items.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        chat={chat!}
                        messagesByRemoteId={messagesByRemoteId}
                        selected={selectedMessageIds.has(message.id)}
                        isSelectionMode={isSelectionMode}
                        isHighlighted={highlightedMessageId === message.id}
                        onToggleSelection={toggleMessageSelection}
                        onReply={beginReply}
                        onForward={beginForward}
                        onDelete={beginDelete}
                        onExpandImage={(url: string, alt: string) => setExpandedImage({ url, alt })}
                        onScrollToMessage={handleScrollToMessage}
                      />
                    ))}
                  </div>
                ))}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {showScrollButton && (
          <Button size="icon" variant="outline" onClick={handleScrollToLastMessage} className="absolute left-1/2 bottom-18 rounded-full -translate-x-2/3 transition-all active:scale-95 animate-in fade-in zoom-in-95 backdrop-blur-sm">
            <ArrowDown className="h-4 w-4 stroke-[2.5]" />
          </Button>
        )}

        <form onSubmit={handleSubmit} className="border-t border-border bg-card px-4 py-3">
          {attachment && (
            <div className="mb-2 flex items-center justify-between rounded-md border border-border bg-secondary px-3 py-2 text-sm">
              <button type="button" className="min-w-0 text-left" onClick={() => setIsAttachmentPreviewOpen(true)}>
                <p className="truncate font-medium text-foreground">{attachment.name}</p>
                <p className="text-xs text-muted-foreground">
                  {getAttachmentLabel(attachment)} · {(attachment.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </button>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={removeAttachment} aria-label="Remover anexo">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {replyTo && (
            <div className="mb-2 flex items-center gap-3 overflow-hidden rounded-lg border-l-4 border-[#00a884] bg-[#f0f2f5] px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(17,27,33,0.05)] dark:bg-[#202c33]">
              <Reply className="h-4 w-4 shrink-0 text-[#00a884]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[#008069] dark:text-[#06cf9c]">Respondendo {replyTo.from_me ? "voce" : getDisplayName(chat)}</p>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  {getMediaKind(replyTo) === "image" && <FileImage className="h-3.5 w-3.5 shrink-0 opacity-75" />}
                  {getMediaKind(replyTo) === "video" && <Video className="h-3.5 w-3.5 shrink-0 opacity-75" />}
                  {getMediaKind(replyTo) === "audio" && <Mic className="h-3.5 w-3.5 shrink-0 opacity-75" />}
                  {getMediaKind(replyTo) === "file" && <FileText className="h-3.5 w-3.5 shrink-0 opacity-75" />}
                  <p className="truncate text-xs">{getMessagePreviewText(replyTo)}</p>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {messageActionError && <p className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{messageActionError}</p>}
          {recordingError && <p className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{recordingError}</p>}

          <div className="flex items-center gap-3">
            {isRecording ? (
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-secondary px-2 py-2 shadow-sm">
                <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground hover:text-red-500" onClick={cancelRecording} disabled={isSending} aria-label="Cancelar gravacao">
                  <Trash2 className="h-5 w-5" />
                </Button>

                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400", isRecordingPaused ? "opacity-40" : "animate-pulse")} />
                <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatTime(recordingSeconds)}</span>

                <div className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden px-2" aria-hidden="true">
                  {Array.from({ length: 26 }).map((_, index) => {
                    const height = 6 + ((index * 7 + recordingSeconds * 5) % 18);

                    return (
                      <span
                        key={index}
                        className={cn("w-1 rounded-full bg-muted-foreground/60 transition-all duration-300", !isRecordingPaused && "animate-pulse")}
                        style={{
                          height,
                          animationDelay: `${index * 45}ms`,
                        }}
                      />
                    );
                  })}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-full text-rose-400 hover:bg-rose-400/10 hover:text-rose-400"
                  onClick={toggleRecordingPause}
                  disabled={isSending}
                  aria-label={isRecordingPaused ? "Retomar gravacao" : "Pausar gravacao"}
                >
                  {isRecordingPaused ? <Mic className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                </Button>

                <Button type="button" disabled={isSending} size="icon" className="shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600" onClick={sendRecording} aria-label="Enviar audio gravado">
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <>
                <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
                  <PenLine className="h-5 w-5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={startRecording} disabled={isSending || !!attachment} aria-label="Gravar audio">
                  <Mic className="h-5 w-5" />
                </Button>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => handleAttachmentSelected(event.target.files?.[0])}
            />
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleAttachmentSelected(event.target.files?.[0])} />
            <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => handleAttachmentSelected(event.target.files?.[0])} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handleAttachmentSelected(event.target.files?.[0])} />
            {!isRecording && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Anexar arquivo">
                      <Paperclip className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" sideOffset={12} className="w-[300px] rounded-lg border-border bg-card p-3 shadow-xl">
                    <div className="grid grid-cols-3 gap-2">
                      <DropdownMenuItem className={attachmentMenuItemClass} onSelect={() => photoInputRef.current?.click()}>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                          <FileImage className="h-5 w-5 text-current" />
                        </span>
                        Fotos
                      </DropdownMenuItem>
                      <DropdownMenuItem className={attachmentMenuItemClass} onSelect={() => videoInputRef.current?.click()}>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                          <Video className="h-5 w-5 text-current" />
                        </span>
                        Videos
                      </DropdownMenuItem>
                      <DropdownMenuItem className={attachmentMenuItemClass} onSelect={() => fileInputRef.current?.click()}>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                          <FileText className="h-5 w-5 text-current" />
                        </span>
                        Documentos
                      </DropdownMenuItem>
                      <DropdownMenuItem className={attachmentMenuItemClass} onSelect={() => cameraInputRef.current?.click()}>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                          <Camera className="h-5 w-5 text-current" />
                        </span>
                        Camera
                      </DropdownMenuItem>
                      <DropdownMenuItem aria-disabled className={disabledAttachmentMenuItemClass} onSelect={(event) => event.preventDefault()}>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                          <MapPin className="h-5 w-5 text-current" />
                        </span>
                        Localizacao
                      </DropdownMenuItem>
                      <DropdownMenuItem aria-disabled className={disabledAttachmentMenuItemClass} onSelect={(event) => event.preventDefault()}>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-600 text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                          <UserRound className="h-5 w-5 text-current" />
                        </span>
                        Contato
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input value={draft} onChange={(event) => setDraft(event.target.value)} disabled={isSending} placeholder={attachment ? "Legenda opcional" : "Digite uma mensagem"} className="flex-1 border-0 bg-secondary" />
                <Button type="submit" disabled={isSending || (!draft.trim() && !attachment)} size="icon" className="shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600" aria-label="Enviar mensagem">
                  <Send className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>
        </form>
      </div>

      {attachment && isAttachmentPreviewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
          <div className="flex h-16 items-center justify-between border-b border-border bg-card px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{attachment.name}</p>
              <p className="text-xs text-muted-foreground">
                {getAttachmentLabel(attachment)} · {(attachment.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={removeAttachment} aria-label="Fechar preview">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center bg-black/5 p-4 sm:p-8">
            {attachmentPreviewUrl && attachmentKind === "image" && (
              <Image src={attachmentPreviewUrl} alt={attachment.name} width={1200} height={900} className="max-h-full w-auto max-w-full rounded-md object-contain shadow-2xl" unoptimized />
            )}

            {attachmentPreviewUrl && attachmentKind === "video" && <video src={attachmentPreviewUrl} className="max-h-full w-auto max-w-full rounded-md bg-black shadow-2xl" controls preload="metadata" />}

            {attachmentPreviewUrl && attachmentKind === "audio" && (
              <div className="flex w-full max-w-xl flex-col items-center gap-5 rounded-lg border border-border bg-card p-8 shadow-2xl">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-500 text-white">
                  <Mic className="h-10 w-10" />
                </span>
                <div className="min-w-0 text-center">
                  <p className="truncate text-base font-medium text-foreground">{attachment.name}</p>
                  <p className="text-sm text-muted-foreground">{attachment.type || "audio"}</p>
                </div>
                <audio src={attachmentPreviewUrl} className="w-full" controls />
              </div>
            )}

            {attachmentKind === "document" && (
              <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center shadow-2xl">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-600 text-white">
                  <FileText className="h-10 w-10" />
                </span>
                <div className="min-w-0">
                  <p className="break-words text-base font-medium text-foreground">{attachment.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {attachment.type || "Arquivo"} · {(attachment.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border bg-card p-4">
            <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
              <Input value={draft} onChange={(event) => setDraft(event.target.value)} disabled={isSending} placeholder="Adicione uma legenda" className="h-11 flex-1 border-0 bg-secondary" />
              <Button type="submit" disabled={isSending} size="icon-lg" className="shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600" aria-label="Enviar anexo">
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </form>
        </div>
      )}

      {expandedImage && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm">
          <div className="flex h-14 items-center justify-end px-4">
            <Button type="button" variant="ghost" size="icon" onClick={() => setExpandedImage(null)} className="text-white hover:bg-white/10 hover:text-white" aria-label="Fechar imagem">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <button type="button" className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onClick={() => setExpandedImage(null)} aria-label="Fechar imagem expandida">
            <span className="relative block h-full max-h-full w-full max-w-6xl">
              <Image src={expandedImage.url} alt={expandedImage.alt} fill sizes="100vw" className="object-contain" priority unoptimized />
            </span>
          </button>
        </div>
      )}

      {forwardingMessages.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Encaminhar {forwardingMessages.length === 1 ? "mensagem" : `${forwardingMessages.length} mensagens`}</p>
                <p className="truncate text-xs text-muted-foreground">{selectedForwardTargetRecord ? `Para ${getDisplayName(selectedForwardTargetRecord)}` : "Escolha um contato"}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setForwardingMessages([])} aria-label="Fechar encaminhamento">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-3 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={forwardSearch} onChange={(event) => setForwardSearch(event.target.value)} placeholder="Pesquisar todos os chats" className="border-border bg-secondary pl-9" />
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
                        className={cn("flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 transition-colors hover:bg-secondary", isSelectedTarget && "bg-teal-500/10")}
                        onClick={() => setSelectedForwardTarget(target.chat_id)}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={target.url_foto_perfil ?? undefined} alt={getDisplayName(target)} />
                          <AvatarFallback className="bg-teal-500 text-xs font-semibold text-white">{getDisplayName(target).slice(0, 1).toUpperCase()}</AvatarFallback>
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
                <Button type="button" variant="ghost" className="w-full" onClick={loadMoreForwardTargets} disabled={isLoadingMoreForwardTargets}>
                  {isLoadingMoreForwardTargets ? "Carregando..." : "Carregar mais chats"}
                </Button>
              )}

              <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border-l-4 border-teal-500 bg-secondary px-3 py-2">
                {forwardingMessages.map((message) => (
                  <div key={message.id} className="min-w-0">
                    <p className="text-xs font-semibold text-teal-600 dark:text-teal-300">{message.from_me ? "Voce" : getDisplayName(chat)}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{getMessagePreviewText(message)}</p>
                  </div>
                ))}
              </div>

              {messageActionError && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{messageActionError}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <Button type="button" variant="ghost" onClick={() => setForwardingMessages([])}>
                Cancelar
              </Button>
              <Button type="button" className="bg-teal-500 text-white hover:bg-teal-600" onClick={handleForwardSubmit} disabled={!selectedForwardTarget || isForwarding}>
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
      )}

      {deleteConfirmationMessages.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                <Trash2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Apagar {deleteConfirmationMessages.length === 1 ? "mensagem?" : `${deleteConfirmationMessages.length} mensagens?`}</p>
                <p className="text-xs text-muted-foreground">A acao sera enviada ao webhook de apagar. O banco nao sera alterado diretamente.</p>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border-l-4 border-red-500 bg-secondary px-3 py-2">
                {deleteConfirmationMessages.map((message) => (
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
              <Button type="button" variant="ghost" onClick={() => setDeleteConfirmationMessages([])}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" onClick={handleDeleteMessage}>
                <Trash2 className="h-4 w-4" />
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
