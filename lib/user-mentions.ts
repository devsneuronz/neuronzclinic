import type { MentionableUser } from "@/lib/user-roles"

export type MentionMatch = MentionableUser & {
  mention: string
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

export function getMentionSlug(name: string) {
  return normalizeText(name)
    .replace(/[^a-z0-9]+/g, "")
    .trim()
}

function getMentionAliases(user: MentionableUser) {
  const name = user.name.trim()
  const firstName = name.split(/\s+/)[0] ?? ""
  const emailUser = user.email.split("@")[0] ?? ""

  return Array.from(new Set([name, firstName, emailUser].map(getMentionSlug).filter(Boolean)))
}

export function getMentionLabel(user: MentionableUser) {
  const firstName = user.name.trim().split(/\s+/)[0]
  return firstName || user.email.split("@")[0] || user.email
}

export function findMentionedUsers(content: string, users: MentionableUser[]) {
  const normalizedContent = normalizeText(content)
  const matches: MentionMatch[] = []

  for (const user of users) {
    const alias = getMentionAliases(user).find((candidate) => normalizedContent.includes(`@${candidate}`))

    if (alias) {
      matches.push({ ...user, mention: alias })
    }
  }

  return matches
}

export function isUserMentioned(content: string, users: MentionableUser[], email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) return false

  return findMentionedUsers(content, users).some((user) => user.email.trim().toLowerCase() === normalizedEmail)
}

export async function fetchMentionableUsers() {
  const response = await fetch("/api/airtable/users", {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar os usuarios.")
  }

  const data = (await response.json()) as { users?: MentionableUser[] }
  return data.users ?? []
}

