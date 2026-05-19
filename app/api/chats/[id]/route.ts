import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

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

  if ("Status_chat" in body) {
    patch.Status_chat = getString(body.Status_chat) || null
  }

  if ("hex_status" in body) {
    patch.hex_status = getHexColor(body.hex_status)
  }

  if ("finalizada" in body) {
    patch.finalizada = getBoolean(body.finalizada)
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

  return patch
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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const chatId = decodeURIComponent(id || "").trim()

    if (!chatId) {
      return NextResponse.json({ message: "ID do chat e obrigatorio." }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload invalido." }, { status: 400 })
    }

    const currentChat = await fetchCurrentChat(chatId)
    if (!currentChat) {
      return NextResponse.json({ message: "Contato nao encontrado." }, { status: 404 })
    }

    const patch = buildPatch(body as RawChat, currentChat)
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
    return NextResponse.json({
      chat: data[0] ?? { ...currentChat, ...patch },
      patch,
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel atualizar o contato." },
      { status: 500 },
    )
  }
}
