"use client";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest";
import { getMentionLabel, getMentionSlug } from "@/lib/user-mentions";
import type { MentionableUser } from "@/lib/user-roles";
import { cn } from "@/lib/utils";
import { Camera, Check, FileImage, FileText, Loader2, MapPin, Mic, Paperclip, Pause, Pin, Reply, Send, StickyNote, Trash2, UserRound, Video, X } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import { useMemo } from "react";
import { Textarea } from "../ui/textarea";
import { getAttachmentLabel } from "./chat-attachment-utils";
import { formatTime, getDisplayName, getMediaKind, getMessagePreviewText } from "./message-utils";
import { ScheduleMessagePopover } from "./schedule-message-popover";

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
  isSignatureMode,
  onScheduleMessage,
}: ChatComposerProps) {
  const mentionMatch = noteDraft.match(/(^|\s)@([\p{L}\p{N}._-]*)$/u);
  const mentionQuery = mentionMatch?.[2] ?? "";

  const isMobile = useIsMobile();
  const canSend = !!draft.trim() || !!attachment;

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

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col border-t border-border bg-card px-4 py-3">
      {isInternalNoteOpen && (
        <div className="flex h-full w-full md:w-2/3 lg:w-1/2 flex-col bg-background/50 p-4 min-h-0 rounded-lg">
          <div className="mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-yellow-300 rotate-45" />
              <p className="text-sm font-semibold text-foreground">Anotação Interna</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Esta anotação não é visível para o cliente.</p>
          </div>

          {noteLinkedMessage && (
            <div className="mb-3 max-w-2xl shrink-0 border-l-2 border-yellow-300 bg-yellow-500/10 backdrop-blur-sm px-3 py-2 rounded-r-md text-xs text-foreground/90">
              <p className="font-medium text-yellow-400 ">Vinculada a uma mensagem</p>
              <p className="mt-0.5 line-clamp-1 italic text-muted-foreground">{noteLinkedMessage.content}</p>
            </div>
          )}

          <div className="relative flex-1 min-h-0 w-full">
            <div
              className="group relative flex-1 h-full w-full rounded-sm border border-border bg-input/30 transition-all focus-within:border-yellow-300/40"
              style={{
                clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)",
              }}
            >
              <div
                className=" absolute top-0 right-0 h-4 w-4 pointer-events-none border-l border-b border-border transition-all group-focus-within:bg-yellow-300/20 group-focus-within:border-yellow-300/40"
                style={{
                  clipPath: "polygon(0 0, 100% 100%, 0 100%)",
                }}
              />
              <textarea
                value={noteDraft}
                onChange={(event) => onNoteDraftChange(event.target.value)}
                className="h-full w-full resize-none bg-transparent px-3.5 py-3 pr-6 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                placeholder="Digite a anotação interna... Use @ para mencionar alguém."
              />
            </div>
            {mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm shadow-xl backdrop-blur-md">
                {mentionSuggestions.map((user) => (
                  <button key={user.email} type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-foreground transition hover:bg-accent" onClick={() => insertMention(user)}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-600 dark:text-amber-400">{getMentionLabel(user).charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-xs">@{getMentionLabel(user)}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{user.email}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-end gap-2 border-t border-border/60 pt-3 shrink-0">
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5 transition-colors" onClick={onCloseInternalNote}>
              <X className="h-3.5 w-3.5" />
              Cancelar
            </Button>

            <Button
              type="button"
              size="sm"
              className="bg-amber-300 text-black hover:bg-amber-300/80 font-medium gap-1.5 shadow-sm shadow-amber-500/10 transition-all disabled:opacity-50"
              onClick={onSaveInternalNote}
              disabled={!noteDraft.trim()}
            >
              <Check className="h-3.5 w-3.5" />
              Salvar Nota
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
              {!isMobile && (
                <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-yellow-300" onClick={onOpenInternalNote} aria-label="Criar anotação interna">
                  <StickyNote className="h-5 w-5" />
                </Button>
              )}
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
              {!isMobile ? (
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
              ) : (
                <ScheduleMessagePopover canSend={canSend} isSending={isSending} attachment={attachment} draft={draft} onScheduleMessage={onScheduleMessage} />
              )}
              <div className="relative flex flex-1 gap-2 items-center h-full">
                {isSignatureMode && !attachment && <span className="shrink-0 select-none rounded-md text-xs py-1.5 px-2 ml-2 bg-theme-primary text-theme-primary-fg font-bold">{userName}</span>}

                <Textarea
                  onKeyDown={handleKeyDown}
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  disabled={isSending}
                  placeholder={attachment ? "Legenda opcional" : "Digite uma mensagem..."}
                  className={cn("flex-1 border-0 bg-input/50 resize-none transition-[color,box-shadow] h-full w-0 min-h-0", isMobile ? "rounded-[20px] pr-7" : "rounded-md")}
                />
                {isMobile && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="absolute right-0">
                      <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Anexar arquivo">
                        <Paperclip className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" sideOffset={12} className="w-[300px] rounded-lg border-border bg-card p-3 shadow-xl">
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
                        {isMobile && (
                          <>
                            <DropdownMenuItem aria-disabled className={attachmentMenuItemClass} onClick={onOpenInternalNote}>
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500  text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                                <StickyNote className="h-5 w-5 text-current" />
                              </span>
                              Anotação
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem aria-disabled className={disabledAttachmentMenuItemClass} onSelect={(event) => event.preventDefault()}>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                            <MapPin className="h-5 w-5 text-current" />
                          </span>
                          Localização
                        </DropdownMenuItem>
                        <DropdownMenuItem aria-disabled className={disabledAttachmentMenuItemClass} onSelect={(event) => event.preventDefault()}>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-black shadow-sm ring-1 ring-black/10 dark:text-white dark:ring-white/15">
                            <UserRound className="h-5 w-5 text-current" />
                          </span>
                          Contato
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {!isMobile && <ScheduleMessagePopover isSending={isSending} attachment={attachment} draft={draft} onScheduleMessage={onScheduleMessage} canSend={canSend} />}

              {canSend ? (
                <Button type="submit" disabled={isSending} size="icon" className="h-10 w-10 shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600" aria-label="Enviar mensagem">
                  {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </Button>
              ) : (
                <Button type="button" disabled={isSending} size="icon" className="h-10 w-10 shrink-0 rounded-full bg-input/30 text-foreground/50 hover:bg-input/80 hover:text-foreground" onClick={onStartRecording} aria-label="Gravar áudio">
                  <Mic className="h-5 w-5" />
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}
