"use client";

import { Button } from "@/components/ui/button";
import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest";
import { ArrowDown } from "lucide-react";
import type { RefObject, UIEvent } from "react";
import { MessageBubble } from "./message-bubble";

type MessageGroup = {
  date: string;
  items: MessageRecord[];
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
  onExpandImage: (url: string, alt: string) => void;
  onScrollToMessage: (id: string) => void;
};

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
  onExpandImage,
  onScrollToMessage,
}: MessageListProps) {
  return (
    <>
      <div
        ref={scrollAreaRef}
        className="relative flex-1 overflow-y-auto bg-theme-accent/10"
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
            <div className="shadow-x m-auto rounded-full border border-input/30 bg-input/20 px-4 py-2 text-sm text-foreground/75 shadow-sm backdrop-blur-[1px]">Esta conversa ainda nao tem mensagens visiveis.</div>
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

                  {group.items.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      chat={chat}
                      messagesByRemoteId={messagesByRemoteId}
                      selected={selectedMessageIds.has(message.id)}
                      isSelectionMode={isSelectionMode}
                      isHighlighted={highlightedMessageId === message.id}
                      onToggleSelection={onToggleSelection}
                      onReply={onReply}
                      onForward={onForward}
                      onDelete={onDelete}
                      onExpandImage={onExpandImage}
                      onScrollToMessage={onScrollToMessage}
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
        <Button size="icon" variant="outline" onClick={onScrollToLastMessage} className="absolute bottom-18 left-1/2 -translate-x-2/3 rounded-full backdrop-blur-sm transition-all active:scale-95 animate-in fade-in zoom-in-95">
          <ArrowDown className="h-4 w-4 stroke-[2.5]" />
        </Button>
      )}
    </>
  );
}
