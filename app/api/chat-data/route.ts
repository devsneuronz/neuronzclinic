import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const CHAT_ID_BATCH_SIZE = 40
const SUPABASE_TIMEOUT_MS = 12000
const SUPABASE_RETRY_DELAYS_MS = [300, 800]
const CHAT_SELECT = [
  "id",
  "chat_id",
  "nome_contato",
  "pushname",
  "phone_contact",
  "cidade_residencia",
  "cidade_desejada",
  "email_contato",
  "ida_contato",
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
  "json_interesses",
  "dono",
  "setor",
  "grupo",
  "draft",
  "lid_id",
  "updated_at",
].join(",")
const MESSAGE_SELECT = [
  "id",
  "message_id",
  "from_me",
  "chat_id",
  "participant",
  "message_type",
  "content",
  "media_url",
  "media_path",
  "media_mime_type",
  "public_media_url",
  "timestamp_msg",
  "status",
  "quoted_message_id",
  "metadata",
  "is_deleted",
].join(",")

type LatestChatMessage = {
  chat_id: string | null
  content: string | null
  message_type: string | null
  media_mime_type: string | null
  timestamp_msg: string | null
  from_me: boolean | null
  status: string | null
}

type LatestMessageStatusRecord = {
  chat_id: string | null
  status: string | null
  timestamp_msg: string | null
}

