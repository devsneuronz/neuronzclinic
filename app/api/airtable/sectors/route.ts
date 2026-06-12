import { NextRequest, NextResponse } from "next/server"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const TABLE = process.env.AIRTABLE_SECTORS_TABLE || "tbljxOTupllfDli5n"

type AirtableRecord = {
  id: string
  fields?: Record<string, unknown>
}

type SectorPayload = {
  name: string
  description: string
  color: string
  tagIds: string[]
}

function assertToken() {
  if (!AIRTABLE_TOKEN) throw new Error("Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY")
}

async function airtableRequest(path: string, init?: RequestInit) {
  assertToken()
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  })

  if (!response.ok) throw new Error(await response.text())
  if (response.status === 204) return null
  return response.json()
}

async function fetchAllRecords() {
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const params = new URLSearchParams({ pageSize: "100" })
    if (offset) params.set("offset", offset)
    const data = (await airtableRequest(`${encodeURIComponent(TABLE)}?${params}`)) as {
      offset?: string
      records?: AirtableRecord[]
    }
    records.push(...(data.records ?? []))
    offset = data.offset
  } while (offset)

  return records
}

function getString(fields: Record<string, unknown>, field: string) {
  const value = fields[field]
  return typeof value === "string" ? value.trim() : ""
}

function getIds(fields: Record<string, unknown>, field: string) {
  const value = fields[field]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function isExcluded(fields: Record<string, unknown>) {
  return getString(fields, "Status").toLowerCase() === "excluído"
}

function toSector(record: AirtableRecord) {
  const fields = record.fields ?? {}
  return {
    id: record.id,
    name: getString(fields, "Setor"),
    description: getString(fields, "Observações"),
    color: /^#[0-9a-f]{6}$/i.test(getString(fields, "HEXCOR")) ? getString(fields, "HEXCOR") : "#64748b",
    tagIds: getIds(fields, "Tags"),
    tagLabels: getIds(fields, "nometags"),
    userIds: getIds(fields, "User"),
  }
}

function normalizePayload(body: unknown): SectorPayload {
  if (!body || typeof body !== "object") throw new Error("Dados inválidos.")
  const source = body as Record<string, unknown>
  const name = typeof source.name === "string" ? source.name.trim() : ""
  const description = typeof source.description === "string" ? source.description.trim() : ""
  const color = typeof source.color === "string" ? source.color.trim() : ""
  const tagIds = Array.isArray(source.tagIds)
    ? Array.from(new Set(source.tagIds.filter((id): id is string => typeof id === "string" && /^rec[a-zA-Z0-9]+$/.test(id))))
    : []

  if (!name) throw new Error("Informe o nome do setor.")
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Informe uma cor hexadecimal válida.")

  return { name, description, color: color || "#64748b", tagIds }
}

function getFields(payload: SectorPayload) {
  return {
    Setor: payload.name,
    Status: "Ativo",
    "Observações": payload.description,
    HEXCOR: payload.color,
    Tags: payload.tagIds,
  }
}

export async function GET(request: Request) {
  try {
    const records = await fetchAllRecords()
    const sectors = records
      .filter((record) => !isExcluded(record.fields ?? {}))
      .map(toSector)
      .filter((sector) => sector.name)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))

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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os setores." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = normalizePayload(await request.json())
    const data = (await airtableRequest(encodeURIComponent(TABLE), {
      method: "POST",
      body: JSON.stringify({ records: [{ fields: getFields(payload) }] }),
    })) as { records?: AirtableRecord[] }
    const sector = data.records?.[0] ? toSector(data.records[0]) : null
    return NextResponse.json({ sector }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar o setor." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id) throw new Error("Setor não encontrado.")
    const payload = normalizePayload(await request.json())
    const data = (await airtableRequest(encodeURIComponent(TABLE), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id, fields: getFields(payload) }] }),
    })) as { records?: AirtableRecord[] }
    const sector = data.records?.[0] ? toSector(data.records[0]) : null
    return NextResponse.json({ sector })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o setor." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id) throw new Error("Setor não encontrado.")
    await airtableRequest(encodeURIComponent(TABLE), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id, fields: { Status: "Excluído", Tags: [] } }] }),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir o setor." }, { status: 500 })
  }
}
