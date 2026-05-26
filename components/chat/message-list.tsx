"use client";

import { Button } from "@/components/ui/button";
import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest";
import { ArrowDown, MessageSquareText, Trash2 } from "lucide-react";
import type { RefObject, UIEvent } from "react";
import { MessageBubble } from "./message-bubble";
import { getDisplayName, getTimeLabel } from "./message-utils";

export type InternalNote = {
  id: string;
  chatId: string;
  content: string;
  createdAt: string;
  linkedMessageId?: string | null;
  linkedMessagePreview?: string | null;
  linkedMessageFromMe?: boolean | null;
};

export type TimelineItem = { kind: "message"; message: MessageRecord; timestamp: string | null } | { kind: "note"; note: InternalNote; timestamp: string | null };

export type MessageGroup = {
  date: string;
  items: TimelineItem[];
};

type MessageListProps = {
  chat: ChatRecord;
  groupedMessages: MessageGroup[];
  messagesByRemoteId: Map<string, MessageRecord>;
  selectedMessageIds: Set<string>;
  isSelectionMode: boolean;
  highlightedMessageId: string | null;
  isLoading?: boolean;
  isLoadingOlder?: boolean;
  hasMoreMessages?: boolean;
  error?: string;
  showScrollButton: boolean;
  scrollAreaRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  onMessagesScroll: (event: UIEvent<HTMLDivElement>) => void;
  onLoadOlderClick: () => Promise<void>;
  onScrollToLastMessage: () => void;
  onToggleSelection: (message: MessageRecord) => void;
  onReply: (message: MessageRecord) => void;
  onForward: (message: MessageRecord) => void;
  onDelete: (message: MessageRecord) => void;
  onCreateNote: (message: MessageRecord) => void;
  onDeleteNote: (noteId: string) => void;
  onExpandImage: (url: string, alt: string) => void;
  onScrollToMessage: (id: string) => void;
};

