import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STORAGE_BUCKET = process.env.SEND_MESSAGE_STORAGE_BUCKET || "file"

const mediaTypeByMime = [
  { prefix: "audio/", type: "audio" },
  { prefix: "image/", type: "image" },
  { prefix: "video/", type: "video" },
] as const

type RawRecord = Record<string, unknown>

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getSupabaseRestUrl() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for scheduled messages. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.")
  }

  return SUPABASE_REST_URL.replace(/\/$/, "")
}

function getSupabaseBaseUrl() {
  return getSupabaseRestUrl().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "")
}

async function supabaseRequest(path: string, init?: RequestInit) {
  return fetch(`${getSupabaseRestUrl()}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })
}

function getMediaType(file: File) {
  const mimeType = file.type.toLowerCase()
  return mediaTypeByMime.find(({ prefix }) => mimeType.startsWith(prefix))?.type || "document"
}

function sanitizeFileName(fileName: string) {
  return (
    fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "file"
  )
}

function getPublicStorageUrl(baseUrl: string, objectPath: string) {
  const encodedPath = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  return `${baseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`
}

async function uploadFile(file: File, chatId: string) {
  const baseUrl = getSupabaseBaseUrl()
  const safeChatId = chatId.replace(/[^a-zA-Z0-9@._-]/g, "-")
  const objectPath = `scheduled/${safeChatId}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
  const uploadUrl = `${baseUrl}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(details || `Falha no upload do anexo (${response.status}).`)
  }

  return {
    mediaUrl: getPublicStorageUrl(baseUrl, objectPath),
    mediaType: getMediaType(file),
    fileName: file.name || "file",
    mimeType: file.type || "application/octet-stream",
  }
}

function parseJsonObject(value: string) {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeScheduledAt(value: string) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  return new Date(time).toISOString()
}

function buildSelect() {
  return [
    "id",
    "chat_id",
    "contact_name",
    "type",
    "text",
    "content",
    "caption",
    "media_url",
    "media_type",
    "media_mime_type",
    "filename",
    "reply_payload",
    "payload",
    "scheduled_at",
    "timezone",
    "status",
    "attempts",
    "max_attempts",
    "next_attempt_at",
    "sent_at",
    "canceled_at",
    "last_error",
    "created_by",
    "created_at",
    "updated_at",
  ].join(",")
}

export async function GET(request: NextRequest) {
  try {
    const chatId = getString(request.nextUrl.searchParams.get("chat_id"))
    const includeHistory = request.nextUrl.searchParams.get("include_history") === "true"
    const search = getString(request.nextUrl.searchParams.get("search"))
    const filters = [`select=${buildSelect()}`]

    if (chatId) filters.push(`chat_id=eq.${encodeURIComponent(chatId)}`)
    if (!includeHistory) filters.push("status=in.(scheduled,processing,failed)")
    if (search) {
      const term = search.replace(/[%*_]/g, "\\$&")
      filters.push(`or=(contact_name.ilike.*${encodeURIComponent(term)}*,chat_id.ilike.*${encodeURIComponent(term)}*,text.ilike.*${encodeURIComponent(term)}*,content.ilike.*${encodeURIComponent(term)}*)`)
    }
    filters.push("order=scheduled_at.asc")
    filters.push("limit=500")

    const response = await supabaseRequest(`scheduled_messages?${filters.join("&")}`)

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    return NextResponse.json({ messages: (await response.json()) as RawRecord[] })
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel carregar os agendamentos." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const chatId = getString(formData.get("chat_id"))
    const contactName = getString(formData.get("contact_name"))
    const text = getString(formData.get("text"))
    const scheduledAt = normalizeScheduledAt(getString(formData.get("scheduled_at")))
    const createdBy = getString(formData.get("created_by"))
    const replyPayload = parseJsonObject(getString(formData.get("reply_payload")))
    const file = formData.get("file")
    const attachment = file instanceof File && file.size > 0 ? file : null

    if (!chatId) {
      return NextResponse.json({ message: "chat_id e obrigatorio." }, { status: 400 })
    }

    if (!scheduledAt) {
      return NextResponse.json({ message: "Informe uma data e hora validas." }, { status: 400 })
    }

    if (Date.parse(scheduledAt) < Date.now() - 60000) {
      return NextResponse.json({ message: "Escolha um horario futuro para agendar." }, { status: 400 })
    }

    if (!text && !attachment) {
      return NextResponse.json({ message: "Informe uma mensagem ou anexo para agendar." }, { status: 400 })
    }

    const uploaded = attachment ? await uploadFile(attachment, chatId) : null
    const message = uploaded
      ? {
          chat_id: chatId,
          contact_name: contactName || null,
          type: uploaded.mediaType,
          text: text || null,
          content: text || null,
          caption: text || null,
          media_url: uploaded.mediaUrl,
          media_type: uploaded.mediaType,
          media_mime_type: uploaded.mimeType,
          filename: uploaded.fileName,
          reply_payload: replyPayload,
          scheduled_at: scheduledAt,
          created_by: createdBy || null,
        }
      : {
          chat_id: chatId,
          contact_name: contactName || null,
          type: "text",
          text,
          content: text,
          reply_payload: replyPayload,
          scheduled_at: scheduledAt,
          created_by: createdBy || null,
        }

    const response = await supabaseRequest(`scheduled_messages?select=${buildSelect()}`, {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    const data = (await response.json()) as RawRecord[]
    return NextResponse.json({ message: data[0] ?? message })
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel agendar a mensagem." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawRecord | null
    const id = getString(body?.id)
    const action = getString(body?.action)

    if (!id || !["cancel", "update"].includes(action)) {
      return NextResponse.json({ message: "Acao invalida." }, { status: 400 })
    }

    if (action === "update") {
      const text = getString(body?.text)
      const scheduledAt = normalizeScheduledAt(getString(body?.scheduled_at))

      if (!text) {
        return NextResponse.json({ message: "Informe o texto da mensagem." }, { status: 400 })
      }

      if (!scheduledAt) {
        return NextResponse.json({ message: "Informe uma data e hora validas." }, { status: 400 })
      }

      if (Date.parse(scheduledAt) < Date.now() - 60000) {
        return NextResponse.json({ message: "Escolha um horario futuro para agendar." }, { status: 400 })
      }

      const response = await supabaseRequest(`scheduled_messages?id=eq.${encodeURIComponent(id)}&status=in.(scheduled,failed)&select=${buildSelect()}`, {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          text,
          content: text,
          caption: text,
          scheduled_at: scheduledAt,
          status: "scheduled",
          last_error: null,
          next_attempt_at: null,
        }),
      })

      if (!response.ok) {
        return NextResponse.json({ message: await response.text() }, { status: response.status })
      }

      const data = (await response.json()) as RawRecord[]
      return NextResponse.json({ message: data[0] ?? null })
    }

    const response = await supabaseRequest(`scheduled_messages?id=eq.${encodeURIComponent(id)}&status=in.(scheduled,failed)&select=${buildSelect()}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "canceled",
        canceled_at: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    const data = (await response.json()) as RawRecord[]
    return NextResponse.json({ message: data[0] ?? null })
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel cancelar o agendamento." }, { status: 500 })
  }
}
