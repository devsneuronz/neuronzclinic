import { isFallbackAdminEmail, normalizeUserRole } from "@/lib/user-roles"
import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type SectorPayload = {
  name: string
  description: string
  color: string
  tagIds: string[]
  email?: unknown
  role?: unknown
}

type SectorRow = {
  id: string
  airtable_record_id: string | null
  name: string
  description: string | null
  color: string | null
  status: string | null
  raw_airtable?: { fields?: { User?: unknown } } | null
}

type TagRow = {
  id: string
  airtable_record_id: string | null
  label: string
}

type SectorTagRow = {
  sector_id: string
  tags?: TagRow | null
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function getSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for sectors.")
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

function getViewer(request: NextRequest, body?: { email?: unknown; role?: unknown } | null) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role") ?? body?.role)
  const email = getString(request.nextUrl.searchParams.get("email") ?? body?.email).toLowerCase()
  return { role, email }
}

function requireAdmin(request: NextRequest, body?: { email?: unknown; role?: unknown } | null) {
  const viewer = getViewer(request, body)
  if (viewer.role !== "admin" && !isFallbackAdminEmail(viewer.email)) {
    return NextResponse.json({ error: "Apenas administradores podem alterar setores." }, { status: 403 })
  }
  return null
}

function getExternalSectorId(row: SectorRow) {
  return row.airtable_record_id || row.id
}

function getExternalTagId(row: TagRow) {
  return row.airtable_record_id || row.id
}

function getRecordIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []
}

function normalizePayload(body: unknown): SectorPayload {
  if (!body || typeof body !== "object") throw new Error("Dados invalidos.")

  const source = body as Record<string, unknown>
  const name = getString(source.name)
  const description = getString(source.description)
  const color = getString(source.color)
  const tagIds = Array.isArray(source.tagIds)
    ? Array.from(new Set(source.tagIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)))
    : []

  if (!name) throw new Error("Informe o nome do setor.")
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Informe uma cor hexadecimal valida.")

  return { name, description, color: color || "#64748b", tagIds, email: source.email, role: source.role }
}

function getIdFilter(id: string) {
  return isUuid(id) ? `id=eq.${encodeURIComponent(id)}` : `airtable_record_id=eq.${encodeURIComponent(id)}`
}

async function fetchActiveSectors() {
  const response = await supabaseRequest("sectors?select=id,airtable_record_id,name,description,color,status,raw_airtable&status=eq.active&order=name.asc")
  return response.json() as Promise<SectorRow[]>
}

async function fetchSectorTags(sectorIds: string[]) {
  if (sectorIds.length === 0) return []

  const response = await supabaseRequest(`sector_tags?select=sector_id,tags:tag_id(id,airtable_record_id,label)&sector_id=in.(${sectorIds.join(",")})`)
  return response.json() as Promise<SectorTagRow[]>
}

function toSector(row: SectorRow, links: SectorTagRow[]) {
  const tagRows = links.map((link) => link.tags).filter((tag): tag is TagRow => Boolean(tag))
  return {
    id: getExternalSectorId(row),
    name: row.name,
    description: row.description || "",
    color: /^#[0-9a-f]{6}$/i.test(row.color || "") ? row.color || "#64748b" : "#64748b",
    tagIds: tagRows.map(getExternalTagId),
    tagLabels: tagRows.map((tag) => tag.label),
    userIds: getRecordIds(row.raw_airtable?.fields?.User),
  }
}

async function resolveTagIds(tagIds: string[]) {
  if (tagIds.length === 0) return []

  const response = await supabaseRequest("tags?select=id,airtable_record_id&status=eq.active&limit=1000")
  const tags = (await response.json()) as TagRow[]
  const tagByExternalId = new Map<string, string>()

  for (const tag of tags) {
    tagByExternalId.set(tag.id, tag.id)
    if (tag.airtable_record_id) tagByExternalId.set(tag.airtable_record_id, tag.id)
  }

  return tagIds.map((tagId) => tagByExternalId.get(tagId)).filter((tagId): tagId is string => Boolean(tagId))
}

