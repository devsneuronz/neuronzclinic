"use client";

import { ChatWindow } from "@/components/chat/chat-window";
import { ContactList } from "@/components/chat/contact-list";
import { ContactDetails } from "@/components/contact-details/contact-details";
import type { ContactInfoValues } from "@/components/contact-details/profile-view";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getChatStatusColor, getChatStatusLabel, type ChatStatusOption } from "@/lib/chat-status";
import { getChatTags, type ChatTag } from "@/lib/chat-tags";
import { createSupabaseRealtimeSubscription, type SupabasePostgresChangePayload } from "@/lib/supabase-realtime";
import {
  ChatRecord,
  deleteMessage,
  deleteMessages,
  fetchChats,
  fetchLatestMessagesForChats,
  fetchLatestMessageStatuses,
  fetchMessages,
  forwardMessage,
  forwardMessages,
  LatestChatMessage,
  LatestMessageStatus,
  markChatAsRead,
  MessageRecord,
  sendMessage,
  updateChatDetails,
} from "@/lib/supabase-rest";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

const CHAT_PAGE_SIZE = 50;
const MESSAGE_PAGE_SIZE = 50;
const CHAT_SYNC_INTERVAL_MS = 5000;
const MESSAGE_SYNC_INTERVAL_MS = 2500;
const LAST_OPEN_CHAT_STORAGE_KEY = "neuronzclinic:last-open-chat-id";
const MEDIA_PREVIEW_LABELS = new Set(["Foto", "Vídeo", "Áudio", "Figurinha", "Documento"]);
const EMPTY_MESSAGES: MessageRecord[] = [];

type ChatPreviewMessage = Pick<LatestChatMessage, "content" | "media_mime_type" | "message_type" | "timestamp_msg" | "from_me">;

