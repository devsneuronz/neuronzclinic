import { NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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
  creatorEmail?: unknown
}

type UpdateTaskBody = {
  type?: unknown
  status?: unknown
  dueDate?: unknown
  responsibleUserId?: unknown
  subject?: unknown
  observations?: unknown
}

type UserProfileRow = {
  id: string
  airtable_record_id: string | null
  name: string
  email: string
}

type ContactRow = {
  id: string
  name: string | null
  phone: string | null
  phone_id_chat: string | null
}

type ChatRow = {
  id: string
  chat_id: string | null
  phone_contact: string | null
  nome_contato: string | null
  url_foto_perfil: string | null
  contact_id: string | null
}

type TaskRow = {
  id: string
  airtable_record_id: string | null
  type: string
  status: string
  status_normalized: string
  subject: string
  description: string | null
  responsible_airtable_record_id: string | null
  responsible_name: string | null
  creator_airtable_record_id: string | null
  creator_name: string | null
  contact_airtable_record_id: string | null
  chat_id: string | null
  patient_name: string | null
  patient_phone: string | null
  due_date: string | null
  created_at: string
  responsible_user_profiles?: UserProfileRow | null
  creator_user_profiles?: UserProfileRow | null
  contacts?: ContactRow | null
  chats?: ChatRow | null
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function normalizeStatus(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  if (["finalizado", "finalizada", "finalizados", "finalizadas", "concluido", "concluida"].includes(normalized)) return "finalizado"
  if (["resolvendo", "atendendo", "em atendimento", "em andamento", "andamento", "em resolucao"].includes(normalized)) return "resolvendo"
  return "aguardando"
}

function getInitials(name: string) {
  const words = name
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  return (words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : words[0]?.slice(0, 2) || "TA").toUpperCase()
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "")
}

function getBrazilPhoneVariants(value: string) {
  const digits = onlyDigits(value)
  const variants = new Set<string>()

  if (digits) variants.add(digits)
  if (digits.startsWith("55")) variants.add(digits.slice(2))
  if (digits.length >= 10 && !digits.startsWith("55")) variants.add(`55${digits}`)

  return Array.from(variants).filter(Boolean)
}

function getSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase REST configuration for tasks.")
  return { url: SUPABASE_REST_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY }
}

