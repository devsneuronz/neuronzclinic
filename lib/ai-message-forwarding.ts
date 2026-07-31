import { createHash } from "crypto"

import { supabaseJson, supabaseRequest } from "@/lib/supabase-server"

const AI_RECEIVE_MESSAGE_WEBHOOK_URL = process.env.AI_RECEIVE_MESSAGE_WEBHOOK_URL
const AI_RECEIVE_MESSAGE_TIMEOUT_MS = 90000
const LATEST_MESSAGE_LIMIT = 20

type ForwardableChat = {
  id: string
  chat_id?: string | null
  contact_id?: string | null
  nome_contato?: string | null
  pushname?: string | null
  phone_contact?: string | null
}

type MessageRow = {
  id: string
  message_id: string | null
  chat_id: string | null
  chat_table_id: string | null
  from_me: boolean | null
  content: string | null
  message_type: string | null
  media_url: string | null
  public_media_url: string | null
  timestamp_msg: string | null
  metadata: Record<string, unknown> | null
}

type ForwardPendingResult = {
  forwarded: boolean
  skipped: boolean
  reason?: string
  messageIds?: string[]
  payloadHash?: string
  webhook?: unknown
}

const MESSAGE_SELECT = ["id", "message_id", "chat_id", "chat_table_id", "from_me", "content", "message_type", "media_url", "public_media_url", "timestamp_msg", "metadata"].join(",")

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function getNestedString(source: Record<string, unknown>, path: string[]) {
  let current: unknown = source
  for (const segment of path) {
    const record = getRecord(current)
    if (!record) return ""
    current = record[segment]
  }

  return getString(current)
}

function getMessageContent(message: MessageRow) {
  return getString(message.content) || getString(message.public_media_url) || getString(message.media_url)
}

function hasForwardableContent(message: MessageRow) {
  return Boolean(getMessageContent(message))
}

function wasForwardedToAi(message: MessageRow) {
  return message.metadata?.ai_forwarded_to_ia === true
}

function getPayloadHash(values: string[]) {
  return createHash("sha256").update(values.join("\n")).digest("hex")
}

function requireWebhookUrl() {
  if (!AI_RECEIVE_MESSAGE_WEBHOOK_URL) throw new Error("Configure AI_RECEIVE_MESSAGE_WEBHOOK_URL no .env.local.")
  return AI_RECEIVE_MESSAGE_WEBHOOK_URL
}

async function readWebhookResponse(response: Response) {
  const text = await response.text()
  if (!text.trim()) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function postAiReceiveMessageWebhook(payload: Record<string, unknown>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_RECEIVE_MESSAGE_TIMEOUT_MS)

  try {
    const response = await fetch(requireWebhookUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    })
    const body = await readWebhookResponse(response)

    if (!response.ok) {
      throw new Error(typeof body === "string" ? body : JSON.stringify(body))
    }

    return body
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchLatestChatMessages(chat: ForwardableChat) {
  const filters = [`chat_table_id.eq.${chat.id}`]
  if (chat.chat_id) filters.push(`chat_id.eq.${chat.chat_id}`)

  const params = new URLSearchParams({
    select: MESSAGE_SELECT,
    or: `(${filters.join(",")})`,
    order: "timestamp_msg.desc",
    limit: String(LATEST_MESSAGE_LIMIT),
  })

  return supabaseJson<MessageRow[]>(`messages?${params}`)
}

function getLatestIncomingRun(messages: MessageRow[]) {
  const ordered = [...messages].sort((first, second) => {
    const firstTime = first.timestamp_msg ? new Date(first.timestamp_msg).getTime() : 0
    const secondTime = second.timestamp_msg ? new Date(second.timestamp_msg).getTime() : 0
    return secondTime - firstTime
  })

  if (ordered.length === 0) return []
  if (ordered[0].from_me === true) return []

  const latestIncoming: MessageRow[] = []
  for (const message of ordered) {
    if (message.from_me === true) break
    latestIncoming.push(message)
  }

  return latestIncoming.reverse()
}

async function markMessagesForwarded(messages: MessageRow[], payloadHash: string, source: string) {
  const forwardedAt = new Date().toISOString()

  await Promise.all(
    messages.map(async (message) => {
      const response = await supabaseRequest(`messages?id=eq.${encodeURIComponent(message.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          metadata: {
            ...(message.metadata ?? {}),
            ai_forwarded_to_ia: true,
            ai_forwarded_to_ia_at: forwardedAt,
            ai_forwarded_payload_hash: payloadHash,
            ai_forwarded_source: source,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }
    }),
  )
}

export function getIncomingMessageIdFromPayload(payload: Record<string, unknown>) {
  return (
    getString(payload.message_id) ||
    getString(payload.messageId) ||
    getString(payload.id) ||
    getNestedString(payload, ["key", "id"]) ||
    getNestedString(payload, ["data", "key", "id"]) ||
    getNestedString(payload, ["message", "id"]) ||
    getNestedString(payload, ["data", "message", "id"])
  )
}

export async function markIncomingPayloadForwarded({ chat, payload, received }: { chat: ForwardableChat; payload: Record<string, unknown>; received: string }) {
  const messageId = getIncomingMessageIdFromPayload(payload)
  if (!messageId) return { marked: false, reason: "message_id_not_found" }

  const params = new URLSearchParams({
    select: MESSAGE_SELECT,
    message_id: `eq.${messageId}`,
    from_me: "is.false",
    limit: "1",
  })
  const rows = await supabaseJson<MessageRow[]>(`messages?${params}`)
  const message = rows[0]
  if (!message) return { marked: false, reason: "message_not_found" }

  const payloadHash = getPayloadHash([chat.id, message.message_id || message.id, received])
  await markMessagesForwarded([message], payloadHash, "receive_message")
  return { marked: true, payloadHash }
}

export async function forwardPendingIncomingMessagesForChat(chat: ForwardableChat): Promise<ForwardPendingResult> {
  const latestMessages = await fetchLatestChatMessages(chat)
  const latestIncomingRun = getLatestIncomingRun(latestMessages)

  if (latestIncomingRun.length === 0) {
    return { forwarded: false, skipped: true, reason: latestMessages[0]?.from_me === true ? "latest_message_from_team" : "no_messages" }
  }

  const pendingMessages = latestIncomingRun.filter((message) => !wasForwardedToAi(message) && hasForwardableContent(message))
  if (pendingMessages.length === 0) {
    return { forwarded: false, skipped: true, reason: "latest_incoming_messages_already_forwarded" }
  }

  const received = pendingMessages.map(getMessageContent).join("\n")
  const messageIds = pendingMessages.map((message) => message.message_id || message.id)
  const payloadHash = getPayloadHash([chat.id, ...messageIds, received])
  const webhook = await postAiReceiveMessageWebhook({
    chad_id: chat.id,
    chat_row_id: chat.id,
    contact_id: chat.chat_id,
    received,
    text: received,
    mensagem: received,
    debounce_key: chat.id,
    replay_payload_hash: payloadHash,
    replay_message_ids: messageIds,
    replayed_from_ia_toggle: true,
    contact: {
      id: chat.contact_id,
      chat_row_id: chat.id,
      chat_id: chat.chat_id,
      name: chat.nome_contato || chat.pushname,
      phone: chat.phone_contact,
    },
    source: "neuronzclinic_ia_toggle_replay",
  })

  await markMessagesForwarded(pendingMessages, payloadHash, "ia_toggle_replay")

  return {
    forwarded: true,
    skipped: false,
    messageIds,
    payloadHash,
    webhook,
  }
}
