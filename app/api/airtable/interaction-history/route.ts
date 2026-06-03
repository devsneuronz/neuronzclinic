import { NextResponse } from "next/server"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const INTERACTION_HISTORY_TABLE = process.env.AIRTABLE_INTERACTION_HISTORY_TABLE || "Histórico de Interações"
const CONTACTS_TABLE = process.env.AIRTABLE_CONTACTS_TABLE || "Contatos"
const FALLBACK_QUALITY_OPTIONS = ["Ótima", "Boa", "Razoável", "Ruim", "Péssima"]

type AirtableRecord = {
  id: string
  createdTime?: string
  fields?: Record<string, unknown>
}

type AirtableField = {
  id: string
  name: string
  type?: string
  options?: {
    choices?: Array<{ name?: string }>
  }
}

type AirtableTable = {
  id: string
  name: string
  fields?: AirtableField[]
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getStringField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate]

    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }

    if (Array.isArray(value)) {
      const textValue = value.find((item) => typeof item === "string" && item.trim())
      if (typeof textValue === "string") return textValue.trim()
    }
  }

  return ""
}

function getDateField(fields: Record<string, unknown>, candidates: string[]) {
  const value = getStringField(fields, candidates)
  const date = value ? new Date(value) : null

  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : ""
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "")
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

function getFieldByCandidates(table: AirtableTable | undefined, candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase())

  return (table?.fields ?? []).find((field) => normalizedCandidates.includes(field.name.toLowerCase()))
}

function getChoiceNames(table: AirtableTable | undefined, candidates: string[]) {
  const field = getFieldByCandidates(table, candidates)

  return Array.from(
    new Set(
      (field?.options?.choices ?? [])
        .map((choice) => choice.name?.trim())
        .filter((choice): choice is string => Boolean(choice)),
    ),
  )
}

