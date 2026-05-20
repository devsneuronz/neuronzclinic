import { NextResponse } from "next/server"
import { getChatTags, type ChatTag } from "@/lib/chat-tags"
import { getChatStatusColor, getChatStatusLabel, type ChatStatusOption } from "@/lib/chat-status"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const AIRTABLE_TAG_TABLE_CANDIDATES = [
  process.env.AIRTABLE_TAGS_TABLE,
  "tblP68L7jNYctqKAq",
  "Tag",
  "TAG",
  "Tags",
  "TAGS",
  "Tags do contato",
  "Tags contato",
  "Tag Chat",
  "Tags Chat",
  "Etiquetas",
  "Etiqueta",
  "tags",
  "tag",
].filter(Boolean) as string[]
const PAGE_SIZE = 1000

interface CatalogChatRecord {
  Status_chat: string | null
  hex_status: string | null
  finalizada: boolean | null
  json_tags: unknown
  json_tags_parsed: unknown
  tag_chat_array: unknown
}

type AirtableRecord = {
  id: string
  fields?: Record<string, unknown>
}

async function fetchCatalogChats() {
  if (!SUPABASE_REST_URL || !SUPABASE_PUBLISHABLE_KEY) return []

  const chats: CatalogChatRecord[] = []
  let offset = 0
  const select = ["Status_chat", "hex_status", "finalizada", "json_tags", "json_tags_parsed", "tag_chat_array"].join(",")

  while (true) {
    const url = `${SUPABASE_REST_URL.replace(/\/$/, "")}/chats?select=${select}&limit=${PAGE_SIZE}&offset=${offset}`
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    const page = (await response.json()) as CatalogChatRecord[]
    chats.push(...page)

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return chats
}

function getStatusOptions(chats: CatalogChatRecord[]) {
  const options = new Map<string, ChatStatusOption>()

  for (const fallback of [
    { label: "Aberta", color: "#22c55e" },
    { label: "Finalizada", color: "#6b7280" },
  ]) {
    options.set(fallback.label, fallback)
  }

  for (const chat of chats) {
    const label = getChatStatusLabel(chat)
    if (!label || options.has(label)) continue

    options.set(label, {
      label,
      color: getChatStatusColor(chat),
    })
  }

  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
}

function getTagOptions(chats: CatalogChatRecord[]) {
  const options = new Map<string, ChatTag>()

  for (const chat of chats) {
    for (const tag of getChatTags(chat)) {
      const key = tag.id || tag.label
      if (!options.has(key)) options.set(key, tag)
    }
  }

  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
}

function getStringField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate]

    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return ""
}

function getAirtableTag(record: AirtableRecord): ChatTag | null {
  const fields = record.fields ?? {}
  const label = getStringField(fields, ["Tag", "tag", "Nome", "nome", "Name", "name", "label", "Label"]) || getFirstReadableStringField(fields)
  if (!label) return null

  const color = getStringField(fields, ["HEXCOR", "hexcor", "hex_status", "Color", "color", "Cor", "cor"])
  const tag: ChatTag = { id: record.id, label }

  if (/^#[0-9a-f]{6}$/i.test(color)) {
    tag.color = color
  }

  return tag
}

function getFirstReadableStringField(fields: Record<string, unknown>) {
  for (const [key, value] of Object.entries(fields)) {
    if (["status", "ativo", "hexcor", "hex_status", "color", "cor"].includes(key.toLowerCase())) continue
    if (typeof value === "string" && value.trim() && !value.startsWith("rec")) return value.trim()
  }

  return ""
}

function isInactiveAirtableTag(record: AirtableRecord) {
  const status = getStringField(record.fields ?? {}, ["Status", "status", "Ativo", "ativo"])

  return ["inativo", "inactive", "desativado", "excluido", "excluído", "false", "nao", "não"].includes(status.toLowerCase())
}

async function fetchAirtableRecords(table: string) {
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const params = new URLSearchParams({ pageSize: "100" })
    if (offset) params.set("offset", offset)

    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params}`, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
      cache: "no-store",
    })

    if (response.status === 404) return []

    if (!response.ok) {
      throw new Error(await response.text())
    }

    const data = (await response.json()) as { offset?: string; records?: AirtableRecord[] }
    records.push(...(data.records ?? []))
    offset = data.offset
  } while (offset)

  return records
}

async function fetchAirtableTagTableNamesFromMetadata() {
  if (!AIRTABLE_TOKEN) return []

  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
    cache: "no-store",
  })

  if (!response.ok) return []

  const data = (await response.json()) as {
    tables?: Array<{
      name?: string
      fields?: Array<{ name?: string }>
    }>
  }

  return (data.tables ?? [])
    .filter((table) => {
      const tableName = table.name?.toLowerCase() ?? ""
      const fieldNames = (table.fields ?? []).map((field) => field.name?.toLowerCase() ?? "")

      return (
        tableName.includes("tag") ||
        tableName.includes("etiqueta") ||
        fieldNames.some((field) => ["tag", "tags", "ida tag", "hexcor", "cor"].includes(field))
      )
    })
    .map((table) => table.name)
    .filter((name): name is string => Boolean(name))
}

async function fetchAirtableTagOptions() {
  if (!AIRTABLE_TOKEN) return []

  const metadataTableNames = await fetchAirtableTagTableNamesFromMetadata()
  const tableCandidates = Array.from(new Set([...AIRTABLE_TAG_TABLE_CANDIDATES, ...metadataTableNames]))

  for (const table of tableCandidates) {
    let records: AirtableRecord[] = []

    try {
      records = await fetchAirtableRecords(table)
    } catch {
      continue
    }

    const tags = records
      .filter((record) => !isInactiveAirtableTag(record))
      .map(getAirtableTag)
      .filter((tag): tag is ChatTag => Boolean(tag))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))

    if (tags.length > 0) return tags
  }

  return []
}

export async function GET() {
  const errors: string[] = []
  let chats: CatalogChatRecord[] = []
  let airtableTags: ChatTag[] = []

  try {
    chats = await fetchCatalogChats()
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Não foi possível carregar opções do Supabase.")
  }

  try {
    airtableTags = await fetchAirtableTagOptions()
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Não foi possível carregar tags do Airtable.")
  }

  const fallbackTags = getTagOptions(chats).filter((tag) => /^rec[a-zA-Z0-9]+$/.test(tag.id))

  return NextResponse.json({
    statuses: getStatusOptions(chats),
    tags: airtableTags.length > 0 ? airtableTags : fallbackTags,
    errors,
  })
}
