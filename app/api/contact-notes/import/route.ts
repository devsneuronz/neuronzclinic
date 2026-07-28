import { NextResponse } from "next/server"

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const CONTACTS_TABLE = process.env.AIRTABLE_CONTACTS_TABLE || "Contatos"
const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type AirtableRecord = {
  id: string
  createdTime?: string
  fields?: Record<string, unknown>
}

type AirtableField = {
  id: string
  name: string
  type?: string
}

type AirtableTable = {
  id: string
  name: string
  fields?: AirtableField[]
}

type ImportBody = {
  chatId?: unknown
  contactPhone?: unknown
}

type ContactNoteInsert = {
  chat_id: string
  contact_phone: string | null
  content: string
  created_at?: string
}

const CONTACT_NOTE_FIELD_CANDIDATES = [
  "Descricao",
  "Descrição",
  "Description",
]

const CONTACT_CHAT_FIELD_CANDIDATES = ["SUPABASE_CHAT", "ALT_CHAT_ID", "N_WHATS_API", "N_WHATS_WEB"]
const CONTACT_PHONE_FIELD_CANDIDATES = [
  "N_WHATS_API",
  "N_WHATS_WEB",
  "Telefone Princial",
  "Telefone Principal",
  "Telefone Secundario",
  "Telefone Secundário",
  "celular-so-numero",
  "Celularsupabase",
]

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "")
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function formulaString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function fieldText(fieldName: string) {
  return `{${fieldName}}&""`
}

function getBrazilPhoneVariants(value: string) {
  const digits = onlyDigits(value)
  const variants = new Set<string>()

  if (digits) variants.add(digits)
  if (digits.startsWith("55")) variants.add(digits.slice(2))
  if (digits.length >= 10 && !digits.startsWith("55")) variants.add(`55${digits}`)

  return Array.from(variants).filter(Boolean)
}

function getExistingFieldNames(table: AirtableTable | undefined, candidates: string[]) {
  const names = new Set((table?.fields ?? []).map((field) => field.name))
  return candidates.filter((candidate) => names.has(candidate))
}

function getTableByNameOrId(tables: AirtableTable[], tableNameOrId: string) {
  const normalized = normalizeText(tableNameOrId)
  return tables.find((table) => table.id === tableNameOrId || normalizeText(table.name) === normalized)
}

function getConfiguredNoteFieldNames() {
  return (process.env.AIRTABLE_CONTACT_NOTE_FIELDS || "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean)
}

function getNoteFields(table: AirtableTable | undefined) {
  const fields = table?.fields ?? []
  const configuredFields = getConfiguredNoteFieldNames()
  const normalizedCandidates = new Set([...configuredFields, ...CONTACT_NOTE_FIELD_CANDIDATES].map(normalizeText))

  const exactMatches = fields.filter((field) => normalizedCandidates.has(normalizeText(field.name)))
  if (exactMatches.length > 0) return exactMatches

  return fields.filter((field) => {
    if (!["multilineText", "richText", "singleLineText"].includes(field.type || "")) return false
    const name = normalizeText(field.name)
    return ["nota", "anota", "observ", "histor", "coment"].some((term) => name.includes(term))
  })
}

function getFieldText(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
      .map(String)
      .map((item) => item.trim())
      .filter((item) => item && !/^rec[a-zA-Z0-9]+$/.test(item))
      .join("\n")
      .trim()
  }

  return ""
}

function buildImportedNoteContent(_fieldName: string, value: string) {
  return value.trim()
}

function getExistingContentKeys(notes: Array<{ content?: unknown }>) {
  const keys = new Set<string>()

  for (const note of notes) {
    const content = getString(note.content)
    if (!content) continue

    keys.add(normalizeText(content))
    keys.add(normalizeText(content.replace(/^\[Historico Airtable\][^\n]*\n/, "")))
  }

  return keys
}