type LatestMessageStatus = {
  status: string | null
  timestamp_msg: string | null
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getNumberParam(request: NextRequest, name: string, fallback: number) {
  const value = Number(request.nextUrl.searchParams.get(name))
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

function escapePostgrestPattern(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[%*_]/g, (character) => `\\${character}`)
}

function buildChatSearchFilter(term: string) {
  const pattern = `"*${escapePostgrestPattern(term)}*"`
  const fields = [
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

  const params = new URLSearchParams()
  params.set("or", `(${fields.map((field) => `${field}.ilike.${pattern}`).join(",")})`)

  return `&${params.toString()}`
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

function getChatIds(request: NextRequest) {
  return Array.from(
    new Set(
      request.nextUrl.searchParams
        .getAll("chat_id")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

function isNonRetryableError(error: unknown) {
  return error instanceof Error && "nonRetryable" in error
}

async function supabaseGet<T>(path: string): Promise<T> {
  if (!SUPABASE_REST_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase REST configuration.")
  }

  let lastError: unknown

  for (let attempt = 0; attempt <= SUPABASE_RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS)

    try {
      const response = await fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        cache: "no-store",
        signal: controller.signal,
      })

      if (response.ok) {
        return response.json() as Promise<T>
      }

      const error = await response.text()
      lastError = new Error(error || `Supabase request failed with ${response.status}`)

      if (!isTransientStatus(response.status) || attempt === SUPABASE_RETRY_DELAYS_MS.length) {
        if (!isTransientStatus(response.status)) {
          Object.assign(lastError as Error, { nonRetryable: true })
        }
        throw lastError
      }
    } catch (error) {
      lastError = error

      if (isNonRetryableError(error)) {
        throw error
      }

      if (attempt === SUPABASE_RETRY_DELAYS_MS.length) {
        throw error
      }
    } finally {
      clearTimeout(timeoutId)
    }

    await wait(SUPABASE_RETRY_DELAYS_MS[attempt])
  }

  throw lastError instanceof Error ? lastError : new Error("Supabase request failed")
}

async function fetchLatestMessageStatuses(chatIds: string[]): Promise<Record<string, LatestMessageStatus>> {
  if (chatIds.length === 0) return {}

  if (chatIds.length > CHAT_ID_BATCH_SIZE) {
    const batches = Array.from({ length: Math.ceil(chatIds.length / CHAT_ID_BATCH_SIZE) }, (_, index) => chatIds.slice(index * CHAT_ID_BATCH_SIZE, (index + 1) * CHAT_ID_BATCH_SIZE))
    const results = await Promise.all(batches.map((batch) => fetchLatestMessageStatuses(batch)))
    return Object.assign({}, ...results)
  }

  const select = ["chat_id", "status", "timestamp_msg"].join(",")
  const encodedIds = chatIds.map((chatId) => encodeURIComponent(chatId)).join(",")
  const limit = Math.min(Math.max(chatIds.length * 10, 100), 400)
  const messages = await supabaseGet<LatestMessageStatusRecord[]>(
    `messages?select=${select}&chat_id=in.(${encodedIds})&from_me=is.true&order=timestamp_msg.desc.nullslast&limit=${limit}`,
  )
  const statuses: Record<string, LatestMessageStatus> = Object.fromEntries(chatIds.map((chatId) => [chatId, { status: null, timestamp_msg: null }]))
  const seenChatIds = new Set<string>()

  for (const message of messages) {
    if (message.chat_id && !seenChatIds.has(message.chat_id)) {
      statuses[message.chat_id] = {
        status: message.status,
        timestamp_msg: message.timestamp_msg,
      }
      seenChatIds.add(message.chat_id)
    }
  }

  return statuses
}

async function fetchLatestMessagesForChats(chatIds: string[]): Promise<Record<string, LatestChatMessage>> {
  if (chatIds.length === 0) return {}

  if (chatIds.length > CHAT_ID_BATCH_SIZE) {
    const batches = Array.from({ length: Math.ceil(chatIds.length / CHAT_ID_BATCH_SIZE) }, (_, index) => chatIds.slice(index * CHAT_ID_BATCH_SIZE, (index + 1) * CHAT_ID_BATCH_SIZE))
    const results = await Promise.all(batches.map((batch) => fetchLatestMessagesForChats(batch)))
    return Object.assign({}, ...results)
  }

  const select = ["chat_id", "content", "message_type", "media_mime_type", "timestamp_msg", "from_me", "status"].join(",")
  const encodedIds = chatIds.map((chatId) => encodeURIComponent(chatId)).join(",")
  const limit = Math.min(Math.max(chatIds.length * 10, 100), 400)
  const messages = await supabaseGet<LatestChatMessage[]>(
    `messages?select=${select}&chat_id=in.(${encodedIds})&order=timestamp_msg.desc.nullslast&limit=${limit}`,
  )
  const latestMessages: Record<string, LatestChatMessage> = {}

  for (const message of messages) {
    if (message.chat_id && isBetterLatestMessage(message, latestMessages[message.chat_id])) {
      latestMessages[message.chat_id] = message
    }
  }

  return latestMessages
}

export async function GET(request: NextRequest) {
  try {
    const resource = getString(request.nextUrl.searchParams.get("resource"))

    if (resource === "chats") {
      const limit = getNumberParam(request, "limit", 50)
      const offset = getNumberParam(request, "offset", 0)
      const search = getString(request.nextUrl.searchParams.get("search"))
      const searchFilter = search ? buildChatSearchFilter(search) : ""
      const chats = await supabaseGet<Record<string, unknown>[]>(
        `chats?select=${CHAT_SELECT}&archived=is.false${searchFilter}&order=last_message_time.desc.nullslast&limit=${limit}&offset=${offset}`,
      )

      return NextResponse.json({ chats })
    }

    if (resource === "messages") {
      const chatId = getString(request.nextUrl.searchParams.get("chat_id"))
      if (!chatId) return NextResponse.json({ message: "chat_id e obrigatorio." }, { status: 400 })

      const limit = getNumberParam(request, "limit", 50)
      const offset = getNumberParam(request, "offset", 0)
      const messages = await supabaseGet<Record<string, unknown>[]>(
        `messages?select=${MESSAGE_SELECT}&chat_id=eq.${encodeURIComponent(chatId)}&order=timestamp_msg.desc.nullslast&limit=${limit}&offset=${offset}`,
      )

      return NextResponse.json({ messages })
    }

    if (resource === "latest-statuses") {
      return NextResponse.json({ statuses: await fetchLatestMessageStatuses(getChatIds(request)) })
    }

    if (resource === "latest-messages") {
      return NextResponse.json({ latestMessages: await fetchLatestMessagesForChats(getChatIds(request)) })
    }

    return NextResponse.json({ message: "Recurso de chat invalido." }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel carregar os dados do chat." },
      { status: 500 },
    )
  }
}
