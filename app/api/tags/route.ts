import type { ChatTag } from "@/lib/chat-tags"
import { isFallbackAdminEmail, normalizeUserRole } from "@/lib/user-roles"
import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type SupabaseTagRow = {
  id: string
  airtable_record_id: string | null
  label: string
  color: string | null
  status: string | null
  notes: string | null
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function getSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for tags.")
  }

  return { url: SUPABASE_REST_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY }
}

async function supabaseRequest(path: string, init?: RequestInit) {
  const { url, key } = getSupabaseConfig()
  const response = await fetch(`${url}/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })

  if (!response.ok) throw new Error(await response.text())
  return response
}

function toChatTag(row: SupabaseTagRow): ChatTag {
  const tag: ChatTag = {
    id: row.airtable_record_id || row.id,
    label: row.label,
    uuid: row.id,
  }

  if (row.color) tag.color = row.color
  return tag
}

function normalizePayload(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("Dados invalidos.")
  }

  const payload = body as { label?: unknown; color?: unknown; email?: unknown; role?: unknown }
  const label = getString(payload.label)
  const color = getString(payload.color)

  if (!label) throw new Error("Informe o nome da tag.")
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Informe uma cor hexadecimal valida.")

  return { label, color: color || "#0d9488", email: payload.email, role: payload.role }
}

function getViewer(request: NextRequest, body?: { email?: unknown; role?: unknown } | null) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role") ?? body?.role)
  const email = getString(request.nextUrl.searchParams.get("email") ?? body?.email).toLowerCase()
  return { role, email }
}

function requireAdmin(request: NextRequest, body?: { email?: unknown; role?: unknown } | null) {
  const viewer = getViewer(request, body)
  if (viewer.role !== "admin" && !isFallbackAdminEmail(viewer.email)) {
    return NextResponse.json({ error: "Apenas administradores podem alterar tags." }, { status: 403 })
  }
  return null
}

function getIdFilter(id: string) {
  return isUuid(id) ? `id=eq.${encodeURIComponent(id)}` : `airtable_record_id=eq.${encodeURIComponent(id)}`
}

export async function GET() {
  try {
    const response = await supabaseRequest("tags?select=id,airtable_record_id,label,color,status,notes&status=eq.active&order=label.asc")
    const rows = (await response.json()) as SupabaseTagRow[]
    const tags = rows.map(toChatTag).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))

    return NextResponse.json({ tags })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel carregar as tags." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const payload = normalizePayload(body)
    const unauthorized = requireAdmin(request, payload)
    if (unauthorized) return unauthorized

    const response = await supabaseRequest("tags?select=id,airtable_record_id,label,color,status,notes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        label: payload.label,
        color: payload.color,
        status: "active",
        source: "supabase",
      }),
    })

    const rows = (await response.json()) as SupabaseTagRow[]
    return NextResponse.json({ tag: rows[0] ? toChatTag(rows[0]) : null }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel criar a tag." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"))
    if (!id) throw new Error("Tag nao encontrada.")

    const body = await request.json().catch(() => null)
    const payload = normalizePayload(body)
    const unauthorized = requireAdmin(request, payload)
    if (unauthorized) return unauthorized

    const response = await supabaseRequest(`tags?${getIdFilter(id)}&select=id,airtable_record_id,label,color,status,notes`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        label: payload.label,
        color: payload.color,
        status: "active",
      }),
    })

    const rows = (await response.json()) as SupabaseTagRow[]
    return NextResponse.json({ tag: rows[0] ? toChatTag(rows[0]) : null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel atualizar a tag." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"))
    if (!id) throw new Error("Tag nao encontrada.")

    const unauthorized = requireAdmin(request)
    if (unauthorized) return unauthorized

    await supabaseRequest(`tags?${getIdFilter(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "inactive" }),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel apagar a tag." }, { status: 500 })
  }
}
