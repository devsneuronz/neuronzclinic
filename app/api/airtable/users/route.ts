import { NextResponse } from "next/server"

import { FALLBACK_ADMIN_EMAILS, getDefaultUser, isFallbackAdminEmail, normalizeUserRole } from "@/lib/user-roles"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const TABLE_CANDIDATES = [
  process.env.AIRTABLE_USERS_TABLE,
  "User",
  "Users",
  "Usuarios",
  "Usuários",
  "users",
  "user",
].filter(Boolean) as string[]
const SECTOR_TABLE_CANDIDATES = [
  process.env.AIRTABLE_SECTORS_TABLE,
  "Setores",
  "Setor",
  "SETOR",
  "setores",
  "setor",
  "Sectors",
  "Sector",
].filter(Boolean) as string[]

type AirtableRecord = {
  id: string
  fields?: Record<string, unknown>
}

type ListedUser = {
  email: string
  name: string
  role: ReturnType<typeof normalizeUserRole>
  tags: string[]
}

function getStringField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate]

    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function getEmail(fields: Record<string, unknown>) {
  return getStringField(fields, ["Email", "email", "E-mail", "e-mail", "Login", "login"])
}

function getName(fields: Record<string, unknown>, fallbackEmail: string) {
  return (
    getStringField(fields, ["Nome", "nome", "Name", "name", "Usuário", "Usuario", "user"]) ??
    fallbackEmail
  )
}

function getRole(fields: Record<string, unknown>) {
  const statusRole = normalizeUserRole(getStringField(fields, ["Status", "status"]))

  if (statusRole === "admin") {
    return statusRole
  }

  return normalizeUserRole(
    getStringField(fields, ["Role", "role", "Perfil", "perfil", "Cargo", "cargo", "Tipo", "tipo", "Permissão", "Permissao"]),
  )
}

function getStringArrayField(fields: Record<string, unknown>, candidates: string[]) {
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

function getUserTags(fields: Record<string, unknown>) {
  return getStringArrayField(fields, [
    "Setores sob responsabilidade",
    "Setores",
    "Setor",
    "Responsabilidades",
    "Tags",
    "tags",
    "Sectors",
    "Sector",
  ])
}

function getRecordLabel(fields: Record<string, unknown>) {
  return getStringField(fields, ["Nome", "nome", "Name", "name", "Setor", "setor", "Titulo", "title"])
}

function isInactive(fields: Record<string, unknown>) {
  const status = getStringField(fields, ["Status", "status", "Ativo", "ativo"])

  if (!status) {
    return false
  }

  return ["inativo", "inactive", "desativado", "excluído", "excluido", "false", "não", "nao"].includes(
    status.toLowerCase(),
  )
}

async function fetchAllRecords(table: string) {
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const params = new URLSearchParams({ pageSize: "100" })
    if (offset) params.set("offset", offset)

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
      cache: "no-store",
    })

    if (response.status === 404) return []

    if (!response.ok) {
      throw new Error(await response.text())
    }

    const data = (await response.json()) as {
      offset?: string
      records?: AirtableRecord[]
    }

    records.push(...(data.records ?? []))
    offset = data.offset
  } while (offset)

  return records
}

async function getLinkedTagLabels(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id) => /^rec[a-zA-Z0-9]+$/.test(id))))
  const labels = new Map<string, string>()

  if (uniqueIds.length === 0) {
    return labels
  }

  for (const table of SECTOR_TABLE_CANDIDATES) {
    const records = await fetchAllRecords(table)

    for (const record of records) {
      if (!uniqueIds.includes(record.id)) continue

      const label = getRecordLabel(record.fields ?? {})
      if (label) labels.set(record.id, label)
    }

    if (labels.size > 0) {
      break
    }
  }

  return labels
}

async function findUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase()

  for (const table of TABLE_CANDIDATES) {
    const records = await fetchAllRecords(table)
    const record = records.find((candidate) => {
      const fields = candidate.fields ?? {}
      const recordEmail = getEmail(fields)

      return recordEmail?.toLowerCase() === normalizedEmail && !isInactive(fields)
    })

    if (record?.fields) {
      return {
        email: normalizedEmail,
        name: getName(record.fields, normalizedEmail),
        role: getRole(record.fields),
        source: "airtable" as const,
      }
    }
  }

  return null
}

async function listActiveUsers() {
  const indexedUsers = new Map<string, ListedUser>()

  for (const table of TABLE_CANDIDATES) {
    const records = await fetchAllRecords(table)

    for (const record of records) {
      const fields = record.fields ?? {}
      const email = getEmail(fields)?.toLowerCase()

      if (!email || isInactive(fields) || indexedUsers.has(email)) {
        continue
      }

      indexedUsers.set(email, {
        email,
        name: getName(fields, email),
        role: getRole(fields),
        tags: getUserTags(fields),
      })
    }

    if (indexedUsers.size > 0) {
      break
    }
  }

  for (const email of FALLBACK_ADMIN_EMAILS) {
    if (!indexedUsers.has(email)) {
      const user = getDefaultUser(email)
      indexedUsers.set(email, {
        email: user.email,
        name: user.name,
        role: user.role,
        tags: user.role === "admin" ? ["ADM"] : [],
      })
    }
  }

  const linkedTagLabels = await getLinkedTagLabels(Array.from(indexedUsers.values()).flatMap((user) => user.tags))

  return Array.from(indexedUsers.values())
    .map((user) => ({
      ...user,
      tags: Array.from(new Set(user.tags.map((tag) => linkedTagLabels.get(tag) ?? tag).filter((tag) => !/^rec[a-zA-Z0-9]+$/.test(tag)))),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get("email")?.trim().toLowerCase()

  if (!email) {
    if (!AIRTABLE_TOKEN) {
      return NextResponse.json({
        users: FALLBACK_ADMIN_EMAILS.map((fallbackEmail) => {
          const user = getDefaultUser(fallbackEmail)
          return { email: user.email, name: user.name, role: user.role, tags: user.role === "admin" ? ["ADM"] : [] }
        }),
      })
    }

    return NextResponse.json({ users: await listActiveUsers() })
  }

  if (isFallbackAdminEmail(email) || !AIRTABLE_TOKEN) {
    return NextResponse.json(getDefaultUser(email))
  }

  const user = await findUserByEmail(email)

  return NextResponse.json(user ?? getDefaultUser(email))
}
