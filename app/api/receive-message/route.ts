import { encodeEq, getBrazilPhoneVariants, getString, isUuid, supabaseJson } from "@/lib/supabase-server"
import { NextRequest, NextResponse } from "next/server"

const AI_RECEIVE_MESSAGE_WEBHOOK_URL = process.env.AI_RECEIVE_MESSAGE_WEBHOOK_URL
const AI_RECEIVE_MESSAGE_TIMEOUT_MS = 90000

type IncomingMessageBody = Record<string, unknown>

type ChatRow = {
  id: string
  chat_id: string | null
  contact_id: string | null
  nome_contato: string | null
  pushname: string | null
  phone_contact: string | null
  ia_responde: boolean | null
  finalizada: boolean | null
}

const CHAT_SELECT = ["id", "chat_id", "contact_id", "nome_contato", "pushname", "phone_contact", "ia_responde", "finalizada"].join(",")

function getRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== "string") return null

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function requireWebhookUrl(value: string | undefined, envName: string) {
  if (!value) throw new Error(`Configure ${envName} no .env.local.`)
  return value
}

function getPayloadSources(body: IncomingMessageBody) {
  const sources: IncomingMessageBody[] = [body]
  const nestedBody = getRecord(body.body)
  const data = getRecord(body.data)
  const nestedDataBody = getRecord(data?.body)
  const nestedPayload = getRecord(body.payload)
  const nestedDataPayload = getRecord(data?.payload)

  if (nestedBody) sources.push(nestedBody)
  if (data) sources.push(data)
  if (nestedDataBody) sources.push(nestedDataBody)
  if (nestedPayload) sources.push(nestedPayload)
  if (nestedDataPayload) sources.push(nestedDataPayload)

  return sources
}

function getNestedString(source: IncomingMessageBody, path: string[]) {
  let current: unknown = source
  for (const segment of path) {
    const record = getRecord(current)
    if (!record) return ""
    current = record[segment]
  }

  return getString(current)
}

function getPlainString(value: unknown) {
  const text = getString(value)
  if (!text) return ""
  return getRecord(text) ? "" : text
}

function getBoolean(value: unknown) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["true", "1", "sim", "yes"].includes(normalized)) return true
    if (["false", "0", "nao", "não", "no"].includes(normalized)) return false
  }
  return false
}

async function parseIncomingBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null)
    return getRecord(body)
  }

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData().catch(() => null)
    if (!formData) return null

    const body: IncomingMessageBody = {}
    for (const [key, value] of formData.entries()) {
      body[key] = typeof value === "string" ? value : value.name
    }
    return body
  }

  const body = await request.json().catch(() => null)
  return getRecord(body)
}

function getIncomingText(body: IncomingMessageBody) {
  for (const source of getPayloadSources(body)) {
    const directText =
      getString(source["mensagem-texto"]) ||
      getString(source.text) ||
      getString(source.texto) ||
      getString(source.mensagem) ||
      getString(source.content) ||
      getPlainString(source.body) ||
      getNestedString(source, ["data", "message", "conversation"]) ||
      getNestedString(source, ["data", "message", "extendedTextMessage", "text"]) ||
      getNestedString(source, ["data", "message", "imageMessage", "caption"]) ||
      getNestedString(source, ["data", "message", "videoMessage", "caption"]) ||
      getNestedString(source, ["data", "message", "documentMessage", "caption"]) ||
      getNestedString(source, ["message", "text"]) ||
      getNestedString(source, ["message", "conversation"]) ||
      getNestedString(source, ["message", "extendedTextMessage", "text"]) ||
      getNestedString(source, ["message", "imageMessage", "caption"]) ||
      getNestedString(source, ["message", "videoMessage", "caption"]) ||
      getNestedString(source, ["message", "documentMessage", "caption"]) ||
      getNestedString(source, ["message", "audioMessage", "url"]) ||
      getNestedString(source, ["message", "imageMessage", "url"])

    if (directText) return directText

    const message = source.message
    if (typeof message === "string") return message.trim()

    const image = source["mensagem-imagem"] ?? source.image ?? source.media_url ?? source.public_media_url ?? source.mediaUrl
    const imageText = getString(image)
    if (imageText) return imageText

    const imageRecord = getRecord(image)
    if (imageRecord) {
      return getString(imageRecord.url) || getString(imageRecord.caption) || JSON.stringify(imageRecord)
    }
  }

  return ""
}

function isOutgoingMessage(body: IncomingMessageBody) {
  return getPayloadSources(body).some((source) => {
    const key = getRecord(source.key)
    return getBoolean(source.from_me) || getBoolean(source.fromMe) || getBoolean(key?.fromMe)
  })
}

