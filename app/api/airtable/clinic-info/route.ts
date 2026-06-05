import { NextRequest, NextResponse } from "next/server"
import type { ClinicAssistantInfo, ClinicProcedure } from "@/lib/clinic-info"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY

const ASSISTANT_TABLE_CANDIDATES = [
  process.env.AIRTABLE_ASSISTANT_TABLE,
  "IA-assistente",
  "IA Assistente",
  "IA assistente",
  "Assistente IA",
  "Assistente",
].filter(Boolean) as string[]

const PROCEDURES_TABLE_CANDIDATES = [
  process.env.AIRTABLE_PROCEDURES_TABLE,
  "Procedimentos",
  "procedimentos",
  "Procedimento",
  "procedimento",
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

type AssistantTableConfig = {
  table: string
  nameField: string
  generalInfoField: string
  initialMessageField: string
}

type ProceduresTableConfig = {
  table: string
  nameField: string
  interestField: string
  descriptionField: string
  activeField: string
  activeFieldType?: string
}

function assertAirtableToken() {
  if (!AIRTABLE_TOKEN) {
    throw new Error("Configure AIRTABLE_TOKEN ou AIRTABLE_API_KEY.")
  }
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function getStringField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate]

    if (typeof value === "string" && value.trim()) return value.trim()
    if (Array.isArray(value)) {
      const text = value.find((item) => typeof item === "string" && item.trim())
      if (typeof text === "string") return text.trim()
    }
  }

  return ""
}

function getBooleanField(fields: Record<string, unknown>, candidates: string[], fallback = true) {
  for (const candidate of candidates) {
    const value = fields[candidate]
    if (typeof value === "boolean") return value

    if (typeof value === "string" && value.trim()) {
      const normalized = normalize(value)
      if (["ativo", "active", "sim", "yes", "true", "1"].includes(normalized)) return true
      if (["inativo", "inactive", "nao", "no", "false", "0"].includes(normalized)) return false
    }
  }

  return fallback
}

function isInactive(fields: Record<string, unknown>) {
  return !getBooleanField(fields, ["Ativo", "ativo", "Active", "active", "Status", "status"], true)
}

function pickField(fields: AirtableField[], candidates: string[], fallback: string) {
  const normalizedCandidates = candidates.map(normalize)
  const field = fields.find((item) => item.name && normalizedCandidates.includes(normalize(item.name)))

  return field?.name ?? fallback
}

function getFieldType(fields: AirtableField[], fieldName: string) {
  return fields.find((field) => field.name === fieldName)?.type
}

function getTableByCandidates(tables: AirtableTable[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalize)

  return tables.find((table) => {
    const id = table.id ? normalize(table.id) : ""
    const name = table.name ? normalize(table.name) : ""

    return normalizedCandidates.includes(id) || normalizedCandidates.includes(name)
  })
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

async function fetchMetadata() {
  assertAirtableToken()

  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  })

  if (!response.ok) return []

  const data = (await response.json()) as { tables?: AirtableTable[] }
  return data.tables ?? []
}

