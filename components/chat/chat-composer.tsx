"use client";

import type { FormEvent, RefObject } from "react";
import { Camera, FileImage, FileText, MapPin, Mic, Paperclip, Pause, PenLine, Reply, Send, Trash2, UserRound, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest";
import { getAttachmentLabel } from "./chat-attachment-utils";
import { formatTime, getDisplayName, getMediaKind, getMessagePreviewText } from "./message-utils";

const attachmentMenuItemClass = "flex h-[76px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md p-2 text-xs font-medium text-foreground transition-colors focus:bg-muted";
const disabledAttachmentMenuItemClass = "flex h-[76px] cursor-not-allowed flex-col items-center justify-center gap-2 rounded-md p-2 text-xs font-medium text-muted-foreground focus:bg-transparent";

type ChatComposerProps = {
  chat: ChatRecord;
  draft: string;
  attachment: File | null;
  replyTo: MessageRecord | null;
  isSending: boolean;
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordingSeconds: number;
  messageActionError: string | null;
  recordingError: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  photoInputRef: RefObject<HTMLInputElement | null>;
  videoInputRef: RefObject<HTMLInputElement | null>;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  onDraftChange: (value: string) => void;
  onOpenAttachmentPreview: () => void;
  onRemoveAttachment: () => void;
  onCancelReply: () => void;
  onAttachmentSelected: (file?: File | null) => void;
  onStartRecording: () => void;
  onCancelRecording: () => void;
  onToggleRecordingPause: () => void;
  onSendRecording: () => void;
};

export function ChatComposer({
  chat,
  draft,
  attachment,
  replyTo,
  isSending,
  isRecording,
  isRecordingPaused,
  recordingSeconds,
  messageActionError,
  recordingError,
  fileInputRef,
  photoInputRef,
  videoInputRef,
  cameraInputRef,
  onSubmit,
  onDraftChange,
  onOpenAttachmentPreview,
  onRemoveAttachment,
  onCancelReply,
  onAttachmentSelected,
  onStartRecording,
  onCancelRecording,
  onToggleRecordingPause,
  onSendRecording,
}: ChatComposerProps) {
  return (
    <form onSubmit={onSubmit} className="border-t border-border bg-card px-4 py-3">
      {attachment && (
        <div className="mb-2 flex items-center justify-between rounded-md border border-border bg-secondary px-3 py-2 text-sm">
          <button type="button" className="min-w-0 text-left" onClick={onOpenAttachmentPreview}>
            <p className="truncate font-medium text-foreground">{attachment.name}</p>
            <p className="text-xs text-muted-foreground">
              {getAttachmentLabel(attachment)} · {(attachment.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </button>
          <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={onRemoveAttachment} aria-label="Remover anexo">
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
          <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={onCancelReply} aria-label="Cancelar resposta">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {messageActionError && <p className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{messageActionError}</p>}
      {recordingError && <p className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{recordingError}</p>}

      <div className="flex items-center gap-3">
        {isRecording ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-secondary px-2 py-2 shadow-sm">
            <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground hover:text-red-500" onClick={onCancelRecording} disabled={isSending} aria-label="Cancelar gravacao">
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

            <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full text-rose-400 hover:bg-rose-400/10 hover:text-rose-400" onClick={onToggleRecordingPause} disabled={isSending} aria-label={isRecordingPaused ? "Retomar gravacao" : "Pausar gravacao"}>
              {isRecordingPaused ? <Mic className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </Button>

            <Button type="button" disabled={isSending} size="icon" className="shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600" onClick={onSendRecording} aria-label="Enviar audio gravado">
              <Send className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <>
            <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
              <PenLine className="h-5 w-5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={onStartRecording} disabled={isSending || !!attachment} aria-label="Gravar audio">
              <Mic className="h-5 w-5" />
            </Button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => onAttachmentSelected(event.target.files?.[0])}
        />
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onAttachmentSelected(event.target.files?.[0])} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => onAttachmentSelected(event.target.files?.[0])} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => onAttachmentSelected(event.target.files?.[0])} />
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
            <Input value={draft} onChange={(event) => onDraftChange(event.target.value)} disabled={isSending} placeholder={attachment ? "Legenda opcional" : "Digite uma mensagem"} className="flex-1 border-0 bg-secondary" />
            <Button type="submit" disabled={isSending || (!draft.trim() && !attachment)} size="icon" className="shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600" aria-label="Enviar mensagem">
              <Send className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