function InternalNoteBubble({ chat, note, onScrollToMessage, onDeleteNote }: { chat: ChatRecord; note: InternalNote; onScrollToMessage: (id: string) => void; onDeleteNote: (noteId: string) => void }) {
  return (
    <div id={`note-${note.id}`} className="mb-2 flex justify-center px-4">
      <div className="group relative w-full max-w-[74%] overflow-hidden rounded-sm border border-amber-300/70 bg-[#fff7a8] text-yellow-950 shadow-sm ring-1 ring-black/5 dark:border-amber-500/60 dark:bg-[#f8ec82] dark:text-yellow-950">
        <div className="flex items-center gap-2 border-b border-amber-300/55 bg-amber-200/35 px-3 py-1.5 text-xs">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700">
            <MessageSquareText className="h-3.5 w-3.5" />
          </span>
          <span className="font-semibold text-red-600">Pedro</span>
          <span className="text-yellow-950/55">anotação interna</span>
          <button
            type="button"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-yellow-950/45 opacity-0 transition hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100"
            onClick={() => onDeleteNote(note.id)}
            aria-label="Apagar anotação"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-3 py-2">
          {note.linkedMessageId && note.linkedMessagePreview && (
            <button
              type="button"
              className="mb-2 w-full rounded border-l-4 border-amber-500 bg-white/55 px-2.5 py-2 text-left text-xs text-yellow-950 transition-colors hover:bg-white/85"
              onClick={() => onScrollToMessage(note.linkedMessageId!)}
            >
              <span className="block truncate font-semibold">{note.linkedMessageFromMe ? "Você" : getDisplayName(chat)}</span>
              <span className="mt-0.5 line-clamp-2 text-yellow-950/70">{note.linkedMessagePreview}</span>
            </button>
          )}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note.content}</p>
          <div className="mt-2 flex justify-end text-[10px] text-yellow-950/60">
            <span>{getTimeLabel(note.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MessageList({
  chat,
  groupedMessages,
  messagesByRemoteId,
  selectedMessageIds,
  isSelectionMode,
  highlightedMessageId,
  isLoading,
  isLoadingOlder,
  hasMoreMessages,
  error,
  showScrollButton,
  scrollAreaRef,
  bottomRef,
  onMessagesScroll,
  onLoadOlderClick,
  onScrollToLastMessage,
  onToggleSelection,
  onReply,
  onForward,
  onDelete,
  onCreateNote,
  onDeleteNote,
  onExpandImage,
  onScrollToMessage,
}: MessageListProps) {
  return (
    <>
      <div
        ref={scrollAreaRef}
        className="relative flex-1 overflow-y-auto bg-theme-accent/10 bg-fixed"
        onScroll={onMessagesScroll}
        style={{
          backgroundImage: "url(/bgs/bgdefault.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "600px",
        }}
      >
        <div className="mx-auto flex min-h-full w-full flex-col px-6 py-4">
          {isLoading ? (
            <div className="shadow-x m-auto rounded-full border border-input/30 bg-input/20 px-4 py-2 text-sm shadow-sm backdrop-blur-[1px]">Carregando mensagens...</div>
          ) : error ? (
            <div className="m-auto max-w-md rounded-full bg-red-400/30 px-4 py-3 text-sm text-red-500 shadow-sm backdrop-blur-[1px]">{error}</div>
          ) : groupedMessages.length === 0 ? (
            <div className="shadow-x m-auto rounded-full border border-input/30 bg-input/20 px-4 py-2 text-sm text-foreground/75 shadow-sm backdrop-blur-[1px]">Esta conversa ainda não tem mensagens visíveis.</div>
          ) : (
            <>
              <div className="mb-2 flex justify-center">
                {hasMoreMessages ? (
                  <Button variant="ghost" className="h-8 bg-(--chat-muted)/70 px-3 text-xs text-(--chat-muted-foreground) shadow-sm hover:bg-(--chat-muted)" disabled={isLoadingOlder} onClick={onLoadOlderClick}>
                    {isLoadingOlder ? "Carregando mensagens antigas..." : "Carregar mensagens antigas"}
                  </Button>
                ) : (
                  <span className="rounded bg-(--chat-muted)/70 px-3 py-1 text-xs text-(--chat-muted-foreground) shadow-sm">Inicio do historico carregado</span>
                )}
              </div>

              {groupedMessages.map((group) => (
                <div key={group.date}>
                  <div className="my-3 flex justify-center">
                    <span className="rounded bg-(--chat-other)/80 px-3 py-1 text-xs text-(--chat-muted-foreground) shadow-sm">{group.date}</span>
                  </div>

                  {group.items.map((item) =>
                    item.kind === "note" ? (
                      <InternalNoteBubble key={item.note.id} chat={chat} note={item.note} onScrollToMessage={onScrollToMessage} onDeleteNote={onDeleteNote} />
                    ) : (
                      <MessageBubble
                        key={item.message.id}
                        message={item.message}
                        chat={chat}
                        messagesByRemoteId={messagesByRemoteId}
                        selected={selectedMessageIds.has(item.message.id)}
                        isSelectionMode={isSelectionMode}
                        isHighlighted={highlightedMessageId === item.message.id}
                        onToggleSelection={onToggleSelection}
                        onReply={onReply}
                        onForward={onForward}
                        onDelete={onDelete}
                        onCreateNote={onCreateNote}
                        onExpandImage={onExpandImage}
                        onScrollToMessage={onScrollToMessage}
                      />
                    ),
                  )}
                </div>
              ))}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {showScrollButton && (
        <Button size="icon" variant="outline" onClick={onScrollToLastMessage} className="absolute bottom-18 left-1/2 -translate-x-2/3 rounded-full backdrop-blur-sm transition-all active:scale-95 animate-in fade-in zoom-in-95">
          <ArrowDown className="h-4 w-4 stroke-[2.5]" />
        </Button>
      )}
    </>
  );
}
