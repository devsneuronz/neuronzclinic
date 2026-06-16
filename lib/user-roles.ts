export type UserRole = "admin" | "manager" | "user"

export type CurrentUser = {
  id?: string
  email: string
  name: string
  role: UserRole
  source: "airtable" | "fallback" | "session"
  sectorIds?: string[]
  tagIds?: string[]
  canAccessUntaggedChats?: boolean
}

export type MentionableUser = Pick<CurrentUser, "email" | "name" | "role">

export const FALLBACK_ADMIN_EMAILS = ["p.augustocardoso@gmail.com"]
const FALLBACK_USER_NAMES: Record<string, string> = {
  "p.augustocardoso@gmail.com": "Pedro",
}

export function normalizeUserRole(value: unknown): UserRole {
  if (typeof value !== "string") {
    return "user"
  }

  const role = value.trim().toLowerCase()

  if (["adm", "admin", "administrador", "administrator", "owner", "dono"].includes(role)) {
    return "admin"
  }

  if (["manager", "gestor", "gerente", "supervisor", "coordenador"].includes(role)) {
    return "manager"
  }

  return "user"
}

export function getRoleLabel(role: UserRole) {
  const labels: Record<UserRole, string> = {
    admin: "Administrador",
    manager: "Gestor",
    user: "Usuário",
  }

  return labels[role]
}

export function isFallbackAdminEmail(email: string) {
  return FALLBACK_ADMIN_EMAILS.includes(email.trim().toLowerCase())
}

export function getDefaultUser(email: string, displayName?: string | null): CurrentUser {
  const normalizedEmail = email.trim().toLowerCase()
  const role = isFallbackAdminEmail(normalizedEmail) ? "admin" : "user"
  const name = displayName?.trim() || FALLBACK_USER_NAMES[normalizedEmail] || normalizedEmail

  return {
    email: normalizedEmail,
    name,
    role,
    source: isFallbackAdminEmail(normalizedEmail) ? "fallback" : "session",
  }
}