function getTableByName(tables: AirtableTable[], tableName: string) {
  const normalizedTableName = tableName.trim().toLowerCase()
  return tables.find((table) => table.name.trim().toLowerCase() === normalizedTableName)
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function getTableByCandidates(tables: AirtableTable[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeText)

  return tables.find((table) => normalizedCandidates.includes(normalizeText(table.name)))
}

function tableHasAnyField(table: AirtableTable, candidates: string[]) {
  return Boolean(getFieldByCandidates(table, candidates))
}

function getInteractionHistoryTable(tables: AirtableTable[]) {
  return (
    getTableByCandidates(tables, [
      INTERACTION_HISTORY_TABLE,
      "Histórico de Interações",
      "Historico de Interacoes",
      "Histórico Interações",
      "Historico Interacoes",
      "Histórico",
      "Historico",
    ]) ||
    tables.find(
      (table) =>
        tableHasAnyField(table, ["msg recebida", "Msg recebida", "Mensagem Recebida"]) &&
        tableHasAnyField(table, ["msg resposta enviada", "Msg resposta enviada", "Resposta IA"]),
    )
  )
}

const QUALITY_FIELD_CANDIDATES = [
  "qualidade de resposta",
  "Qualidade de resposta",
  "Qualidade de Resposta",
  "qualidade da resposta",
  "Qualidade da resposta",
  "Qualidade da Resposta",
  "Qualidade resposta",
  "Qualidade",
  "quality",
  "Avaliação",
  "Avaliacao",
]
const CORRECTED_RESPONSE_FIELD_CANDIDATES = [
  "msg resposta corrigida",
  "Msg resposta corrigida",
  "MSG RESPOSTA CORRIGIDA",
  "Resposta Corrigida",
  "resposta corrigida",
  "Mensagem Corrigida",
]

function mapInteractionRecord(record: AirtableRecord, index: number) {
  const fields = record.fields ?? {}
  const received = getStringField(fields, ["msg recebida", "Msg recebida", "MSG RECEBIDA", "Mensagem Recebida", "mensagem recebida"])
  const iaResponse = getStringField(fields, [
    "msg resposta enviada",
    "Msg resposta enviada",
    "MSG RESPOSTA ENVIADA",
    "Resposta IA",
    "resposta ia",
    "Mensagem Resposta Enviada",
  ])
  const correctedResponse = getStringField(fields, CORRECTED_RESPONSE_FIELD_CANDIDATES)
  const quality = getStringField(fields, QUALITY_FIELD_CANDIDATES)
  const createdAt = getDateField(fields, ["Data e Hora", "Criado em", "Created At", "createdAt"]) || record.createdTime || ""

  return {
    id: record.id,
    number: index + 1,
    createdAt,
    received,
    iaResponse,
    correctedResponse,
    quality,
  }
}

function getInteractionTime(interaction: ReturnType<typeof mapInteractionRecord>) {
  const time = new Date(interaction.createdAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

function sortInteractionsOldestFirst(interactions: ReturnType<typeof mapInteractionRecord>[]) {
  return [...interactions]
    .sort((first, second) => getInteractionTime(first) - getInteractionTime(second))
    .map((interaction, index) => ({ ...interaction, number: index + 1 }))
}

async function fetchMetadataTables() {
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const data = (await response.json()) as { tables?: AirtableTable[] }
  return data.tables ?? []
}

async function fetchAirtableRecords(table: string, params: URLSearchParams) {
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params}`, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const data = (await response.json()) as { records?: AirtableRecord[] }
  return data.records ?? []
}

async function updateAirtableRecord(table: string, id: string, fields: Record<string, unknown>) {
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ fields }),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return (await response.json()) as AirtableRecord
}

async function findContactId(contactTable: AirtableTable | undefined, { chatId, contactPhone }: { chatId: string; contactPhone: string }) {
  const formulaParts: string[] = []
  const trimmedChatId = chatId.trim()
  const chatFields = getExistingFieldNames(contactTable, ["SUPABASE_CHAT", "ALT_CHAT_ID", "N_WHATS_API", "N_WHATS_WEB"])
  const phoneFields = getExistingFieldNames(contactTable, [
    "N_WHATS_API",
    "N_WHATS_WEB",
    "Telefone Princial",
    "Telefone Secundário",
    "celular-so-numero",
    "Celularsupabase",
  ])

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
  const records = await fetchAirtableRecords(CONTACTS_TABLE, params)

  return records[0]?.id ?? null
}

function buildInteractionFilter(table: AirtableTable | undefined, contactId: string | null, chatId: string, contactPhone: string) {
  const formulaParts: string[] = []
  const contactFields = getExistingFieldNames(table, ["Contato", "Paciente", "Contact", "Cliente", "Lead"])
  const chatFields = getExistingFieldNames(table, ["SUPABASE_CHAT", "chat_id", "Chat ID", "N_WHATS_API", "N_WHATS_WEB"])
  const phoneFields = getExistingFieldNames(table, ["Telefone", "Telefone Princial", "Telefone Secundário", "celular-so-numero", "Celularsupabase", "N_WHATS_API", "N_WHATS_WEB"])

  if (contactId) {
    const contactValue = formulaString(contactId)
    for (const field of contactFields) {
      formulaParts.push(`FIND(${contactValue}, ARRAYJOIN({${field}}))>0`)
    }
  }

  if (chatId) {
    const chatValue = formulaString(chatId)
    for (const field of chatFields) {
      formulaParts.push(`{${field}}=${chatValue}`)
      formulaParts.push(`FIND(${chatValue}, ${fieldText(field)})>0`)
    }
  }

  for (const phone of getBrazilPhoneVariants(contactPhone || chatId)) {
    const phoneValue = formulaString(phone)
    for (const field of phoneFields) {
      formulaParts.push(`{${field}}=${phoneValue}`)
      formulaParts.push(`FIND(${phoneValue}, ${fieldText(field)})>0`)
    }
  }

  if (formulaParts.length === 0) return ""
  return formulaParts.length === 1 ? formulaParts[0] : `OR(${formulaParts.join(",")})`
}

export async function GET(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ interactions: [], message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const chatId = getString(searchParams.get("chatId"))
  const contactPhone = getString(searchParams.get("contactPhone"))

  try {
    const tables = await fetchMetadataTables()
    const historyTable = getInteractionHistoryTable(tables)
    const contactsTable = getTableByName(tables, CONTACTS_TABLE)
    const contactId = chatId || contactPhone ? await findContactId(contactsTable, { chatId, contactPhone }) : null
    const params = new URLSearchParams({ pageSize: "100" })
    const dateFields = getExistingFieldNames(historyTable, ["Data e Hora", "Criado em", "Created At", "createdAt"])
    const filterByFormula = buildInteractionFilter(historyTable, contactId, chatId, contactPhone)

    if (dateFields[0]) {
      params.set("sort[0][field]", dateFields[0])
      params.set("sort[0][direction]", "asc")
    }

    if (filterByFormula) {
      params.set("filterByFormula", filterByFormula)
    }

    const records = await fetchAirtableRecords(INTERACTION_HISTORY_TABLE, params)
    const interactions = sortInteractionsOldestFirst(records.map(mapInteractionRecord).filter((interaction) => interaction.received || interaction.iaResponse))
    const qualityOptions = getChoiceNames(historyTable, QUALITY_FIELD_CANDIDATES)

    return NextResponse.json({ interactions, qualityOptions: qualityOptions.length > 0 ? qualityOptions : FALLBACK_QUALITY_OPTIONS })
  } catch (error) {
    return NextResponse.json(
      { interactions: [], message: error instanceof Error ? error.message : "Não foi possível carregar o histórico de interações do Airtable." },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" }, { status: 500 })
  }

  const body = (await request.json()) as { id?: unknown; quality?: unknown; correctedResponse?: unknown }
  const id = getString(body.id)
  const quality = getString(body.quality)
  const correctedResponse = getString(body.correctedResponse)
  const shouldUpdateQuality = Object.prototype.hasOwnProperty.call(body, "quality")
  const shouldUpdateCorrectedResponse = Object.prototype.hasOwnProperty.call(body, "correctedResponse")

  if (!/^rec[a-zA-Z0-9]+$/.test(id)) {
    return NextResponse.json({ message: "Interação inválida." }, { status: 400 })
  }

  if (!shouldUpdateQuality && !shouldUpdateCorrectedResponse) {
    return NextResponse.json({ message: "Nenhuma alteração informada." }, { status: 400 })
  }

  if (shouldUpdateCorrectedResponse && !correctedResponse) {
    return NextResponse.json({ message: "Digite a mensagem corrigida." }, { status: 400 })
  }

  try {
    const tables = await fetchMetadataTables()
    const historyTable = getInteractionHistoryTable(tables)
    const fieldsToUpdate: Record<string, unknown> = {}

    if (shouldUpdateQuality) {
      const qualityField = getFieldByCandidates(historyTable, QUALITY_FIELD_CANDIDATES)

      if (!qualityField) {
        return NextResponse.json({ message: "Campo qualidade de resposta não encontrado no Airtable." }, { status: 404 })
      }

      const qualityOptions = getChoiceNames(historyTable, QUALITY_FIELD_CANDIDATES)
      if (quality && qualityOptions.length > 0 && !qualityOptions.includes(quality)) {
        return NextResponse.json({ message: "Qualidade de resposta inválida para este campo." }, { status: 400 })
      }

      fieldsToUpdate[qualityField.name] = quality || null
    }

    if (shouldUpdateCorrectedResponse) {
      const correctedResponseField = getFieldByCandidates(historyTable, CORRECTED_RESPONSE_FIELD_CANDIDATES)

      if (!correctedResponseField) {
        return NextResponse.json({ message: "Campo msg resposta corrigida não encontrado no Airtable." }, { status: 404 })
      }

      fieldsToUpdate[correctedResponseField.name] = correctedResponse
    }

    const record = await updateAirtableRecord(INTERACTION_HISTORY_TABLE, id, fieldsToUpdate)

    return NextResponse.json({ interaction: mapInteractionRecord(record, 0), message: "Alteração salva." })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível salvar a qualidade de resposta no Airtable." },
      { status: 500 },
    )
  }
}
