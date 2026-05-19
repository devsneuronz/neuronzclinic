import { buildEvolutionQuotedPayload } from "@/lib/message-replies"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL

const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!SUPABASE_REST_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_REST_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
}

const headers = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
}
const supabaseRestUrl = SUPABASE_REST_URL

export interface ChatRecord {
  id: string
  chat_id: string
  nome_contato: string | null
  pushname: string | null
  phone_contact: string | null
  url_foto_perfil: string | null
  text_last_message: string | null
  last_message_time: string | null
  last_time_formatado: string | null
  unread_count: number | null
  pinned: boolean | null
  archived: boolean | null
  finalizada: boolean | null
  ia_responde: boolean | null
  last_message_fromMe: boolean | null
  Status_chat: string | null
  hex_status: string | null
  json_tags: unknown
  json_tags_parsed: unknown
  tag_chat_array: unknown
  dono: string | null
  setor: unknown
  grupo: unknown
  draft: string | null
  lid_id: string | null
  updated_at: string | null
}

export interface MessageRecord {
  id: string
  message_id: string | null
  from_me: boolean | null
  chat_id: string | null
  participant: string | null
  message_type: string | null
  content: string | null
  media_url: string | null
  media_path: string | null
  media_mime_type: string | null
  public_media_url: string | null
  public_midia_thumb: string | null
  timestamp_msg: string | null
  status: string | null
  quoted_message_id?: string | null
  quoted_content?: string | null
  quoted_from_me?: boolean | null
  quoted_message_type?: string | null
  metadata?: unknown
  raw_message?: unknown
  message?: unknown
  data?: unknown
  deleted_at?: string | null
  is_deleted?: boolean | null
  revoked?: boolean | null
}

export interface SendMessageInput {
  chatId: string
  text?: string
  file?: File | null
  replyTo?: MessageRecord | null
}

export interface ForwardMessageInput {
  targetChatId: string
  message: MessageRecord
}

export interface ForwardMessagesInput {
  targetChatId: string
  messages: MessageRecord[]
}

export interface DeleteMessageInput {
  chatId: string
  message: MessageRecord
}

export interface DeleteMessagesInput {
  chatId: string
  messages: MessageRecord[]
}

export interface UpdateChatDetailsInput {
  id: string
  nome_contato?: string | null
  Status_chat?: string | null
  hex_status?: string | null
  finalizada?: boolean | null
  ia_responde?: boolean | null
  tags?: Array<{ id: string; label: string; color?: string | null }>
}

export interface LatestMessageStatusRecord {
  chat_id: string | null
  status: string | null
  timestamp_msg: string | null
}

export interface LatestMessageStatus {
  status: string | null
  timestamp_msg: string | null
}

export interface LatestChatMessage {
  chat_id: string | null
  content: string | null
  message_type: string | null
  media_mime_type: string | null
  timestamp_msg: string | null
  from_me: boolean | null
  status: string | null
}

