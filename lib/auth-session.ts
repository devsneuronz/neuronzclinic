export const AUTH_SESSION_EVENT = "neuronzclinic:auth-session"
export const AUTH_SESSION_STORAGE_KEY = "neuronzclinic.supabase.session"

type SupabaseSession = {
  access_token?: string
  expires_at?: number
  expires_in?: number
  user?: {
    email?: string
    id?: string
    user_metadata?: Record<string, unknown>
    identities?: Array<{
      identity_data?: Record<string, unknown>
    }>
  }
}

type StoredSession = SupabaseSession & {
  saved_at: number
  expires_at: number
}

function getStorage(type: "local" | "session") {
  if (typeof window === "undefined") {
    return null
  }

  return type === "local" ? window.localStorage : window.sessionStorage
}

function normalizeSession(session: SupabaseSession): StoredSession {
  const savedAt = Math.floor(Date.now() / 1000)
  const expiresAt = session.expires_at ?? savedAt + (session.expires_in ?? 3600)

  return {
    ...session,
    saved_at: savedAt,
    expires_at: expiresAt,
  }
}

function readSession(type: "local" | "session") {
  const storage = getStorage(type)
  const rawSession = storage?.getItem(AUTH_SESSION_STORAGE_KEY)

  if (!rawSession) {
    return null
  }

  try {
    return JSON.parse(rawSession) as StoredSession
  } catch {
    storage?.removeItem(AUTH_SESSION_STORAGE_KEY)
    return null
  }
}

export function getSavedSession() {
  return readSession("local") ?? readSession("session")
}

export function getSavedSessionEmail() {
  return getSavedSession()?.user?.email ?? null
}

function getStringMetadataValue(metadata: Record<string, unknown> | undefined, keys: string[]) {
  if (!metadata) {
    return null
  }

  for (const key of keys) {
    const value = metadata[key]

    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return null
}

export function getSavedSessionDisplayName() {
  const user = getSavedSession()?.user
  const metadataKeys = ["name", "full_name", "display_name", "preferred_username", "user_name"]
  const directName = getStringMetadataValue(user?.user_metadata, metadataKeys)

  if (directName) {
    return directName
  }

  for (const identity of user?.identities ?? []) {
    const identityName = getStringMetadataValue(identity.identity_data, metadataKeys)

    if (identityName) {
      return identityName
    }
  }

  return null
}

export function hasValidSession() {
  const session = getSavedSession()
  const now = Math.floor(Date.now() / 1000)

  return Boolean(session?.access_token && session.expires_at > now + 60)
}

export function saveSession(session: SupabaseSession, rememberDevice: boolean) {
  const storageType = rememberDevice ? "local" : "session"
  const oppositeStorageType = rememberDevice ? "session" : "local"
  const storage = getStorage(storageType)
  const oppositeStorage = getStorage(oppositeStorageType)

  storage?.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(normalizeSession(session)))
  oppositeStorage?.removeItem(AUTH_SESSION_STORAGE_KEY)
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT))
}

export function clearSavedSession() {
  getStorage("local")?.removeItem(AUTH_SESSION_STORAGE_KEY)
  getStorage("session")?.removeItem(AUTH_SESSION_STORAGE_KEY)
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT))
}
