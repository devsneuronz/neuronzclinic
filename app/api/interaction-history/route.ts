import { NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const QUALITY_OPTIONS = ["\u00d3tima", "Boa", "Razo\u00e1vel", "Ruim", "P\u00e9ssima"]

type InteractionHistoryRow = {
  id: string
  airtable_record_id: string | null
  chat_id: string | null
  chat_row_id?: string | null
  contact_id?: string | null
  contact_phone: string | null
  received: string | null
  ia_response: string | null
  corrected_response: string | null
  quality: string | null
  occurred_at: string | null
  created_at: string
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "")
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase REST configuration for interaction history.")
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

function externalId(row: InteractionHistoryRow) {
  return row.airtable_record_id || row.id
}

function getInteractionTime(interaction: ReturnType<typeof mapInteractionRow>) {
  const time = new Date(interaction.createdAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

function mapInteractionRow(row: InteractionHistoryRow, index: number) {
  return {
    id: externalId(row),
    number: index + 1,
    createdAt: row.occurred_at || row.created_at || "",
    received: row.received || "",
    iaResponse: row.ia_response || "",
    correctedResponse: row.corrected_response || "",
    quality: row.quality || "",
  }
}

function sortInteractionsOldestFirst(interactions: ReturnType<typeof mapInteractionRow>[]) {
  return [...interactions]
    .sort((first, second) => getInteractionTime(first) - getInteractionTime(second))
    .map((interaction, index) => ({ ...interaction, number: index + 1 }))
}

function buildContactFilters(chatId: string, contactPhone: string, chatRowId: string) {
  const filters: string[] = []
  if (chatRowId) {
    filters.push(`chat_row_id.eq.${encodeURIComponent(chatRowId)}`)
  }

  if (chatId) {
    filters.push(`chat_id.eq.${encodeURIComponent(chatId)}`)
    filters.push(`chat_id.ilike.*${encodeURIComponent(chatId)}*`)
    if (isUuid(chatId)) {
      filters.push(`contact_id.eq.${encodeURIComponent(chatId)}`)
    }
  }

  for (const phone of getBrazilPhoneVariants(contactPhone || chatId)) {
    filters.push(`contact_phone.eq.${encodeURIComponent(phone)}`)
    filters.push(`contact_phone.ilike.*${encodeURIComponent(phone)}*`)
    filters.push(`chat_id.ilike.*${encodeURIComponent(phone)}*`)
  }

  return filters
}

async function fetchInteractionById(id: string) {
  const rows = await supabaseRequest<InteractionHistoryRow[]>("interaction_history?select=*&is_active=is.true&deleted_at=is.null&limit=10000")
  return rows.find((row) => row.id === id || row.airtable_record_id === id) ?? null
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
  const chatRowId = getString(searchParams.get("chatRowId"))

  try {
    const params = new URLSearchParams({
      select: "*",
      is_active: "is.true",
      deleted_at: "is.null",
      order: "occurred_at.asc.nullslast,created_at.asc",
      limit: "10000",
    })
    const filters = buildContactFilters(chatId, contactPhone, chatRowId)
    if (filters.length > 0) params.set("or", `(${filters.join(",")})`)

    const rows = await supabaseRequest<InteractionHistoryRow[]>(`interaction_history?${params}`)
    const interactions = sortInteractionsOldestFirst(rows.map(mapInteractionRow).filter((interaction) => interaction.received || interaction.iaResponse))

    return NextResponse.json({ interactions, qualityOptions: QUALITY_OPTIONS })
  } catch (error) {
    return NextResponse.json({ interactions: [], qualityOptions: QUALITY_OPTIONS, message: getErrorMessage(error, "Nao foi possivel carregar o historico de interacoes.") }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: unknown; quality?: unknown; correctedResponse?: unknown }
  const id = getString(body.id)
  const quality = getString(body.quality)
  const correctedResponse = getString(body.correctedResponse)
  const shouldUpdateQuality = Object.prototype.hasOwnProperty.call(body, "quality")
  const shouldUpdateCorrectedResponse = Object.prototype.hasOwnProperty.call(body, "correctedResponse")

  if (!id) return NextResponse.json({ message: "Interacao invalida." }, { status: 400 })
  if (!shouldUpdateQuality && !shouldUpdateCorrectedResponse) return NextResponse.json({ message: "Nenhuma alteracao informada." }, { status: 400 })
  if (shouldUpdateCorrectedResponse && !correctedResponse) return NextResponse.json({ message: "Digite a mensagem corrigida." }, { status: 400 })

  try {
    const existing = await fetchInteractionById(id)
    if (!existing) return NextResponse.json({ message: "Interacao nao encontrada." }, { status: 404 })

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString(), source: "supabase" }
    if (shouldUpdateQuality) payload.quality = quality || null
    if (shouldUpdateCorrectedResponse) payload.corrected_response = correctedResponse

    await supabaseRequest<unknown>(`interaction_history?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    })

    const updated = await fetchInteractionById(existing.id)
    return NextResponse.json({ interaction: updated ? mapInteractionRow(updated, 0) : null, message: "Alteracao salva." })
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, "Nao foi possivel salvar a qualidade de resposta.") }, { status: 500 })
  }
}
