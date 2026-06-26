import { NextRequest, NextResponse } from "next/server"
import { CHAT_INTEREST_FIELD_CANDIDATES } from "@/lib/chat-tags"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const ROUTINES_EVENT_WEBHOOK_URL = process.env.ROUTINES_EVENT_WEBHOOK_URL
const ROUTINES_WEBHOOK_SECRET = process.env.ROUTINES_WEBHOOK_SECRET

type RawChat = Record<string, unknown>
type TagInput = { id: string; label: string; color?: string | null }

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getHexColor(value: unknown) {
  const color = getString(value)
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null
}

function getUnreadCount(value: unknown) {
  if (value === null) return null
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.floor(value))
}

function normalizeTags(value: unknown): TagInput[] | null {
  if (!Array.isArray(value)) return null

  const tags = value
    .filter((tag) => tag && typeof tag === "object" && !Array.isArray(tag))
    .map((tag) => {
      const source = tag as Record<string, unknown>
      const label = getString(source.label)
      const id = getString(source.id)
      const color = getHexColor(source.color)

      return {
        id,
        label,
        ...(color ? { color } : {}),
      }
    })
    .filter((tag) => /^rec[a-zA-Z0-9]+$/.test(tag.id) && tag.label)

  return tags
}

function normalizeTagFromUnknown(value: unknown): TagInput | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null

    if (looksLikeJsonObjectString(trimmed)) {
      try {
        return normalizeTagFromUnknown(JSON.parse(trimmed))
      } catch {
        return null
      }
    }

    return /^rec[a-zA-Z0-9]+$/.test(trimmed) ? { id: trimmed, label: trimmed } : null
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const source = value as Record<string, unknown>
  const id = getString(source.id) || getString(source["IDA TAG"])
  const label = getString(source.label) || getString(source.Tag) || getString(source.tag) || getString(source.Nome) || getString(source.name) || id
  const color = getHexColor(source.color) || getHexColor(source.HEXCOR) || getHexColor(source.hexcor) || getHexColor(source.hex_status)

  return /^rec[a-zA-Z0-9]+$/.test(id) && label ? { id, label, ...(color ? { color } : {}) } : null
}

function extractTagsFromChat(chat: RawChat): TagInput[] {
  const candidates = [chat.json_tags_parsed, chat.json_tags, chat.tag_chat_array]
  const tags: TagInput[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const values = Array.isArray(candidate) ? candidate : typeof candidate === "string" ? candidate.split(",").map((item) => item.trim()) : []

    for (const value of values) {
      const tag = normalizeTagFromUnknown(value)
      if (!tag || seen.has(tag.id)) continue

      seen.add(tag.id)
      tags.push(tag)
    }
  }

  return tags
}

function looksLikeJsonObjectString(value: unknown) {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  return trimmed.startsWith("{") && trimmed.endsWith("}")
}

function formatTagsLikeExisting(existingValue: unknown, tags: TagInput[]) {
  if (typeof existingValue === "string") {
    try {
      JSON.parse(existingValue)
      return JSON.stringify(tags)
    } catch {
      return tags.map((tag) => tag.id).join(", ")
    }
  }

  if (Array.isArray(existingValue)) {
    if (existingValue.some(looksLikeJsonObjectString)) {
      return tags.map((tag) => JSON.stringify(tag))
    }

    if (existingValue.every((item) => typeof item === "string")) {
      return tags.map((tag) => tag.id)
    }
  }

  return tags
}