function getOptimisticMessageType(file: File | null) {
  if (!file) return "text";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

function getMediaPreviewLabel(message: Pick<LatestChatMessage, "media_mime_type" | "message_type">) {
  const type = `${message.media_mime_type || ""} ${message.message_type || ""}`.toLowerCase();
  if (type.includes("image")) return "Foto";
  if (type.includes("video")) return "Vídeo";
  if (type.includes("audio")) return "Áudio";
  if (type.includes("sticker")) return "Figurinha";
  if (type.includes("document")) return "Documento";
  if (type.includes("file") || type.includes("application/")) return "Documento";

  return "";
}

function getMessagePreviewText(message: MessageRecord) {
  if (message.content?.trim()) return message.content.trim();
  return getMediaPreviewLabel(message) || "Mensagem";
}

function getTimestampValue(value?: string | null) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getPhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeNewContactChatId(phone: string) {
  const trimmedPhone = phone.trim();

  if (trimmedPhone.includes("@")) return trimmedPhone;

  const digits = getPhoneDigits(trimmedPhone).replace(/^0+/, "");
  const normalizedDigits = digits.startsWith("55") || (digits.length !== 10 && digits.length !== 11) ? digits : `55${digits}`;

  if (normalizedDigits.length < 8) {
    throw new Error("Informe um telefone válido.");
  }

  return `${normalizedDigits}@s.whatsapp.net`;
}

function getNewContactSearchTerms(phone: string, chatId: string) {
  const phoneDigits = getPhoneDigits(phone);
  const chatDigits = getPhoneDigits(chatId);
  const localDigits = chatDigits.startsWith("55") ? chatDigits.slice(2) : chatDigits;

  return Array.from(new Set([phoneDigits, chatDigits, localDigits, chatId].filter(Boolean)));
}

function chatMatchesNewContact(chat: ChatRecord, phone: string, chatId: string) {
  const phoneDigits = getPhoneDigits(phone);
  const chatDigits = getPhoneDigits(chatId);
  const candidateDigits = getPhoneDigits(`${chat.chat_id || ""} ${chat.phone_contact || ""}`);

  return chat.chat_id === chatId || (!!chatDigits && candidateDigits.includes(chatDigits)) || (!!phoneDigits && candidateDigits.includes(phoneDigits));
}

function sortChatsByLatestMessage(chatList: ChatRecord[]) {
  return [...chatList].sort((a, b) => getTimestampValue(b.last_message_time) - getTimestampValue(a.last_message_time));
}

function sortMessagesByTimestamp(messageList: MessageRecord[]) {
  return [...messageList].sort((a, b) => getTimestampValue(a.timestamp_msg) - getTimestampValue(b.timestamp_msg));
}

function isMediaPreviewText(value?: string | null) {
  return MEDIA_PREVIEW_LABELS.has(value?.trim() ?? "");
}

function mergeMessages(currentMessages: MessageRecord[], incomingMessages: MessageRecord[]) {
  const realIncomingMessages = incomingMessages.filter((message) => !message.id.startsWith("optimistic-"));
  const filteredCurrentMessages = currentMessages.filter((message) => {
    if (!message.id.startsWith("optimistic-")) return true;
    return !realIncomingMessages.some((incomingMessage) => isMatchingSentMessage(incomingMessage, message));
  });

  const mergedMessages: MessageRecord[] = [];
  const keyToIndex = new Map<string, number>();

  for (const message of [...filteredCurrentMessages, ...incomingMessages]) {
    const keys = getMessageKeys(message);
    const existingIndex = keys.map((key) => keyToIndex.get(key)).find((index) => index !== undefined);

    if (existingIndex === undefined) {
      const nextIndex = mergedMessages.length;
      mergedMessages.push(message);
      keys.forEach((key) => keyToIndex.set(key, nextIndex));
      continue;
    }

    const nextMessage = { ...mergedMessages[existingIndex], ...message };
    const nextKeys = new Set([...getMessageKeys(mergedMessages[existingIndex]), ...keys]);
    mergedMessages[existingIndex] = nextMessage;
    nextKeys.forEach((key) => keyToIndex.set(key, existingIndex));
  }

  return sortMessagesByTimestamp(mergedMessages);
}

function getMessageKeys(message: MessageRecord) {
  return [message.id, message.message_id].filter(Boolean) as string[];
}

function getIncomingReadMessages(messageList: MessageRecord[]) {
  return messageList.filter((message) => !message.from_me && !message.id.startsWith("optimistic-") && (message.message_id || message.id));
}

function getLatestIncomingMessageKey(messageList: MessageRecord[]) {
  for (let index = messageList.length - 1; index >= 0; index--) {
    const message = messageList[index];
    if (!message.from_me && (message.message_id || message.id)) {
      return message.message_id || message.id;
    }
  }

  return "";
}

function countNewIncomingMessages(currentMessages: MessageRecord[], incomingMessages: MessageRecord[]) {
  const knownKeys = new Set(currentMessages.flatMap(getMessageKeys));

  return incomingMessages.filter((message) => {
    if (message.from_me) return false;
    const keys = getMessageKeys(message);
    return keys.length > 0 && keys.every((key) => !knownKeys.has(key));
  }).length;
}

function mergeChats(currentChats: ChatRecord[], incomingChats: ChatRecord[]) {
  const indexedChats = new Map(currentChats.map((chat) => [chat.id, chat]));

  for (const chat of incomingChats) {
    const currentChat = indexedChats.get(chat.id);
    const currentLastMessageTime = getTimestampValue(currentChat?.last_message_time);
    const incomingLastMessageTime = getTimestampValue(chat.last_message_time);
    const shouldKeepCurrentLatestMessage =
      !!currentChat &&
      currentLastMessageTime > 0 &&
      (currentLastMessageTime > incomingLastMessageTime || (currentLastMessageTime === incomingLastMessageTime && isMediaPreviewText(currentChat.text_last_message) && !isMediaPreviewText(chat.text_last_message)));

    if (chat.archived) {
      indexedChats.delete(chat.id);
      continue;
    }

    const mergedChat = {
      ...(currentChat ?? {}),
      ...chat,
      text_last_message: chat.text_last_message || currentChat?.text_last_message || null,
      unread_count: chat.unread_count ?? currentChat?.unread_count ?? null,
    };

    indexedChats.set(
      chat.id,
      shouldKeepCurrentLatestMessage
        ? {
            ...mergedChat,
            text_last_message: currentChat.text_last_message,
            last_message_time: currentChat.last_message_time,
            last_time_formatado: currentChat.last_time_formatado,
            last_message_fromMe: currentChat.last_message_fromMe,
          }
        : mergedChat,
    );
  }

  return sortChatsByLatestMessage(Array.from(indexedChats.values()));
}

function getLatestMessageForPreview<T extends ChatPreviewMessage>(messages: T[]) {
  return messages.reduce<T | undefined>((latestMessage, message) => {
    if (!latestMessage) return message;

    const messageTime = getTimestampValue(message.timestamp_msg);
    const latestTime = getTimestampValue(latestMessage.timestamp_msg);

    if (messageTime > latestTime) return message;
    if (messageTime < latestTime) return latestMessage;

    const messageHasMedia = !!getMediaPreviewLabel(message);
    const latestHasMedia = !!getMediaPreviewLabel(latestMessage);

    if (messageHasMedia && !latestHasMedia) return message;
    return latestMessage;
  }, undefined);
}

function getLatestChatMessagePreviewText(message: Pick<LatestChatMessage, "content" | "media_mime_type" | "message_type">) {
  const mediaPreview = getMediaPreviewLabel(message);
  if (mediaPreview) return mediaPreview;
  if (message.content?.trim()) return message.content.trim();

  return "Mensagem";
}

function updateChatPreview(chat: ChatRecord, message: ChatPreviewMessage) {
  if (!message.timestamp_msg || getTimestampValue(message.timestamp_msg) < getTimestampValue(chat.last_message_time)) {
    return chat;
  }

  return {
    ...chat,
    text_last_message: getLatestChatMessagePreviewText(message),
    last_message_time: message.timestamp_msg,
    last_message_fromMe: message.from_me,
  };
}

function updateChatPreviewFromMessages(chat: ChatRecord, messages: MessageRecord[]) {
  const latestMessage = getLatestMessageForPreview(messages);
  return latestMessage ? updateChatPreview(chat, latestMessage) : chat;
}

function updateChatUnreadCount(chat: ChatRecord, newIncomingCount: number, shouldMarkAsRead: boolean) {
  if (shouldMarkAsRead) {
    return {
      ...chat,
      unread_count: 0,
    };
  }

  if (newIncomingCount === 0) return chat;

  return {
    ...chat,
    unread_count: (chat.unread_count ?? 0) + newIncomingCount,
  };
}

function isMatchingSentMessage(message: MessageRecord, optimisticMessage: MessageRecord) {
  if (!message.from_me || !message.timestamp_msg || !optimisticMessage.timestamp_msg) return false;

  const messageTime = new Date(message.timestamp_msg).getTime();
  const optimisticTime = new Date(optimisticMessage.timestamp_msg).getTime();
  const isNearOptimisticTime = messageTime >= optimisticTime - 10000;

  if (!isNearOptimisticTime) return false;

  if (optimisticMessage.media_url || optimisticMessage.public_media_url) {
    return message.message_type === optimisticMessage.message_type || !!message.media_url || !!message.public_media_url;
  }

  const cleanContent = (text: string | null | undefined) => {
    if (!text) return "";
    return text.replace(/\r\n/g, "\n").trim();
  };

  return cleanContent(message.content) === cleanContent(optimisticMessage.content);
}

function hasFreshLatestStatus(chat: ChatRecord, latestStatus?: LatestMessageStatus) {
  if (!latestStatus) return false;
  if (!chat.last_message_time) return true;
  if (!latestStatus.timestamp_msg) return false;

  const chatMessageTime = Date.parse(chat.last_message_time);
  const statusMessageTime = Date.parse(latestStatus.timestamp_msg);

  if (!Number.isFinite(chatMessageTime) || !Number.isFinite(statusMessageTime)) {
    return latestStatus.timestamp_msg === chat.last_message_time;
  }

  return statusMessageTime >= chatMessageTime - 5000;
}

function getTagKey(tag: ChatTag) {
  return tag.id || tag.label;
}

function getStatusFields(chat: ChatRecord, status: ChatStatusOption) {
  const normalizedStatus = status.label.toLowerCase();

  return {
    Status_chat: status.label,
    hex_status: status.color || chat.hex_status,
    finalizada: normalizedStatus === "finalizada" ? true : normalizedStatus === "aberta" ? false : chat.finalizada,
  };
}

function getFallbackStatusOptions(chats: ChatRecord[]) {
  const options = new Map<string, ChatStatusOption>();

  for (const chat of chats) {
    const label = getChatStatusLabel(chat);
    if (!label || options.has(label)) continue;
    options.set(label, {
      label,
      color: getChatStatusColor(chat),
    });
  }

  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function getFallbackTagOptions(chats: ChatRecord[]) {
  const options = new Map<string, ChatTag>();

  for (const chat of chats) {
    for (const tag of getChatTags(chat)) {
      const key = tag.id || tag.label;
      if (!/^rec[a-zA-Z0-9]+$/.test(tag.id) || options.has(key)) continue;
      options.set(key, tag);
    }
  }

  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

export default function ChatsPage() {
  const [showDetails, setShowDetails] = useState(false);
  const searchParams = useSearchParams();
  const { user, isLoading: isCurrentUserLoading } = useCurrentUser();

  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [searchChats, setSearchChats] = useState<ChatRecord[]>([]);
  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, MessageRecord[]>>({});
  const [latestMessageStatuses, setLatestMessageStatuses] = useState<Record<string, LatestMessageStatus>>({});
  const [selectedChatId, setSelectedChatId] = useState<string>();
  const [search, setSearch] = useState("");
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const [searchChatsTerm, setSearchChatsTerm] = useState("");
  const [isLoadingMoreSearchChats, setIsLoadingMoreSearchChats] = useState(false);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [hasMoreSearchChats, setHasMoreSearchChats] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreMessagesByChatId, setHasMoreMessagesByChatId] = useState<Record<string, boolean>>({});
  const [statusOptions, setStatusOptions] = useState<ChatStatusOption[]>([]);
  const [tagOptions, setTagOptions] = useState<ChatTag[]>([]);
  const [error, setError] = useState<string>();
  const searchRequestIdRef = useRef(0);
  const [storedTargetChatId, setStoredTargetChatId] = useState(() => (typeof window === "undefined" ? "" : window.localStorage.getItem(LAST_OPEN_CHAT_STORAGE_KEY) || ""));

  const normalizedSearch = search.trim();
  const debouncedSearch = useDebouncedValue(normalizedSearch, 350);
  const searchQuery = normalizedSearch ? debouncedSearch.trim() : "";
  const isSearching = !!searchQuery;
  const isSearchingChats = !!normalizedSearch && (normalizedSearch !== searchQuery || searchChatsTerm !== searchQuery);
  const visibleChats = isSearching ? searchChats : chats;
  const visibleChatRemoteIds = useMemo(() => Array.from(new Set(visibleChats.map((chat) => chat.chat_id).filter(Boolean))), [visibleChats]);
  const visibleChatRemoteIdsKey = useMemo(() => visibleChatRemoteIds.join("\n"), [visibleChatRemoteIds]);
  const knownChats = useMemo(() => {
    const indexedChats = new Map<string, ChatRecord>();
    for (const chat of [...chats, ...searchChats]) indexedChats.set(chat.id, chat);
    return Array.from(indexedChats.values());
  }, [chats, searchChats]);
  const selectedChat = useMemo(() => knownChats.find((chat) => chat.id === selectedChatId), [knownChats, selectedChatId]);
  const fallbackStatusOptions = useMemo(() => getFallbackStatusOptions(knownChats), [knownChats]);
  const fallbackTagOptions = useMemo(() => getFallbackTagOptions(knownChats), [knownChats]);
  const contactStatusOptions = statusOptions.length > 0 ? statusOptions : fallbackStatusOptions;
  const contactTagOptions = tagOptions.length > 0 ? tagOptions : fallbackTagOptions;
  const selectedChatRemoteId = selectedChat?.chat_id;
  const messages = selectedChatRemoteId ? (messagesByChatId[selectedChatRemoteId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES;
  const hasMoreMessages = selectedChatRemoteId ? (hasMoreMessagesByChatId[selectedChatRemoteId] ?? false) : false;
  const hasLoadedSelectedMessages = !!selectedChatRemoteId && selectedChatRemoteId in messagesByChatId;
  const isLoadingSelectedMessages = !!selectedChatRemoteId && !hasLoadedSelectedMessages;
  const selectedChatRemoteIdRef = useRef<string | undefined>(undefined);
  const messagesByChatIdRef = useRef(messagesByChatId);
  const readReceiptKeyByChatIdRef = useRef<Record<string, string>>({});
  const ghostUnreadCountByChatIdRef = useRef<Record<string, number>>({});
  const targetChatId = searchParams.get("chatId") || storedTargetChatId;

  const [isSignatureMode, setIsAssinaturaMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("neuronzclinic.chat.use-signature");
      return saved === null ? true : saved === "true";
    }
    return true;
  });

  const [isGhostMode, setIsGhostMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("neuronzclinic.chat.ghost-mode");
      return saved === null ? true : saved === "true";
    }
    return true;
  });

  const canUseAdminChatModes = user?.role === "admin";
  const effectiveSignatureMode = canUseAdminChatModes ? isSignatureMode : true;
  const effectiveGhostMode = isCurrentUserLoading ? true : canUseAdminChatModes ? isGhostMode : false;
  const isGhostModeRef = useRef(effectiveGhostMode);

  useEffect(() => {
    localStorage.setItem("neuronzclinic.chat.use-signature", String(isSignatureMode));
  }, [isSignatureMode]);

  useEffect(() => {
    localStorage.setItem("neuronzclinic.chat.ghost-mode", String(isGhostMode));
  }, [isGhostMode]);

  useEffect(() => {
    selectedChatRemoteIdRef.current = selectedChatRemoteId;
  }, [selectedChatRemoteId]);

  useEffect(() => {
    isGhostModeRef.current = effectiveGhostMode;
  }, [effectiveGhostMode]);

  useEffect(() => {
    messagesByChatIdRef.current = messagesByChatId;
  }, [messagesByChatId]);

  useEffect(() => {
    if (!selectedChatRemoteId) return;
    window.localStorage.setItem(LAST_OPEN_CHAT_STORAGE_KEY, selectedChatRemoteId);
  }, [selectedChatRemoteId]);

  const loadMoreChats = useCallback(async () => {
    if (isSearching) {
      if (isLoadingMoreSearchChats || !hasMoreSearchChats) return;

      setIsLoadingMoreSearchChats(true);

      try {
        const data = await fetchChats({
          limit: CHAT_PAGE_SIZE,
          offset: searchChats.length,
          search: searchQuery,
        });
        setSearchChats((current) => {
          const knownIds = new Set(current.map((chat) => chat.id));
          return [...current, ...data.filter((chat) => !knownIds.has(chat.id))];
        });
        setHasMoreSearchChats(data.length === CHAT_PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível carregar mais resultados.");
      } finally {
        setIsLoadingMoreSearchChats(false);
      }
      return;
    }

    if (isLoadingMoreChats || !hasMoreChats) return;

    setIsLoadingMoreChats(true);

    try {
      const data = await fetchChats({ limit: CHAT_PAGE_SIZE, offset: chats.length });
      setChats((current) => {
        const knownIds = new Set(current.map((chat) => chat.id));
        return [...current, ...data.filter((chat) => !knownIds.has(chat.id))];
      });
      setHasMoreChats(data.length === CHAT_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar mais chats.");
    } finally {
      setIsLoadingMoreChats(false);
    }
  }, [chats.length, hasMoreChats, hasMoreSearchChats, isLoadingMoreChats, isLoadingMoreSearchChats, isSearching, searchChats.length, searchQuery]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);

    if (!value.trim()) {
      searchRequestIdRef.current += 1;
      setSearchChats([]);
      setSearchChatsTerm("");
      setHasMoreSearchChats(false);
    }
  }, []);

  const handleSelectChat = useCallback(
    (id: string) => {
      const chat = knownChats.find((knownChat) => knownChat.id === id);
      if (chat?.chat_id) {
        window.localStorage.setItem(LAST_OPEN_CHAT_STORAGE_KEY, chat.chat_id);
        setStoredTargetChatId(chat.chat_id);
      }
      setSelectedChatId(id);
    },
    [knownChats],
  );

  const handleCloseChat = useCallback(() => {
    window.localStorage.removeItem(LAST_OPEN_CHAT_STORAGE_KEY);
    setStoredTargetChatId("");
    setSelectedChatId(undefined);
  }, []);

  const findNewContactChat = useCallback(async (phone: string, chatId: string) => {
    for (const delay of [0, 1200, 2500, 5000]) {
      if (delay) await wait(delay);

      const searchResults = await Promise.all(
        getNewContactSearchTerms(phone, chatId).map((term) =>
          fetchChats({
            limit: CHAT_PAGE_SIZE,
            offset: 0,
            search: term,
          }).catch(() => [] as ChatRecord[]),
        ),
      );

      const foundChat = searchResults.flat().find((chat) => chatMatchesNewContact(chat, phone, chatId));
      if (foundChat) return foundChat;
    }

    return undefined;
  }, []);

  const handleCreateContact = useCallback(
    async ({ name, phone, message }: { name: string; phone: string; message: string }) => {
      const chatId = normalizeNewContactChatId(phone);
      const contactName = name.trim();

      setError(undefined);
      await sendMessage({ chatId, text: message, contactName });

      const createdChat = await findNewContactChat(phone, chatId);
      if (!createdChat) {
        setSearch(phone);
        window.localStorage.setItem(LAST_OPEN_CHAT_STORAGE_KEY, chatId);
        setStoredTargetChatId(chatId);
        return;
      }

      const namedChat = contactName ? { ...createdChat, nome_contato: contactName } : createdChat;
      const addCreatedChat = (list: ChatRecord[]) => mergeChats(list, [namedChat]);

      setChats(addCreatedChat);
      setSearchChats((current) => (search.trim() ? addCreatedChat(current) : current));
      setSearch("");
      setSearchChats([]);
      setSearchChatsTerm("");
      setHasMoreSearchChats(false);
      window.localStorage.setItem(LAST_OPEN_CHAT_STORAGE_KEY, namedChat.chat_id);
      setStoredTargetChatId(namedChat.chat_id);
      setSelectedChatId(namedChat.id);

      if (contactName) {
        await updateChatDetails({
          id: namedChat.id,
          nome_contato: contactName,
        });
      }
    },
    [findNewContactChat, search],
  );

  const setChatHasMoreMessages = useCallback((chatId: string, hasMore: boolean) => {
    setHasMoreMessagesByChatId((current) => ({
      ...current,
      [chatId]: hasMore,
    }));
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (!selectedChatRemoteId || isLoadingOlderMessages || !hasMoreMessages) return 0;

    setIsLoadingOlderMessages(true);
    const currentMessages = messagesByChatId[selectedChatRemoteId] ?? [];

    try {
      const data = await fetchMessages(selectedChatRemoteId, {
        limit: MESSAGE_PAGE_SIZE,
        offset: currentMessages.length,
      });
      const olderMessages = [...data].reverse();
      const knownIds = new Set(currentMessages.map((message) => message.id));
      const newMessages = olderMessages.filter((message) => !knownIds.has(message.id));

      setMessagesByChatId((current) => {
        const currentChatMessages = current[selectedChatRemoteId] ?? [];
        const currentIds = new Set(currentChatMessages.map((message) => message.id));
        return {
          ...current,
          [selectedChatRemoteId]: mergeMessages(
            olderMessages.filter((message) => !currentIds.has(message.id)),
            currentChatMessages,
          ),
        };
      });
      setChatHasMoreMessages(selectedChatRemoteId, data.length === MESSAGE_PAGE_SIZE);
      return newMessages.length;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar mensagens antigas.");
      return 0;
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [hasMoreMessages, isLoadingOlderMessages, messagesByChatId, selectedChatRemoteId, setChatHasMoreMessages]);

  const replaceChatMessages = useCallback((chatId: string, nextMessages: MessageRecord[]) => {
    setMessagesByChatId((current) => ({
      ...current,
      [chatId]: mergeMessages([], nextMessages),
    }));
  }, []);

  const updateLatestMessageStatus = useCallback((chatId: string, freshMessages: MessageRecord[]) => {
    const latestMessage = freshMessages[freshMessages.length - 1];

    setLatestMessageStatuses((current) => ({
      ...current,
      [chatId]: {
        status: latestMessage?.status ?? null,
        timestamp_msg: latestMessage?.timestamp_msg ?? null,
      },
    }));
  }, []);

  const appendChatMessage = useCallback((chatId: string, message: MessageRecord) => {
    setMessagesByChatId((current) => ({
      ...current,
      [chatId]: mergeMessages(current[chatId] ?? [], [message]),
    }));
  }, []);

  const updateChatMessages = useCallback((chatId: string, updater: (messages: MessageRecord[]) => MessageRecord[]) => {
    setMessagesByChatId((current) => ({
      ...current,
      [chatId]: updater(current[chatId] ?? []),
    }));
  }, []);

  const mergeFreshChats = useCallback((freshChats: ChatRecord[]) => {
    setChats((current) => mergeChats(current, freshChats));
    setSearchChats((current) => {
      if (current.length === 0) return current;

      const currentIds = new Set(current.map((chat) => chat.id));
      return mergeChats(
        current,
        freshChats.filter((chat) => currentIds.has(chat.id)),
      );
    });
  }, []);

  useEffect(() => {
    if (!targetChatId) return;

    const knownTarget = knownChats.find((chat) => chat.chat_id === targetChatId || chat.id === targetChatId);
    if (knownTarget) {
      window.queueMicrotask(() => setSelectedChatId(knownTarget.id));
      return;
    }

    let isMounted = true;

    fetchChats({ limit: 1, offset: 0, search: targetChatId })
      .then((data) => {
        if (!isMounted) return;
        const target = data.find((chat) => chat.chat_id === targetChatId || chat.id === targetChatId) || data[0];
        if (!target) return;
        mergeFreshChats([target]);
        setSelectedChatId(target.id);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "NÃ£o foi possÃ­vel abrir o chat selecionado.");
      });

    return () => {
      isMounted = false;
    };
  }, [knownChats, mergeFreshChats, targetChatId]);

  const updateChatPreviewForMessages = useCallback((chatId: string, freshMessages: MessageRecord[]) => {
    if (freshMessages.length === 0) return;

    const updateLoadedChatPreview = (list: ChatRecord[]) => {
      let didUpdate = false;
      const nextList = list.map((chat) => {
        if (chat.chat_id !== chatId) return chat;

        const nextChat = updateChatPreviewFromMessages(chat, freshMessages);
        const hasChanged = nextChat.text_last_message !== chat.text_last_message || nextChat.last_message_time !== chat.last_message_time || nextChat.last_message_fromMe !== chat.last_message_fromMe;

        if (hasChanged) didUpdate = true;
        return hasChanged ? nextChat : chat;
      });

      return didUpdate ? sortChatsByLatestMessage(nextList) : list;
    };

    setChats(updateLoadedChatPreview);
    setSearchChats(updateLoadedChatPreview);
  }, []);

  const mergeFreshMessages = useCallback(
    (chatId: string, freshMessages: MessageRecord[]) => {
      const currentMessages = messagesByChatIdRef.current[chatId] ?? [];
      const newIncomingCount = countNewIncomingMessages(currentMessages, freshMessages);
      const shouldMarkAsRead = selectedChatRemoteIdRef.current === chatId && !isGhostModeRef.current;

      setMessagesByChatId((current) => {
        if (!(chatId in current) && selectedChatRemoteIdRef.current !== chatId) {
          return current;
        }

        const nextMessages = mergeMessages(current[chatId] ?? [], freshMessages);

        return {
          ...current,
          [chatId]: nextMessages,
        };
      });

      const updateChatFromMessages = (chat: ChatRecord) => {
        if (chat.chat_id !== chatId) return chat;

        const chatWithPreview = freshMessages.length > 0 ? updateChatPreview(chat, freshMessages[freshMessages.length - 1]) : chat;
        return updateChatUnreadCount(chatWithPreview, newIncomingCount, shouldMarkAsRead);
      };

      setChats((current) => sortChatsByLatestMessage(current.map(updateChatFromMessages)));
      setSearchChats((current) => sortChatsByLatestMessage(current.map(updateChatFromMessages)));
      updateLatestMessageStatus(chatId, freshMessages);
    },
    [updateLatestMessageStatus],
  );

  const handleRealtimeMessage = useCallback(
    (message: MessageRecord) => {
      const chatId = message.chat_id;
      if (!chatId) return;

      mergeFreshMessages(chatId, [message]);
    },
    [mergeFreshMessages],
  );

  const handleRealtimeChat = useCallback(
    (chat: ChatRecord) => {
      mergeFreshChats([chat]);
    },
    [mergeFreshChats],
  );

  const refreshMessagesAfterSend = useCallback(
    async (chatId: string, optimisticId: string) => {
      const data = await fetchMessages(chatId, { limit: MESSAGE_PAGE_SIZE, offset: 0 });
      const freshMessages = [...data].reverse();

      updateLatestMessageStatus(chatId, freshMessages);
      updateChatPreviewForMessages(chatId, freshMessages);

      if (selectedChatRemoteIdRef.current !== chatId) return;

      setMessagesByChatId((current) => {
        const currentMessages = current[chatId] ?? [];
        const optimisticMessage = currentMessages.find((message) => message.id === optimisticId);
        const nextMessages = (() => {
          if (!optimisticMessage) return freshMessages;

          const hasRealMessage = freshMessages.some((message) => isMatchingSentMessage(message, optimisticMessage));
          return hasRealMessage ? freshMessages : [...freshMessages, { ...optimisticMessage, status: "sent" }];
        })();

        return {
          ...current,
          [chatId]: mergeMessages([], nextMessages),
        };
      });
      setChatHasMoreMessages(chatId, data.length === MESSAGE_PAGE_SIZE);
    },
    [setChatHasMoreMessages, updateChatPreviewForMessages, updateLatestMessageStatus],
  );

  const handleSendMessage = useCallback(
    async ({ text, file }: { text: string; file: File | null }) => {
      if (!selectedChatRemoteId) return;

      const timestamp = new Date().toISOString();
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const localMediaUrl = file ? URL.createObjectURL(file) : null;
      const optimisticMessage: MessageRecord = {
        id: optimisticId,
        message_id: optimisticId,
        from_me: true,
        chat_id: selectedChatRemoteId,
        participant: null,
        message_type: getOptimisticMessageType(file),
        content: text || (file ? file.name : ""),
        media_url: null,
        media_path: null,
        media_mime_type: file?.type || null,
        public_media_url: localMediaUrl,
        public_midia_thumb: null,
        timestamp_msg: timestamp,
        status: "sending",
      };

      appendChatMessage(selectedChatRemoteId, optimisticMessage);
      updateChatPreviewForMessages(selectedChatRemoteId, [optimisticMessage]);
      setError(undefined);

      try {
        await sendMessage({ chatId: selectedChatRemoteId, text, file });
        await refreshMessagesAfterSend(selectedChatRemoteId, optimisticId);
        window.setTimeout(() => void refreshMessagesAfterSend(selectedChatRemoteId, optimisticId), 2500);
        window.setTimeout(() => void refreshMessagesAfterSend(selectedChatRemoteId, optimisticId), 7000);
      } catch (err) {
        updateChatMessages(selectedChatRemoteId, (current) => current.map((message) => (message.id === optimisticId ? { ...message, status: "error" } : message)));
        setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
        throw err;
      } finally {
        if (localMediaUrl) {
          window.setTimeout(() => URL.revokeObjectURL(localMediaUrl), 60000);
        }
      }
    },
    [appendChatMessage, refreshMessagesAfterSend, selectedChatRemoteId, updateChatMessages, updateChatPreviewForMessages],
  );

  const handleReplyMessage = useCallback(
    async ({ text, file, replyTo }: { text: string; file: File | null; replyTo: MessageRecord }) => {
      if (!selectedChatRemoteId) return;

      const timestamp = new Date().toISOString();
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const localMediaUrl = file ? URL.createObjectURL(file) : null;
      const optimisticMessage: MessageRecord = {
        id: optimisticId,
        message_id: optimisticId,
        from_me: true,
        chat_id: selectedChatRemoteId,
        participant: null,
        message_type: getOptimisticMessageType(file),
        content: text || (file ? file.name : ""),
        media_url: null,
        media_path: null,
        media_mime_type: file?.type || null,
        public_media_url: localMediaUrl,
        public_midia_thumb: null,
        timestamp_msg: timestamp,
        status: "sending",
        quoted_message_id: replyTo.message_id || replyTo.id,
        quoted_content: getMessagePreviewText(replyTo),
        quoted_from_me: replyTo.from_me,
        quoted_message_type: replyTo.message_type,
      };

      appendChatMessage(selectedChatRemoteId, optimisticMessage);
      updateChatPreviewForMessages(selectedChatRemoteId, [optimisticMessage]);
      setError(undefined);

      try {
        await sendMessage({ chatId: selectedChatRemoteId, text, file, replyTo });
        await refreshMessagesAfterSend(selectedChatRemoteId, optimisticId);
        window.setTimeout(() => void refreshMessagesAfterSend(selectedChatRemoteId, optimisticId), 2500);
        window.setTimeout(() => void refreshMessagesAfterSend(selectedChatRemoteId, optimisticId), 7000);
      } catch (err) {
        updateChatMessages(selectedChatRemoteId, (current) => current.map((message) => (message.id === optimisticId ? { ...message, status: "error" } : message)));
        setError(err instanceof Error ? err.message : "Não foi possível responder a mensagem.");
        throw err;
      } finally {
        if (localMediaUrl) {
          window.setTimeout(() => URL.revokeObjectURL(localMediaUrl), 60000);
        }
      }
    },
    [appendChatMessage, refreshMessagesAfterSend, selectedChatRemoteId, updateChatMessages, updateChatPreviewForMessages],
  );

  const handleForwardMessage = useCallback(
    async ({ message, targetChatId }: { message: MessageRecord; targetChatId: string }) => {
      await forwardMessage({ message, targetChatId });

      if (targetChatId === selectedChatRemoteId) {
        await refreshMessagesAfterSend(targetChatId, message.id);
      }
    },
    [refreshMessagesAfterSend, selectedChatRemoteId],
  );

  const handleForwardMessages = useCallback(
    async ({ messages, targetChatId }: { messages: MessageRecord[]; targetChatId: string }) => {
      await forwardMessages({ messages, targetChatId });

      if (targetChatId === selectedChatRemoteId) {
        await refreshMessagesAfterSend(targetChatId, messages[messages.length - 1]?.id || "");
      }
    },
    [refreshMessagesAfterSend, selectedChatRemoteId],
  );

  const handleDeleteMessage = useCallback(
    async (message: MessageRecord) => {
      if (!selectedChatRemoteId) return;

      const previousMessages = messagesByChatId[selectedChatRemoteId] ?? [];
      updateChatMessages(selectedChatRemoteId, (current) =>
        current.map((currentMessage) =>
          currentMessage.id === message.id
            ? {
                ...currentMessage,
                status: "deleted",
              }
            : currentMessage,
        ),
      );
      setError(undefined);

      try {
        await deleteMessage({ chatId: selectedChatRemoteId, message });
      } catch (err) {
        replaceChatMessages(selectedChatRemoteId, previousMessages);
        setError(err instanceof Error ? err.message : "Não foi possível apagar a mensagem.");
        throw err;
      }
    },
    [messagesByChatId, replaceChatMessages, selectedChatRemoteId, updateChatMessages],
  );

  const handleDeleteMessages = useCallback(
    async (messagesToDelete: MessageRecord[]) => {
      if (!selectedChatRemoteId || messagesToDelete.length === 0) return;

      const idsToDelete = new Set(messagesToDelete.map((message) => message.id));
      const previousMessages = messagesByChatId[selectedChatRemoteId] ?? [];
      updateChatMessages(selectedChatRemoteId, (current) =>
        current.map((currentMessage) =>
          idsToDelete.has(currentMessage.id)
            ? {
                ...currentMessage,
                status: "deleted",
              }
            : currentMessage,
        ),
      );
      setError(undefined);

      try {
        await deleteMessages({ chatId: selectedChatRemoteId, messages: messagesToDelete });
      } catch (err) {
        replaceChatMessages(selectedChatRemoteId, previousMessages);
        setError(err instanceof Error ? err.message : "Não foi possível apagar as mensagens.");
        throw err;
      }
    },
    [messagesByChatId, replaceChatMessages, selectedChatRemoteId, updateChatMessages],
  );

  useEffect(() => {
    let isMounted = true;

    fetch("/api/chat-options")
      .then((response) => {
        if (!response.ok) throw new Error(`Não foi possível carregar opções (${response.status}).`);
        return response.json() as Promise<{ statuses?: ChatStatusOption[]; tags?: ChatTag[]; errors?: string[] }>;
      })
      .then((data) => {
        if (!isMounted) return;
        setStatusOptions(data.statuses ?? []);
        setTagOptions(data.tags ?? []);
        if (data.errors?.length) setError(data.errors.join(" | "));
      })
      .catch((err) => {
        if (!isMounted) return;
        setStatusOptions([]);
        setTagOptions([]);
        setError(err instanceof Error ? err.message : "Não foi possível carregar tags e status.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetchChats({ limit: CHAT_PAGE_SIZE, offset: 0 })
      .then((data) => {
        if (!isMounted) return;
        setChats(data);
        setHasMoreChats(data.length === CHAT_PAGE_SIZE);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Não foi possível carregar os chats.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingChats(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = createSupabaseRealtimeSubscription([{ table: "messages" }, { table: "chats" }], (payload: SupabasePostgresChangePayload) => {
      if (payload.table === "messages" && payload.record) {
        handleRealtimeMessage(payload.record as unknown as MessageRecord);
      }

      if (payload.table === "chats" && payload.record) {
        handleRealtimeChat(payload.record as unknown as ChatRecord);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [handleRealtimeChat, handleRealtimeMessage]);

  useEffect(() => {
    if (isSearching) return;

    let isMounted = true;
    let isRefreshing = false;

    const refreshVisibleChats = async () => {
      if (isRefreshing || document.visibilityState === "hidden") return;
      isRefreshing = true;

      try {
        const data = await fetchChats({ limit: CHAT_PAGE_SIZE, offset: 0 });
        if (!isMounted) return;
        mergeFreshChats(data);
        setHasMoreChats((current) => current && data.length === CHAT_PAGE_SIZE);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Não foi possível sincronizar os chats.");
      } finally {
        isRefreshing = false;
      }
    };

    const intervalId = window.setInterval(refreshVisibleChats, CHAT_SYNC_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [isSearching, mergeFreshChats]);

  useEffect(() => {
    const term = searchQuery;
    const requestId = ++searchRequestIdRef.current;

    if (!term) {
      return;
    }

    let isMounted = true;

    fetchChats({ limit: CHAT_PAGE_SIZE, offset: 0, search: term })
      .then((data) => {
        if (!isMounted || requestId !== searchRequestIdRef.current) return;
        setSearchChats(data);
        setSearchChatsTerm(term);
        setHasMoreSearchChats(data.length === CHAT_PAGE_SIZE);
      })
      .catch((err) => {
        if (!isMounted || requestId !== searchRequestIdRef.current) return;
        setSearchChats([]);
        setSearchChatsTerm(term);
        setHasMoreSearchChats(false);
        setError(err instanceof Error ? err.message : "Não foi possível buscar os chats.");
      });

    return () => {
      isMounted = false;
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!selectedChatRemoteId) {
      return;
    }

    let isMounted = true;

    fetchMessages(selectedChatRemoteId, { limit: MESSAGE_PAGE_SIZE, offset: 0 })
      .then((data) => {
        if (!isMounted) return;
        const freshMessages = [...data].reverse();
        replaceChatMessages(selectedChatRemoteId, freshMessages);
        updateLatestMessageStatus(selectedChatRemoteId, freshMessages);
        updateChatPreviewForMessages(selectedChatRemoteId, freshMessages);
        setChatHasMoreMessages(selectedChatRemoteId, data.length === MESSAGE_PAGE_SIZE);
      })
      .catch((err) => {
        if (!isMounted) return;
        replaceChatMessages(selectedChatRemoteId, []);
        setChatHasMoreMessages(selectedChatRemoteId, false);
        setError(err instanceof Error ? err.message : "Não foi possível carregar as mensagens.");
      });

    return () => {
      isMounted = false;
    };
  }, [replaceChatMessages, selectedChatRemoteId, setChatHasMoreMessages, updateChatPreviewForMessages, updateLatestMessageStatus]);

  useEffect(() => {
    if (!selectedChatRemoteId) return;

    let isMounted = true;
    let isRefreshing = false;

    const refreshSelectedMessages = async () => {
      if (isRefreshing || document.visibilityState === "hidden") return;
      isRefreshing = true;

      try {
        const data = await fetchMessages(selectedChatRemoteId, { limit: MESSAGE_PAGE_SIZE, offset: 0 });
        if (!isMounted) return;
        const freshMessages = [...data].reverse();
        mergeFreshMessages(selectedChatRemoteId, freshMessages);
        setChatHasMoreMessages(selectedChatRemoteId, data.length === MESSAGE_PAGE_SIZE);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Não foi possível sincronizar as mensagens.");
      } finally {
        isRefreshing = false;
      }
    };

    const intervalId = window.setInterval(refreshSelectedMessages, MESSAGE_SYNC_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [mergeFreshMessages, selectedChatRemoteId, setChatHasMoreMessages]);

  useEffect(() => {
    const chatsNeedingStatus = visibleChats.filter((chat) => chat.last_message_fromMe && !hasFreshLatestStatus(chat, latestMessageStatuses[chat.chat_id]));
    const chatIds = chatsNeedingStatus.map((chat) => chat.chat_id);

    if (chatIds.length === 0) return;

    let isMounted = true;

    fetchLatestMessageStatuses(chatIds)
      .then((statuses) => {
        if (!isMounted) return;
        const statusesWithFallbacks: Record<string, LatestMessageStatus> = Object.fromEntries(
          chatsNeedingStatus.map((chat) => {
            const status = statuses[chat.chat_id];
            return [
              chat.chat_id,
              {
                status: status?.status ?? null,
                timestamp_msg: status?.timestamp_msg ?? chat.last_message_time,
              },
            ];
          }),
        );
        setLatestMessageStatuses((current) => ({ ...current, ...statusesWithFallbacks }));
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Não foi possível carregar os status das mensagens.");
      });

    return () => {
      isMounted = false;
    };
  }, [latestMessageStatuses, visibleChats]);

  useEffect(() => {
    const chatIds = visibleChatRemoteIdsKey ? visibleChatRemoteIdsKey.split("\n") : [];

    if (chatIds.length === 0) return;

    let isMounted = true;

    fetchLatestMessagesForChats(chatIds)
      .then((latestMessages) => {
        if (!isMounted) return;
        if (Object.keys(latestMessages).length === 0) return;

        const updatePreviews = (list: ChatRecord[]) => {
          let didUpdate = false;
          const nextList = list.map((chat) => {
            const latestMessage = latestMessages[chat.chat_id];
            if (!latestMessage) return chat;

            const nextChat = updateChatPreview(chat, latestMessage);
            const hasChanged = nextChat.text_last_message !== chat.text_last_message || nextChat.last_message_time !== chat.last_message_time || nextChat.last_message_fromMe !== chat.last_message_fromMe;

            if (hasChanged) didUpdate = true;
            return hasChanged ? nextChat : chat;
          });

          return didUpdate ? sortChatsByLatestMessage(nextList) : list;
        };

        setChats(updatePreviews);
        setSearchChats(updatePreviews);

        setLatestMessageStatuses((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(latestMessages).map(([chatId, message]) => [
              chatId,
              {
                status: message.status,
                timestamp_msg: message.timestamp_msg,
              },
            ]),
          ),
        }));
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Não foi possível carregar as últimas mensagens.");
      });

    return () => {
      isMounted = false;
    };
  }, [visibleChatRemoteIdsKey]);

  const restoreSelectedChat = useCallback(
    (previousChat: ChatRecord) => {
      if (!selectedChatId) return;

      const restoreChat = (list: ChatRecord[]) => list.map((chat) => (chat.id === selectedChatId ? previousChat : chat));

      setChats((current) => restoreChat(current));
      setSearchChats((current) => restoreChat(current));
    },
    [selectedChatId],
  );

  const handleToggleStatus = useCallback(async () => {
    if (!selectedChat || !selectedChatId) return;

    const previousChat = selectedChat;
    const nextFinalizada = !selectedChat.finalizada;
    const toggleStatus = (list: ChatRecord[]) => list.map((chat) => (chat.id === selectedChatId ? { ...chat, finalizada: nextFinalizada } : chat));

    setChats((current) => toggleStatus(current));
    setSearchChats((current) => toggleStatus(current));
    setError(undefined);

    try {
      await updateChatDetails({
        id: selectedChat.id,
        finalizada: nextFinalizada,
      });
    } catch (err) {
      restoreSelectedChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível salvar o status da conversa.");
    }
  }, [restoreSelectedChat, selectedChat, selectedChatId]);

  const handleToggleIA = useCallback(async () => {
    if (!selectedChat || !selectedChatId) return;

    const previousChat = selectedChat;
    const nextIAStatus = !selectedChat.ia_responde;
    const toggleIAStatus = (list: ChatRecord[]) => list.map((chat) => (chat.id === selectedChatId ? { ...chat, ia_responde: nextIAStatus } : chat));

    setChats((current) => toggleIAStatus(current));
    setSearchChats((current) => toggleIAStatus(current));
    setError(undefined);

    try {
      await updateChatDetails({
        id: selectedChat.id,
        ia_responde: nextIAStatus,
      });
    } catch (err) {
      restoreSelectedChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível salvar o status da IA.");
    }
  }, [restoreSelectedChat, selectedChat, selectedChatId]);

  const updateSelectedChatUnreadCount = useCallback(
    (unreadCount: number) => {
      if (!selectedChatId) return;

      const updateUnreadCount = (list: ChatRecord[]) => list.map((chat) => (chat.id === selectedChatId ? { ...chat, unread_count: unreadCount } : chat));

      setChats((current) => updateUnreadCount(current));
      setSearchChats((current) => updateUnreadCount(current));
    },
    [selectedChatId],
  );

  const persistSelectedChatUnreadCount = useCallback(
    async (unreadCount: number) => {
      if (!selectedChat) return;

      await updateChatDetails({
        id: selectedChat.id,
        unread_count: unreadCount,
      });
    },
    [selectedChat],
  );

  const handleMarkAsRead = useCallback(() => {
    updateSelectedChatUnreadCount(0);
  }, [updateSelectedChatUnreadCount]);

  const handleMarkAsReadPersisted = useCallback(async () => {
    if (!selectedChat) return;

    const previousChat = selectedChat;
    updateSelectedChatUnreadCount(0);
    setError(undefined);

    try {
      await persistSelectedChatUnreadCount(0);
    } catch (err) {
      restoreSelectedChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível marcar a conversa como lida.");
    }
  }, [persistSelectedChatUnreadCount, restoreSelectedChat, selectedChat, updateSelectedChatUnreadCount]);

  const sendReadReceiptForChat = useCallback(async (chatId: string, messageList: MessageRecord[]) => {
    const incomingMessages = getIncomingReadMessages(messageList);
    const latestIncomingMessageKey = getLatestIncomingMessageKey(incomingMessages);

    if (!latestIncomingMessageKey) return;

    const receiptKey = `${chatId}:${latestIncomingMessageKey}`;
    if (readReceiptKeyByChatIdRef.current[chatId] === receiptKey) return;

    readReceiptKeyByChatIdRef.current[chatId] = receiptKey;

    try {
      await markChatAsRead({ chatId, messages: incomingMessages });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar a leitura.");
    }
  }, []);

  useEffect(() => {
    if (selectedChatId && !effectiveGhostMode) {
      window.queueMicrotask(handleMarkAsRead);
    }
  }, [selectedChatId, effectiveGhostMode, handleMarkAsRead]);

  useEffect(() => {
    if (!selectedChatRemoteId || effectiveGhostMode || !hasLoadedSelectedMessages) return;

    window.queueMicrotask(() => {
      void sendReadReceiptForChat(selectedChatRemoteId, messages);
    });
  }, [hasLoadedSelectedMessages, effectiveGhostMode, messages, selectedChatRemoteId, sendReadReceiptForChat]);

  const handleMarkAsUnread = useCallback(async () => {
    if (!selectedChat) return;

    const previousChat = selectedChat;
    const unreadCount = Math.max(selectedChat.unread_count || 0, 1);
    ghostUnreadCountByChatIdRef.current[selectedChat.id] = unreadCount;
    updateSelectedChatUnreadCount(unreadCount);
    setError(undefined);

    try {
      await persistSelectedChatUnreadCount(unreadCount);
    } catch (err) {
      restoreSelectedChat(previousChat);
      setError(err instanceof Error ? err.message : "Não foi possível marcar a conversa como não lida.");
    }
  }, [persistSelectedChatUnreadCount, restoreSelectedChat, selectedChat, updateSelectedChatUnreadCount]);

  useEffect(() => {
    if (!selectedChat || !effectiveGhostMode) return;

    const rememberedUnreadCount = ghostUnreadCountByChatIdRef.current[selectedChat.id] ?? 0;
    const currentUnreadCount = selectedChat.unread_count ?? 0;

    if (currentUnreadCount > rememberedUnreadCount) {
      ghostUnreadCountByChatIdRef.current[selectedChat.id] = currentUnreadCount;
      return;
    }

    if (rememberedUnreadCount <= 0 || currentUnreadCount >= rememberedUnreadCount) return;

    updateSelectedChatUnreadCount(rememberedUnreadCount);
    void updateChatDetails({
      id: selectedChat.id,
      unread_count: rememberedUnreadCount,
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Não foi possível manter a conversa como não lida no modo espião.");
    });
  }, [effectiveGhostMode, selectedChat, updateSelectedChatUnreadCount]);

  const updateSelectedChatTags = useCallback(
    (tags: ChatTag[]) => {
      if (!selectedChatId) return;

      const updateTags = (list: ChatRecord[]) =>
        list.map((chat) =>
          chat.id === selectedChatId
            ? {
                ...chat,
                json_tags: tags,
                json_tags_parsed: tags,
                tag_chat_array: tags,
              }
            : chat,
        );

      setChats((current) => updateTags(current));
      setSearchChats((current) => updateTags(current));
    },
    [selectedChatId],
  );

  const handleChangeContactName = useCallback(
    async (name: string) => {
      if (!selectedChat || !selectedChatId) return;

      const previousChat = selectedChat;
      const nextName = name.trim() || null;
      const updateName = (list: ChatRecord[]) => list.map((chat) => (chat.id === selectedChatId ? { ...chat, nome_contato: nextName } : chat));

      setChats((current) => updateName(current));
      setSearchChats((current) => updateName(current));
      setError(undefined);

      try {
        await updateChatDetails({
          id: selectedChat.id,
          nome_contato: nextName,
        });
      } catch (err) {
        restoreSelectedChat(previousChat);
        const message = err instanceof Error ? err.message : "Não foi possível salvar o nome do contato.";
        setError(message);
        throw new Error(message);
      }
    },
    [restoreSelectedChat, selectedChat, selectedChatId],
  );

  const handleChangeContactInfo = useCallback(
    async (info: ContactInfoValues) => {
      if (!selectedChat || !selectedChatId) return;

      const previousChat = selectedChat;
      const updateInfo = (list: ChatRecord[]) => list.map((chat) => (chat.id === selectedChatId ? { ...chat, ...info } : chat));

      setChats((current) => updateInfo(current));
      setSearchChats((current) => updateInfo(current));
      setError(undefined);

      try {
        await updateChatDetails({
          id: selectedChat.id,
          ...info,
        });
      } catch (err) {
        restoreSelectedChat(previousChat);
        const message = err instanceof Error ? err.message : "Não foi possível salvar as informações do contato.";
        setError(message);
        throw new Error(message);
      }
    },
    [restoreSelectedChat, selectedChat, selectedChatId],
  );

  const handleChangeContactStatus = useCallback(
    async (status: ChatStatusOption) => {
      if (!selectedChat || !selectedChatId) return;
      const previousChat = selectedChat;
      const updatePatch = getStatusFields(selectedChat, status);

      const updateStatus = (list: ChatRecord[]) =>
        list.map((chat) =>
          chat.id === selectedChatId
            ? {
                ...chat,
                ...updatePatch,
              }
            : chat,
        );

      setChats((current) => updateStatus(current));
      setSearchChats((current) => updateStatus(current));
      setError(undefined);

      try {
        await updateChatDetails({
          id: selectedChat.id,
          ...updatePatch,
        });
      } catch (err) {
        restoreSelectedChat(previousChat);
        setError(err instanceof Error ? err.message : "Não foi possível salvar o status do contato.");
      }
    },
    [restoreSelectedChat, selectedChat, selectedChatId],
  );

  const handleToggleContactTag = useCallback(
    async (tag: ChatTag) => {
      if (!selectedChat) return;

      const previousChat = selectedChat;
      const currentTags = getChatTags(selectedChat);
      const tagKey = getTagKey(tag);
      const hasTag = currentTags.some((currentTag) => getTagKey(currentTag) === tagKey);
      const nextTags = hasTag ? currentTags.filter((currentTag) => getTagKey(currentTag) !== tagKey) : [...currentTags, tag];

      updateSelectedChatTags(nextTags);
      setError(undefined);

      try {
        await updateChatDetails({
          id: selectedChat.id,
          tags: nextTags,
        });
      } catch (err) {
        restoreSelectedChat(previousChat);
        setError(err instanceof Error ? err.message : "Não foi possível salvar as tags do contato.");
      }
    },
    [restoreSelectedChat, selectedChat, updateSelectedChatTags],
  );

  const handleReorderTags = useCallback(
    (tags: ChatTag[]) => {
      updateSelectedChatTags(tags);
    },
    [updateSelectedChatTags],
  );

  const handleCommitTagOrder = useCallback(
    async (tags: ChatTag[]) => {
      if (!selectedChat) return;

      const previousChat = selectedChat;
      setError(undefined);

      try {
        await updateChatDetails({
          id: selectedChat.id,
          tags,
        });
      } catch (err) {
        restoreSelectedChat(previousChat);
        setError(err instanceof Error ? err.message : "Não foi possível salvar a ordem das tags.");
      }
    },
    [restoreSelectedChat, selectedChat],
  );

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (isMobile) {
    if (!selectedChat) {
      return (
        <ContactList
          chats={visibleChats}
          search={search}
          isLoadingMessages={isLoadingChats}
          isLoadingMore={isSearching ? isLoadingMoreSearchChats : isLoadingMoreChats}
          isSearching={isSearchingChats}
          hasMore={isSearching ? hasMoreSearchChats : hasMoreChats}
          selectedId={undefined}
          latestMessageStatuses={latestMessageStatuses}
          onSearchChange={setSearch}
          onSelect={(id) => {
            handleSelectChat(id);
            setShowDetails(false);
          }}
          onLoadMore={loadMoreChats}
          onCreateContact={handleCreateContact}
          isSignatureMode={effectiveSignatureMode}
          onToggleAssinatura={setIsAssinaturaMode}
          isGhostMode={effectiveGhostMode}
          onToggleGhost={setIsGhostMode}
          canUseAdminChatModes={canUseAdminChatModes}
          isMobile={isMobile}
        />
      );
    }

    if (showDetails) {
      return (
        <ContactDetails
          chat={selectedChat}
          onClose={() => setShowDetails(false)}
          onToggleStatus={handleToggleStatus}
          onToggleIA={handleToggleIA}
          statusOptions={contactStatusOptions}
          tagOptions={contactTagOptions}
          onChangeStatus={handleChangeContactStatus}
          onToggleTag={handleToggleContactTag}
          onMarkAsRead={handleMarkAsReadPersisted}
          onMarkAsUnread={handleMarkAsUnread}
          onReorderTags={handleReorderTags}
          onCommitTagOrder={handleCommitTagOrder}
          isMobile={true}
        />
      );
    }

    // Janela de Chat nativa
    return (
      <ChatWindow
        chat={selectedChat}
        messages={messages}
        isLoading={isLoadingSelectedMessages}
        isLoadingOlder={isLoadingOlderMessages}
        hasMoreMessages={!!selectedChatRemoteId && hasMoreMessages}
        onLoadOlderMessages={loadOlderMessages}
        onCloseChat={handleCloseChat}
        onSendMessage={handleSendMessage}
        onReplyMessage={handleReplyMessage}
        onForwardMessage={handleForwardMessage}
        onForwardMessages={handleForwardMessages}
        onDeleteMessage={handleDeleteMessage}
        onDeleteMessages={handleDeleteMessages}
        forwardTargets={chats}
        error={error}
        onToggleDetails={() => setShowDetails(!showDetails)}
        isDetailsOpen={showDetails}
        onToggleStatus={handleToggleStatus}
        isMobile={true}
        isSignatureMode={effectiveSignatureMode}
      />
    );
  }

  // Desktop (original) layout
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ContactList
        chats={visibleChats}
        search={search}
        isLoadingMessages={isLoadingChats}
        isLoadingMore={isSearching ? isLoadingMoreSearchChats : isLoadingMoreChats}
        isSearching={isSearchingChats}
        hasMore={isSearching ? hasMoreSearchChats : hasMoreChats}
        selectedId={selectedChat?.id}
        latestMessageStatuses={latestMessageStatuses}
        onSearchChange={handleSearchChange}
        onSelect={handleSelectChat}
        onLoadMore={loadMoreChats}
        onCreateContact={handleCreateContact}
        isSignatureMode={effectiveSignatureMode}
        onToggleAssinatura={setIsAssinaturaMode}
        isGhostMode={effectiveGhostMode}
        onToggleGhost={setIsGhostMode}
        canUseAdminChatModes={canUseAdminChatModes}
      />
      <Group orientation="horizontal">
        <Panel>
          <ChatWindow
            chat={selectedChat}
            messages={messages}
            isLoading={isLoadingSelectedMessages}
            isLoadingOlder={isLoadingOlderMessages}
            hasMoreMessages={!!selectedChatRemoteId && hasMoreMessages}
            onLoadOlderMessages={loadOlderMessages}
            onCloseChat={handleCloseChat}
            onSendMessage={handleSendMessage}
            onReplyMessage={handleReplyMessage}
            onForwardMessage={handleForwardMessage}
            onForwardMessages={handleForwardMessages}
            onDeleteMessage={handleDeleteMessage}
            onDeleteMessages={handleDeleteMessages}
            forwardTargets={chats}
            error={error}
            onToggleDetails={() => setShowDetails(!showDetails)}
            isDetailsOpen={showDetails}
            onToggleStatus={handleToggleStatus}
            isSignatureMode={effectiveSignatureMode}
          />
        </Panel>

        {selectedChat && showDetails && (
          <>
            <Separator className="w-1 bg-(--chat-muted)/50 transition-colors hover:bg-theme-primary/50" />
            <Panel id="details-panel" defaultSize="360px" minSize="360px" maxSize="600px" className="bg-(--chat-card) border-l border-(--chat-muted)">
              <ContactDetails
                chat={selectedChat}
                onClose={() => setShowDetails(false)}
                onToggleStatus={handleToggleStatus}
                onToggleIA={handleToggleIA}
                statusOptions={contactStatusOptions}
                tagOptions={contactTagOptions}
                onChangeStatus={handleChangeContactStatus}
                onToggleTag={handleToggleContactTag}
                onChangeName={handleChangeContactName}
                onChangeContactInfo={handleChangeContactInfo}
                onMarkAsRead={handleMarkAsReadPersisted}
                onMarkAsUnread={handleMarkAsUnread}
                onReorderTags={handleReorderTags}
                onCommitTagOrder={handleCommitTagOrder}
              />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}
