import { NextResponse } from "next/server"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const TASK_TABLE = process.env.AIRTABLE_TASKS_TABLE || "Encaminhamentos"
const CONTACTS_TABLE = process.env.AIRTABLE_CONTACTS_TABLE || "Contatos"

type CreateTaskBody = {
  type?: unknown
  status?: unknown
  createdAt?: unknown
  dueDate?: unknown
  responsibleUserId?: unknown
  patientName?: unknown
  contactPhone?: unknown
  chatId?: unknown
  subject?: unknown
  observations?: unknown
}

type AirtableRecord = {
  id: string
  fields?: Record<string, unknown>
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
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

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]+$/.test(value)
}

function getBrazilPhoneVariants(value: string) {
  const digits = onlyDigits(value)
  const variants = new Set<string>()

  if (digits) variants.add(digits)
  if (digits.startsWith("55")) variants.add(digits.slice(2))
  if (digits.length >= 10 && !digits.startsWith("55")) variants.add(`55${digits}`)

  return Array.from(variants).filter(Boolean)
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

async function findContactId({ chatId, contactPhone }: { chatId: string; contactPhone: string }) {
  const formulaParts: string[] = []
  const trimmedChatId = chatId.trim()

  if (trimmedChatId) {
    const chatValue = formulaString(trimmedChatId)
    formulaParts.push(`{SUPABASE_CHAT}=${chatValue}`)
    formulaParts.push(`{ALT_CHAT_ID}=${chatValue}`)
    formulaParts.push(`{N_WHATS_API}=${chatValue}`)
    formulaParts.push(`{N_WHATS_WEB}=${chatValue}`)
    formulaParts.push(`FIND(${chatValue}, ${fieldText("SUPABASE_CHAT")})>0`)
    formulaParts.push(`FIND(${chatValue}, ${fieldText("ALT_CHAT_ID")})>0`)
  }

  for (const phone of getBrazilPhoneVariants(contactPhone || trimmedChatId)) {
    const phoneValue = formulaString(phone)
    formulaParts.push(`{N_WHATS_API}=${phoneValue}`)
    formulaParts.push(`{N_WHATS_WEB}=${phoneValue}`)
    formulaParts.push(`{Telefone Princial}=${phoneValue}`)
    formulaParts.push(`{Telefone Secundário}=${phoneValue}`)
    formulaParts.push(`{celular-so-numero}=${phoneValue}`)
    formulaParts.push(`{Celularsupabase}=${phoneValue}`)
    formulaParts.push(`FIND(${phoneValue}, ${fieldText("N_WHATS_API")})>0`)
    formulaParts.push(`FIND(${phoneValue}, ${fieldText("N_WHATS_WEB")})>0`)
    formulaParts.push(`FIND(${phoneValue}, ${fieldText("celular-so-numero")})>0`)
    formulaParts.push(`FIND(${phoneValue}, ${fieldText("Celularsupabase")})>0`)
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

async function createTask(fields: Record<string, unknown>) {
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TASK_TABLE)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      records: [{ fields }],
    }),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const data = (await response.json()) as { records?: AirtableRecord[] }
  return data.records?.[0]
}

export async function POST(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" }, { status: 500 })
  }

  const body = (await request.json()) as CreateTaskBody
  const type = getString(body.type)
  const status = getString(body.status)
  const createdAt = getString(body.createdAt)
  const dueDate = getString(body.dueDate)
  const responsibleUserId = getString(body.responsibleUserId)
  const patientName = getString(body.patientName)
  const contactPhone = getString(body.contactPhone)
  const chatId = getString(body.chatId)
  const subject = getString(body.subject)
  const observations = getString(body.observations)

  if (!type || !status || !createdAt || !dueDate || !responsibleUserId || !subject) {
    return NextResponse.json({ message: "Preencha tipo, status, prazo, responsavel e assunto." }, { status: 400 })
  }

  if (!isAirtableRecordId(responsibleUserId)) {
    return NextResponse.json({ message: "Usuario responsavel invalido." }, { status: 400 })
  }

  const createdAtDate = new Date(createdAt)
  const dueDateValue = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(createdAtDate.getTime()) || Number.isNaN(dueDateValue.getTime())) {
    return NextResponse.json({ message: "Data invalida." }, { status: 400 })
  }

  try {
    const contactId = await findContactId({ chatId, contactPhone })
    if (!contactId) {
      return NextResponse.json({ message: "Contato nao encontrado no Airtable para vincular ao aviso/tarefa." }, { status: 404 })
    }

    const fields: Record<string, unknown> = {
      Tipo: type,
      Status: status,
      "Data e Hora": createdAtDate.toISOString(),
      Data_prazo: dueDate,
      Contato: [contactId],
      User: [responsibleUserId],
      Assunto: subject,
    }

    if (observations) fields["Observações"] = observations

    const record = await createTask(fields)

    return NextResponse.json({
      id: record?.id,
      patientName,
      message: "Aviso/tarefa criado com sucesso.",
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel criar o aviso/tarefa no Airtable." },
      { status: 500 },
    )
  }
}
