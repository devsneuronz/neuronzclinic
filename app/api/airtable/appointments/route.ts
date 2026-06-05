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
  endDateTime?: unknown
  professionalId?: unknown
  patientId?: unknown
  patientName?: unknown
  contactPhone?: unknown
  chatId?: unknown
  observations?: unknown
}

type UpdateAppointmentBody = CreateAppointmentBody

type AirtableRecord = {
  id: string
  fields?: Record<string, unknown>
}

type CalendarAppointment = {
  id: string
  status: string
  type: string
  attendanceMode: string
  startDateTime: string
  endDateTime: string
  professionalId: string
  professional: string
  patientId: string
  patient: string
  phone: string
  observations: string
}

type ContactAppointment = {
  id: string
  status: string
  type: string
  attendanceMode: string
  startDateTime: string
  endDateTime: string
  professionalId: string
  professional: string
  observations: string
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

function getFirstLinkedRecordId(value: unknown) {
  return getLinkedRecordIds(value)[0] ?? ""
}

function getStringField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number") return String(value)
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

async function fetchRecordsByIds(table: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(isAirtableRecordId)))
  const records: AirtableRecord[] = []

  for (let index = 0; index < uniqueIds.length; index += 25) {
    const chunk = uniqueIds.slice(index, index + 25)
    const filterByFormula = `OR(${chunk.map((id) => `RECORD_ID()=${formulaString(id)}`).join(",")})`
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula,
    })

    records.push(...(await fetchAirtableRecords(table, params)))
  }

  return records
}

function getContactLabel(fields: Record<string, unknown>) {
  return (
    getStringField(fields, ["Nome", "nome", "Name", "name", "Paciente", "paciente", "Nome completo"]) ||
    getFirstReadableStringField(fields)
  )
}

function getProfessionalLabel(fields: Record<string, unknown>) {
  return (
    getStringField(fields, ["Nome", "nome", "Name", "name", "Profissional", "profissional", "Nome completo"]) ||
    getFirstReadableStringField(fields)
  )
}

function getContactPhone(fields: Record<string, unknown>) {
  return getStringField(fields, [
    "Telefone Princial",
    "Telefone Principal",
    "Telefone Secundário",
    "N_WHATS_API",
    "N_WHATS_WEB",
    "celular-so-numero",
    "Celularsupabase",
    "Whatsapp",
    "WhatsApp",
  ])
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

function isExcludedAppointment(record: AirtableRecord) {
  const excluded = getString(record.fields?.Excluir)
  return ["sim", "yes", "true", "excluir", "excluido", "excluído"].includes(excluded.toLowerCase())
}

function getAppointmentStart(record: AirtableRecord) {
  return getString(record.fields?.["Data e Hora - Inicio"])
}

function getAppointmentEnd(record: AirtableRecord) {
  return getString(record.fields?.["Data e Hora - Fim"])
}

async function mapContactAppointments(records: AirtableRecord[]) {
  const activeRecords = records.filter((record) => !isExcludedAppointment(record)).sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a))
  const professionalIds = activeRecords.map((record) => getFirstLinkedRecordId(record.fields?.Profissional)).filter(Boolean)
  const professionals =
    professionalIds.length > 0
      ? await fetchRecordsByIds(process.env.AIRTABLE_PROFESSIONALS_TABLE || "Profissional", professionalIds).catch(() => [])
      : []
  const professionalsById = new Map(professionals.map((record) => [record.id, record.fields ?? {}]))

  return activeRecords.map((record): ContactAppointment => {
    const fields = record.fields ?? {}
    const professionalIdValue = getFirstLinkedRecordId(fields.Profissional)
    const professionalFields = professionalsById.get(professionalIdValue) ?? {}

    return {
      id: record.id,
      status: getString(fields.Status) || "Sem status",
      type: getString(fields.Tipo),
      attendanceMode: getString(fields["Presencial/Online"]),
      startDateTime: getAppointmentStart(record),
      endDateTime: getAppointmentEnd(record),
      professionalId: professionalIdValue,
      professional: getProfessionalLabel(professionalFields) || professionalIdValue || "Sem profissional",
      observations: getString(fields.Observações),
    }
  })
}

