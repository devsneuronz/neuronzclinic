"use client";

import { ContactDetails } from "@/components/contact-details/contact-details";
import { ChatWindow } from "@/components/chat/chat-window";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  fetchChats,
  fetchMessages,
  deleteMessages,
  forwardMessages,
  sendMessage,
  updateChatDetails,
  type ChatRecord,
  type MessageRecord,
} from "@/lib/supabase-rest";
import type { Task } from "@/lib/task";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatOptions } from "@/hooks/use-chat-options";
import { useSignatureMode } from "@/hooks/use-signature-mode";
import { CHAT_INTEREST_FIELD_CANDIDATES, getChatTags, getChatInterestTags, type ChatTag } from "@/lib/chat-tags";
import type { ChatStatusOption } from "@/lib/chat-status";
import type { ContactInfoValues } from "@/components/contact-details/profile-view";

const MESSAGE_PAGE_SIZE = 50;

interface TaskChatDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forwardTargets: ChatRecord[];
}

function getTimestampValue(value?: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getMessageKeys(message: MessageRecord) {
  return [message.id, message.message_id].filter(Boolean) as string[];
}

function sortMessagesByTimestamp(messages: MessageRecord[]) {
  return [...messages].sort((a, b) => getTimestampValue(a.timestamp_msg) - getTimestampValue(b.timestamp_msg));
}

function mergeMessages(currentMessages: MessageRecord[], incomingMessages: MessageRecord[]) {
  const mergedMessages: MessageRecord[] = [];
  const keyToIndex = new Map<string, number>();

  for (const message of [...currentMessages, ...incomingMessages]) {
    const keys = getMessageKeys(message);
    const existingIndex = keys.map((key) => keyToIndex.get(key)).find((index) => index !== undefined);

    if (existingIndex === undefined) {
      const nextIndex = mergedMessages.length;
      mergedMessages.push(message);
      keys.forEach((key) => keyToIndex.set(key, nextIndex));
      continue;
    }

    mergedMessages[existingIndex] = { ...mergedMessages[existingIndex], ...message };
    getMessageKeys(mergedMessages[existingIndex]).forEach((key) => keyToIndex.set(key, existingIndex));
  }

  return sortMessagesByTimestamp(mergedMessages);
}

function getOptimisticMessageType(file: File | null) {
  if (!file) return "conversation";
  if (file.type.startsWith("image/")) return "imageMessage";
  if (file.type.startsWith("audio/")) return "audioMessage";
  if (file.type.startsWith("video/")) return "videoMessage";
  return "documentMessage";
}

function getOptimisticMessage(chatId: string, text: string, file: File | null, replyTo?: MessageRecord) {
  const optimisticId = `optimistic-${crypto.randomUUID()}`;
  const localMediaUrl = file ? URL.createObjectURL(file) : null;

  const message: MessageRecord = {
    id: optimisticId,
    message_id: optimisticId,
    from_me: true,
    chat_id: chatId,
    participant: null,
    message_type: getOptimisticMessageType(file),
    content: text || (file ? file.name : ""),
    media_url: null,
    media_path: null,
    media_mime_type: file?.type || null,
    public_media_url: localMediaUrl,
    public_midia_thumb: null,
    timestamp_msg: new Date().toISOString(),
    status: "sending",
    quoted_message_id: replyTo ? replyTo.message_id || replyTo.id : null,
    quoted_content: replyTo?.content || null,
    quoted_from_me: replyTo?.from_me ?? null,
    quoted_message_type: replyTo?.message_type ?? null,
  };

  return { message, localMediaUrl };
}

function getStatusFields(chat: ChatRecord, status: ChatStatusOption) {
  const normalizedStatus = status.label.toLowerCase();

  return {
    Status_chat: status.label,
    hex_status: status.color || chat.hex_status,
    finalizada: normalizedStatus === "finalizada" ? true : normalizedStatus === "aberta" ? false : chat.finalizada,
  };
}

function getTagKey(tag: ChatTag) {
  return tag.id || tag.label;
}

export function TaskChatDialog({ task, open, onOpenChange, forwardTargets }: TaskChatDialogProps) {
  const [chat, setChat] = useState<ChatRecord | undefined>();
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [error, setError] = useState<string>();

  const { statusOptions, tagOptions, interestOptions, error: chatOptionsError } = useChatOptions(forwardTargets);
  const { isSignatureMode: effectiveSignatureMode } = useSignatureMode();

  useEffect(() => {
    if (chatOptionsError) setError(chatOptionsError);
  }, [chatOptionsError]);

  const chatId = task?.patientChatId || "";

  const knownChat = useMemo(() => {
    if (!chatId) return undefined;
    return forwardTargets.find((candidate) => candidate.chat_id === chatId || candidate.id === chatId);
  }, [chatId, forwardTargets]);

  const loadLatestMessages = useCallback(async (targetChatId: string) => {
    const data = await fetchMessages(targetChatId, { limit: MESSAGE_PAGE_SIZE, offset: 0 });
    setMessages(mergeMessages([], data));
    setHasMoreMessages(data.length === MESSAGE_PAGE_SIZE);
  }, []);

  useEffect(() => {
    if (!open || !chatId) return;

    let isCurrent = true;
    queueMicrotask(() => {
      if (!isCurrent) return;
      setChat(knownChat);
      setMessages([]);
      setError(undefined);
      setShowDetails(true);
      setIsLoadingChat(!knownChat);
      setIsLoadingMessages(true);
    });

    const loadChat = knownChat
      ? Promise.resolve(knownChat)
      : fetchChats({ limit: 1, offset: 0, search: chatId }).then((results) => results.find((candidate) => candidate.chat_id === chatId || candidate.id === chatId) || results[0]);

    loadChat
      .then(async (loadedChat) => {
        if (!isCurrent) return;
        if (!loadedChat) {
          throw new Error("Nao foi possivel encontrar o chat deste paciente.");
        }

        setChat(loadedChat);
        await loadLatestMessages(loadedChat.chat_id);
      })
      .catch((err) => {
        if (!isCurrent) return;
        setError(err instanceof Error ? err.message : "Nao foi possivel abrir o chat do paciente.");
      })
      .finally(() => {
        if (!isCurrent) return;
        setIsLoadingChat(false);
        setIsLoadingMessages(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [chatId, knownChat, loadLatestMessages, open]);

  const loadOlderMessages = useCallback(async () => {
    if (!chat?.chat_id || isLoadingOlderMessages || !hasMoreMessages) return 0;

    setIsLoadingOlderMessages(true);
    try {
      const data = await fetchMessages(chat.chat_id, { limit: MESSAGE_PAGE_SIZE, offset: messages.length });
      setMessages((current) => mergeMessages(data, current));
      setHasMoreMessages(data.length === MESSAGE_PAGE_SIZE);
      return data.length;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar mensagens anteriores.");
      return 0;
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [chat, hasMoreMessages, isLoadingOlderMessages, messages.length]);

  const handleSend = useCallback(
    async ({ text, file, replyTo }: { text: string; file: File | null; replyTo?: MessageRecord }) => {
      if (!chat?.chat_id) return;

      const { message, localMediaUrl } = getOptimisticMessage(chat.chat_id, text, file, replyTo);
      setMessages((current) => mergeMessages(current, [message]));
      setError(undefined);

      try {
        await sendMessage({ chatId: chat.chat_id, text, file, replyTo });
        await loadLatestMessages(chat.chat_id);
        window.setTimeout(() => void loadLatestMessages(chat.chat_id), 2500);
        window.setTimeout(() => void loadLatestMessages(chat.chat_id), 7000);
      } catch (err) {
        setMessages((current) => current.map((currentMessage) => (currentMessage.id === message.id ? { ...currentMessage, status: "error" } : currentMessage)));
        setError(err instanceof Error ? err.message : "Nao foi possivel enviar a mensagem.");
        throw err;
      } finally {
        if (localMediaUrl) window.setTimeout(() => URL.revokeObjectURL(localMediaUrl), 60000);
      }
    },
    [chat, loadLatestMessages],
  );

  const handleForwardMessages = useCallback(async ({ messages: messagesToForward, targetChatId }: { messages: MessageRecord[]; targetChatId: string }) => {
    await forwardMessages({ messages: messagesToForward, targetChatId });
    if (targetChatId === chat?.chat_id) {
      await loadLatestMessages(targetChatId);
    }
  }, [chat, loadLatestMessages]);

  const handleDeleteMessages = useCallback(async (messagesToDelete: MessageRecord[]) => {
    if (!chat?.chat_id || messagesToDelete.length === 0) return;

    const previousMessages = messages;
    setMessages((current) => current.filter((message) => !messagesToDelete.some((messageToDelete) => messageToDelete.id === message.id)));

    try {
      await deleteMessages({ chatId: chat.chat_id, messages: messagesToDelete });
      await loadLatestMessages(chat.chat_id);
    } catch (err) {
      setMessages(previousMessages);
      setError(err instanceof Error ? err.message : "Nao foi possivel apagar a mensagem.");
      throw err;
    }
  }, [chat, loadLatestMessages, messages]);

  const handleToggleStatus = useCallback(async () => {
    if (!chat) return;
    const nextFinalizada = !chat.finalizada;
    const previousChat = chat;
    setChat((current) => current ? { ...current, finalizada: nextFinalizada } : current);
    setError(undefined);
    try {
      await updateChatDetails({ id: chat.id, finalizada: nextFinalizada });
    } catch (err) {
      setChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível alternar o status do chat.");
    }
  }, [chat]);

  const handleToggleIA = useCallback(async () => {
    if (!chat) return;
    const nextIA = !chat.ia_responde;
    const previousChat = chat;
    setChat((current) => current ? { ...current, ia_responde: nextIA } : current);
    setError(undefined);
    try {
      await updateChatDetails({ id: chat.id, ia_responde: nextIA });
    } catch (err) {
      setChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível alternar a IA para este contato.");
    }
  }, [chat]);

  const handleChangeStatus = useCallback(async (status: ChatStatusOption) => {
    if (!chat) return;
    const updatePatch = getStatusFields(chat, status);
    const previousChat = chat;
    setChat((current) => current ? { ...current, ...updatePatch } : current);
    setError(undefined);
    try {
      await updateChatDetails({ id: chat.id, ...updatePatch });
    } catch (err) {
      setChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o status do contato.");
    }
  }, [chat]);

  const handleToggleTag = useCallback(async (tag: ChatTag) => {
    if (!chat) return;
    const currentTags = getChatTags(chat);
    const tagKey = getTagKey(tag);
    const hasTag = currentTags.some((t) => getTagKey(t) === tagKey);
    const nextTags = hasTag ? currentTags.filter((t) => getTagKey(t) !== tagKey) : [...currentTags, tag];
    const previousChat = chat;
    setChat((current) => current ? {
      ...current,
      json_tags: nextTags,
      json_tags_parsed: nextTags,
      tag_chat_array: nextTags,
    } : current);
    setError(undefined);
    try {
      await updateChatDetails({ id: chat.id, tags: nextTags });
    } catch (err) {
      setChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível salvar as tags do contato.");
    }
  }, [chat]);

  const handleToggleInterest = useCallback(async (interest: ChatTag) => {
    if (!chat) return;
    const currentInterests = getChatInterestTags(chat);
    const interestKey = getTagKey(interest);
    const hasInterest = currentInterests.some((i) => getTagKey(i) === interestKey);
    const nextInterests = hasInterest ? currentInterests.filter((i) => getTagKey(i) !== interestKey) : [...currentInterests, interest];
    const interestPatch = CHAT_INTEREST_FIELD_CANDIDATES.reduce<Record<string, ChatTag[]>>((patch, field) => {
      patch[field] = nextInterests;
      return patch;
    }, {});
    const previousChat = chat;
    setChat((current) => current ? { ...current, ...interestPatch } : current);
    setError(undefined);
    try {
      await updateChatDetails({ id: chat.id, interestTags: nextInterests });
    } catch (err) {
      setChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível salvar os interesses do contato.");
    }
  }, [chat]);

  const handleChangeName = useCallback(async (name: string) => {
    if (!chat) return;
    const nextName = name.trim();
    const previousChat = chat;
    setChat((current) => current ? { ...current, nome_contato: nextName } : current);
    setError(undefined);
    try {
      await updateChatDetails({ id: chat.id, nome_contato: nextName });
    } catch (err) {
      setChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível salvar o nome do contato.");
    }
  }, [chat]);

  const handleChangeContactInfo = useCallback(async (info: ContactInfoValues) => {
    if (!chat) return;
    const previousChat = chat;
    setChat((current) => current ? { ...current, ...info } : current);
    setError(undefined);
    try {
      await updateChatDetails({ id: chat.id, ...info });
    } catch (err) {
      setChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível salvar os detalhes do contato.");
    }
  }, [chat]);

  const handleReorderTags = useCallback((tags: ChatTag[]) => {
    if (!chat) return;
    setChat((current) => current ? {
      ...current,
      json_tags: tags,
      json_tags_parsed: tags,
      tag_chat_array: tags,
    } : current);
  }, [chat]);

  const handleCommitTagOrder = useCallback(async (tags: ChatTag[]) => {
    if (!chat) return;
    const previousChat = chat;
    setError(undefined);
    try {
      await updateChatDetails({ id: chat.id, tags });
    } catch (err) {
      setChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível salvar a ordem das tags.");
    }
  }, [chat]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-h-[92vh] w-[min(1280px,96vw)] max-w-none overflow-hidden p-0">
        <DialogTitle className="sr-only">Chat do paciente</DialogTitle>
        {isLoadingChat && !chat ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-theme-primary" />
            Carregando chat
          </div>
        ) : (
          <div className="flex h-full min-h-0 bg-background">
            <div className="min-w-0 flex-1">
              <ChatWindow
                chat={chat}
                messages={messages}
                isLoading={isLoadingMessages}
                isLoadingOlder={isLoadingOlderMessages}
                hasMoreMessages={hasMoreMessages}
                onLoadOlderMessages={loadOlderMessages}
                onCloseChat={() => onOpenChange(false)}
                onSendMessage={({ text, file }) => handleSend({ text, file })}
                onReplyMessage={({ text, file, replyTo }) => handleSend({ text, file, replyTo })}
                onForwardMessage={({ message, targetChatId }) => handleForwardMessages({ messages: [message], targetChatId })}
                onForwardMessages={handleForwardMessages}
                onDeleteMessage={(message) => handleDeleteMessages([message])}
                onDeleteMessages={handleDeleteMessages}
                forwardTargets={forwardTargets}
                error={error}
                onToggleDetails={() => setShowDetails((current) => !current)}
                isDetailsOpen={showDetails}
                onToggleStatus={handleToggleStatus}
                isSignatureMode={effectiveSignatureMode}
                onOpenIATraining={() => setShowDetails(true)}
              />
            </div>

            {chat && showDetails ? (
              <aside className="hidden h-full w-[360px] shrink-0 border-l bg-(--chat-card) lg:block">
                <ContactDetails
                  chat={chat}
                  onClose={() => setShowDetails(false)}
                  onToggleStatus={handleToggleStatus}
                  onToggleIA={handleToggleIA}
                  statusOptions={statusOptions}
                  tagOptions={tagOptions}
                  interestOptions={interestOptions}
                  onChangeStatus={handleChangeStatus}
                  onToggleTag={handleToggleTag}
                  onToggleInterest={handleToggleInterest}
                  onChangeName={handleChangeName}
                  onChangeContactInfo={handleChangeContactInfo}
                  onReorderTags={handleReorderTags}
                  onCommitTagOrder={handleCommitTagOrder}
                />
              </aside>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
