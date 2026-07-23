const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export type SupabaseRecord = Record<string, unknown>

function getSupabaseKey() {
  return SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY
}

export function getSupabaseRestUrl() {
  if (!SUPABASE_REST_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_REST_URL.")
  }

  return SUPABASE_REST_URL.replace(/\/$/, "")
}

export async function supabaseRequest(path: string, init?: RequestInit) {
  const key = getSupabaseKey()

  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.")
  }

  return fetch(`${getSupabaseRestUrl()}/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })
}

export async function supabaseJson<T>(path: string, init?: RequestInit) {
  const response = await supabaseRequest(path, init)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(text || `Supabase request failed with ${response.status}.`)
  }

  return (text.trim() ? JSON.parse(text) : null) as T
}

export function encodeEq(value: string) {
  return encodeURIComponent(value)
}

export function encodeIlike(value: string) {
  return encodeURIComponent(`*${value.replace(/[%*_]/g, "\\$&")}*`)
}

export function normalizeDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`

  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ""
}

export function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function getNullableString(value: unknown) {
  const text = getString(value)
  return text || null
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function getBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["true", "sim", "yes", "1", "ativo", "active"].includes(normalized)) return true
    if (["false", "nao", "não", "no", "0", "inativo", "inactive"].includes(normalized)) return false
  }
  return fallback
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "")
}

export function getBrazilPhoneVariants(value: string) {
  const digits = onlyDigits(value)
  const variants = new Set<string>()

  if (digits) variants.add(digits)
  if (digits.startsWith("55")) variants.add(digits.slice(2))
  if (digits.length >= 10 && !digits.startsWith("55")) variants.add(`55${digits}`)

  return Array.from(variants).filter(Boolean)
}
