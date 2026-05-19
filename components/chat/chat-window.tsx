"use client";

import Image from "next/image";
import type { FormEvent, UIEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Camera, Check, FileImage, FileText, Forward, Info, MapPin, Mic, Paperclip, Pause, PenLine, Reply, Search, Send, Trash2, UserRound, Video, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { cn } from "@/lib/utils";
import { ChatRecord, MessageRecord, fetchChats } from "@/lib/supabase-rest";
import { MessageBubble } from "./message-bubble";
import { formatTime, getDateLabel, getDisplayName, getMediaKind, getMessagePreviewText, isDeletedMessage } from "./message-utils";

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
  isDetailsOpen,
}: ChatWindowProps) {
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
  const forwardSearchRequestIdRef = useRef(0);
  const normalizedForwardSearch = forwardSearch.trim();
  const debouncedForwardSearch = useDebouncedValue(normalizedForwardSearch, 250);
  const forwardSearchQuery = normalizedForwardSearch ? debouncedForwardSearch.trim() : "";
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
    if (forwardingMessages.length === 0) return;

    let isMounted = true;
    const requestId = ++forwardSearchRequestIdRef.current;

    async function loadForwardTargets() {
      const term = forwardSearchQuery;

      setIsLoadingForwardTargets(true);
      try {
        const data = await fetchChats({ limit: FORWARD_TARGET_PAGE_SIZE, offset: 0, search: term || undefined });
        if (!isMounted || requestId !== forwardSearchRequestIdRef.current) return;
        setForwardTargetResults(data);
        setHasMoreForwardTargets(data.length === FORWARD_TARGET_PAGE_SIZE);
        setSelectedForwardTarget((current) => current || chat?.chat_id || data[0]?.chat_id || "");
      } catch (error) {
        if (!isMounted || requestId !== forwardSearchRequestIdRef.current) return;
        setForwardTargetResults([]);
        setHasMoreForwardTargets(false);
        setMessageActionError(error instanceof Error ? error.message : "Nao foi possivel buscar os chats.");
      } finally {
        if (isMounted && requestId === forwardSearchRequestIdRef.current) setIsLoadingForwardTargets(false);
      }
    }

    void loadForwardTargets();

    return () => {
      isMounted = false;
    };
  }, [chat?.chat_id, forwardSearchQuery, forwardingMessages.length]);

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
      if (isDetailsOpen) {
        onToggleDetails();
        return;
      }
      onCloseChat?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chat, deleteConfirmationMessages.length, forwardingMessages.length, isDetailsOpen, onCloseChat, onToggleDetails, selectedMessageIds.size]);

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
    forwardSearchRequestIdRef.current += 1;
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
        search: forwardSearchQuery || undefined,
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
                    <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-semibold text-white">{getAvatarInitials(getDisplayName(chat), "C")}</AvatarFallback>
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
                          <AvatarFallback className="bg-teal-500 text-xs font-semibold text-white">{getAvatarInitials(getDisplayName(target), "C")}</AvatarFallback>
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