function buildPatch(body: RawChat, currentChat: RawChat) {
  const patch: RawChat = {}

  if ("nome_contato" in body) {
    patch.nome_contato = getString(body.nome_contato) || null
  }

  if ("phone_contact" in body) {
    patch.phone_contact = getString(body.phone_contact) || null
  }

  if ("cidade_residencia" in body) {
    patch.cidade_residencia = getString(body.cidade_residencia) || null
  }

  if ("cidade_desejada" in body) {
    patch.cidade_desejada = getString(body.cidade_desejada) || null
  }

  if ("email_contato" in body) {
    patch.email_contato = getString(body.email_contato) || null
  }

  if ("Status_chat" in body) {
    patch.Status_chat = getString(body.Status_chat) || null
  }

  if ("hex_status" in body) {
    patch.hex_status = getHexColor(body.hex_status)
  }

  if ("finalizada" in body) {
    patch.finalizada = getBoolean(body.finalizada)
  }

  if ("ia_responde" in body) {
    patch.ia_responde = getBoolean(body.ia_responde)
  }

  if ("archived" in body) {
    patch.archived = getBoolean(body.archived)
  }

  if ("unread_count" in body) {
    const unreadCount = getUnreadCount(body.unread_count)

    if (unreadCount === undefined) {
      throw new Error("unread_count precisa ser um numero valido.")
    }

    patch.unread_count = unreadCount
  }

  if ("tags" in body) {
    const tags = normalizeTags(body.tags)

    if (tags) {
      if (tags.length !== (Array.isArray(body.tags) ? body.tags.length : 0)) {
        throw new Error("Todas as tags precisam ter um id valido do Airtable.")
      }

      const tagFields = ["json_tags_parsed", "json_tags", "tag_chat_array"]
      const fieldsToUpdate = tagFields.filter((field) => currentChat[field] !== null && currentChat[field] !== undefined)
      const safeFields = fieldsToUpdate.length > 0 ? fieldsToUpdate : ["json_tags_parsed"]

      for (const field of safeFields) {
        patch[field] = formatTagsLikeExisting(currentChat[field], tags)
      }
    }
  }

  if ("interestTags" in body) {
    const interestTags = normalizeTags(body.interestTags)

    if (interestTags) {
      if (interestTags.length !== (Array.isArray(body.interestTags) ? body.interestTags.length : 0)) {
        throw new Error("Todos os interesses precisam ter um id valido do Airtable.")
      }

      const fieldsToUpdate = CHAT_INTEREST_FIELD_CANDIDATES.filter((field) => Object.prototype.hasOwnProperty.call(currentChat, field))

      if (fieldsToUpdate.length === 0) {
        throw new Error("Nenhum campo de interesses foi encontrado no registro do contato.")
      }

      for (const field of fieldsToUpdate) {
        patch[field] = formatTagsLikeExisting(currentChat[field], interestTags)
      }
    }
  }

  return patch
}

function getAddedTags(body: RawChat, currentChat: RawChat) {
  if (!("tags" in body)) return []

  const nextTags = normalizeTags(body.tags)
  if (!nextTags) return []

  const currentTagIds = new Set(extractTagsFromChat(currentChat).map((tag) => tag.id))
  return nextTags.filter((tag) => !currentTagIds.has(tag.id))
}

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase REST configuration.")
  }

  return fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })
}

async function fetchCurrentChat(id: string) {
  const response = await supabaseRequest(`chats?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const data = (await response.json()) as RawChat[]
  return data[0] ?? null
}

function getContactAirtableId(chat: RawChat) {
  return (
    getString(chat.airtable_id) ||
    getString(chat.airtable_record_id) ||
    getString(chat.contato_airtable_id) ||
    getString(chat.contact_airtable_id) ||
    getString(chat.record_id)
  )
}

async function notifyRoutineTagAdded({ chatId, currentChat, addedTags }: { chatId: string; currentChat: RawChat; addedTags: TagInput[] }) {
  if (!ROUTINES_EVENT_WEBHOOK_URL || addedTags.length === 0) return

  const contactName = getString(currentChat.nome_contato) || getString(currentChat.pushname)
  const contactPhone = getString(currentChat.phone_contact) || getString(currentChat.chat_id) || chatId
  const contactAirtableId = getContactAirtableId(currentChat)

  for (const tag of addedTags) {
    const payload = {
      event_type: "tag_added",
      contact_id: chatId,
      contact_airtable_id: contactAirtableId,
      chat_id: getString(currentChat.chat_id) || chatId,
      contact_name: contactName,
      contact_phone: contactPhone,
      tag,
      occurred_at: new Date().toISOString(),
      source: "neuronzclinic-app",
    }

    const response = await fetch(ROUTINES_EVENT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ROUTINES_WEBHOOK_SECRET ? { Authorization: `Bearer ${ROUTINES_WEBHOOK_SECRET}` } : {}),
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error("Routine tag webhook failed", await response.text().catch(() => response.statusText))
    }
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const chatId = decodeURIComponent(id || "").trim()

    if (!chatId) {
      return NextResponse.json({ message: "ID do chat e obrigatório." }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 })
    }

    const currentChat = await fetchCurrentChat(chatId)
    if (!currentChat) {
      return NextResponse.json({ message: "Contato não encontrado." }, { status: 404 })
    }

    const patch = buildPatch(body as RawChat, currentChat)
    const addedTags = getAddedTags(body as RawChat, currentChat)
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ message: "Nenhum campo valido para atualizar." }, { status: 400 })
    }

    const response = await supabaseRequest(`chats?id=eq.${encodeURIComponent(chatId)}&select=*`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    })

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    const data = (await response.json()) as RawChat[]
    await notifyRoutineTagAdded({ chatId, currentChat: data[0] ?? { ...currentChat, ...patch }, addedTags })

    return NextResponse.json({
      chat: data[0] ?? { ...currentChat, ...patch },
      patch,
      routineEvents: {
        tagAdded: addedTags.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível atualizar o contato." },
      { status: 500 },
    )
  }
}
