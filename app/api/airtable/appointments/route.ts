import { NextResponse } from "next/server"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const APPOINTMENT_TABLE = process.env.AIRTABLE_APPOINTMENTS_TABLE || "Agendamentos"
const CONTACTS_TABLE = process.env.AIRTABLE_CONTACTS_TABLE || "Contatos"

type CreateAppointmentBody = {
  status?: unknown
  type?: unknown
  attendanceMode?: unknown
  startDateTime?: unknown
  professionalId?: unknown
  patientName?: unknown
  contactPhone?: unknown
  chatId?: unknown
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

async function fetchAirtableRecord(table: string, id: string) {
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}/${id}`, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
    cache: "no-store",
  })

  if (response.status === 404) return null

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return (await response.json()) as AirtableRecord
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

function getLinkedRecordIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && isAirtableRecordId(item)) : []
}

function getRecordTimestamp(record: AirtableRecord) {
  const fields = record.fields ?? {}
  const candidates = [
    fields["Data e Hora - Inicio"],
    fields["Data e Hora - Fim"],
    fields["Agendado em"],
    fields.Created,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue
    const time = Date.parse(candidate)
    if (Number.isFinite(time)) return time
  }

  return 0
}

function getLatestAppointment(records: AirtableRecord[]) {
  return records
    .filter((record) => {
      const excluded = getString(record.fields?.Excluir)
      return !["sim", "yes", "true", "excluir", "excluido", "excluído"].includes(excluded.toLowerCase())
    })
    .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a))[0]
}

async function createAppointment(fields: Record<string, unknown>) {
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(APPOINTMENT_TABLE)}`, {
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

export async function GET(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ latestAppointment: null, message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" }, { status: 200 })
  }

  const { searchParams } = new URL(request.url)
  const chatId = getString(searchParams.get("chatId"))
  const contactPhone = getString(searchParams.get("contactPhone"))

  try {
    const contactId = await findContactId({ chatId, contactPhone })
    if (!contactId) {
      return NextResponse.json({ latestAppointment: null })
    }

    const contact = await fetchAirtableRecord(CONTACTS_TABLE, contactId)
    const appointmentIds = getLinkedRecordIds(contact?.fields?.Agendamentos)

    if (appointmentIds.length === 0) {
      return NextResponse.json({ latestAppointment: null })
    }

    const filterByFormula = `OR(${appointmentIds.map((id) => `RECORD_ID()=${formulaString(id)}`).join(",")})`
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula,
    })
    const records = await fetchAirtableRecords(APPOINTMENT_TABLE, params)
    const latest = getLatestAppointment(records)

    if (!latest) {
      return NextResponse.json({ latestAppointment: null })
    }

    return NextResponse.json({
      latestAppointment: {
        id: latest.id,
        status: getString(latest.fields?.Status) || "Sem status",
        type: getString(latest.fields?.Tipo),
        startDateTime: getString(latest.fields?.["Data e Hora - Inicio"]),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { latestAppointment: null, message: error instanceof Error ? error.message : "Nao foi possivel carregar o ultimo agendamento." },
      { status: 200 },
    )
  }
}

export async function POST(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" }, { status: 500 })
  }

  const body = (await request.json()) as CreateAppointmentBody
  const status = getString(body.status)
  const type = getString(body.type)
  const attendanceMode = getString(body.attendanceMode)
  const startDateTime = getString(body.startDateTime)
  const professionalId = getString(body.professionalId)
  const patientName = getString(body.patientName)
  const contactPhone = getString(body.contactPhone)
  const chatId = getString(body.chatId)
  const observations = getString(body.observations)

  if (!status || !type || !attendanceMode || !startDateTime || !professionalId) {
    return NextResponse.json({ message: "Preencha status, tipo, formato, data/hora e profissional." }, { status: 400 })
  }

  if (!isAirtableRecordId(professionalId)) {
    return NextResponse.json({ message: "Profissional invalido." }, { status: 400 })
  }

  const startDate = new Date(startDateTime)
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ message: "Data e hora invalidas." }, { status: 400 })
  }

  try {
    const contactId = await findContactId({ chatId, contactPhone })
    if (!contactId) {
      return NextResponse.json({ message: "Contato nao encontrado no Airtable para vincular como paciente." }, { status: 404 })
    }

    const fields: Record<string, unknown> = {
      Status: status,
      Tipo: type,
      "Presencial/Online": attendanceMode,
      "Data e Hora - Inicio": startDate.toISOString(),
      Profissional: [professionalId],
      Paciente: [contactId],
    }

    if (observations) fields["Observações"] = observations

    const record = await createAppointment(fields)

    return NextResponse.json({
      id: record?.id,
      patientName,
      message: "Agendamento criado com sucesso.",
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel criar o agendamento no Airtable." },
      { status: 500 },
    )
  }
}