async function listCalendarAppointments(searchParams: URLSearchParams) {
  const start = getString(searchParams.get("start"))
  const end = getString(searchParams.get("end"))
  const status = getString(searchParams.get("status"))
  const type = getString(searchParams.get("type"))
  const patient = getString(searchParams.get("patient"))
  const formulaParts: string[] = []

  if (start) {
    formulaParts.push(
      `OR(IS_SAME({Data e Hora - Inicio}, DATETIME_PARSE(${formulaString(start)}), "minute"), IS_AFTER({Data e Hora - Inicio}, DATETIME_PARSE(${formulaString(start)})))`,
    )
  }

  if (end) {
    formulaParts.push(`IS_BEFORE({Data e Hora - Inicio}, DATETIME_PARSE(${formulaString(end)}))`)
  }

  if (status) {
    formulaParts.push(`LOWER({Status}&"")=LOWER(${formulaString(status)})`)
  }

  if (type) {
    formulaParts.push(`LOWER({Tipo}&"")=LOWER(${formulaString(type)})`)
  }

  const params = new URLSearchParams({ pageSize: "100" })
  params.append("sort[0][field]", "Data e Hora - Inicio")
  params.append("sort[0][direction]", "asc")

  if (formulaParts.length > 0) {
    params.set("filterByFormula", `AND(${formulaParts.join(",")})`)
  }

  const records = (await fetchAirtableRecords(APPOINTMENT_TABLE, params)).filter((record) => !isExcludedAppointment(record))
  const contactIds = records.map((record) => getFirstLinkedRecordId(record.fields?.Paciente)).filter(Boolean)
  const professionalIds = records.map((record) => getFirstLinkedRecordId(record.fields?.Profissional)).filter(Boolean)
  const [contacts, professionals] = await Promise.all([
    contactIds.length > 0 ? fetchRecordsByIds(CONTACTS_TABLE, contactIds) : Promise.resolve([]),
    professionalIds.length > 0
      ? fetchRecordsByIds(process.env.AIRTABLE_PROFESSIONALS_TABLE || "Profissional", professionalIds).catch(() => [])
      : Promise.resolve([]),
  ])
  const contactsById = new Map(contacts.map((record) => [record.id, record.fields ?? {}]))
  const professionalsById = new Map(professionals.map((record) => [record.id, record.fields ?? {}]))

  const appointments = records.map((record): CalendarAppointment => {
    const fields = record.fields ?? {}
    const patientId = getFirstLinkedRecordId(fields.Paciente)
    const professionalIdValue = getFirstLinkedRecordId(fields.Profissional)
    const patientFields = contactsById.get(patientId) ?? {}
    const professionalFields = professionalsById.get(professionalIdValue) ?? {}

    return {
      id: record.id,
      status: getString(fields.Status) || "Sem status",
      type: getString(fields.Tipo),
      attendanceMode: getString(fields["Presencial/Online"]),
      startDateTime: getAppointmentStart(record),
      endDateTime: getAppointmentEnd(record),
      professionalId: professionalIdValue,
      professional: getProfessionalLabel(professionalFields) || professionalIdValue || "Sem profissional",
      patientId,
      patient: getContactLabel(patientFields) || patientId || "Sem paciente",
      phone: getContactPhone(patientFields),
      observations: getString(fields.Observações),
    }
  })

  const filteredAppointments = patient
    ? appointments.filter((appointment) => appointment.patient.toLowerCase().includes(patient.toLowerCase()))
    : appointments

  return NextResponse.json({ appointments: filteredAppointments })
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

async function updateAppointment(id: string, fields: Record<string, unknown>) {
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(APPOINTMENT_TABLE)}/${id}`, {
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

export async function GET(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ appointments: [], latestAppointment: null, message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" }, { status: 200 })
  }

  const { searchParams } = new URL(request.url)
  const chatId = getString(searchParams.get("chatId"))
  const contactPhone = getString(searchParams.get("contactPhone"))

  if (!chatId && !contactPhone) {
    try {
      return await listCalendarAppointments(searchParams)
    } catch (error) {
      return NextResponse.json(
        { appointments: [], message: error instanceof Error ? error.message : "Não foi possível carregar os agendamentos." },
        { status: 200 },
      )
    }
  }

  try {
    const contactId = await findContactId({ chatId, contactPhone })
    if (!contactId) {
      return NextResponse.json({ appointments: [], latestAppointment: null })
    }

    const contact = await fetchAirtableRecord(CONTACTS_TABLE, contactId)
    const appointmentIds = getLinkedRecordIds(contact?.fields?.Agendamentos)

    if (appointmentIds.length === 0) {
      return NextResponse.json({ appointments: [], latestAppointment: null })
    }

    const filterByFormula = `OR(${appointmentIds.map((id) => `RECORD_ID()=${formulaString(id)}`).join(",")})`
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula,
    })
    const records = await fetchAirtableRecords(APPOINTMENT_TABLE, params)
    const appointments = await mapContactAppointments(records)
    const latest = appointments[0]

    if (!latest) {
      return NextResponse.json({ appointments: [], latestAppointment: null })
    }

    return NextResponse.json({
      appointments,
      latestAppointment: latest,
    })
  } catch (error) {
    return NextResponse.json(
      { latestAppointment: null, message: error instanceof Error ? error.message : "Não foi possível carregar o último agendamento." },
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
  const endDateTime = getString(body.endDateTime)
  const professionalId = getString(body.professionalId)
  const patientId = getString(body.patientId)
  const patientName = getString(body.patientName)
  const contactPhone = getString(body.contactPhone)
  const chatId = getString(body.chatId)
  const observations = getString(body.observations)

  if (!status || !type || !attendanceMode || !startDateTime || !professionalId) {
    return NextResponse.json({ message: "Preencha status, tipo, formato, data/hora e profissional." }, { status: 400 })
  }

  if (!isAirtableRecordId(professionalId)) {
    return NextResponse.json({ message: "Profissional inválido." }, { status: 400 })
  }

  if (patientId && !isAirtableRecordId(patientId)) {
    return NextResponse.json({ message: "Paciente inválido." }, { status: 400 })
  }

  const startDate = new Date(startDateTime)
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ message: "Data e hora invalidas." }, { status: 400 })
  }

  const endDate = endDateTime ? new Date(endDateTime) : null
  if (endDateTime && (!endDate || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime())) {
    return NextResponse.json({ message: "Data e hora final inválidas." }, { status: 400 })
  }

  try {
    const contactId = patientId || (await findContactId({ chatId, contactPhone }))
    if (!contactId) {
      return NextResponse.json({ message: "Contato não encontrado no Airtable para vincular como paciente." }, { status: 404 })
    }

    const fields: Record<string, unknown> = {
      Status: status,
      Tipo: type,
      "Presencial/Online": attendanceMode,
      "Data e Hora - Inicio": startDate.toISOString(),
      Profissional: [professionalId],
      Paciente: [contactId],
    }

    if (endDate) fields["Data e Hora - Fim"] = endDate.toISOString()
    if (observations) fields["Observações"] = observations

    const record = await createAppointment(fields)

    return NextResponse.json({
      id: record?.id,
      patientName,
      message: "Agendamento criado com sucesso.",
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível criar o agendamento no Airtable." },
      { status: 500 },
    )
  }
}
export async function PATCH(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const id = getString(searchParams.get("id"))

  if (!isAirtableRecordId(id)) {
    return NextResponse.json({ message: "Agendamento inválido." }, { status: 400 })
  }

  const body = (await request.json()) as UpdateAppointmentBody
  const status = getString(body.status)
  const type = getString(body.type)
  const attendanceMode = getString(body.attendanceMode)
  const startDateTime = getString(body.startDateTime)
  const endDateTime = getString(body.endDateTime)
  const professionalId = getString(body.professionalId)
  const patientId = getString(body.patientId)
  const observations = getString(body.observations)

  if (!status || !type || !attendanceMode || !startDateTime || !professionalId || !patientId) {
    return NextResponse.json({ message: "Preencha status, tipo, formato, data/hora, profissional e paciente." }, { status: 400 })
  }

  if (!isAirtableRecordId(professionalId)) {
    return NextResponse.json({ message: "Profissional inválido." }, { status: 400 })
  }

  if (!isAirtableRecordId(patientId)) {
    return NextResponse.json({ message: "Paciente inválido." }, { status: 400 })
  }

  const startDate = new Date(startDateTime)
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ message: "Data e hora invalidas." }, { status: 400 })
  }

  const endDate = endDateTime ? new Date(endDateTime) : null
  if (endDateTime && (!endDate || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime())) {
    return NextResponse.json({ message: "Data e hora final inválidas." }, { status: 400 })
  }

  try {
    await updateAppointment(id, {
      Status: status,
      Tipo: type,
      "Presencial/Online": attendanceMode,
      "Data e Hora - Inicio": startDate.toISOString(),
      "Data e Hora - Fim": endDate ? endDate.toISOString() : null,
      Profissional: [professionalId],
      Paciente: [patientId],
      Observações: observations,
    })

    return NextResponse.json({ id, message: "Agendamento atualizado." })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível atualizar o agendamento no Airtable." },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const id = getString(searchParams.get("id"))

  if (!isAirtableRecordId(id)) {
    return NextResponse.json({ message: "Agendamento inválido." }, { status: 400 })
  }

  try {
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(APPOINTMENT_TABLE)}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    return NextResponse.json({ id, message: "Agendamento excluído." })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível excluir o agendamento no Airtable." },
      { status: 500 },
    )
  }
}
