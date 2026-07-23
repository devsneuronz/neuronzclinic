import { getCanonicalWhatsappChatId, normalizeWhatsappPhone } from "@/lib/phone"
import { getBrazilPhoneVariants, getNullableString, getString, isUuid, supabaseJson } from "@/lib/supabase-server"

type ContactRow = {
  id: string
  chat_id: string | null
  alt_chat_id: string | null
  name: string | null
  pushname: string | null
  phone: string | null
  email?: string | null
  city_residence?: string | null
  city_interest?: string | null
  notes?: string | null
  status?: string | null
}

type ChatRow = {
  id: string
  chat_id: string | null
  nome_contato: string | null
  pushname: string | null
  phone_contact: string | null
  contact_id: string | null
}

export type ContactChatInput = {
  contactId?: unknown
  patientId?: unknown
  name?: unknown
  patientName?: unknown
  pushname?: unknown
  phone?: unknown
  contactPhone?: unknown
  chatId?: unknown
  email?: unknown
  cityResidence?: unknown
  cityInterest?: unknown
  notes?: unknown
  status?: unknown
}

function getLocalPhone(value: unknown) {
  const normalized = normalizeWhatsappPhone(value)
  return normalized.startsWith("55") ? normalized.slice(2) : normalized
}

async function findContact({ id, chatId, phone }: { id: string; chatId: string; phone: string }) {
  if (isUuid(id)) {
    const rows = await supabaseJson<ContactRow[]>(`contacts?select=id,chat_id,alt_chat_id,name,pushname,phone,email,city_residence,city_interest,notes,status&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (rows[0]) return rows[0]
  }

  const filters: string[] = []
  if (chatId) filters.push(`chat_id.eq.${encodeURIComponent(chatId)}`, `alt_chat_id.eq.${encodeURIComponent(chatId)}`)
  for (const variant of getBrazilPhoneVariants(phone || chatId)) {
    filters.push(`phone.eq.${encodeURIComponent(variant)}`)
  }
  const localPhone = getLocalPhone(phone)
  if (localPhone) filters.push(`phone.eq.${encodeURIComponent(localPhone)}`)
  if (filters.length === 0) return null

  const rows = await supabaseJson<ContactRow[]>(`contacts?select=id,chat_id,alt_chat_id,name,pushname,phone,email,city_residence,city_interest,notes,status&or=(${Array.from(new Set(filters)).join(",")})&limit=1`)
  return rows[0] ?? null
}

async function findChat(chatId: string, phone: string) {
  const filters: string[] = []
  if (chatId) filters.push(`chat_id.eq.${encodeURIComponent(chatId)}`)
  for (const variant of getBrazilPhoneVariants(phone || chatId)) {
    filters.push(`phone_contact.eq.${encodeURIComponent(variant)}`, `chat_id.ilike.*${encodeURIComponent(variant)}*`)
  }
  if (filters.length === 0) return null
  const rows = await supabaseJson<ChatRow[]>(`chats?select=id,chat_id,nome_contato,pushname,phone_contact,contact_id&or=(${Array.from(new Set(filters)).join(",")})&limit=1`)
  return rows[0] ?? null
}

async function upsertChat({ chatId, name, pushname, phone, contactId }: { chatId: string; name: string; pushname: string; phone: string; contactId: string }) {
  if (!chatId) return null

  const existing = await findChat(chatId, phone)
  const payload = {
    chat_id: chatId,
    nome_contato: name || existing?.nome_contato || pushname || phone || chatId,
    pushname: pushname || existing?.pushname || name || null,
    phone_contact: phone || existing?.phone_contact || null,
    contact_id: contactId,
  }

  const path = existing?.id
    ? `chats?id=eq.${encodeURIComponent(existing.id)}&select=id,chat_id,nome_contato,pushname,phone_contact,contact_id`
    : "chats?select=id,chat_id,nome_contato,pushname,phone_contact,contact_id"

  const [chat] = await supabaseJson<ChatRow[]>(path, {
    method: existing?.id ? "PATCH" : "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  })
  return chat ?? existing
}

export async function ensureContactAndChat(input: ContactChatInput) {
  const explicitId = getString(input.contactId) || getString(input.patientId)
  const inputChatId = getString(input.chatId)
  const rawPhone = getString(input.phone) || getString(input.contactPhone) || inputChatId
  const phone = normalizeWhatsappPhone(rawPhone)
  const chatId = getCanonicalWhatsappChatId(inputChatId || phone)
  const name = getString(input.name) || getString(input.patientName) || getString(input.pushname) || phone || chatId
  const pushname = getString(input.pushname) || name

  const existing = await findContact({ id: explicitId, chatId, phone })
  const hasNotes = Object.prototype.hasOwnProperty.call(input, "notes")
  const hasStatus = Object.prototype.hasOwnProperty.call(input, "status")
  const payload = {
    name,
    pushname: getNullableString(pushname),
    phone: phone || existing?.phone || null,
    chat_id: chatId || existing?.chat_id || null,
    alt_chat_id: existing?.alt_chat_id || (inputChatId && inputChatId !== chatId ? inputChatId : null),
    email: getNullableString(input.email) ?? existing?.email ?? null,
    city_residence: getNullableString(input.cityResidence) ?? existing?.city_residence ?? null,
    city_interest: getNullableString(input.cityInterest) ?? existing?.city_interest ?? null,
    notes: hasNotes ? getNullableString(input.notes) : existing?.notes ?? null,
    status: hasStatus ? getString(input.status) || existing?.status || "Novo" : existing?.status || "Novo",
    active: true,
  }

  const contactPath = existing?.id
    ? `contacts?id=eq.${encodeURIComponent(existing.id)}&select=id,chat_id,alt_chat_id,name,pushname,phone,email,city_residence,city_interest,notes,status`
    : "contacts?select=id,chat_id,alt_chat_id,name,pushname,phone,email,city_residence,city_interest,notes,status"

  const [contact] = await supabaseJson<ContactRow[]>(contactPath, {
    method: existing?.id ? "PATCH" : "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  })

  const finalContact = contact ?? existing
  const chat = finalContact?.id ? await upsertChat({ chatId: payload.chat_id || "", name, pushname, phone: phone || getString(finalContact.phone), contactId: finalContact.id }) : null

  return { contact: finalContact, chat }
}