async function airtableRequest(path: string, init?: RequestInit) {
  if (!AIRTABLE_TOKEN) {
    throw new Error("Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY.")
  }

  const response = await fetch(`https://api.airtable.com/v0/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response
}

async function fetchMetadataTables() {
  const response = await airtableRequest(`meta/bases/${AIRTABLE_BASE_ID}/tables`)
  const data = (await response.json()) as { tables?: AirtableTable[] }
  return data.tables ?? []
}

async function fetchAirtableRecords(table: string, params: URLSearchParams) {
  const response = await airtableRequest(`${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params}`)
  const data = (await response.json()) as { records?: AirtableRecord[] }
  return data.records ?? []
}

async function findContactRecord(contactTable: AirtableTable | undefined, { chatId, contactPhone }: { chatId: string; contactPhone: string }) {
  const formulaParts: string[] = []
  const trimmedChatId = chatId.trim()
  const chatFields = getExistingFieldNames(contactTable, CONTACT_CHAT_FIELD_CANDIDATES)
  const phoneFields = getExistingFieldNames(contactTable, CONTACT_PHONE_FIELD_CANDIDATES)

  if (trimmedChatId) {
    const chatValue = formulaString(trimmedChatId)
    for (const field of chatFields) {
      formulaParts.push(`{${field}}=${chatValue}`)
      formulaParts.push(`FIND(${chatValue}, ${fieldText(field)})>0`)
    }
  }

  for (const phone of getBrazilPhoneVariants(contactPhone || trimmedChatId)) {
    const phoneValue = formulaString(phone)
    for (const field of phoneFields) {
      formulaParts.push(`{${field}}=${phoneValue}`)
      formulaParts.push(`FIND(${phoneValue}, ${fieldText(field)})>0`)
    }
  }

  if (formulaParts.length === 0) return null

  const params = new URLSearchParams({
    maxRecords: "1",
    pageSize: "1",
    filterByFormula: formulaParts.length === 1 ? formulaParts[0] : `OR(${formulaParts.join(",")})`,
  })
  const records = await fetchAirtableRecords(contactTable?.id || CONTACTS_TABLE, params)

  return records[0] ?? null
}

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration.")
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

async function fetchExistingContactNotes(chatId: string) {
  const response = await supabaseRequest(`contact_notes?select=content&chat_id=eq.${encodeURIComponent(chatId)}`)

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return (await response.json()) as Array<{ content?: unknown }>
}

async function insertContactNotes(notes: ContactNoteInsert[]) {
  if (notes.length === 0) return []

  const response = await supabaseRequest("contact_notes?select=*", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(notes),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return (await response.json()) as unknown[]
}

export async function POST(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY." }, { status: 500 })
  }

  try {
    const body = (await request.json().catch(() => null)) as ImportBody | null
    const chatId = getString(body?.chatId)
    const contactPhone = getString(body?.contactPhone)

    if (!chatId) {
      return NextResponse.json({ message: "chatId e obrigatorio." }, { status: 400 })
    }

    const tables = await fetchMetadataTables()
    const contactTable = getTableByNameOrId(tables, CONTACTS_TABLE)

    if (!contactTable) {
      return NextResponse.json({ message: `Tabela de contatos nao encontrada no Airtable: ${CONTACTS_TABLE}.` }, { status: 404 })
    }

    const contactRecord = await findContactRecord(contactTable, { chatId, contactPhone })

    if (!contactRecord) {
      return NextResponse.json({ imported: 0, skipped: 0, notes: [] })
    }

    const noteFields = getNoteFields(contactTable)

    if (noteFields.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, notes: [] })
    }

    const existingKeys = getExistingContentKeys(await fetchExistingContactNotes(chatId))
    const fields = contactRecord.fields ?? {}
    const notesToInsert: ContactNoteInsert[] = []
    let skipped = 0

    for (const field of noteFields) {
      const rawContent = getFieldText(fields[field.name])
      if (!rawContent) continue

      const content = buildImportedNoteContent(field.name, rawContent)
      const rawKey = normalizeText(rawContent)
      const contentKey = normalizeText(content)

      if (existingKeys.has(rawKey) || existingKeys.has(contentKey)) {
        skipped += 1
        continue
      }

      existingKeys.add(rawKey)
      existingKeys.add(contentKey)
      notesToInsert.push({
        chat_id: chatId,
        contact_phone: contactPhone || null,
        content,
        ...(contactRecord.createdTime ? { created_at: contactRecord.createdTime } : {}),
      })
    }

    const insertedNotes = await insertContactNotes(notesToInsert)

    return NextResponse.json({
      imported: insertedNotes.length,
      skipped,
      notes: insertedNotes,
      contactRecordId: contactRecord.id,
      fields: noteFields.map((field) => field.name),
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel importar as anotacoes antigas do Airtable." },
      { status: 500 },
    )
  }
}
