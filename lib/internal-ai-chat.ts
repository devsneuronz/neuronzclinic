import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest"

export const INTERNAL_AI_CHAT_PREFIX = "internal-ai-assistant"

export function isInternalAiChatId(value?: string | null) {
  return value === INTERNAL_AI_CHAT_PREFIX || value?.startsWith(`${INTERNAL_AI_CHAT_PREFIX}:`) === true
}

export function isInternalAiChat(chat?: Partial<ChatRecord> | null) {
  return isInternalAiChatId(chat?.id) || isInternalAiChatId(chat?.chat_id)
}

export function getInternalAiChatId(userProfileId: string) {
  return `${INTERNAL_AI_CHAT_PREFIX}:${userProfileId}`
}

export function createInternalAiMessage({ chatId, content, fromMe, status = "sent" }: { chatId: string; content: string; fromMe: boolean; status?: string }): MessageRecord {
  const id = `internal-ai-${crypto.randomUUID()}`
  return {
    id,
    message_id: id,
    from_me: fromMe,
    chat_id: chatId,
    participant: null,
    message_type: "text",
    content,
    media_url: null,
    media_path: null,
    media_mime_type: null,
    public_media_url: null,
    public_midia_thumb: null,
    timestamp_msg: new Date().toISOString(),
    status,
  }
}