async function supabaseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, key } = getSupabaseConfig()
  const response = await fetch(`${url}/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })

  const text = await response.text()
  if (!response.ok) throw new Error(text)
  if (!text.trim()) return null as T
  return JSON.parse(text) as T
}

function externalId(row: { id: string; airtable_record_id: string | null }) {
  return row.airtable_record_id || row.id
}

function getIdFilter(id: string) {
  const encodedId = encodeURIComponent(id)
  return isUuid(id) ? `or=(id.eq.${encodedId},airtable_record_id.eq.${encodedId})` : `airtable_record_id=eq.${encodedId}`
}

function getExternalUserId(user: UserProfileRow | null | undefined, fallback: string | null) {
  if (user) return externalId(user)
  return fallback || ""
}

function mapTask(row: TaskRow) {
  const responsible = row.responsible_user_profiles
  const creator = row.creator_user_profiles
  const contact = row.contacts
  const chat = row.chats
  const responsibleName = responsible?.name || row.responsible_name || "Sem responsavel"
  const creatorName = creator?.name || row.creator_name || "Sistema"
  const patientName = row.patient_name || contact?.name || chat?.nome_contato || ""
  const patientPhone = row.patient_phone || contact?.phone || contact?.phone_id_chat || chat?.phone_contact || ""
  const patientChatId = row.chat_id || chat?.chat_id || ""
  const status = normalizeStatus(row.status_normalized || row.status)

  return {
    id: externalId(row),
    subject: row.subject,
    description: row.description || "",
    status,
    statusLabel: row.status || "Aguardando",
    type: row.type || "Tarefa",
    creator: creatorName,
    creatorInitials: getInitials(creatorName),
    responsible: responsibleName,
    responsibleUserId: getExternalUserId(responsible, row.responsible_airtable_record_id),
    responsibleInitials: getInitials(responsibleName),
    patient: patientName,
    patientChatId,
    patientPhone,
    patientPhotoUrl: chat?.url_foto_perfil || undefined,
    createdAt: row.created_at,
    dueDate: row.due_date || "",
  }
}

type TaskPayload = ReturnType<typeof mapTask>

const TASK_SELECT = [
  "id,airtable_record_id,type,status,status_normalized,subject,description,responsible_airtable_record_id,responsible_name,creator_airtable_record_id,creator_name,contact_airtable_record_id,chat_id,patient_name,patient_phone,due_date,created_at",
  "responsible_user_profiles:responsible_user_profile_id(id,airtable_record_id,name,email)",
  "creator_user_profiles:creator_user_profile_id(id,airtable_record_id,name,email)",
  "contacts:contact_id(id,name,phone,phone_id_chat)",
  "chats:chat_row_id(id,chat_id,phone_contact,nome_contato,url_foto_perfil,contact_id)",
].join(",")

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
  if (!viewerUserId) return []

  return tasks.filter((task) => task.responsibleUserId === viewerUserId)
}

function filterTasksForContact(tasks: TaskPayload[], chatId: string, contactPhone: string) {
  if (!chatId && !contactPhone) return tasks
  const phoneVariants = new Set(getBrazilPhoneVariants(contactPhone || chatId))

  return tasks.filter((task) => {
    if (chatId && (task.patientChatId === chatId || task.patientPhone === chatId)) return true
    const taskPhone = onlyDigits(task.patientPhone || task.patientChatId)
    return taskPhone ? phoneVariants.has(taskPhone) : false
  })
}

async function fetchTasks() {
  const rows = await supabaseRequest<TaskRow[]>(`tasks?select=${TASK_SELECT}&is_active=is.true&deleted_at=is.null&order=created_at.desc`)
  return rows.map(mapTask).sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime()
    const dateB = new Date(b.createdAt || 0).getTime()
    return dateB - dateA
  })
}

async function fetchTaskById(id: string) {
  const rows = await supabaseRequest<TaskRow[]>(`tasks?select=${TASK_SELECT}&is_active=is.true&deleted_at=is.null&limit=10000`)
  return rows.find((row) => row.id === id || row.airtable_record_id === id) ?? null
}

async function resolveUserProfile(id: string, email = "") {
  if (id) {
    const rows = await supabaseRequest<UserProfileRow[]>(`user_profiles?select=id,airtable_record_id,name,email&${getIdFilter(id)}&limit=1`)
    if (rows[0]) return rows[0]
  }

  if (email) {
    const rows = await supabaseRequest<UserProfileRow[]>(`user_profiles?select=id,airtable_record_id,name,email&email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`)
    if (rows[0]) return rows[0]
  }

  return null
}

async function resolveContactAndChat(chatId: string, contactPhone: string) {
  const phoneVariants = getBrazilPhoneVariants(contactPhone || chatId)
  const chatFilters = []
  if (chatId) chatFilters.push(`chat_id.eq.${encodeURIComponent(chatId)}`)
  for (const phone of phoneVariants) chatFilters.push(`phone_contact.eq.${encodeURIComponent(phone)}`, `chat_id.ilike.*${encodeURIComponent(phone)}*`)

  let chat: ChatRow | null = null
  if (chatFilters.length > 0) {
    const chats = await supabaseRequest<ChatRow[]>(`chats?select=id,contact_id,chat_id,phone_contact,nome_contato,url_foto_perfil&or=(${chatFilters.join(",")})&limit=1`)
    chat = chats[0] ?? null
  }

  let contact: ContactRow | null = null
  if (chat?.contact_id) {
    const contacts = await supabaseRequest<ContactRow[]>(`contacts?select=id,name,phone,phone_id_chat&id=eq.${encodeURIComponent(chat.contact_id)}&limit=1`)
    contact = contacts[0] ?? null
  }

  if (!contact && phoneVariants.length > 0) {
    const filters = phoneVariants.flatMap((phone) => [`phone.eq.${encodeURIComponent(phone)}`, `phone_id_chat.ilike.*${encodeURIComponent(phone)}*`])
    const contacts = await supabaseRequest<ContactRow[]>(`contacts?select=id,name,phone,phone_id_chat&or=(${filters.join(",")})&limit=1`)
    contact = contacts[0] ?? null
  }

  return { contact, chat }
}

function getTaskWritePayload({
  type,
  status,
  dueDate,
  subject,
  observations,
  responsible,
  creator,
  creatorName,
  patientName,
  contactPhone,
  chatId,
  contact,
  chat,
  createdAt,
}: {
  type: string
  status: string
  dueDate: string
  subject: string
  observations: string
  responsible?: UserProfileRow | null
  creator?: UserProfileRow | null
  creatorName?: string
  patientName?: string
  contactPhone?: string
  chatId?: string
  contact?: ContactRow | null
  chat?: ChatRow | null
  createdAt?: string
}) {
  return {
    type,
    status,
    status_normalized: normalizeStatus(status),
    due_date: dueDate || null,
    subject,
    description: observations || null,
    responsible_user_profile_id: responsible?.id ?? null,
    responsible_airtable_record_id: responsible?.airtable_record_id ?? null,
    responsible_name: responsible?.name ?? null,
    creator_user_profile_id: creator?.id ?? null,
    creator_airtable_record_id: creator?.airtable_record_id ?? null,
    creator_name: creator?.name || creatorName || "Sistema",
    contact_id: contact?.id ?? chat?.contact_id ?? null,
    chat_row_id: chat?.id ?? null,
    chat_id: chatId || chat?.chat_id || null,
    patient_name: patientName || contact?.name || chat?.nome_contato || null,
    patient_phone: contactPhone || contact?.phone || contact?.phone_id_chat || chat?.phone_contact || null,
    source: "supabase",
    updated_at: new Date().toISOString(),
    ...(createdAt ? { created_at: createdAt } : {}),
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  const rawMessage = error instanceof Error ? error.message : ""
  try {
    const parsed = JSON.parse(rawMessage) as { message?: string; error?: { message?: string } }
    return parsed.message || parsed.error?.message || rawMessage || fallback
  } catch {
    return rawMessage || fallback
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const chatId = getString(searchParams.get("chatId"))
  const contactPhone = getString(searchParams.get("contactPhone"))
  const shouldRefresh = searchParams.get("refresh") === "1"
  const viewerUserId = getString(searchParams.get("userId"))
  const viewerRole = getString(searchParams.get("role"))

  try {
    const allTasks = !chatId && !contactPhone && !shouldRefresh && taskListCache && taskListCache.expiresAt > Date.now() ? taskListCache.tasks : await fetchTasks()
    if (!chatId && !contactPhone && (!taskListCache || shouldRefresh)) taskListCache = { expiresAt: Date.now() + TASK_CACHE_TTL_MS, tasks: allTasks }

    const contactTasks = filterTasksForContact(allTasks, chatId, contactPhone)
    return NextResponse.json({ tasks: filterTasksForViewer(contactTasks, viewerUserId, viewerRole) })
  } catch (error) {
    return NextResponse.json({ tasks: [], message: getErrorMessage(error, "Nao foi possivel carregar encaminhamentos.") }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = getString(searchParams.get("id"))
  if (!id) return NextResponse.json({ message: "Tarefa invalida." }, { status: 400 })

  try {
    const existing = await fetchTaskById(id)
    if (!existing) return NextResponse.json({ message: "Tarefa nao encontrada." }, { status: 404 })

    taskListCache = null
    await supabaseRequest<unknown>(`tasks?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    })

    return NextResponse.json({ id, message: "Tarefa excluida." })
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, "Nao foi possivel excluir a tarefa.") }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = getString(searchParams.get("id"))
  if (!id) return NextResponse.json({ message: "Tarefa invalida." }, { status: 400 })

  const body = (await request.json()) as UpdateTaskBody
  const type = getString(body.type)
  const status = getString(body.status)
  const dueDate = getString(body.dueDate)
  const responsibleUserId = getString(body.responsibleUserId)
  const subject = getString(body.subject)
  const observations = getString(body.observations)

  if (!type || !status || !responsibleUserId || !subject) return NextResponse.json({ message: "Preencha tipo, status, responsavel e assunto." }, { status: 400 })

  try {
    const [existing, responsible] = await Promise.all([fetchTaskById(id), resolveUserProfile(responsibleUserId)])
    if (!existing) return NextResponse.json({ message: "Tarefa nao encontrada." }, { status: 404 })
    if (!responsible) return NextResponse.json({ message: "Usuario responsavel nao encontrado no Supabase." }, { status: 400 })

    taskListCache = null
    await supabaseRequest<unknown>(`tasks?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        type,
        status,
        status_normalized: normalizeStatus(status),
        due_date: dueDate || null,
        subject,
        description: observations || null,
        responsible_user_profile_id: responsible.id,
        responsible_airtable_record_id: responsible.airtable_record_id,
        responsible_name: responsible.name,
        updated_at: new Date().toISOString(),
      }),
    })

    const updated = await fetchTaskById(existing.id)
    return NextResponse.json({ task: updated ? mapTask(updated) : null, message: "Tarefa atualizada." })
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, "Nao foi possivel atualizar a tarefa.") }, { status: 500 })
  }
}

export async function POST(request: Request) {
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
  const creatorEmail = getString(body.creatorEmail)

  if (!type || !status || !createdAt || !subject || !creatorName) {
    return NextResponse.json({ message: "Preencha tipo, status, criador e assunto." }, { status: 400 })
  }

  const createdAtDate = new Date(createdAt)
  const dueDateValue = dueDate ? new Date(`${dueDate}T00:00:00`) : null
  if (Number.isNaN(createdAtDate.getTime()) || (dueDateValue && Number.isNaN(dueDateValue.getTime()))) {
    return NextResponse.json({ message: "Data invalida." }, { status: 400 })
  }

  try {
    const [responsible, creator, relation] = await Promise.all([
      responsibleUserId ? resolveUserProfile(responsibleUserId) : Promise.resolve(null),
      resolveUserProfile(creatorUserId, creatorEmail),
      resolveContactAndChat(chatId, contactPhone),
    ])
    if (responsibleUserId && !responsible) return NextResponse.json({ message: "Usuario responsavel nao encontrado no Supabase." }, { status: 400 })

    taskListCache = null
    const rows = await supabaseRequest<TaskRow[]>("tasks?select=id,airtable_record_id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(
        getTaskWritePayload({
          type,
          status,
          dueDate,
          subject,
          observations,
          responsible,
          creator,
          creatorName,
          patientName,
          contactPhone,
          chatId,
          contact: relation.contact,
          chat: relation.chat,
          createdAt: createdAtDate.toISOString(),
        }),
      ),
    })

    const row = rows[0]
    return NextResponse.json({ id: row?.airtable_record_id || row?.id, patientName, message: "Aviso/tarefa criado com sucesso." })
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, "Nao foi possivel criar o aviso/tarefa.") }, { status: 500 })
  }
}