async function replaceSectorTags(sectorId: string, tagIds: string[]) {
  await supabaseRequest(`sector_tags?sector_id=eq.${encodeURIComponent(sectorId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  })

  const resolvedTagIds = await resolveTagIds(tagIds)
  if (resolvedTagIds.length === 0) return

  await supabaseRequest("sector_tags", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(resolvedTagIds.map((tagId) => ({ sector_id: sectorId, tag_id: tagId }))),
  })
}

async function fetchSectorById(id: string) {
  const response = await supabaseRequest(`sectors?select=id,airtable_record_id,name,description,color,status,raw_airtable&${getIdFilter(id)}&limit=1`)
  const rows = (await response.json()) as SectorRow[]
  return rows[0] ?? null
}

export async function GET(request: Request) {
  try {
    const rows = await fetchActiveSectors()
    const links = await fetchSectorTags(rows.map((row) => row.id))
    const linksBySectorId = new Map<string, SectorTagRow[]>()

    for (const link of links) {
      const current = linksBySectorId.get(link.sector_id) ?? []
      current.push(link)
      linksBySectorId.set(link.sector_id, current)
    }

    const sectors = rows.map((row) => toSector(row, linksBySectorId.get(row.id) ?? []))
    const requestedIds = new Set(
      (new URL(request.url).searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
    const labels = Object.fromEntries(
      sectors.flatMap((sector) => [
        ...(requestedIds.has(sector.id) ? [[sector.id, sector.name] as const] : []),
        ...sector.tagIds.filter((id) => requestedIds.has(id)).map((id) => [id, sector.name] as const),
      ]),
    )

    return NextResponse.json({ labels, sectors: sectors.map((sector) => sector.name), sectorRecords: sectors })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel carregar os setores." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const payload = normalizePayload(body)
    const unauthorized = requireAdmin(request, payload)
    if (unauthorized) return unauthorized

    const response = await supabaseRequest("sectors?select=id,airtable_record_id,name,description,color,status,raw_airtable", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: payload.name,
        description: payload.description || null,
        color: payload.color,
        status: "active",
        source: "supabase",
      }),
    })
    const rows = (await response.json()) as SectorRow[]
    const row = rows[0] ?? null
    if (!row) return NextResponse.json({ sector: null }, { status: 201 })

    await replaceSectorTags(row.id, payload.tagIds)
    const links = await fetchSectorTags([row.id])
    return NextResponse.json({ sector: toSector(row, links) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel criar o setor." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"))
    if (!id) throw new Error("Setor nao encontrado.")

    const body = await request.json().catch(() => null)
    const payload = normalizePayload(body)
    const unauthorized = requireAdmin(request, payload)
    if (unauthorized) return unauthorized

    const response = await supabaseRequest(`sectors?${getIdFilter(id)}&select=id,airtable_record_id,name,description,color,status,raw_airtable`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: payload.name,
        description: payload.description || null,
        color: payload.color,
        status: "active",
      }),
    })
    const rows = (await response.json()) as SectorRow[]
    const row = rows[0] ?? null
    if (!row) throw new Error("Setor nao encontrado.")

    await replaceSectorTags(row.id, payload.tagIds)
    const links = await fetchSectorTags([row.id])
    return NextResponse.json({ sector: toSector(row, links) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel atualizar o setor." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"))
    if (!id) throw new Error("Setor nao encontrado.")

    const unauthorized = requireAdmin(request)
    if (unauthorized) return unauthorized

    const row = await fetchSectorById(id)
    if (!row) throw new Error("Setor nao encontrado.")

    await replaceSectorTags(row.id, [])
    await supabaseRequest(`sectors?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "inactive" }),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel excluir o setor." }, { status: 500 })
  }
}
