import { NextResponse } from "next/server"

import { normalizeUserRole } from "@/lib/user-roles"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type AuthUserResponse = {
  id?: string
  email?: string
}

type UserProfileRow = {
  id: string
  airtable_record_id: string | null
  auth_user_id: string | null
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

function getSupabaseBaseUrl() {
  const baseUrl = SUPABASE_URL ?? SUPABASE_REST_URL?.replace(/\/rest\/v1\/?$/, "")
  return baseUrl?.replace(/\/$/, "") ?? null
}

function getRestConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration.")
  }

  return { url: SUPABASE_REST_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? ""
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ""
}

function getExternalTagId(row: { id: string; airtable_record_id: string | null }) {
  return row.airtable_record_id || row.id
}

function getStringArrayField(fields: Record<string, unknown> | undefined, candidates: string[]) {
  if (!fields) return []

  for (const candidate of candidates) {
    const value = fields[candidate]

    if (Array.isArray(value)) {
      return value.map((item) => (typeof item === "string" ? item.trim() : null)).filter((item): item is string => Boolean(item))
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

async function supabaseRequest<T>(path: string, init?: RequestInit) {
  const { url, key } = getRestConfig()
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
  return response.json() as Promise<T>
}

async function fetchAuthUser(accessToken: string) {
  const baseUrl = getSupabaseBaseUrl()

  if (!baseUrl || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase Auth configuration.")
  }

  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  if (!response.ok) return null
  return response.json() as Promise<AuthUserResponse>
}

async function fetchProfile(authUser: AuthUserResponse) {
  if (authUser.id) {
    const byAuthId = await supabaseRequest<UserProfileRow[]>(
      `user_profiles?select=id,airtable_record_id,auth_user_id,email,name,role,status,raw_airtable&auth_user_id=eq.${encodeURIComponent(authUser.id)}&limit=1`,
    )
    if (byAuthId[0]) return byAuthId[0]
  }

  if (!authUser.email) return null

  const byEmail = await supabaseRequest<UserProfileRow[]>(
    `user_profiles?select=id,airtable_record_id,auth_user_id,email,name,role,status,raw_airtable&email=eq.${encodeURIComponent(authUser.email.toLowerCase())}&limit=1`,
  )

  return byEmail[0] ?? null
}

async function fetchProfileSectors(profileId: string) {
  return supabaseRequest<UserProfileSectorRow[]>(
    `user_profile_sectors?select=user_profile_id,sectors:sector_id(id,airtable_record_id,name,color)&user_profile_id=eq.${encodeURIComponent(profileId)}`,
  )
}

async function fetchSectorTags(sectorIds: string[]) {
  if (sectorIds.length === 0) return []

  return supabaseRequest<SectorTagRow[]>(
    `sector_tags?select=sector_id,tags:tag_id(id,airtable_record_id,label)&sector_id=in.(${sectorIds.map(encodeURIComponent).join(",")})`,
  )
}

export async function GET(request: Request) {
  try {
    const accessToken = getBearerToken(request)

    if (!accessToken) {
      return NextResponse.json({ error: "Sessao ausente." }, { status: 401 })
    }

    const authUser = await fetchAuthUser(accessToken)

    if (!authUser?.id || !authUser.email) {
      return NextResponse.json({ error: "Sessao invalida." }, { status: 401 })
    }

    const profile = await fetchProfile(authUser)

    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Usuario sem perfil ativo." }, { status: 403 })
    }

    const profileSectors = await fetchProfileSectors(profile.id)
    const sectors = profileSectors.map((link) => link.sectors).filter((sector): sector is SectorRow => Boolean(sector))
    const sectorTags = await fetchSectorTags(sectors.map((sector) => sector.id))
    const tagIds = new Set<string>(getStringArrayField(profile.raw_airtable?.fields, ["Tags", "tags"]))

    for (const link of sectorTags) {
      if (link.tags) tagIds.add(getExternalTagId(link.tags))
    }

    return NextResponse.json({
      id: profile.airtable_record_id || profile.id,
      authUserId: authUser.id,
      profileId: profile.id,
      email: profile.email,
      name: profile.name,
      role: normalizeUserRole(profile.role),
      source: "session",
      sectorIds: sectors.map((sector) => sector.airtable_record_id || sector.id),
      tagIds: Array.from(tagIds),
      canAccessUntaggedChats: sectors.some((sector) => !sectorTags.some((link) => link.sector_id === sector.id)),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel carregar o usuario." }, { status: 500 })
  }
}
