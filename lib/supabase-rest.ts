import { buildEvolutionQuotedPayload } from "@/lib/message-replies"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL

const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const CHAT_ID_BATCH_SIZE = 40

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
  cidade_residencia: string | null
  cidade_desejada: string | null
  email_contato: string | null
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
  json_interests_parsed?: unknown
  json_interests?: unknown
  interest_tags_array?: unknown
  interest_tags?: unknown
  interests?: unknown
  json_interesses_parsed?: unknown
  json_interesses?: unknown
  interesses_array?: unknown
  interesses?: unknown
  tag_interesse_array?: unknown
  tags_interesse?: unknown
  tags_interesses?: unknown
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
  contactName?: string | null
}

export interface ScheduledMessageRecord {
  id: string
  chat_id: string
  contact_name: string | null
  type: string | null
  text: string | null
  content: string | null
  caption: string | null
  media_url: string | null
  media_type: string | null
  media_mime_type: string | null
  filename: string | null
  reply_payload: unknown
  payload: unknown
  scheduled_at: string
  timezone: string | null
  status: "scheduled" | "processing" | "sent" | "failed" | "canceled"
  attempts: number | null
  max_attempts: number | null
  next_attempt_at: string | null
  sent_at: string | null
  canceled_at: string | null
  last_error: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ScheduleMessageInput {
  chatId: string
  scheduledAt: string
  text?: string
  file?: File | null
  replyTo?: MessageRecord | null
  contactName?: string | null
  createdBy?: string | null
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

export interface MarkChatAsReadInput {
  chatId: string
  messages?: MessageRecord[]
}

export interface UpdateChatDetailsInput {
  id: string
  nome_contato?: string | null
  phone_contact?: string | null
  cidade_residencia?: string | null
  cidade_desejada?: string | null
  email_contato?: string | null
  Status_chat?: string | null
  hex_status?: string | null
  finalizada?: boolean | null
  ia_responde?: boolean | null
  unread_count?: number | null
  tags?: Array<{ id: string; label: string; color?: string | null }>
  interestTags?: Array<{ id: string; label: string; color?: string | null }>
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

export interface ChatNoteRecord {
  id: string
  chat_id: string
  content: string
  created_at: string
  linked_message_id: string | null
  linked_message_preview: string | null
  linked_message_from_me: boolean | null
}

export interface CreateChatNoteInput {
  chatId: string
  content: string
  linkedMessageId?: string | null
  linkedMessagePreview?: string | null
  linkedMessageFromMe?: boolean | null
}

export interface ContactNoteRecord {
  id: string
  chat_id: string
  contact_phone: string | null
  content: string
  created_at: string
  updated_at: string
}

export interface CreateContactNoteInput {
  chatId: string
  contactPhone?: string | null
  content: string
}

export interface ImportAirtableContactNotesInput {
  chatId: string
  contactPhone?: string | null
}

export interface ImportAirtableContactNotesResult {
  imported: number
  skipped: number
  notes: ContactNoteRecord[]
  message?: string
  fields?: string[]
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
  const select = "*"
  const term = search?.trim()
  const searchFilter = term
    ? `&or=(${[
        "nome_contato",
        "pushname",
        "phone_contact",
        "cidade_residencia",
        "cidade_desejada",
        "email_contato",
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

  if (uniqueChatIds.length > CHAT_ID_BATCH_SIZE) {
    const batches = Array.from({ length: Math.ceil(uniqueChatIds.length / CHAT_ID_BATCH_SIZE) }, (_, index) => uniqueChatIds.slice(index * CHAT_ID_BATCH_SIZE, (index + 1) * CHAT_ID_BATCH_SIZE))

    return Promise.all(batches.map((batch) => fetchLatestMessageStatuses(batch))).then((results) => Object.assign({}, ...results))
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

  if (uniqueChatIds.length > CHAT_ID_BATCH_SIZE) {
    const batches = Array.from({ length: Math.ceil(uniqueChatIds.length / CHAT_ID_BATCH_SIZE) }, (_, index) => uniqueChatIds.slice(index * CHAT_ID_BATCH_SIZE, (index + 1) * CHAT_ID_BATCH_SIZE))

    return Promise.all(batches.map((batch) => fetchLatestMessagesForChats(batch))).then((results) => Object.assign({}, ...results))
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

export async function sendMessage({ chatId, text, file, replyTo, contactName }: SendMessageInput) {
  const formData = new FormData()
  formData.append("chat_id", chatId)

  const trimmedContactName = contactName?.trim()
  if (trimmedContactName) {
    formData.append("contact_name", trimmedContactName)
  }

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
    throw new Error(error?.message || `Não foi possível enviar a mensagem (${response.status}).`)
  }

  return response.json()
}

export async function fetchScheduledMessages({
  chatId,
  includeHistory = false,
  search,
}: {
  chatId?: string
  includeHistory?: boolean
  search?: string
} = {}) {
  const params = new URLSearchParams()
  if (chatId) params.set("chat_id", chatId)
  if (includeHistory) params.set("include_history", "true")
  if (search?.trim()) params.set("search", search.trim())

  const response = await fetch(`/api/scheduled-messages?${params.toString()}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Nao foi possivel carregar os agendamentos (${response.status}).`)
  }

  const data = (await response.json()) as { messages?: ScheduledMessageRecord[] }
  return data.messages ?? []
}

export async function scheduleMessage({ chatId, scheduledAt, text, file, replyTo, contactName, createdBy }: ScheduleMessageInput) {
  const formData = new FormData()
  formData.append("chat_id", chatId)
  formData.append("scheduled_at", scheduledAt)

  const trimmedContactName = contactName?.trim()
  if (trimmedContactName) formData.append("contact_name", trimmedContactName)

  const trimmedText = text?.trim()
  if (trimmedText) formData.append("text", trimmedText)
  if (file) formData.append("file", file)
  if (createdBy?.trim()) formData.append("created_by", createdBy.trim())

  if (replyTo) {
    const quotedPayload = buildEvolutionQuotedPayload(replyTo)
    if (quotedPayload) {
      formData.append("reply_payload", JSON.stringify(getReplyPayloadForSchedule(replyTo, quotedPayload as unknown as Record<string, unknown>)))
    }
  }

  const response = await fetch("/api/scheduled-messages", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Nao foi possivel agendar a mensagem (${response.status}).`)
  }

  const data = (await response.json()) as { message?: ScheduledMessageRecord }
  if (!data.message) throw new Error("O agendamento foi salvo, mas a API nao retornou o registro.")
  return data.message
}

function getReplyPayloadForSchedule(message: MessageRecord, quotedPayload: Record<string, unknown>) {
  const messageId = message.message_id || message.id

  return {
    reply_to: {
      message_id: messageId,
      content: message.content || "",
      type: message.message_type || "",
      from_me: !!message.from_me,
      chat_id: message.chat_id || "",
      participant: message.participant || "",
    },
    reply_to_message_id: messageId,
    replyToMessageId: messageId,
    quoted_message_id: messageId,
    quotedMessageId: messageId,
    quoted_content: message.content || "",
    quoted_message_type: message.message_type || "",
    quoted_from_me: !!message.from_me,
    quoted_remote_jid: message.chat_id || "",
    quoted_participant: message.participant || "",
    quoted_key: quotedPayload.key,
    quoted: quotedPayload,
    quotedMessage: quotedPayload,
    quoted_message: quotedPayload,
    options: {
      quoted: quotedPayload,
    },
  }
}

export async function cancelScheduledMessage(id: string) {
  const response = await fetch("/api/scheduled-messages", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, action: "cancel" }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Nao foi possivel cancelar o agendamento (${response.status}).`)
  }

  return response.json() as Promise<{ message?: ScheduledMessageRecord | null }>
}

export async function updateScheduledMessage({
  id,
  text,
  scheduledAt,
}: {
  id: string
  text: string
  scheduledAt: string
}) {
  const response = await fetch("/api/scheduled-messages", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, action: "update", text, scheduled_at: scheduledAt }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Nao foi possivel editar o agendamento (${response.status}).`)
  }

  const data = (await response.json()) as { message?: ScheduledMessageRecord | null }
  if (!data.message) throw new Error("O agendamento foi editado, mas a API nao retornou o registro.")
  return data.message
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
    throw new Error(error?.message || `Não foi possível encaminhar a mensagem (${response.status}).`)
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
    throw new Error(error?.message || `Não foi possível apagar a mensagem (${response.status}).`)
  }

  return response.json()
}

