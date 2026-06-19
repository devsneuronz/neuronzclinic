import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2"
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY
const APPOINTMENT_TABLE = process.env.AIRTABLE_APPOINTMENTS_TABLE || "Agendamentos"

type MedicalRecordPayload = Record<string, unknown>

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getNullableString(value: unknown) {
  const text = getString(value)
  return text || null
}

function getJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null
}

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]+$/.test(value)
}

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for medical records.")
  }

  return fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })
}

async function updateAirtableAppointmentStatus(appointmentId: string, status: string) {
  if (!AIRTABLE_TOKEN) {
    throw new Error("Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY.")
  }

  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(APPOINTMENT_TABLE)}/${appointmentId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        Status: status,
      },
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }
}

function buildRecordPayload(body: MedicalRecordPayload) {
  return {
    contact_chat_id: getNullableString(body.contactChatId),
    contact_airtable_id: getNullableString(body.contactAirtableId),
    contact_name: getNullableString(body.contactName),
    contact_phone: getNullableString(body.contactPhone),
    appointment_airtable_id: getNullableString(body.appointmentAirtableId),
    professional_airtable_id: getNullableString(body.professionalAirtableId),
    professional_name: getNullableString(body.professionalName),
    title: getNullableString(body.title),
    status: getString(body.status) || "draft",
    content_html: getString(body.contentHtml),
    content_json: getJsonObject(body.contentJson),
    metadata: getJsonObject(body.metadata) ?? {},
    updated_by: getNullableString(body.userEmail),
  }
}

export async function GET(request: NextRequest) {
  try {
    const appointmentId = getString(request.nextUrl.searchParams.get("appointmentId"))
    const contactChatId = getString(request.nextUrl.searchParams.get("contactChatId"))

    if (!appointmentId && !contactChatId) {
      return NextResponse.json({ record: null })
    }

    const filters = new URLSearchParams({
      select: "*",
      limit: "1",
      order: "updated_at.desc",
    })

    if (appointmentId) {
      filters.set("appointment_airtable_id", `eq.${appointmentId}`)
    } else if (contactChatId) {
      filters.set("contact_chat_id", `eq.${contactChatId}`)
    }

    const response = await supabaseRequest(`medical_records?${filters}`)

    if (!response.ok) {
      return NextResponse.json({ record: null, message: await response.text() }, { status: response.status })
    }

    const records = (await response.json()) as MedicalRecordPayload[]
    return NextResponse.json({ record: records[0] ?? null })
  } catch (error) {
    return NextResponse.json(
      { record: null, message: error instanceof Error ? error.message : "Não foi possível carregar o prontuário." },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as MedicalRecordPayload | null

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 })
    }

    const id = getString(body.id)
    const appointmentId = getString(body.appointmentAirtableId)
    const contactChatId = getString(body.contactChatId)

    if (!appointmentId && !contactChatId) {
      return NextResponse.json({ message: "Informe o agendamento ou contato do prontuário." }, { status: 400 })
    }

    const payload = buildRecordPayload(body)
    let existingId = id
    let existingMetadata: Record<string, unknown> | null = null

    if (existingId) {
      const lookup = await supabaseRequest(`medical_records?select=id,metadata&id=eq.${encodeURIComponent(existingId)}&limit=1`)
      if (!lookup.ok) return NextResponse.json({ message: await lookup.text() }, { status: lookup.status })
      const records = (await lookup.json()) as Array<{ id?: string; metadata?: Record<string, unknown> | null }>
      existingMetadata = records[0]?.metadata ?? null
    }

    if (!existingId && appointmentId) {
      const lookup = await supabaseRequest(`medical_records?select=id,metadata&appointment_airtable_id=eq.${encodeURIComponent(appointmentId)}&limit=1`)
      if (!lookup.ok) return NextResponse.json({ message: await lookup.text() }, { status: lookup.status })
      const records = (await lookup.json()) as Array<{ id?: string; metadata?: Record<string, unknown> | null }>
      existingId = getString(records[0]?.id)
      existingMetadata = records[0]?.metadata ?? null
    }

    if (existingMetadata) {
      payload.metadata = {
        ...existingMetadata,
        ...(payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : {}),
      }
    }

    const response = existingId
      ? await supabaseRequest(`medical_records?id=eq.${encodeURIComponent(existingId)}&select=*`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await supabaseRequest("medical_records?select=*", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            created_by: getNullableString(body.userEmail),
          }),
        })

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    const records = (await response.json()) as MedicalRecordPayload[]
    const record = records[0] ?? null
    let appointmentStatusUpdated = false

    if (payload.status === "finalized" && isAirtableRecordId(appointmentId)) {
      await updateAirtableAppointmentStatus(appointmentId, "Finalizado")
      appointmentStatusUpdated = true
    }

    return NextResponse.json({ record, appointmentStatusUpdated })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível salvar o prontuário." },
      { status: 500 },
    )
  }
}
