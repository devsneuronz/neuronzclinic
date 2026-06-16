import { NextResponse } from "next/server"

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const TASK_TABLE = process.env.AIRTABLE_TASKS_TABLE || "Encaminhamentos"
const CONTACTS_TABLE = process.env.AIRTABLE_CONTACTS_TABLE || "Contatos"
const USERS_TABLE = process.env.AIRTABLE_USERS_TABLE || "User"

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
  creatorName?: unknown
  creatorUserId?: unknown
}

type UpdateTaskBody = {
  type?: unknown
  status?: unknown
  dueDate?: unknown
  responsibleUserId?: unknown
  subject?: unknown
  observations?: unknown
}

type AirtableRecord = {
  id: string
  createdTime?: string
  fields?: Record<string, unknown>
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

function getRecordIds(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate]

    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && isAirtableRecordId(item))
    }

    if (typeof value === "string" && isAirtableRecordId(value)) {
      return [value]
    }
  }

  return []
}

function getDateField(fields: Record<string, unknown>, candidates: string[]) {
  const value = getStringField(fields, candidates)
  const date = value ? new Date(value) : null

  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : ""
}

function getDateOnlyField(fields: Record<string, unknown>, candidates: string[]) {
  const value = getStringField(fields, candidates)
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`

  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ""
}

function normalizeStatus(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  if (["finalizado", "finalizada", "finalizada.", "finalizados", "finalizadas", "concluido", "concluida"].includes(normalized)) {
    return "finalizado"
  }

  if (["resolvendo", "atendendo", "em atendimento", "em andamento", "andamento", "em resolucao"].includes(normalized)) {
    return "resolvendo"
  }

  return "aguardando"
}

function getInitials(name: string) {
  const words = name
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  return (words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : words[0]?.slice(0, 2) || "TA").toUpperCase()
}

type LinkedContact = {
  name: string
  chatId: string
  phone: string
}

function mapTaskRecord(record: AirtableRecord, linkedNames: { users: Map<string, string>; contacts: Map<string, LinkedContact> }) {
  const fields = record.fields ?? {}
  const subject = getStringField(fields, ["Assunto", "assunto", "Titulo", "Título", "Title", "Name", "Nome"])
  const observations = getStringField(fields, ["Observações", "Observacoes", "Descricao", "Descrição", "Description"])
  const statusLabel = getStringField(fields, ["Status", "status"]) || "Aguardando"
  const type = getStringField(fields, ["Tipo", "tipo"]) || "Tarefa"
  const responsibleIds = getRecordIds(fields, ["User", "Responsável", "Responsavel"])
  const contactIds = getRecordIds(fields, ["Contato", "Paciente", "Patient"])
  const responsible = getStringField(fields, [
    "Responsável",
    "Responsavel",
    "Nome User",
    "User Name",
    "Usuario",
    "Usuário",
    "User",
  ])
  const creatorIds = getRecordIds(fields, ["User_criador", "Criador", "Creator", "Created by", "Autor", "Solicitante"])
  const creator = getStringField(fields, [
    "nome_user_criador",
    "Criador",
    "Creator",
    "Created by",
    "Autor",
    "Solicitante",
  ])
  const patient = getStringField(fields, [
    "Paciente",
    "Nome Paciente",
    "Contato Nome",
    "Nome Contato",
    "Contato",
    "Patient",
  ])
  const responsibleName =
    responsibleIds.map((id) => linkedNames.users.get(id)).find(Boolean) ||
    (isAirtableRecordId(responsible) ? "" : responsible)
  const linkedContact = contactIds.map((id) => linkedNames.contacts.get(id)).find(Boolean)
  const patientName = linkedContact?.name || (isAirtableRecordId(patient) ? "" : patient)
  const creatorName = creatorIds.map((id) => linkedNames.users.get(id)).find(Boolean) || creator || "Sistema"
  const createdAt = getDateField(fields, ["Data e Hora", "Criado em", "Created At", "createdAt"]) || record.createdTime || ""
  const dueDate = getDateOnlyField(fields, ["Data_prazo", "Data prazo", "Prazo", "Due date", "Due Date"])

  return {
    id: record.id,
    subject,
    description: observations,
    status: normalizeStatus(statusLabel),
    statusLabel,
    type,
    creator: creatorName,
    creatorInitials: getInitials(creatorName),
    responsible: responsibleName || "Sem responsável",
    responsibleUserId: responsibleIds[0] || "",
    responsibleInitials: getInitials(responsibleName || "Sem responsável"),
    patient: patientName,
    patientChatId: linkedContact?.chatId || "",
    patientPhone: linkedContact?.phone || "",
    createdAt,
    dueDate,
  }
}

type TaskPayload = ReturnType<typeof mapTaskRecord>

const TASK_CACHE_TTL_MS = 45_000
let taskListCache: { expiresAt: number; tasks: TaskPayload[] } | null = null

function normalizeTaskViewerRole(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()

  return ["adm", "admin", "administrador", "administrator", "owner", "dono"].includes(normalized) ? "admin" : "user"
}

function filterTasksForViewer(tasks: TaskPayload[], viewerUserId: string, viewerRole: string) {
  if (normalizeTaskViewerRole(viewerRole) === "admin") return tasks
  if (!isAirtableRecordId(viewerUserId)) return []

  return tasks.filter((task) => task.responsibleUserId === viewerUserId)
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

async function fetchTaskRecords(filterByFormula?: string) {
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const params = new URLSearchParams({ pageSize: "100" })
    params.set("sort[0][field]", "Data_prazo")
    params.set("sort[0][direction]", "asc")
    if (filterByFormula) params.set("filterByFormula", filterByFormula)
    if (offset) params.set("offset", offset)

    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TASK_TABLE)}?${params}`, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    const data = (await response.json()) as { offset?: string; records?: AirtableRecord[] }
    records.push(...(data.records ?? []))
    offset = data.offset
  } while (offset)

  return records
}