function getChatRowId(body: IncomingMessageBody) {
  for (const source of getPayloadSources(body)) {
    const chatRowId = getString(source.chad_id) || getString(source.chat_row_id) || getString(source.chatRowId) || getString(source.chat_table_id)
    if (chatRowId) return chatRowId
  }

  return ""
}

function getExternalChatId(body: IncomingMessageBody) {
  for (const source of getPayloadSources(body)) {
    const key = getRecord(source.key)
    const externalChatId =
      getString(source.contact_id) ||
      getString(source.chat_id) ||
      getString(source.remoteJid) ||
      getString(key?.remoteJid) ||
      getNestedString(source, ["data", "key", "remoteJid"]) ||
      getString(source.phone_contact) ||
      getString(source.sessionId)

    if (externalChatId) return externalChatId
  }

  return ""
}

async function fetchChatByFilter(filter: string) {
  const rows = await supabaseJson<ChatRow[]>(`chats?select=${CHAT_SELECT}&${filter}&limit=1`)
  return rows[0] ?? null
}

async function fetchChat(body: IncomingMessageBody) {
  const chatRowId = getChatRowId(body)
  if (isUuid(chatRowId)) {
    const chat = await fetchChatByFilter(`id=eq.${encodeEq(chatRowId)}`)
    if (chat) return chat
  }

  const externalChatId = getExternalChatId(body)
  if (externalChatId) {
    const directFilters = [`chat_id=eq.${encodeEq(externalChatId)}`, `lid_id=eq.${encodeEq(externalChatId)}`]
    if (isUuid(externalChatId)) directFilters.push(`contact_id=eq.${encodeEq(externalChatId)}`)

    for (const filter of directFilters) {
      const chat = await fetchChatByFilter(filter)
      if (chat) return chat
    }

    for (const phone of getBrazilPhoneVariants(externalChatId)) {
      const chat = await fetchChatByFilter(`phone_contact=ilike.${encodeURIComponent(`*${phone}*`)}`)
      if (chat) return chat
    }
  }

  return null
}

async function readWebhookResponse(response: Response) {
  const text = await response.text()
  if (!text.trim()) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function POST(request: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_RECEIVE_MESSAGE_TIMEOUT_MS)

  try {
    const body = await parseIncomingBody(request)
    if (!body) {
      return NextResponse.json({ message: "Payload de mensagem invalido." }, { status: 400 })
    }

    if (isOutgoingMessage(body)) {
      return NextResponse.json({ ok: true, forwarded: false, skipped: true, reason: "outgoing_message" })
    }

    const received = getIncomingText(body)
    if (!received) {
      return NextResponse.json({ message: "Mensagem recebida sem texto ou imagem." }, { status: 400 })
    }

    const chat = await fetchChat(body)
    if (!chat) {
      return NextResponse.json({ ok: true, forwarded: false, skipped: true, reason: "chat_not_found" })
    }

    if (chat.ia_responde !== true) {
      return NextResponse.json({ ok: true, forwarded: false, skipped: true, reason: "ia_responde_disabled", chat: { id: chat.id, chat_id: chat.chat_id } })
    }

    const payload = {
      ...body,
      chad_id: chat.id,
      chat_row_id: chat.id,
      contact_id: chat.chat_id || getExternalChatId(body),
      received,
      debounce_key: chat.id,
      contact: {
        id: chat.contact_id,
        chat_row_id: chat.id,
        chat_id: chat.chat_id,
        name: chat.nome_contato || chat.pushname,
        phone: chat.phone_contact,
      },
      source: "neuronzclinic_receive_message",
    }

    const webhookResponse = await fetch(requireWebhookUrl(AI_RECEIVE_MESSAGE_WEBHOOK_URL, "AI_RECEIVE_MESSAGE_WEBHOOK_URL"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    })
    const webhookBody = await readWebhookResponse(webhookResponse)

    if (!webhookResponse.ok) {
      return NextResponse.json(
        {
          message: "Webhook da IA recusou a mensagem.",
          details: webhookBody,
        },
        { status: webhookResponse.status },
      )
    }

    return NextResponse.json({
      ok: true,
      forwarded: true,
      chat: { id: chat.id, chat_id: chat.chat_id },
      webhook: webhookBody,
    })
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "Webhook da IA demorou para responder." : error instanceof Error ? error.message : "Nao foi possivel encaminhar a mensagem para a IA."
    return NextResponse.json({ message }, { status: 500 })
  } finally {
    clearTimeout(timeoutId)
  }
}
