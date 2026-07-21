import { NextRequest, NextResponse } from "next/server"

import { FALLBACK_ADMIN_EMAILS, getDefaultUser, isFallbackAdminEmail, normalizeUserRole } from "@/lib/user-roles"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type UserProfileRow = {
  id: string
  airtable_record_id: string | null
  email: string
  name: string
  role: string | null
  status: string | null
  raw_airtable?: { fields?: Record<string, unknown> } | null
}

type SectorRow = {
  id: string
  airtable_record_id: string | null
  name: string
  color: string | null
}

type UserProfileSectorRow = {
  user_profile_id: string
  sectors?: SectorRow | null
}

type SectorTagRow = {
  sector_id: string
  tags?: {
    id: string
    airtable_record_id: string | null
    label: string
  } | null
}

type ListedUser = {
  id: string
  email: string
  name: string
  role: ReturnType<typeof normalizeUserRole>
  tags: string[]
  sectorIds: string[]
  tagIds: string[]
  canAccessUntaggedChats: boolean
  source: "airtable"
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function getStringArrayField(fields: Record<string, unknown> | undefined, candidates: string[]) {
  if (!fields) return []

  for (const candidate of candidates) {
    const value = fields[candidate]

    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : null))
        .filter((item): item is string => Boolean(item))
    }

    if (typeof value === "string" && value.trim()) {
      return value
        .split(/[,;|]/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }

  return []
}

function getSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for users.")
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

function getExternalProfileId(row: UserProfileRow) {
  return row.airtable_record_id || row.id
}

function getExternalSectorId(row: SectorRow) {
  return row.airtable_record_id || row.id
}

function getExternalTagId(row: { id: string; airtable_record_id: string | null }) {
  return row.airtable_record_id || row.id
}

function getIdFilter(id: string) {
  return isUuid(id) ? `id=eq.${encodeURIComponent(id)}` : `airtable_record_id=eq.${encodeURIComponent(id)}`
}

function getViewer(request: NextRequest, body?: { email?: unknown; role?: unknown } | null) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role") ?? body?.role)
  const email = getString(request.nextUrl.searchParams.get("email") ?? body?.email).toLowerCase()
  return { role, email }
}

function requireAdmin(request: NextRequest, body?: { email?: unknown; role?: unknown } | null) {
  const viewer = getViewer(request, body)
  if (viewer.role !== "admin" && !isFallbackAdminEmail(viewer.email)) {
    return NextResponse.json({ error: "Apenas administradores podem alterar usuarios." }, { status: 403 })
  }
  return null
}

async function fetchProfiles(email?: string) {
  const params = new URLSearchParams({
    select: "id,airtable_record_id,email,name,role,status,raw_airtable",
    status: "eq.active",
    order: "name.asc",
  })
  if (email) params.set("email", `eq.${email}`)

  const response = await supabaseRequest(`user_profiles?${params}`)
  return response.json() as Promise<UserProfileRow[]>
}

async function fetchProfileSectors(profileIds: string[]) {
  if (profileIds.length === 0) return []

  const response = await supabaseRequest(`user_profile_sectors?select=user_profile_id,sectors:sector_id(id,airtable_record_id,name,color)&user_profile_id=in.(${profileIds.join(",")})`)
  return response.json() as Promise<UserProfileSectorRow[]>
}

async function fetchSectorTags(sectorIds: string[]) {
  if (sectorIds.length === 0) return []

  const response = await supabaseRequest(`sector_tags?select=sector_id,tags:tag_id(id,airtable_record_id,label)&sector_id=in.(${sectorIds.join(",")})`)
  return response.json() as Promise<SectorTagRow[]>
}

function getFallbackListedUser(email: string): ListedUser {
  const user = getDefaultUser(email)
  return {
    id: `fallback-${user.email}`,
    email: user.email,
    name: user.name,
    role: user.role,
    tags: user.role === "admin" ? ["ADM"] : [],
    sectorIds: [],
    tagIds: [],
    canAccessUntaggedChats: false,
    source: "airtable",
  }
}

