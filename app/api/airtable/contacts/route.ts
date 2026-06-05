import { NextRequest, NextResponse } from "next/server"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const CONTACTS_TABLE_CANDIDATES = [
  process.env.AIRTABLE_CONTACTS_TABLE,
  "Contatos",
  "Contato",
  "Pacientes",
  "Paciente",
  "Contacts",
].filter(Boolean) as string[]

type AirtableField = {
  name?: string
}

type AirtableTable = {
  name?: string
  fields?: AirtableField[]
}

type AirtableRecord = {
  id: string
  fields?: Record<string, unknown>
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function assertAirtableToken() {
  if (!AIRTABLE_TOKEN) {
    throw new Error("Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY")
  }
}

async function fetchMetadataTables() {
  assertAirtableToken()

  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Não foi possível carregar a estrutura de contatos do Airtable.")
  }

  const data = (await response.json()) as { tables?: AirtableTable[] }
  return data.tables ?? []
}

function getTableByCandidates(tables: AirtableTable[], candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase())

  return tables.find((table) => {
    const tableName = table.name?.toLowerCase()
    return tableName ? normalizedCandidates.includes(tableName) : false
  })
}

function pickField(fields: AirtableField[], candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase())
  return fields.find((field) => field.name && normalizedCandidates.includes(field.name.toLowerCase()))?.name
}

async function createAirtableRecord(table: string, fields: Record<string, unknown>) {
  assertAirtableToken()

  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  })

  const data = (await response.json().catch(() => null)) as AirtableRecord | { error?: { message?: string } } | null

  if (!response.ok) {
    const message = data && "error" in data ? data.error?.message : ""
    throw new Error(message || "Não foi possível criar o contato no Airtable.")
  }

  return data as AirtableRecord
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 })
    }

    const name = getString(body.name)
    const phone = getString(body.phone)
    const email = getString(body.email)
    const observations = getString(body.observations)

    if (!name) {
      return NextResponse.json({ message: "Informe o nome do contato." }, { status: 400 })
    }

    const tables = await fetchMetadataTables()
    const contactsTable = getTableByCandidates(tables, CONTACTS_TABLE_CANDIDATES)

    if (!contactsTable?.name) {
      return NextResponse.json({ message: "Tabela de contatos não encontrada no Airtable." }, { status: 404 })
    }

    const tableFields = contactsTable.fields ?? []
    const nameField = pickField(tableFields, ["Nome", "nome", "Nome completo", "Nome Contato", "nome_contato", "Contato", "contact_name", "Name", "name", "Paciente", "paciente"])
    const phoneField = pickField(tableFields, ["WhatsApp", "whatsapp", "Telefone", "telefone", "Phone", "phone", "phone_contact"])
    const emailField = pickField(tableFields, ["Email", "email", "E-mail", "e-mail", "email_contato"])
    const observationsField = pickField(tableFields, ["Observações", "Observacoes", "observações", "observacoes", "Observação", "Observacao", "Notas", "Notes"])

    if (!nameField) {
      return NextResponse.json({ message: "Campo de nome não encontrado na tabela de contatos." }, { status: 400 })
    }

    const fields: Record<string, unknown> = {
      [nameField]: name,
    }

    if (phone && phoneField) fields[phoneField] = phone
    if (email && emailField) fields[emailField] = email
    if (observations && observationsField) fields[observationsField] = observations

    const record = await createAirtableRecord(contactsTable.name, fields)

    return NextResponse.json({
      contact: {
        id: record.id,
        label: name,
      },
      ignoredFields: {
        phone: Boolean(phone && !phoneField),
        email: Boolean(email && !emailField),
        observations: Boolean(observations && !observationsField),
      },
      message: "Contato criado com sucesso.",
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível criar o contato." },
      { status: 500 },
    )
  }
}