async function fetchRecordsByIds(table: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(isAirtableRecordId)))
  const records: AirtableRecord[] = []

  for (let index = 0; index < uniqueIds.length; index += 20) {
    const batch = uniqueIds.slice(index, index + 20)
    const formula = batch.length === 1 ? `RECORD_ID()="${batch[0]}"` : `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(",")})`
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula })
    records.push(...(await fetchAirtableRecords(table, params)))
  }

  return records
}

function getLinkedTaskIdsFromContact(fields: Record<string, unknown>) {
  return getRecordIds(fields, [
    "Encaminhamentos",
    "Encaminhamento",
    "Avisos / Tarefas",
    "Avisos/Tarefas",
    "Avisos",
    "Tarefas",
    "Tasks",
  ])
}

async function fetchContactTaskRecords(contactId: string) {
  const contact = await fetchAirtableRecord(CONTACTS_TABLE, contactId)
  const linkedTaskIds = getLinkedTaskIdsFromContact(contact?.fields ?? {})

  if (linkedTaskIds.length > 0) {
    return fetchRecordsByIds(TASK_TABLE, linkedTaskIds)
  }

  return (await fetchTaskRecords()).filter((record) =>
    getRecordIds(record.fields ?? {}, ["Contato", "Paciente", "Patient"]).includes(contactId),
  )
}

