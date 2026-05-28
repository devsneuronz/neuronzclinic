import type { CurrentUser } from "@/lib/user-roles"

type TaskOwnership = {
  creator?: string
  responsible?: string
}

function normalizeComparableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(dra|dr|doutora|doutor)\b\.?/g, "")
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim()
}

function hasTatianaIdentity(value: string) {
  return /\btatiana\b/.test(normalizeComparableName(value))
}

export function isDraTatianaUser(user: CurrentUser | null | undefined) {
  if (!user) return false

  return hasTatianaIdentity(user.name) || hasTatianaIdentity(user.email)
}

export function getUserHomePath(user: CurrentUser | null | undefined) {
  return isDraTatianaUser(user) ? "/tarefas" : "/"
}

export function canUserViewTask(user: CurrentUser | null | undefined, task: TaskOwnership) {
  if (!isDraTatianaUser(user)) {
    return true
  }

  const responsible = normalizeComparableName(task.responsible ?? "")

  return hasTatianaIdentity(responsible)
}
