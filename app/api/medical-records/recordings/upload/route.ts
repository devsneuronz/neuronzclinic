import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STORAGE_BUCKET = process.env.MEDICAL_RECORDINGS_STORAGE_BUCKET || "medical-records"
const MAX_FILE_SIZE = 250 * 1024 * 1024

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getSupabaseBaseUrl() {
  return SUPABASE_REST_URL?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "")
}

function sanitizeFileName(fileName: string) {
  return (
    fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "consulta.webm"
  )
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isBucketMissingError(status: number, body: string) {
  return status === 404 && body.toLowerCase().includes("bucket not found")
}

async function supabaseWrite<T>(path: string, init: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Configuração do Supabase ausente para prontuários.")
  }

  const response = await fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json() as Promise<T>
}

async function ensureStorageBucket(baseUrl: string) {
  if (!SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Configuração do Supabase ausente para criar o bucket de gravações.")
  }

  const response = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: STORAGE_BUCKET,
      name: STORAGE_BUCKET,
      public: false,
      file_size_limit: MAX_FILE_SIZE,
      allowed_mime_types: ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "video/webm"],
    }),
    cache: "no-store",
  })

  if (response.ok || response.status === 409) return

  const details = await response.text()
  throw new Error(details || `Não foi possível criar o bucket de gravações (${response.status}).`)
}

async function uploadRecordingFile(baseUrl: string, objectPath: string, mimeType: string, file: File) {
  if (!SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Configuração do Supabase ausente para upload.")
  }

  return fetch(`${baseUrl}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": mimeType,
      "x-upsert": "false",
    },
    body: file,
  })
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const medicalRecordId = getString(formData.get("medical_record_id"))
    const userEmail = getString(formData.get("user_email"))
    const consentConfirmed = getString(formData.get("consent_confirmed")) === "true"
    const durationSeconds = Number(getString(formData.get("duration_seconds")) || 0)
    const fileValue = formData.get("file")
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null

    if (!isUuid(medicalRecordId)) {
      return NextResponse.json({ message: "Prontuário inválido para vincular a gravação." }, { status: 400 })
    }

    if (!consentConfirmed) {
      return NextResponse.json({ message: "Confirme o consentimento do paciente antes de enviar a gravação." }, { status: 400 })
    }

    if (!file) {
      return NextResponse.json({ message: "Nenhuma gravação foi enviada." }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: "A gravação deve ter no máximo 250 MB." }, { status: 400 })
    }

    const mimeType = file.type || "audio/webm"
    if (!mimeType.toLowerCase().startsWith("audio/") && mimeType !== "video/webm") {
      return NextResponse.json({ message: "Envie apenas arquivos de áudio da consulta." }, { status: 400 })
    }

    const baseUrl = getSupabaseBaseUrl()
    if (!baseUrl || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
      return NextResponse.json({ message: "Configuração do Supabase ausente para upload." }, { status: 500 })
    }

    const objectPath = [
      "recordings",
      medicalRecordId,
      `${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name || "consulta.webm")}`,
    ].join("/")

    let uploadResponse = await uploadRecordingFile(baseUrl, objectPath, mimeType, file)

    if (!uploadResponse.ok) {
      let uploadError = await uploadResponse.text()
      const shouldCreateBucket = isBucketMissingError(uploadResponse.status, uploadError)

      if (shouldCreateBucket) {
        await ensureStorageBucket(baseUrl)
        uploadResponse = await uploadRecordingFile(baseUrl, objectPath, mimeType, file)
        uploadError = uploadResponse.ok ? "" : await uploadResponse.text()
      }

      if (!uploadResponse.ok) {
        return NextResponse.json(
          { message: uploadError || "Não foi possível enviar a gravação." },
          { status: uploadResponse.status },
        )
      }
    }

    const [attachment] = await supabaseWrite<Array<Record<string, unknown>>>("medical_record_attachments?select=*", {
      method: "POST",
      body: JSON.stringify({
        medical_record_id: medicalRecordId,
        kind: "audio",
        title: `Gravação da consulta - ${new Date().toLocaleString("pt-BR")}`,
        storage_path: objectPath,
        mime_type: mimeType,
        file_name: file.name || "consulta.webm",
        file_size: file.size,
        metadata: {
          source: "ai-consultation-recording",
          processing_status: "uploaded",
          consent_confirmed: true,
          duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        },
        created_by: userEmail || null,
      }),
    })

    return NextResponse.json({
      attachment,
      attachmentId: attachment?.id,
      storagePath: objectPath,
      mimeType,
      fileName: file.name || "consulta.webm",
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível enviar a gravação." },
      { status: 500 },
    )
  }
}
