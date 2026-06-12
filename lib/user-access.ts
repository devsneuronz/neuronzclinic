import type { CurrentUser } from "@/lib/user-roles"
import { getChatTags } from "@/lib/chat-tags"
import type { ChatRecord } from "@/lib/supabase-rest"

function normalizeComparableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(dra|dr|doutora|doutor)\b\.?/g, "")
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim()
}

export function hasTatianaIdentity(value: string) {
  return /\btatiana\b/.test(normalizeComparableName(value))
}

export function isDraTatianaUser(user: CurrentUser | null | undefined) {
  if (!user) return false

  return hasTatianaIdentity(user.name) || hasTatianaIdentity(user.email)
}

export function getUserHomePath(user: CurrentUser | null | undefined) {
  return isDraTatianaUser(user) ? "/tarefas" : "/"
}

export function getDraTatianaResponsibleFilter(options: string[]) {
  return options.find(hasTatianaIdentity) ?? ""
}

export function canUserAccessChat(user: CurrentUser | null | undefined, chat: Partial<ChatRecord>) {
  if (!user) return false
  if (user.role === "admin") return true

  const allowedTagIds = new Set(user.tagIds ?? [])
  if (allowedTagIds.size === 0) return false

  return getChatTags(chat).some((tag) => allowedTagIds.has(tag.id))
}

export function filterChatsForUser<T extends Partial<ChatRecord>>(user: CurrentUser | null | undefined, chats: T[]) {
  return chats.filter((chat) => canUserAccessChat(user, chat))
}