function getTimestampValue(value?: string | null) {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

function hasMediaPreview(message: Pick<LatestChatMessage, "media_mime_type" | "message_type">) {
  const type = `${message.media_mime_type || ""} ${message.message_type || ""}`.toLowerCase()
  return (
    type.includes("image") ||
    type.includes("video") ||
    type.includes("audio") ||
    type.includes("sticker") ||
    type.includes("document") ||
    type.includes("file") ||
    type.includes("application/")
  )
}

function isBetterLatestMessage(message: LatestChatMessage, currentMessage?: LatestChatMessage) {
  if (!currentMessage) return true

  const messageTime = getTimestampValue(message.timestamp_msg)
  const currentTime = getTimestampValue(currentMessage.timestamp_msg)

  if (messageTime !== currentTime) return messageTime > currentTime
  return hasMediaPreview(message) && !hasMediaPreview(currentMessage)
}

async function supabaseGet<T>(path: string): Promise<T> {
  const url = `${supabaseRestUrl.replace(/\/$/, "")}/${path}`
  const response = await fetch(url, {
    headers,
    cache: "no-store",
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || `Supabase request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

interface PaginationOptions {
  limit?: number
  offset?: number
}

interface ChatQueryOptions extends PaginationOptions {
  search?: string
}

function escapePostgrestPattern(value: string) {
  return value.replace(/[%*_]/g, (character) => `\\${character}`)
}

export function fetchChats({ limit = 50, offset = 0, search }: ChatQueryOptions = {}) {
  const select = [
    "id",
    "chat_id",
    "nome_contato",
    "pushname",
    "phone_contact",
    "url_foto_perfil",
    "text_last_message",
    "last_message_time",
    "last_time_formatado",
    "unread_count",
    "pinned",
    "archived",
    "finalizada",
    "ia_responde",
    "last_message_fromMe",
    "Status_chat",
    "hex_status",
    "json_tags",
    "json_tags_parsed",
    "tag_chat_array",
    "dono",
    "setor",
    "grupo",
    "draft",
    "lid_id",
    "updated_at",
  ].join(",")
  const term = search?.trim()
  const searchFilter = term
    ? `&or=(${[
        "nome_contato",
        "pushname",
        "phone_contact",
        "chat_id",
        "text_last_message",
        "Status_chat",
      ]
        .map((field) => `${field}.ilike.*${encodeURIComponent(escapePostgrestPattern(term))}*`)
        .join(",")})`
    : ""

  return supabaseGet<ChatRecord[]>(
    `chats?select=${select}&archived=is.false${searchFilter}&order=last_message_time.desc.nullslast&limit=${limit}&offset=${offset}`,
  )
}

export function fetchMessages(chatId: string, { limit = 50, offset = 0 }: PaginationOptions = {}) {
  const select = "*"

  return supabaseGet<MessageRecord[]>(
    `messages?select=${select}&chat_id=eq.${encodeURIComponent(chatId)}&order=timestamp_msg.desc.nullslast&limit=${limit}&offset=${offset}`,
  )
}

export function fetchLatestMessageStatuses(chatIds: string[]): Promise<Record<string, LatestMessageStatus>> {
  const uniqueChatIds = Array.from(new Set(chatIds.filter(Boolean)))

  if (uniqueChatIds.length === 0) {
    return Promise.resolve({})
  }

  const select = ["chat_id", "status", "timestamp_msg"].join(",")
  const encodedIds = uniqueChatIds.map((chatId) => encodeURIComponent(chatId)).join(",")
  const limit = Math.max(uniqueChatIds.length * 20, 1000)

  return supabaseGet<LatestMessageStatusRecord[]>(
    `messages?select=${select}&chat_id=in.(${encodedIds})&from_me=is.true&order=timestamp_msg.desc.nullslast&limit=${limit}`,
  ).then((messages) => {
    const initialStatuses = Object.fromEntries(
      uniqueChatIds.map((chatId) => [chatId, { status: null, timestamp_msg: null }]),
    )
    const seenChatIds = new Set<string>()

    return messages.reduce<Record<string, LatestMessageStatus>>((statuses, message) => {
      if (message.chat_id && !seenChatIds.has(message.chat_id)) {
        statuses[message.chat_id] = {
          status: message.status,
          timestamp_msg: message.timestamp_msg,
        }
        seenChatIds.add(message.chat_id)
      }

      return statuses
    }, initialStatuses)
  })
}

export function fetchLatestMessagesForChats(chatIds: string[]): Promise<Record<string, LatestChatMessage>> {
  const uniqueChatIds = Array.from(new Set(chatIds.filter(Boolean)))

  if (uniqueChatIds.length === 0) {
    return Promise.resolve({})
  }

  const select = ["chat_id", "content", "message_type", "media_mime_type", "timestamp_msg", "from_me", "status"].join(",")
  const encodedIds = uniqueChatIds.map((chatId) => encodeURIComponent(chatId)).join(",")
  const limit = Math.max(uniqueChatIds.length * 20, 1000)

  return supabaseGet<LatestChatMessage[]>(
    `messages?select=${select}&chat_id=in.(${encodedIds})&order=timestamp_msg.desc.nullslast&limit=${limit}`,
  ).then((messages) => {
    const latestMessages: Record<string, LatestChatMessage> = {}

    for (const message of messages) {
      if (message.chat_id && isBetterLatestMessage(message, latestMessages[message.chat_id])) {
        latestMessages[message.chat_id] = message
      }
    }

    return latestMessages
  })
}

export async function sendMessage({ chatId, text, file, replyTo }: SendMessageInput) {
  const formData = new FormData()
  formData.append("chat_id", chatId)

  const trimmedText = text?.trim()
  if (trimmedText) {
    formData.append("text", trimmedText)
  }

  if (file) {
    formData.append("file", file)
  }

  if (replyTo) {
    const quotedPayload = buildEvolutionQuotedPayload(replyTo)

    formData.append("reply_to_message_id", replyTo.message_id || replyTo.id)
    formData.append("reply_to_content", replyTo.content || "")
    formData.append("reply_to_type", replyTo.message_type || "")
    formData.append("reply_to_from_me", String(!!replyTo.from_me))
    formData.append("reply_to_chat_id", replyTo.chat_id || "")
    formData.append("reply_to_participant", replyTo.participant || "")

    if (quotedPayload) {
      formData.append("quoted", JSON.stringify(quotedPayload))
    }
  }

  const response = await fetch("/api/send-message", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Nao foi possivel enviar a mensagem (${response.status}).`)
  }

  return response.json()
}

function getForwardMessagePayload(message: MessageRecord) {
  return {
    id: message.id,
    message_id: message.message_id || message.id,
    message_type: message.message_type || "text",
    content: message.content || "",
    media_url: message.public_media_url || message.media_url || null,
    media_path: message.media_path || null,
    media_mime_type: message.media_mime_type || null,
  }
}

export async function forwardMessages({ targetChatId, messages }: ForwardMessagesInput) {
  const response = await fetch("/api/message-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "forward",
      target_chat_id: targetChatId,
      messages: messages.map(getForwardMessagePayload),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Nao foi possivel encaminhar a mensagem (${response.status}).`)
  }

  return response.json()
}

export function forwardMessage({ targetChatId, message }: ForwardMessageInput) {
  return forwardMessages({ targetChatId, messages: [message] })
}

function getDeleteMessagePayload(message: MessageRecord) {
  return {
    id: message.id,
    chat_id: message.chat_id,
    message_id: message.message_id || message.id,
    from_me: !!message.from_me,
  }
}

export async function deleteMessages({ chatId, messages }: DeleteMessagesInput) {
  const response = await fetch("/api/message-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "delete",
      chat_id: chatId,
      messages: messages.map(getDeleteMessagePayload),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Nao foi possivel apagar a mensagem (${response.status}).`)
  }

  return response.json()
}

export function deleteMessage({ chatId, message }: DeleteMessageInput) {
  return deleteMessages({ chatId, messages: [message] })
}

export async function updateChatDetails({ id, ...payload }: UpdateChatDetailsInput) {
  const response = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Nao foi possivel atualizar o contato (${response.status}).`)
  }

  return response.json() as Promise<{ chat: ChatRecord }>
}
