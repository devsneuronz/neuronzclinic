import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STORAGE_BUCKET = process.env.SAVED_ATTACHMENTS_STORAGE_BUCKET || "saved-attachments"
const MAX_FILE_SIZE = 80 * 1024 * 1024

const allowedPrefixes = {
  image: "image/",
  video: "video/",
  audio: "audio/",
} as const

type MediaKind = keyof typeof allowedPrefixes

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
      .slice(0, 120) || "file"
  )
}

function getPublicStorageUrl(baseUrl: string, objectPath: string) {
  const encodedPath = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  return `${baseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`
}

function isMediaKind(value: string): value is MediaKind {
  return value === "image" || value === "video" || value === "audio"
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const kind = String(formData.get("kind") || "").trim()
    const fileValue = formData.get("file")
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null

    if (!isMediaKind(kind)) {
      return NextResponse.json({ message: "Tipo de anexo inválido." }, { status: 400 })
    }

    if (!file) {
      return NextResponse.json({ message: "Selecione um arquivo para enviar." }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: "O arquivo deve ter no máximo 80 MB." }, { status: 400 })
    }

    const mimeType = file.type || "application/octet-stream"
    if (!mimeType.toLowerCase().startsWith(allowedPrefixes[kind])) {
      return NextResponse.json({ message: "O arquivo selecionado não corresponde ao tipo do anexo." }, { status: 400 })
    }

    const baseUrl = getSupabaseBaseUrl()
    const storageKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY

    if (!baseUrl || !storageKey || !SUPABASE_PUBLISHABLE_KEY) {
      return NextResponse.json({ message: "Configuração do Supabase ausente para upload." }, { status: 500 })
    }

    const objectPath = `${kind}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
    const uploadUrl = `${baseUrl}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${storageKey}`,
        "Content-Type": mimeType,
        "x-upsert": "false",
      },
      body: file,
    })

    if (!response.ok) {
      const details = await response.text()
      return NextResponse.json({ message: details || `Falha no upload do arquivo (${response.status}).` }, { status: response.status })
    }

    return NextResponse.json({
      mediaUrl: getPublicStorageUrl(baseUrl, objectPath),
      mediaPath: objectPath,
      mediaMimeType: mimeType,
      fileName: file.name || "file",
    })
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Não foi possível enviar o arquivo.",
      },
      { status: 500 },
    )
  }
}
