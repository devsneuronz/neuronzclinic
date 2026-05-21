import { NextResponse } from "next/server"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const APPOINTMENT_TABLE_CANDIDATES = [
  process.env.AIRTABLE_APPOINTMENTS_TABLE,
  "Agendamentos",
  "Agendamento",
  "Appointments",
  "Appointment",
].filter(Boolean) as string[]
const PROFESSIONAL_TABLE_CANDIDATES = [
  process.env.AIRTABLE_PROFESSIONALS_TABLE,
  "Profissional",
  "Profissionais",
  "Professional",
  "Professionals",
].filter(Boolean) as string[]
const CONTACTS_TABLE_CANDIDATES = [
  process.env.AIRTABLE_CONTACTS_TABLE,
  "Contatos",
  "Contato",
  "Pacientes",
  "Paciente",
  "Contacts",
].filter(Boolean) as string[]

type AirtableRecord = {
  id: string
  fields?: Record<string, unknown>
}

type AirtableTable = {
  name?: string
  fields?: Array<{
    name?: string
    type?: string
    options?: {
      choices?: Array<{ name?: string }>
    }
  }>
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
    const normalizedKey = key.toLowerCase()
    if (["status", "excluir", "cpf", "whatsapp"].includes(normalizedKey)) continue
    if (typeof value === "string" && value.trim() && !value.startsWith("rec")) return value.trim()
  }

  return ""
}

function isInactive(fields: Record<string, unknown>) {
  const status = getStringField(fields, ["Status", "status", "Ativo", "ativo"])
  const excluded = getStringField(fields, ["Excluir", "excluir"])
  const inactiveStatuses = ["inativo", "inactive", "desativado", "excluido", "excluído", "false", "nao", "não"]
  const excludedStatuses = ["sim", "yes", "true", "excluir", "excluido", "excluído"]

  return inactiveStatuses.includes(status.toLowerCase()) || excludedStatuses.includes(excluded.toLowerCase())
}

function getChoiceNames(table: AirtableTable | undefined, fieldCandidates: string[]) {
  const fields = table?.fields ?? []
  const field = fields.find((candidate) => {
    const fieldName = candidate.name?.toLowerCase()
    return fieldName ? fieldCandidates.some((name) => name.toLowerCase() === fieldName) : false
  })

  return Array.from(
    new Set(
      (field?.options?.choices ?? [])
        .map((choice) => choice.name?.trim())
        .filter((choice): choice is string => Boolean(choice)),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
}

async function fetchMetadataTables() {
  if (!AIRTABLE_TOKEN) return []

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

async function fetchAllRecords(table: string) {
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

function getTableByCandidates(tables: AirtableTable[], candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase())

  return tables.find((table) => {
    const tableName = table.name?.toLowerCase()
    return tableName ? normalizedCandidates.includes(tableName) : false
  })
}

async function getProfessionals(tableName: string) {
  const records = await fetchAllRecords(tableName)

  return records
    .filter((record) => !isInactive(record.fields ?? {}))
    .map((record) => {
      const fields = record.fields ?? {}
      const label =
        getStringField(fields, ["Nome", "nome", "Nome completo", "Name", "name", "Profissional", "profissional"]) ||
        getFirstReadableStringField(fields)

      return label ? { id: record.id, label } : null
    })
    .filter((professional): professional is { id: string; label: string } => Boolean(professional))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
}

async function getPatients(tableName: string) {
  const records = await fetchAllRecords(tableName)

  return records
    .filter((record) => !isInactive(record.fields ?? {}))
    .map((record) => {
      const fields = record.fields ?? {}
      const label =
        getStringField(fields, ["Nome", "nome", "Nome completo", "Name", "name", "Paciente", "paciente"]) ||
        getFirstReadableStringField(fields)

      return label ? { id: record.id, label } : null
    })
    .filter((patient): patient is { id: string; label: string } => Boolean(patient))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
}

export async function GET() {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json(
      { types: [], professionals: [], patients: [], error: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" },
      { status: 200 },
    )
  }

  try {
    const tables = await fetchMetadataTables()
    const appointmentTable = getTableByCandidates(tables, APPOINTMENT_TABLE_CANDIDATES)
    const professionalTable = getTableByCandidates(tables, PROFESSIONAL_TABLE_CANDIDATES)
    const contactsTable = getTableByCandidates(tables, CONTACTS_TABLE_CANDIDATES)
    const errors: string[] = []

    let types = getChoiceNames(appointmentTable, ["Tipo", "tipo"])
    const status = getChoiceNames(appointmentTable, ["Status", "status"])
    const attendanceModes = getChoiceNames(appointmentTable, ["Presencial/Online", "presencial/online"])
    let professionals: Array<{ id: string; label: string }> = []
    let patients: Array<{ id: string; label: string }> = []

    if (professionalTable?.name) {
      try {
        professionals = await getProfessionals(professionalTable.name)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Não foi possível carregar profissionais do Airtable.")
      }
    }

    if (contactsTable?.name) {
      try {
        patients = await getPatients(contactsTable.name)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Não foi possível carregar pacientes do Airtable.")
      }
    }

    if (types.length === 0 && appointmentTable?.name) {
      try {
        const records = await fetchAllRecords(appointmentTable.name)
        types = Array.from(
          new Set(
            records
              .map((record) => getStringField(record.fields ?? {}, ["Tipo", "tipo"]))
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Não foi possível carregar tipos do Airtable.")
      }
    }

    return NextResponse.json({
      types,
      professionals,
      patients,
      status,
      attendanceModes,
      errors,
    })
  } catch (error) {
    return NextResponse.json(
      {
        types: [],
        professionals: [],
        patients: [],
        status: [],
        attendanceModes: [],
        errors: [error instanceof Error ? error.message : "Não foi possível carregar opções do Airtable."],
      },
      { status: 200 },
    )
  }
}
