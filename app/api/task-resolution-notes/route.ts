import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STORAGE_BUCKET = process.env.SEND_MESSAGE_STORAGE_BUCKET || "file"
const TASK_NOTE_MEDIA_PREFIX = "task-note-media:"
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024

type RawTaskResolutionNote = Record<string, unknown>

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getNullableString(value: unknown) {
  const text = getString(value)
  return text || null
}

function getSupabaseBaseUrl() {
  return SUPABASE_REST_URL?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "")
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "file"
}

function getPublicStorageUrl(baseUrl: string, objectPath: string) {
  const encodedPath = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  return `${baseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`
}

function getAttachmentKind(file: File) {
  const mimeType = file.type.toLowerCase()
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("audio/")) return "audio"
  return ""
}

async function uploadTaskNoteFile(file: File, taskId: string) {
  const baseUrl = getSupabaseBaseUrl()

  if (!baseUrl || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Configuracao do Supabase ausente para upload de anexos.")
  }

  const kind = getAttachmentKind(file)
  if (!kind) {
    throw new Error("Envie apenas imagens ou audios na evolucao da tarefa.")
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error("O anexo deve ter no maximo 25 MB.")
  }

  const safeTaskId = taskId.replace(/[^a-zA-Z0-9@._-]/g, "-")
  const objectPath = `task-resolution-notes/${safeTaskId}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
  const uploadUrl = `${baseUrl}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(details || `Falha no upload do anexo (${response.status}).`)
  }

  return {
    kind,
    url: getPublicStorageUrl(baseUrl, objectPath),
    fileName: file.name || "arquivo",
    mimeType: file.type || "application/octet-stream",
  }
}

function serializeMediaNote({
  caption,
  file,
}: {
  caption: string
  file: Awaited<ReturnType<typeof uploadTaskNoteFile>>
}) {
  return `${TASK_NOTE_MEDIA_PREFIX}${JSON.stringify({
    version: 1,
    type: file.kind,
    caption,
    mediaUrl: file.url,
    fileName: file.fileName,
    mimeType: file.mimeType,
  })}`
}

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for task resolution notes. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.")
  }

  return fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })
}

export async function GET(request: NextRequest) {
  try {
    const taskId = getString(request.nextUrl.searchParams.get("task_id"))

    if (!taskId) {
      return NextResponse.json({ message: "task_id e obrigatorio." }, { status: 400 })
    }

    const select = ["id", "task_id", "content", "status_snapshot", "created_at", "updated_at"].join(",")
    const response = await supabaseRequest(`task_resolution_notes?select=${select}&task_id=eq.${encodeURIComponent(taskId)}&order=created_at.desc`)

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    return NextResponse.json({ notes: (await response.json()) as RawTaskResolutionNote[] })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel carregar o historico da tarefa." },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const isMultipart = request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")
    const body = isMultipart ? null : ((await request.json().catch(() => null)) as RawTaskResolutionNote | null)
    const formData = isMultipart ? await request.formData() : null

    if (!formData && (!body || typeof body !== "object" || Array.isArray(body))) {
      return NextResponse.json({ message: "Payload invalido." }, { status: 400 })
    }

    const taskId = formData ? getString(formData.get("task_id")) : getString(body?.task_id)
    const caption = formData ? getString(formData.get("content")) : getString(body?.content)
    const fileValue = formData?.get("file")
    const attachment = fileValue instanceof File && fileValue.size > 0 ? fileValue : null

    if (!taskId || (!caption && !attachment)) {
      return NextResponse.json({ message: "task_id e content sao obrigatorios." }, { status: 400 })
    }

    const uploaded = attachment ? await uploadTaskNoteFile(attachment, taskId) : null
    const note = {
      task_id: taskId,
      content: uploaded ? serializeMediaNote({ caption, file: uploaded }) : caption,
      status_snapshot: getNullableString(formData ? formData.get("status_snapshot") : body?.status_snapshot),
    }

    const response = await supabaseRequest("task_resolution_notes?select=*", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(note),
    })

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    const data = (await response.json()) as RawTaskResolutionNote[]
    return NextResponse.json({ note: data[0] ?? note })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel salvar a evolucao da tarefa." },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"))

    if (!id) {
      return NextResponse.json({ message: "ID da evolucao e obrigatorio." }, { status: 400 })
    }

    const response = await supabaseRequest(`task_resolution_notes?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel apagar a evolucao da tarefa." },
      { status: 500 },
    )
  }
}