async function fetchAllRecords(table: string) {
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

async function getAssistantTableConfig(tables?: AirtableTable[]): Promise<AssistantTableConfig> {
  const table = getTableByCandidates(tables ?? (await fetchMetadata()), ASSISTANT_TABLE_CANDIDATES)
  const fields = table?.fields ?? []

  return {
    table: table?.id ?? table?.name ?? ASSISTANT_TABLE_CANDIDATES[0],
    nameField: pickField(fields, ["Nome", "Name", "Assistente"], "Nome"),
    generalInfoField: pickField(fields, ["dados da clínica", "dados da clinica", "Dados da Clínica", "Dados da Clinica"], "dados da clínica"),
    initialMessageField: pickField(fields, ["mensagem inicial", "Mensagem inicial", "Mensagem Inicial"], "mensagem inicial"),
  }
}

async function getProceduresTableConfig(tables?: AirtableTable[]): Promise<ProceduresTableConfig> {
  const table = getTableByCandidates(tables ?? (await fetchMetadata()), PROCEDURES_TABLE_CANDIDATES)
  const fields = table?.fields ?? []
  const activeField = pickField(fields, ["Ativo", "ativo", "Active", "Status"], "Ativo")

  return {
    table: table?.id ?? table?.name ?? PROCEDURES_TABLE_CANDIDATES[0],
    nameField: pickField(fields, ["Nome", "Name", "Procedimento", "procedimento"], "Nome"),
    interestField: pickField(fields, ["Interesse", "interesse", "Categoria", "Tipo"], "Interesse"),
    descriptionField: pickField(fields, ["Descrição", "Descricao", "description", "Description"], "Descrição"),
    activeField,
    activeFieldType: getFieldType(fields, activeField),
  }
}

function mapAssistant(record: AirtableRecord | null, config?: AssistantTableConfig): ClinicAssistantInfo {
  const fields = record?.fields ?? {}

  return {
    id: record?.id ?? null,
    name: getStringField(fields, [config?.nameField ?? "", "Nome", "Name", "Assistente"]) || "Lia",
    generalInfo: getStringField(fields, [
      config?.generalInfoField ?? "",
      "dados da clínica",
      "dados da clinica",
      "Dados da Clínica",
      "Dados da Clinica",
    ]),
    initialMessage: getStringField(fields, [config?.initialMessageField ?? "", "mensagem inicial", "Mensagem inicial", "Mensagem Inicial"]),
  }
}

function mapProcedure(record: AirtableRecord, config?: ProceduresTableConfig): ClinicProcedure {
  const fields = record.fields ?? {}

  return {
    id: record.id,
    name: getStringField(fields, [config?.nameField ?? "", "Nome", "Name", "Procedimento", "procedimento"]),
    interest: getStringField(fields, [config?.interestField ?? "", "Interesse", "interesse", "Categoria", "Tipo"]),
    description: getStringField(fields, [config?.descriptionField ?? "", "Descrição", "Descricao", "description", "Description"]),
    active: getBooleanField(fields, [config?.activeField ?? "", "Ativo", "ativo", "Active", "Status"], true),
  }
}

function getAssistantFields(config: AssistantTableConfig, input: Partial<ClinicAssistantInfo>) {
  const fields: Record<string, unknown> = {}
  const name = typeof input.name === "string" ? input.name.trim() : ""
  const generalInfo = typeof input.generalInfo === "string" ? input.generalInfo.trim() : ""
  const initialMessage = typeof input.initialMessage === "string" ? input.initialMessage.trim() : ""

  fields[config.nameField] = name || "Lia"
  fields[config.generalInfoField] = generalInfo
  fields[config.initialMessageField] = initialMessage

  return fields
}

function getProcedurePayload(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Dados invalidos.")

  const payload = input as Partial<ClinicProcedure>
  const name = typeof payload.name === "string" ? payload.name.trim() : ""
  const interest = typeof payload.interest === "string" ? payload.interest.trim() : ""
  const description = typeof payload.description === "string" ? payload.description.trim() : ""
  const active = typeof payload.active === "boolean" ? payload.active : true

  if (!name && !interest) throw new Error("Informe o nome ou interesse do procedimento.")
  if (!description) throw new Error("Informe a descrição do procedimento.")

  return { name, interest, description, active }
}

function getProcedureFields(config: ProceduresTableConfig, payload: Omit<ClinicProcedure, "id">) {
  const activeValue = config.activeFieldType === "checkbox" ? payload.active : payload.active ? "Ativo" : "Inativo"

  return {
    [config.nameField]: payload.name,
    [config.interestField]: payload.interest,
    [config.descriptionField]: payload.description,
    [config.activeField]: activeValue,
  }
}

function getAirtableErrorMessage(error: unknown, fallback: string) {
  const rawMessage = error instanceof Error ? error.message : ""

  try {
    const parsed = JSON.parse(rawMessage) as { error?: { message?: string } }
    return parsed.error?.message || rawMessage || fallback
  } catch {
    return rawMessage || fallback
  }
}

export async function GET() {
  try {
    const tables = await fetchMetadata()
    const assistantConfig = await getAssistantTableConfig(tables)
    const proceduresConfig = await getProceduresTableConfig(tables)
    const [assistantRecords, procedureRecords] = await Promise.all([
      fetchAllRecords(assistantConfig.table),
      fetchAllRecords(proceduresConfig.table),
    ])

    const assistantRecord = assistantRecords.find((record) => !isInactive(record.fields ?? {})) ?? assistantRecords[0] ?? null
    const procedures = procedureRecords
      .map((record) => mapProcedure(record, proceduresConfig))
      .sort((a, b) => (a.interest || a.name).localeCompare(b.interest || b.name, "pt-BR", { sensitivity: "base" }))

    return NextResponse.json({ assistant: mapAssistant(assistantRecord, assistantConfig), procedures })
  } catch (error) {
    return NextResponse.json(
      { message: getAirtableErrorMessage(error, "Não foi possível carregar as informações da clínica.") },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const config = await getProceduresTableConfig()
    const payload = getProcedurePayload(await request.json())
    const data = (await airtableRequest(encodeURIComponent(config.table), {
      method: "POST",
      body: JSON.stringify({ records: [{ fields: getProcedureFields(config, payload) }] }),
    })) as { records?: AirtableRecord[] }
    const procedure = data.records?.[0] ? mapProcedure(data.records[0], config) : null

    return NextResponse.json({ procedure }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { message: getAirtableErrorMessage(error, "Não foi possível criar o procedimento.") },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { type?: unknown; assistant?: Partial<ClinicAssistantInfo>; procedure?: Partial<ClinicProcedure> }
    const type = typeof body.type === "string" ? body.type : ""

    if (type === "assistant") {
      const config = await getAssistantTableConfig()
      const id = typeof body.assistant?.id === "string" ? body.assistant.id.trim() : ""
      const fields = getAssistantFields(config, body.assistant ?? {})

      if (id) {
        const record = (await airtableRequest(`${encodeURIComponent(config.table)}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ fields }),
        })) as AirtableRecord

        return NextResponse.json({ assistant: mapAssistant(record, config) })
      }

      const data = (await airtableRequest(encodeURIComponent(config.table), {
        method: "POST",
        body: JSON.stringify({ records: [{ fields }] }),
      })) as { records?: AirtableRecord[] }

      return NextResponse.json({ assistant: mapAssistant(data.records?.[0] ?? null, config) })
    }

    if (type === "procedure") {
      const id = typeof body.procedure?.id === "string" ? body.procedure.id.trim() : ""
      if (!id) throw new Error("Procedimento nao encontrado.")

      const config = await getProceduresTableConfig()
      const payload = getProcedurePayload(body.procedure)
      const data = (await airtableRequest(encodeURIComponent(config.table), {
        method: "PATCH",
        body: JSON.stringify({ records: [{ id, fields: getProcedureFields(config, payload) }] }),
      })) as { records?: AirtableRecord[] }
      const procedure = data.records?.[0] ? mapProcedure(data.records[0], config) : null

      return NextResponse.json({ procedure })
    }

    return NextResponse.json({ message: "Tipo de atualização inválido." }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { message: getAirtableErrorMessage(error, "Não foi possível salvar as informações.") },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim()
    if (!id) throw new Error("Procedimento nao encontrado.")

    const config = await getProceduresTableConfig()
    await airtableRequest(`${encodeURIComponent(config.table)}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { message: getAirtableErrorMessage(error, "Não foi possível excluir o procedimento.") },
      { status: 500 },
    )
  }
}
