import { NextRequest, NextResponse } from "next/server"
import type { ChatTag } from "@/lib/chat-tags"

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

type AirtableRecord = {
  id: string
  fields?: Record<string, unknown>
}

type AirtableField = {
  id?: string
  name?: string
  type?: string
}

type AirtableTable = {
  id?: string
  name?: string
  fields?: AirtableField[]
}

type TagTableConfig = {
  table: string
  labelField: string
  colorField: string
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

function getFirstReadableStringField(fields: Record<string, unknown>) {
  for (const [key, value] of Object.entries(fields)) {
    if (["status", "ativo", "hexcor", "hex_status", "color", "cor"].includes(key.toLowerCase())) continue
    if (typeof value === "string" && value.trim() && !value.startsWith("rec")) return value.trim()
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

function assertAirtableToken() {
  if (!AIRTABLE_TOKEN) {
    throw new Error("Missing Airtable token. Add AIRTABLE_TOKEN or AIRTABLE_API_KEY to .env.local.")
  }
}

async function fetchAirtableMetadata() {
  assertAirtableToken()

  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
    cache: "no-store",
  })

  if (!response.ok) return []

  const data = (await response.json()) as { tables?: AirtableTable[] }
  return data.tables ?? []
}

function pickField(fields: AirtableField[], candidates: string[], fallback: string) {
  const lowerCandidates = candidates.map((candidate) => candidate.toLowerCase())
  const field = fields.find((item) => item.name && lowerCandidates.includes(item.name.toLowerCase()))

  return field?.name ?? fallback
}

function hasTagShape(table: AirtableTable) {
  const tableName = table.name?.toLowerCase() ?? ""
  const fieldNames = (table.fields ?? []).map((field) => field.name?.toLowerCase() ?? "")
  const hasLabelField = fieldNames.some((field) => ["tag", "nome", "name", "label"].includes(field))
  const hasColorField = fieldNames.some((field) => ["hexcor", "hex_status", "color", "cor"].includes(field))

  return (tableName.includes("tag") || tableName.includes("etiqueta")) && hasLabelField && hasColorField
}

async function getTagTableConfig(): Promise<TagTableConfig> {
  const tables = await fetchAirtableMetadata()
  const candidates = AIRTABLE_TAG_TABLE_CANDIDATES.map((candidate) => candidate.toLowerCase())
  const configuredTable = tables.find((table) => {
    const id = table.id?.toLowerCase()
    const name = table.name?.toLowerCase()
    return Boolean((id && candidates.includes(id)) || (name && candidates.includes(name)))
  })
  const inferredTable = tables.find(hasTagShape)
  const table = configuredTable ?? inferredTable

  if (table?.id || table?.name) {
    const fields = table.fields ?? []

    return {
      table: table.id ?? table.name ?? AIRTABLE_TAG_TABLE_CANDIDATES[0],
      labelField: pickField(fields, ["Tag", "tag", "Nome", "nome", "Name", "name", "label", "Label"], "Tag"),
      colorField: pickField(fields, ["HEXCOR", "hexcor", "hex_status", "Color", "color", "Cor", "cor"], "HEXCOR"),
    }
  }

  return {
    table: AIRTABLE_TAG_TABLE_CANDIDATES[0],
    labelField: "Tag",
    colorField: "HEXCOR",
  }
}

async function airtableRequest(path: string, init?: RequestInit) {
  assertAirtableToken()

  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  if (response.status === 204) return null

  return response.json()
}

async function fetchTagRecords(table: string) {
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const params = new URLSearchParams({ pageSize: "100" })
    if (offset) params.set("offset", offset)

    const data = (await airtableRequest(`${encodeURIComponent(table)}?${params}`)) as {
      offset?: string
      records?: AirtableRecord[]
    }

    records.push(...(data.records ?? []))
    offset = data.offset
  } while (offset)

  return records
}

function normalizePayload(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("Dados invalidos.")
  }

  const payload = body as { label?: unknown; color?: unknown }
  const label = typeof payload.label === "string" ? payload.label.trim() : ""
  const color = typeof payload.color === "string" ? payload.color.trim() : ""

  if (!label) {
    throw new Error("Informe o nome da tag.")
  }

  if (color && !/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error("Informe uma cor hexadecimal valida.")
  }

  return { label, color: color || "#0d9488" }
}

function getFields(config: TagTableConfig, payload: { label: string; color: string }) {
  return {
    [config.labelField]: payload.label,
    [config.colorField]: payload.color,
  }
}

export async function GET() {
  try {
    const config = await getTagTableConfig()
    const records = await fetchTagRecords(config.table)
    const tags = records
      .map(getAirtableTag)
      .filter((tag): tag is ChatTag => Boolean(tag))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))

    return NextResponse.json({ tags })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel carregar as tags." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const config = await getTagTableConfig()
    const payload = normalizePayload(await request.json())
    const data = (await airtableRequest(encodeURIComponent(config.table), {
      method: "POST",
      body: JSON.stringify({ records: [{ fields: getFields(config, payload) }] }),
    })) as { records?: AirtableRecord[] }
    const tag = data.records?.[0] ? getAirtableTag(data.records[0]) : null

    return NextResponse.json({ tag }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel criar a tag." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id) throw new Error("Tag nao encontrada.")

    const config = await getTagTableConfig()
    const payload = normalizePayload(await request.json())
    const data = (await airtableRequest(encodeURIComponent(config.table), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id, fields: getFields(config, payload) }] }),
    })) as { records?: AirtableRecord[] }
    const tag = data.records?.[0] ? getAirtableTag(data.records[0]) : null

    return NextResponse.json({ tag })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel atualizar a tag." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id) throw new Error("Tag nao encontrada.")

    const config = await getTagTableConfig()
    await airtableRequest(`${encodeURIComponent(config.table)}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel apagar a tag." }, { status: 500 })
  }
}
