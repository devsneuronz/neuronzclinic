import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type RawTaskResolutionNote = Record<string, unknown>

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getNullableString(value: unknown) {
  const text = getString(value)
  return text || null
}

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for task resolution notes. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.")
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
    const taskId = getString(request.nextUrl.searchParams.get("task_id"))

    if (!taskId) {
      return NextResponse.json({ message: "task_id e obrigatorio." }, { status: 400 })
    }

    const select = ["id", "task_id", "content", "status_snapshot", "created_at", "updated_at"].join(",")
    const response = await supabaseRequest(`task_resolution_notes?select=${select}&task_id=eq.${encodeURIComponent(taskId)}&order=created_at.desc`)

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    return NextResponse.json({ notes: (await response.json()) as RawTaskResolutionNote[] })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel carregar o historico da tarefa." },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawTaskResolutionNote | null

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload invalido." }, { status: 400 })
    }

    const taskId = getString(body.task_id)
    const content = getString(body.content)

    if (!taskId || !content) {
      return NextResponse.json({ message: "task_id e content sao obrigatorios." }, { status: 400 })
    }

    const note = {
      task_id: taskId,
      content,
      status_snapshot: getNullableString(body.status_snapshot),
    }

    const response = await supabaseRequest("task_resolution_notes?select=*", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(note),
    })

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    const data = (await response.json()) as RawTaskResolutionNote[]
    return NextResponse.json({ note: data[0] ?? note })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel salvar a evolucao da tarefa." },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"))

    if (!id) {
      return NextResponse.json({ message: "ID da evolucao e obrigatorio." }, { status: 400 })
    }

    const response = await supabaseRequest(`task_resolution_notes?id=eq.${encodeURIComponent(id)}`, {
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
      { message: error instanceof Error ? error.message : "Nao foi possivel apagar a evolucao da tarefa." },
      { status: 500 },
    )
  }
}