async function getLinkedNames(records: AirtableRecord[]) {
  const userIds = records.flatMap((record) =>
    getRecordIds(record.fields ?? {}, ["User", "User_criador", "Responsável", "Responsavel", "Criador"]),
  )
  const contactIds = records.flatMap((record) => getRecordIds(record.fields ?? {}, ["Contato", "Paciente", "Patient"]))
  const users = new Map<string, string>()
  const contacts = new Map<string, LinkedContact>()

  let userRecords: AirtableRecord[] = []
  let contactRecords: AirtableRecord[] = []

  ;[userRecords, contactRecords] = await Promise.all([
    userIds.length > 0 ? fetchRecordsByIds(USERS_TABLE, userIds).catch(() => []) : Promise.resolve([]),
    contactIds.length > 0 ? fetchRecordsByIds(CONTACTS_TABLE, contactIds).catch(() => []) : Promise.resolve([]),
  ])

  for (const record of userRecords) {
    const fields = record.fields ?? {}
    const name = getStringField(fields, ["Name", "name", "Nome", "nome", "Usuário", "Usuario", "user"])
    if (name) users.set(record.id, name)
  }

  for (const record of contactRecords) {
    const fields = record.fields ?? {}
    const name = getStringField(fields, ["Name", "name", "Nome", "nome", "Nome Completo", "Contato", "Paciente"])
    const chatId = getStringField(fields, ["SUPABASE_CHAT", "ALT_CHAT_ID", "chat_id", "Chat ID"]) || ""
    const phone = getStringField(fields, [
      "N_WHATS_API",
      "N_WHATS_WEB",
      "Telefone Princial",
      "Telefone Principal",
      "Telefone SecundÃ¡rio",
      "Telefone Secundario",
      "celular-so-numero",
      "Celularsupabase",
      "Telefone",
    ])

    if (name || chatId || phone) {
      contacts.set(record.id, {
        name,
        chatId,
        phone: phone || "",
      })
    }
  }

  return { users, contacts }
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

async function updateTask(id: string, fields: Record<string, unknown>) {
  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TASK_TABLE)}/${id}`, {
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

function getAirtableErrorMessage(error: unknown, fallback: string) {
  const rawMessage = error instanceof Error ? error.message : ""

  if (!rawMessage) return fallback

  try {
    const parsed = JSON.parse(rawMessage) as { error?: { message?: string } }
    const message = parsed.error?.message

    if (message?.startsWith("Unknown field name:")) {
      return `Campo não encontrado no Airtable: ${message.replace("Unknown field name:", "").trim().replace(/^"|"$/g, "")}.`
    }

    return message || fallback
  } catch {
    return rawMessage
  }
}

export async function GET(request: Request) {
  if (!AIRTABLE_TOKEN) {
    return NextResponse.json({ tasks: [], message: "Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY" }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const chatId = getString(searchParams.get("chatId"))
  const contactPhone = getString(searchParams.get("contactPhone"))
  const shouldRefresh = searchParams.get("refresh") === "1"
  const viewerUserId = getString(searchParams.get("userId"))
  const viewerRole = getString(searchParams.get("role"))

  try {
    if (!chatId && !contactPhone && !shouldRefresh && taskListCache && taskListCache.expiresAt > Date.now()) {
      return NextResponse.json({ tasks: filterTasksForViewer(taskListCache.tasks, viewerUserId, viewerRole) })
    }

    const contactId = chatId || contactPhone ? await findContactId({ chatId, contactPhone }) : ""
    if ((chatId || contactPhone) && !contactId) {
      return NextResponse.json({ tasks: [] })
    }

    const records = contactId ? await fetchContactTaskRecords(contactId) : await fetchTaskRecords()
    const linkedNames = await getLinkedNames(records)
    const tasks = records
      .map((record) => mapTaskRecord(record, linkedNames))
      .sort((a, b) => {
        const dateA = new Date(a.dueDate || a.createdAt || 0).getTime()
        const dateB = new Date(b.dueDate || b.createdAt || 0).getTime()
        return dateA - dateB
      })

    if (!contactId) {
      taskListCache = { expiresAt: Date.now() + TASK_CACHE_TTL_MS, tasks }
    }

    return NextResponse.json({ tasks: filterTasksForViewer(tasks, viewerUserId, viewerRole) })
  } catch (error) {
    return NextResponse.json(
      { tasks: [], message: error instanceof Error ? error.message : "Não foi possível carregar encaminhamentos do Airtable." },
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
    return NextResponse.json({ message: "Tarefa inválida." }, { status: 400 })
  }

  try {
    taskListCache = null

    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TASK_TABLE)}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    return NextResponse.json({ id, message: "Tarefa excluída." })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível excluir a tarefa no Airtable." },
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
    return NextResponse.json({ message: "Tarefa inválida." }, { status: 400 })
  }

  const body = (await request.json()) as UpdateTaskBody
  const type = getString(body.type)
  const status = getString(body.status)
  const dueDate = getString(body.dueDate)
  const responsibleUserId = getString(body.responsibleUserId)
  const subject = getString(body.subject)
  const observations = getString(body.observations)

  if (!type || !status || !dueDate || !responsibleUserId || !subject) {
    return NextResponse.json({ message: "Preencha tipo, status, prazo, responsável e assunto." }, { status: 400 })
  }

  if (!isAirtableRecordId(responsibleUserId)) {
    return NextResponse.json({ message: "Usuário responsável inválido." }, { status: 400 })
  }

  const dueDateValue = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(dueDateValue.getTime())) {
    return NextResponse.json({ message: "Data invalida." }, { status: 400 })
  }

  try {
    taskListCache = null

    const record = await updateTask(id, {
      Tipo: type,
      Status: status,
      Data_prazo: dueDate,
      User: [responsibleUserId],
      Assunto: subject,
      Observações: observations,
    })
    const linkedNames = await getLinkedNames([record])
    const task = mapTaskRecord(record, linkedNames)

    return NextResponse.json({ task, message: "Tarefa atualizada." })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível atualizar a tarefa no Airtable." },
      { status: 500 },
    )
  }
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
  const creatorName = getString(body.creatorName)
  const creatorUserId = getString(body.creatorUserId)

  if (!type || !status || !createdAt || !dueDate || !responsibleUserId || !subject || !creatorName || !creatorUserId) {
    return NextResponse.json({ message: "Preencha tipo, status, prazo, responsável, criador e assunto." }, { status: 400 })
  }

  if (!isAirtableRecordId(responsibleUserId)) {
    return NextResponse.json({ message: "Usuário responsável inválido." }, { status: 400 })
  }

  if (creatorUserId && !isAirtableRecordId(creatorUserId)) {
    return NextResponse.json({ message: "Usuário criador inválido." }, { status: 400 })
  }

  const createdAtDate = new Date(createdAt)
  const dueDateValue = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(createdAtDate.getTime()) || Number.isNaN(dueDateValue.getTime())) {
    return NextResponse.json({ message: "Data invalida." }, { status: 400 })
  }

  try {
    taskListCache = null

    const contactId = await findContactId({ chatId, contactPhone })
    if (!contactId) {
      return NextResponse.json({ message: "Contato não encontrado no Airtable para vincular ao aviso/tarefa." }, { status: 404 })
    }

    const fields: Record<string, unknown> = {
      Tipo: type,
      Status: status,
      "Data e Hora": createdAtDate.toISOString(),
      Data_prazo: dueDate,
      Contato: [contactId],
      User: [responsibleUserId],
      User_criador: [creatorUserId],
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
      { message: getAirtableErrorMessage(error, "Não foi possível criar o aviso/tarefa no Airtable.") },
      { status: 500 },
    )
  }
}
