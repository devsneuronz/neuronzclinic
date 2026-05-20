import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type RawNote = Record<string, unknown>

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getNullableString(value: unknown) {
  const text = getString(value)
  return text || null
}

function getNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null
}

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for chat notes. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.")
  }

  return fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })
}

export async function GET(request: NextRequest) {
  try {
    const chatId = getString(request.nextUrl.searchParams.get("chat_id"))

    if (!chatId) {
      return NextResponse.json({ message: "chat_id e obrigatório." }, { status: 400 })
    }

    const select = ["id", "chat_id", "content", "created_at", "linked_message_id", "linked_message_preview", "linked_message_from_me"].join(",")
    const response = await supabaseRequest(`chat_notes?select=${select}&chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.asc`)

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    return NextResponse.json({ notes: (await response.json()) as RawNote[] })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível carregar as anotações." },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawNote | null

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 })
    }

    const chatId = getString(body.chat_id)
    const content = getString(body.content)

    if (!chatId || !content) {
      return NextResponse.json({ message: "chat_id e content sao obrigatórios." }, { status: 400 })
    }

    const note = {
      chat_id: chatId,
      content,
      linked_message_id: getNullableString(body.linked_message_id),
      linked_message_preview: getNullableString(body.linked_message_preview),
      linked_message_from_me: getNullableBoolean(body.linked_message_from_me),
    }

    const response = await supabaseRequest("chat_notes?select=*", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(note),
    })

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    const data = (await response.json()) as RawNote[]
    return NextResponse.json({ note: data[0] ?? note })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível salvar a anotação." },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"))

    if (!id) {
      return NextResponse.json({ message: "ID da anotação e obrigatório." }, { status: 400 })
    }

    const response = await supabaseRequest(`chat_notes?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível apagar a anotação." },
      { status: 500 },
    )
  }
}
