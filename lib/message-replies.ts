import type { MessageRecord } from "@/lib/supabase-rest"

export interface QuotedMessageInfo {
  messageId: string
  content: string
  fromMe: boolean
  participant?: string
}

interface EvolutionQuotedPayload {
  key: {
    id: string
    remoteJid?: string
    fromMe?: boolean
    participant?: string
  }
  message: {
    conversation: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function parseJsonRecord(value: unknown) {
  if (isRecord(value)) return value

  if (typeof value !== "string" || !value.trim()) return null

  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null
}

function firstString(...values: unknown[]) {
  return values.map(getString).find(Boolean) || ""
}

function getJid(value: unknown) {
  const text = getString(value)
  return text.includes("@") ? text : ""
}

function getMessageMetadata(message: MessageRecord) {
  const record = message as MessageRecord & Record<string, unknown>
  return parseJsonRecord(record.metadata) || parseJsonRecord(record.raw_message) || parseJsonRecord(record.message) || parseJsonRecord(record.data)
}

function findContextInfoWithQuoted(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !isRecord(value)) return null

  const directContext = parseJsonRecord(value.contextInfo)
  if (directContext && isRecord(directContext.quotedMessage)) return directContext

  const messageContext = parseJsonRecord(value.messageContextInfo)
  if (messageContext && isRecord(messageContext.quotedMessage)) return messageContext

  for (const item of Object.values(value)) {
    const parsed = parseJsonRecord(item)
    const found = findContextInfoWithQuoted(parsed, depth + 1)
    if (found) return found
  }

  return null
}

function getQuotedMessagePreview(quotedMessage: Record<string, unknown>) {
  const extendedText = parseJsonRecord(quotedMessage.extendedTextMessage)
  const image = parseJsonRecord(quotedMessage.imageMessage)
  const video = parseJsonRecord(quotedMessage.videoMessage)
  const audio = parseJsonRecord(quotedMessage.audioMessage)
  const document = parseJsonRecord(quotedMessage.documentMessage)
  const sticker = parseJsonRecord(quotedMessage.stickerMessage)

  return (
    firstString(quotedMessage.conversation, extendedText?.text, image?.caption, video?.caption, document?.caption) ||
    (image ? "Foto" : "") ||
    (video ? "Vídeo" : "") ||
    (audio ? "Áudio" : "") ||
    (document ? "Documento" : "") ||
    (sticker ? "Figurinha" : "") ||
    "Mensagem"
  )
}

function getMessagePreview(message: MessageRecord) {
  if (message.content?.trim()) return message.content.trim()

  const type = `${message.media_mime_type || ""} ${message.message_type || ""}`.toLowerCase()
  if (type.includes("image")) return "Foto"
  if (type.includes("video")) return "Vídeo"
  if (type.includes("audio")) return "Áudio"
  if (type.includes("sticker")) return "Figurinha"
  if (type.includes("document")) return "Documento"

  return "Mensagem"
}

export function extractQuotedMessageInfo(message: MessageRecord): QuotedMessageInfo | null {
  const record = message as MessageRecord & Record<string, unknown>
  const directMessageId = firstString(record.quoted_message_id, record.reply_to_message_id, record.quoted_id)
  const directContent = firstString(record.quoted_content, record.quoted_text, record.quoted_message, record.reply_to_content, record.reply_content)
  const directFromMe = getBoolean(record.quoted_from_me) ?? getBoolean(record.reply_to_from_me)

  if (directMessageId || directContent) {
    return {
      messageId: directMessageId,
      content: directContent || "Mensagem",
      fromMe: Boolean(directFromMe),
    }
  }

  const metadata = getMessageMetadata(message)
  const contextInfo = findContextInfoWithQuoted(metadata)
  const quotedMessage = parseJsonRecord(contextInfo?.quotedMessage)
  const stanzaId = firstString(contextInfo?.stanzaId, contextInfo?.quotedMessageId)

  if (!quotedMessage && !stanzaId) return null

  return {
    messageId: stanzaId,
    content: quotedMessage ? getQuotedMessagePreview(quotedMessage) : "Mensagem",
    fromMe: Boolean(directFromMe),
    participant: firstString(contextInfo?.participant, contextInfo?.remoteJid),
  }
}

export function buildEvolutionQuotedPayload(message: MessageRecord): EvolutionQuotedPayload | null {
  const metadata = getMessageMetadata(message)
  const key = parseJsonRecord(metadata?.key)
  const messageId = firstString(key?.id, message.message_id, message.id)

  if (!messageId) return null

  const remoteJid = getJid(key?.remoteJid) || getJid(message.chat_id)
  const participant = getJid(key?.participant) || getJid(message.participant)
  const fromMe = getBoolean(key?.fromMe) ?? Boolean(message.from_me)

  return {
    key: {
      id: messageId,
      ...(remoteJid ? { remoteJid } : {}),
      fromMe,
      ...(participant ? { participant } : {}),
    },
    message: {
      conversation: getMessagePreview(message),
    },
  }
}
