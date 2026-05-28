"use client";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest";
import { getMentionLabel, getMentionSlug } from "@/lib/user-mentions";
import type { MentionableUser } from "@/lib/user-roles";
import { cn } from "@/lib/utils";
import { CalendarClock, Camera, Check, Clock, FileImage, FileText, Loader2, MapPin, Mic, Paperclip, Pause, PenLine, Reply, Send, Trash2, UserRound, Video, X } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import { useMemo, useState } from "react";
import { Textarea } from "../ui/textarea";
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
  isInternalNoteOpen: boolean;
  noteDraft: string;
  noteLinkedMessage: MessageRecord | null;
  noteMentionUsers: MentionableUser[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  photoInputRef: RefObject<HTMLInputElement | null>;
  videoInputRef: RefObject<HTMLInputElement | null>;
  cameraInputRef: RefObject<HTMLInputElement | null>;

  isSignatureMode: boolean;

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
  onOpenInternalNote: () => void;
  onCloseInternalNote: () => void;
  onNoteDraftChange: (value: string) => void;
  onSaveInternalNote: () => void;
  onScheduleMessage: (scheduledAt: string) => Promise<void>;
};

function getLocalDateTimeValue(date = new Date(Date.now() + 10 * 60 * 1000)) {
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

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
  isInternalNoteOpen,
  noteDraft,
  noteLinkedMessage,
  noteMentionUsers,
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
  onOpenInternalNote,
  onCloseInternalNote,
  onNoteDraftChange,
  onSaveInternalNote,
  onScheduleMessage,
  isSignatureMode,
}: ChatComposerProps) {
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState(() => getLocalDateTimeValue());
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const mentionMatch = noteDraft.match(/(^|\s)@([\p{L}\p{N}._-]*)$/u);
  const mentionQuery = mentionMatch?.[2] ?? "";
  const mentionSuggestions = useMemo(() => {
    if (!isInternalNoteOpen || !mentionMatch) return [];

    const normalizedQuery = getMentionSlug(mentionQuery);

    return noteMentionUsers
      .filter((user) => {
        const label = getMentionLabel(user);
        return getMentionSlug(label).startsWith(normalizedQuery) || getMentionSlug(user.name).includes(normalizedQuery) || user.email.toLowerCase().startsWith(normalizedQuery);
      })
      .slice(0, 5);
  }, [isInternalNoteOpen, mentionMatch, mentionQuery, noteMentionUsers]);

  function insertMention(user: MentionableUser) {
    if (!mentionMatch) return;

    const mentionStart = mentionMatch.index ?? 0;
    const prefix = noteDraft.slice(0, mentionStart + mentionMatch[1].length);
    onNoteDraftChange(`${prefix}@${getMentionLabel(user)} `);
  }

  const { user } = useCurrentUser();
  const userName = user?.name ?? "Usuário";

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      event.currentTarget.form?.requestSubmit();
    }
  };

  async function handleScheduleSubmit() {
    const date = new Date(scheduleDateTime);
    setScheduleError(null);

    if (!draft.trim() && !attachment) {
      setScheduleError("Digite uma mensagem ou selecione um anexo.");
      return;
    }

    if (Number.isNaN(date.getTime())) {
      setScheduleError("Escolha uma data valida.");
      return;
    }

    if (date.getTime() < Date.now() + 30000) {
      setScheduleError("Escolha um horario futuro.");
      return;
    }

    setIsScheduling(true);
    try {
      await onScheduleMessage(date.toISOString());
      setIsScheduleOpen(false);
      setScheduleDateTime(getLocalDateTimeValue());
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Nao foi possivel agendar.");
    } finally {
      setIsScheduling(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col border-t border-border bg-card px-4 py-3">
      {isInternalNoteOpen && (
        <div className="mb-4 max-w-5xl">
          <div className="mb-2">
            <p className="text-sm font-semibold text-foreground">Escrever anotação interna:</p>
            <p className="text-xs text-muted-foreground">A anotação não é visível para o cliente.</p>
          </div>
          {noteLinkedMessage && (
            <div className="mb-2 max-w-2xl border-l-4 border-amber-400 bg-yellow-100/85 px-3 py-2 text-xs text-yellow-950">
              <p className="font-semibold">Anotação vinculada à mensagem</p>
              <p className="mt-0.5 line-clamp-2">{getMessagePreviewText(noteLinkedMessage)}</p>
            </div>
          )}
          <div className="relative">
            <textarea
              value={noteDraft}
              onChange={(event) => onNoteDraftChange(event.target.value)}
              className="min-h-20 w-full resize-y border-0 bg-yellow-100 px-3 py-2 text-sm text-yellow-950 outline-none ring-1 ring-yellow-200 placeholder:text-yellow-950/45 focus:ring-2 focus:ring-amber-400"
              placeholder="Digite uma anotacao interna. Use @ para mencionar alguem."
            />
            {mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-md border border-amber-200 bg-card p-1 text-sm shadow-lg">
                {mentionSuggestions.map((user) => (
                  <button key={user.email} type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-foreground transition hover:bg-amber-100 dark:hover:bg-amber-500/15" onClick={() => insertMention(user)}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-semibold text-amber-700">{getMentionLabel(user).charAt(0).toUpperCase()}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">@{getMentionLabel(user)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={onSaveInternalNote} disabled={!noteDraft.trim()}>
              <Check className="h-4 w-4" />
              Salvar anotação
            </Button>
            <Button type="button" size="sm" className="bg-red-700 text-white hover:bg-red-800" onClick={onCloseInternalNote}>
              <X className="h-4 w-4" />
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {!isInternalNoteOpen && attachment && (
        <div className="mb-2 overflow-hidden rounded-md border border-border bg-secondary text-sm">
          <div className="flex items-center justify-between px-3 py-2">
            <button type="button" className="min-w-0 text-left" onClick={onOpenAttachmentPreview} disabled={isSending}>
              <p className="truncate font-medium text-foreground">{attachment.name}</p>
              <p className="text-xs text-muted-foreground">
                {isSending ? "Enviando arquivo" : getAttachmentLabel(attachment)} · {(attachment.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </button>
            {isSending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-500" />
            ) : (
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={onRemoveAttachment} aria-label="Remover anexo">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {isSending && (
            <div className="h-1 w-full overflow-hidden bg-background/60">
              <span className="block h-full w-1/2 animate-pulse bg-teal-500" />
            </div>
          )}
        </div>
      )}

      {!isInternalNoteOpen && replyTo && (
        <div
          className={cn(
            "mb-2 flex items-center gap-3 overflow-hidden rounded-lg border-l-4 bg-(--chat-reply-other-bg) px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(17,27,33,0.05)]",
            replyTo.from_me ? "border-(--chat-reply-me-border) text-(--chat-reply-me-border)" : "border-l-(--chat-reply-other-border) text-(--chat-reply-other-border)",
          )}
        >
          <Reply className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">Respondendo {replyTo.from_me ? "você" : getDisplayName(chat)}</p>
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

      {!isInternalNoteOpen && (
        <div className="flex min-h-10 flex-1 items-center gap-3">
          {isRecording ? (
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-secondary px-2 py-2 shadow-sm">
              <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground hover:text-red-500" onClick={onCancelRecording} disabled={isSending} aria-label="Cancelar gravação">
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
                onClick={onToggleRecordingPause}
                disabled={isSending}
                aria-label={isRecordingPaused ? "Retomar gravação" : "Pausar gravação"}
              >
                {isRecordingPaused ? <Mic className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </Button>

              <Button type="button" disabled={isSending} size="icon" className="shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600" onClick={onSendRecording} aria-label="Enviar áudio gravado">
                <Send className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <>
              <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={onOpenInternalNote} aria-label="Criar anotação interna">
                <PenLine className="h-5 w-5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={onStartRecording} disabled={isSending || !!attachment} aria-label="Gravar áudio">
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
                      Vídeos
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
                      Câmera
                    </DropdownMenuItem>
                    <DropdownMenuItem aria-disabled className={disabledAttachmentMenuItemClass} onSelect={(event) => event.preventDefault()}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                        <MapPin className="h-5 w-5 text-current" />
                      </span>
                      Localização
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
              <div className="relative flex flex-1 gap-2 items-center h-full">
                {isSignatureMode && !attachment && <span className="shrink-0 select-none rounded-md text-xs py-1.5 px-2 ml-2 bg-theme-primary text-theme-primary-fg font-bold">{userName}</span>}

                <Textarea
                  onKeyDown={handleKeyDown}
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  disabled={isSending}
                  placeholder={attachment ? "Legenda opcional" : "Digite uma mensagem..."}
                  className="flex-1 border-0 bg-input/50 rounded-md resize-none transition-[color,box-shadow] h-full min-h-0"
                />
              </div>
              <Popover open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-teal-500 hover:text-teal-600" disabled={isSending} aria-label="Agendar mensagem" title="Agendar mensagem">
                    <Clock className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" sideOffset={12} className="w-80 rounded-md border-border bg-card p-3 shadow-xl">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Agendar mensagem</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{attachment ? attachment.name : draft.trim() || "Mensagem"}</p>
                    </div>
                    <input
                      type="datetime-local"
                      value={scheduleDateTime}
                      onChange={(event) => setScheduleDateTime(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    {scheduleError && <p className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-500">{scheduleError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setIsScheduleOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="button" size="sm" className="bg-teal-500 text-white hover:bg-teal-600" onClick={handleScheduleSubmit} disabled={isScheduling}>
                        <CalendarClock className="h-4 w-4" />
                        Agendar
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button type="submit" disabled={isSending || (!draft.trim() && !attachment)} size="icon" className="shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600" aria-label="Enviar mensagem">
                {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </>
          )}
        </div>
      )}
    </form>
  );
}