async function buildUsers(profiles: UserProfileRow[]) {
  const profileSectors = await fetchProfileSectors(profiles.map((profile) => profile.id))
  const sectorsByProfileId = new Map<string, SectorRow[]>()

  for (const link of profileSectors) {
    if (!link.sectors) continue
    const current = sectorsByProfileId.get(link.user_profile_id) ?? []
    current.push(link.sectors)
    sectorsByProfileId.set(link.user_profile_id, current)
  }

  const allSectorIds = Array.from(new Set(profileSectors.map((link) => link.sectors?.id).filter((id): id is string => Boolean(id))))
  const sectorTags = await fetchSectorTags(allSectorIds)
  const tagsBySectorId = new Map<string, SectorTagRow[]>()

  for (const link of sectorTags) {
    const current = tagsBySectorId.get(link.sector_id) ?? []
    current.push(link)
    tagsBySectorId.set(link.sector_id, current)
  }

  return profiles.map((profile) => {
    const sectors = sectorsByProfileId.get(profile.id) ?? []
    const tagIds = new Set<string>(getStringArrayField(profile.raw_airtable?.fields, ["Tags", "tags"]))

    for (const sector of sectors) {
      for (const link of tagsBySectorId.get(sector.id) ?? []) {
        if (link.tags) tagIds.add(getExternalTagId(link.tags))
      }
    }

    return {
      id: getExternalProfileId(profile),
      email: profile.email,
      name: profile.name,
      role: normalizeUserRole(profile.role),
      tags: sectors.map((sector) => sector.name),
      sectorIds: sectors.map(getExternalSectorId),
      tagIds: Array.from(tagIds),
      canAccessUntaggedChats: sectors.some((sector) => (tagsBySectorId.get(sector.id) ?? []).length === 0),
      source: "airtable" as const,
    }
  })
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get("email")?.trim().toLowerCase()

    if (email) {
      const users = await buildUsers(await fetchProfiles(email))
      return NextResponse.json(users[0] ?? getDefaultUser(email))
    }

    const indexedUsers = new Map<string, ListedUser>()
    for (const user of await buildUsers(await fetchProfiles())) indexedUsers.set(user.email, user)

    for (const email of FALLBACK_ADMIN_EMAILS) {
      if (!indexedUsers.has(email)) indexedUsers.set(email, getFallbackListedUser(email))
    }

    return NextResponse.json({ users: Array.from(indexedUsers.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) })
  } catch (error) {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get("email")?.trim().toLowerCase()
    if (email) return NextResponse.json(getDefaultUser(email))

    return NextResponse.json({
      users: FALLBACK_ADMIN_EMAILS.map((fallbackEmail) => getFallbackListedUser(fallbackEmail)),
      error: error instanceof Error ? error.message : "Nao foi possivel carregar usuarios.",
    })
  }
}

async function resolveSectorIds(sectorIds: string[]) {
  if (sectorIds.length === 0) return []

  const response = await supabaseRequest("sectors?select=id,airtable_record_id&status=eq.active&limit=1000")
  const sectors = (await response.json()) as SectorRow[]
  const sectorsByExternalId = new Map<string, string>()

  for (const sector of sectors) {
    sectorsByExternalId.set(sector.id, sector.id)
    if (sector.airtable_record_id) sectorsByExternalId.set(sector.airtable_record_id, sector.id)
  }

  return sectorIds.map((sectorId) => sectorsByExternalId.get(sectorId)).filter((sectorId): sectorId is string => Boolean(sectorId))
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { id?: unknown; sectorIds?: unknown; email?: unknown; role?: unknown } | null
    const unauthorized = requireAdmin(request, body)
    if (unauthorized) return unauthorized

    const id = getString(body?.id)
    const sectorIds = Array.isArray(body?.sectorIds)
      ? Array.from(new Set(body.sectorIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)))
      : []

    if (!id) throw new Error("Usuario nao encontrado.")

    const profileResponse = await supabaseRequest(`user_profiles?select=id&${getIdFilter(id)}&limit=1`)
    const profiles = (await profileResponse.json()) as Array<{ id: string }>
    const profile = profiles[0]
    if (!profile) throw new Error("Usuario nao encontrado.")

    await supabaseRequest(`user_profile_sectors?user_profile_id=eq.${encodeURIComponent(profile.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    })

    const resolvedSectorIds = await resolveSectorIds(sectorIds)
    if (resolvedSectorIds.length > 0) {
      await supabaseRequest("user_profile_sectors", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(resolvedSectorIds.map((sectorId) => ({ user_profile_id: profile.id, sector_id: sectorId }))),
      })
    }

    return NextResponse.json({ ok: true, sectorIds })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel atualizar o usuario." }, { status: 500 })
  }
}