export function deleteMessage({ chatId, message }: DeleteMessageInput) {
  return deleteMessages({ chatId, messages: [message] })
}

function getReadMessagePayload(message: MessageRecord) {
  return {
    id: message.id,
    chat_id: message.chat_id,
    message_id: message.message_id || message.id,
    from_me: !!message.from_me,
    participant: message.participant,
  }
}

export async function markChatAsRead({ chatId, messages = [] }: MarkChatAsReadInput) {
  const response = await fetch("/api/message-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "read",
      chat_id: chatId,
      messages: messages.filter((message) => !message.from_me).map(getReadMessagePayload),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Não foi possível confirmar a leitura (${response.status}).`)
  }

  return response.json()
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
    throw new Error(error?.message || `Não foi possível atualizar o contato (${response.status}).`)
  }

  return response.json() as Promise<{ chat: ChatRecord }>
}

export async function fetchChatNotes(chatId: string) {
  const response = await fetch(`/api/chat-notes?chat_id=${encodeURIComponent(chatId)}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Não foi possível carregar as anotações (${response.status}).`)
  }

  const data = (await response.json()) as { notes?: ChatNoteRecord[] }
  return data.notes ?? []
}

export async function createChatNote({
  chatId,
  content,
  linkedMessageId = null,
  linkedMessagePreview = null,
  linkedMessageFromMe = null,
}: CreateChatNoteInput) {
  const response = await fetch("/api/chat-notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      content,
      linked_message_id: linkedMessageId,
      linked_message_preview: linkedMessagePreview,
      linked_message_from_me: linkedMessageFromMe,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Não foi possível salvar a anotação (${response.status}).`)
  }

  const data = (await response.json()) as { note?: ChatNoteRecord }
  if (!data.note) throw new Error("A anotação foi salva, mas a API não retornou o registro.")
  return data.note
}

