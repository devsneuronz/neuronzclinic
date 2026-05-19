"use client";

import type { FormEvent, UIEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ChatRecord, MessageRecord, fetchChats } from "@/lib/supabase-rest";
import { AttachmentPreviewModal } from "./attachment-preview-modal";
import { ChatComposer } from "./chat-composer";
import { getAttachmentType } from "./chat-attachment-utils";
import { ChatHeader } from "./chat-header";
import { DeleteMessageDialog } from "./delete-message-dialog";
import { ExpandedImageModal } from "./expanded-image-modal";
import { ForwardMessageDialog } from "./forward-message-dialog";
import { MessageList } from "./message-list";
import { getDateLabel, isDeletedMessage } from "./message-utils";

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
  isMobile?: boolean;
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
  isMobile,
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
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;

    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

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

  const attachmentKind = getAttachmentType(attachment);

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-background">
      <div className="flex flex-1 flex-col border-r border-border relative w-full">
        <ChatHeader
          chat={chat}
          isSelectionMode={isSelectionMode}
          selectedMessagesCount={selectedMessages.length}
          canDeleteSelectedMessages={canDeleteSelectedMessages}
          onClearSelection={clearSelectedMessages}
          onForwardSelected={beginForwardSelected}
          onDeleteSelected={beginDeleteSelected}
          onToggleDetails={onToggleDetails}
          onToggleStatus={onToggleStatus}
          isMobile={isMobile}
          onCloseChat={onCloseChat}
        />

        <MessageList
          chat={chat}
          groupedMessages={groupedMessages}
          messagesByRemoteId={messagesByRemoteId}
          selectedMessageIds={selectedMessageIds}
          isSelectionMode={isSelectionMode}
          highlightedMessageId={highlightedMessageId}
          isLoading={isLoading}
          isLoadingOlder={isLoadingOlder}
          hasMoreMessages={hasMoreMessages}
          error={error}
          showScrollButton={showScrollButton}
          scrollAreaRef={scrollAreaRef}
          bottomRef={bottomRef}
          onMessagesScroll={handleMessagesScroll}
          onLoadOlderClick={async () => {
            const scrollArea = scrollAreaRef.current;
            if (scrollArea) previousScrollHeightRef.current = scrollArea.scrollHeight;
            const addedCount = await onLoadOlderMessages?.();
            if (!addedCount) previousScrollHeightRef.current = null;
          }}
          onScrollToLastMessage={handleScrollToLastMessage}
          onToggleSelection={toggleMessageSelection}
          onReply={beginReply}
          onForward={beginForward}
          onDelete={beginDelete}
          onExpandImage={(url: string, alt: string) => setExpandedImage({ url, alt })}
          onScrollToMessage={handleScrollToMessage}
        />
        <ChatComposer
          chat={chat}
          draft={draft}
          attachment={attachment}
          replyTo={replyTo}
          isSending={isSending}
          isRecording={isRecording}
          isRecordingPaused={isRecordingPaused}
          recordingSeconds={recordingSeconds}
          messageActionError={messageActionError}
          recordingError={recordingError}
          fileInputRef={fileInputRef}
          photoInputRef={photoInputRef}
          videoInputRef={videoInputRef}
          cameraInputRef={cameraInputRef}
          onSubmit={handleSubmit}
          onDraftChange={setDraft}
          onOpenAttachmentPreview={() => setIsAttachmentPreviewOpen(true)}
          onRemoveAttachment={removeAttachment}
          onCancelReply={() => setReplyTo(null)}
          onAttachmentSelected={handleAttachmentSelected}
          onStartRecording={startRecording}
          onCancelRecording={cancelRecording}
          onToggleRecordingPause={toggleRecordingPause}
          onSendRecording={sendRecording}
        />
      </div>

      {attachment && isAttachmentPreviewOpen && (
        <AttachmentPreviewModal
          attachment={attachment}
          attachmentKind={attachmentKind}
          attachmentPreviewUrl={attachmentPreviewUrl}
          draft={draft}
          isSending={isSending}
          onDraftChange={setDraft}
          onRemoveAttachment={removeAttachment}
          onSubmit={handleSubmit}
        />
      )}

      {expandedImage && <ExpandedImageModal image={expandedImage} onClose={() => setExpandedImage(null)} />}

      <ForwardMessageDialog
        chat={chat}
        messages={forwardingMessages}
        selectedForwardTarget={selectedForwardTarget}
        selectedForwardTargetRecord={selectedForwardTargetRecord}
        forwardSearch={forwardSearch}
        forwardTargetResults={forwardTargetResults}
        isLoadingForwardTargets={isLoadingForwardTargets}
        isLoadingMoreForwardTargets={isLoadingMoreForwardTargets}
        hasMoreForwardTargets={hasMoreForwardTargets}
        isForwarding={isForwarding}
        messageActionError={messageActionError}
        onClose={() => setForwardingMessages([])}
        onSearchChange={setForwardSearch}
        onSelectTarget={setSelectedForwardTarget}
        onLoadMore={loadMoreForwardTargets}
        onSubmit={handleForwardSubmit}
      />

      <DeleteMessageDialog chat={chat} messages={deleteConfirmationMessages} messageActionError={messageActionError} onClose={() => setDeleteConfirmationMessages([])} onConfirm={handleDeleteMessage} />
    </div>
  );
}
