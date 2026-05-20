import { NextResponse } from "next/server"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const TASK_TABLE_CANDIDATES = [
  process.env.AIRTABLE_TASKS_TABLE,
  "Encaminhamentos",
  "Encaminhamento",
  "Tarefas",
  "Tarefa",
].filter(Boolean) as string[]
const USERS_TABLE_CANDIDATES = [process.env.AIRTABLE_USERS_TABLE, "User", "Users", "Usuarios", "Usuários"].filter(
  Boolean,
) as string[]

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

function isInactive(fields: Record<string, unknown>) {
  const status = getStringField(fields, ["Status", "status", "Ativo", "ativo"])
  const inactiveStatuses = ["inativo", "inactive", "desativado", "excluido", "excluído", "false", "nao", "não"]

  return inactiveStatuses.includes(status.toLowerCase())
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

async function getUsers(tableName: string) {
  const records = await fetchAllRecords(tableName)

  return records
    .filter((record) => !isInactive(record.fields ?? {}))
    .map((record) => {
      const fields = record.fields ?? {}
      const label = getStringField(fields, ["Name", "name", "Nome", "nome", "Usuário", "Usuario", "user"])

      return label ? { id: record.id, label } : null
    })
    .filter((user): user is { id: string; label: string } => Boolean(user))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
}

export async function GET() {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ types: [], statuses: [], users: [], error: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" })
  }

  const tables = await fetchMetadataTables()
  const taskTable = getTableByCandidates(tables, TASK_TABLE_CANDIDATES)
  const usersTable = getTableByCandidates(tables, USERS_TABLE_CANDIDATES)
  const errors: string[] = []

  const types = getChoiceNames(taskTable, ["Tipo", "tipo"])
  const statuses = getChoiceNames(taskTable, ["Status", "status"])
  let users: Array<{ id: string; label: string }> = []

  if (usersTable?.name) {
    try {
      users = await getUsers(usersTable.name)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Nao foi possivel carregar usuarios do Airtable.")
    }
  }

  return NextResponse.json({ types, statuses, users, errors })
}