export async function deleteChatNote(noteId: string) {
  const response = await fetch(`/api/chat-notes?id=${encodeURIComponent(noteId)}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Não foi possível apagar a anotação (${response.status}).`)
  }

  return response.json() as Promise<{ ok: true }>
}

export async function fetchContactNotes(chatId: string) {
  const response = await fetch(`/api/contact-notes?chat_id=${encodeURIComponent(chatId)}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Não foi possível carregar as anotações do contato (${response.status}).`)
  }

  const data = (await response.json()) as { notes?: ContactNoteRecord[] }
  return data.notes ?? []
}

export async function createContactNote({ chatId, contactPhone = null, content }: CreateContactNoteInput) {
  const response = await fetch("/api/contact-notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      contact_phone: contactPhone,
      content,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Não foi possível salvar a anotação do contato (${response.status}).`)
  }

  const data = (await response.json()) as { note?: ContactNoteRecord }
  if (!data.note) throw new Error("A anotação foi salva, mas a API não retornou o registro.")
  return data.note
}

export async function deleteContactNote(noteId: string) {
  const response = await fetch(`/api/contact-notes?id=${encodeURIComponent(noteId)}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || `Não foi possível apagar a anotação do contato (${response.status}).`)
  }

  return response.json() as Promise<{ ok: true }>
}

export async function importAirtableContactNotes({ chatId, contactPhone = null }: ImportAirtableContactNotesInput) {
  const response = await fetch("/api/airtable/contact-notes/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chatId,
      contactPhone,
    }),
  })

  const data = (await response.json().catch(() => null)) as ImportAirtableContactNotesResult | { message?: string } | null

  if (!response.ok) {
    throw new Error(data?.message || `Nao foi possivel importar as anotacoes antigas (${response.status}).`)
  }

  return {
    imported: "imported" in (data ?? {}) ? Number((data as ImportAirtableContactNotesResult).imported) : 0,
    skipped: "skipped" in (data ?? {}) ? Number((data as ImportAirtableContactNotesResult).skipped) : 0,
    notes: "notes" in (data ?? {}) && Array.isArray((data as ImportAirtableContactNotesResult).notes) ? (data as ImportAirtableContactNotesResult).notes : [],
    message: data?.message,
    fields: "fields" in (data ?? {}) ? (data as ImportAirtableContactNotesResult).fields : undefined,
  } satisfies ImportAirtableContactNotesResult
}
