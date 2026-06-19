import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STORAGE_BUCKET = process.env.MEDICAL_RECORDINGS_STORAGE_BUCKET || "medical-records"
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe-diarize"
const FALLBACK_TRANSCRIPTION_MODEL = process.env.OPENAI_FALLBACK_TRANSCRIPTION_MODEL || "gpt-4o-transcribe"
const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini"

type AttachmentRecord = {
  id: string
  medical_record_id: string
  storage_path: string | null
  mime_type: string | null
  file_name: string | null
  metadata: Record<string, unknown> | null
}

type MedicalRecord = {
  id: string
  contact_name: string | null
  professional_name: string | null
  title: string | null
  metadata: Record<string, unknown> | null
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getSupabaseBaseUrl() {
  return SUPABASE_REST_URL?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "")
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function supabaseRequest<T>(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Configuração do Supabase ausente para prontuários.")
  }

  const response = await fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json() as Promise<T>
}

async function patchAttachmentMetadata(attachment: AttachmentRecord, metadata: Record<string, unknown>) {
  const [updated] = await supabaseRequest<AttachmentRecord[]>(
    `medical_record_attachments?id=eq.${encodeURIComponent(attachment.id)}&select=*`,
    {
      method: "PATCH",
      body: JSON.stringify({
        metadata: {
          ...(attachment.metadata ?? {}),
          ...metadata,
        },
      }),
    },
  )

  return updated ?? attachment
}

async function downloadRecording(storagePath: string) {
  const baseUrl = getSupabaseBaseUrl()
  if (!baseUrl || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Configuração do Supabase ausente para baixar a gravação.")
  }

  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  const response = await fetch(`${baseUrl}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error((await response.text()) || "Não foi possível baixar a gravação.")
  }

  return response.arrayBuffer()
}

function getTranscriptText(payload: unknown) {
  if (typeof payload === "string") return payload.trim()
  if (!payload || typeof payload !== "object") return ""

  const record = payload as Record<string, unknown>
  const text = getString(record.text)
  if (text) return text

  const segments = Array.isArray(record.segments) ? record.segments : []
  return segments
    .map((segment) => {
      if (!segment || typeof segment !== "object") return ""
      const segmentRecord = segment as Record<string, unknown>
      const speaker = getString(segmentRecord.speaker)
      const content = getString(segmentRecord.text)
      return content ? `${speaker ? `${speaker}: ` : ""}${content}` : ""
    })
    .filter(Boolean)
    .join("\n")
    .trim()
}

async function transcribeAudio(audio: ArrayBuffer, fileName: string, mimeType: string | null) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.")
  }

  async function requestTranscription(model: string, diarized: boolean) {
    const formData = new FormData()
    formData.append("file", new Blob([audio], { type: mimeType || "audio/webm" }), fileName || "consulta.webm")
    formData.append("model", model)
    formData.append("response_format", diarized ? "diarized_json" : "json")
    if (diarized) formData.append("chunking_strategy", "auto")

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    })

    const text = await response.text()
    if (!response.ok) {
      throw new Error(text || `Falha na transcrição (${response.status}).`)
    }

    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }

  try {
    return await requestTranscription(TRANSCRIPTION_MODEL, TRANSCRIPTION_MODEL.includes("diarize"))
  } catch (error) {
    if (TRANSCRIPTION_MODEL === FALLBACK_TRANSCRIPTION_MODEL) throw error
    return requestTranscription(FALLBACK_TRANSCRIPTION_MODEL, false)
  }
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const record = payload as Record<string, unknown>
  const outputText = getString(record.output_text)
  if (outputText) return outputText

  const output = Array.isArray(record.output) ? record.output : []
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const content = (item as Record<string, unknown>).content
      return Array.isArray(content) ? content : []
    })
    .map((content) => {
      if (!content || typeof content !== "object") return ""
      const contentRecord = content as Record<string, unknown>
      return getString(contentRecord.text) || getString(contentRecord.output_text)
    })
    .filter(Boolean)
    .join("\n")
    .trim()
}

async function summarizeTranscript(transcript: string, record: MedicalRecord) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.")
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      input: [
        {
          role: "system",
          content:
            "Voce resume consultas medicas em portugues do Brasil. Seja fiel a transcricao, nao invente informacoes, marque incertezas e escreva em formato clinico claro para revisao humana.",
        },
        {
          role: "user",
          content: [
            `Paciente: ${record.contact_name || "Nao informado"}`,
            `Profissional: ${record.professional_name || "Nao informado"}`,
            `Atendimento: ${record.title || "Prontuario clinico"}`,
            "",
            "Gere um resumo com secoes: Queixa principal, Historia clinica, Achados relevantes, Hipoteses, Conduta, Prescricoes mencionadas, Exames solicitados, Orientacoes e Pontos incertos.",
            "Nao trate o resultado como final; ele sera revisado pelo profissional.",
            "",
            "Transcricao:",
            transcript,
          ].join("\n"),
        },
      ],
    }),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(JSON.stringify(body) || `Falha ao gerar resumo (${response.status}).`)
  }

  return extractResponseText(body)
}

export async function POST(request: NextRequest) {
  let attachment: AttachmentRecord | null = null

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const attachmentId = getString(body?.attachmentId)
    const medicalRecordId = getString(body?.medicalRecordId)

    if (!isUuid(attachmentId) || !isUuid(medicalRecordId)) {
      return NextResponse.json({ message: "Informe a gravação e o prontuário para processar." }, { status: 400 })
    }

    const [loadedAttachment] = await supabaseRequest<AttachmentRecord[]>(
      `medical_record_attachments?select=*&id=eq.${encodeURIComponent(attachmentId)}&medical_record_id=eq.${encodeURIComponent(medicalRecordId)}&limit=1`,
    )
    attachment = loadedAttachment ?? null

    if (!attachment?.storage_path) {
      return NextResponse.json({ message: "Gravação não encontrada no prontuário." }, { status: 404 })
    }

    const [record] = await supabaseRequest<MedicalRecord[]>(
      `medical_records?select=id,contact_name,professional_name,title,metadata&id=eq.${encodeURIComponent(medicalRecordId)}&limit=1`,
    )

    if (!record) {
      return NextResponse.json({ message: "Prontuário não encontrado." }, { status: 404 })
    }

    attachment = await patchAttachmentMetadata(attachment, {
      processing_status: "processing",
      processing_started_at: new Date().toISOString(),
    })

    const storagePath = attachment.storage_path
    if (!storagePath) {
      return NextResponse.json({ message: "Gravação sem arquivo vinculado." }, { status: 404 })
    }

    const audio = await downloadRecording(storagePath)
    const transcriptionPayload = await transcribeAudio(audio, attachment.file_name || "consulta.webm", attachment.mime_type)
    const transcript = getTranscriptText(transcriptionPayload)

    if (!transcript) {
      throw new Error("A transcrição retornou vazia.")
    }

    const summary = await summarizeTranscript(transcript, record)

    const aiMetadata = {
      ...(record.metadata ?? {}),
      ai_recording: {
        attachment_id: attachment.id,
        transcribed_at: new Date().toISOString(),
        transcription_model: TRANSCRIPTION_MODEL,
        fallback_transcription_model: FALLBACK_TRANSCRIPTION_MODEL,
        summary_model: SUMMARY_MODEL,
        has_speaker_segments: Boolean((transcriptionPayload as Record<string, unknown>)?.segments),
      },
    }

    const [updatedRecord] = await supabaseRequest<Array<Record<string, unknown>>>(
      `medical_records?id=eq.${encodeURIComponent(record.id)}&select=*`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ai_transcription: transcript,
          ai_summary: summary,
          metadata: aiMetadata,
        }),
      },
    )

    attachment = await patchAttachmentMetadata(attachment, {
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      transcription_model: TRANSCRIPTION_MODEL,
      summary_model: SUMMARY_MODEL,
    })

    return NextResponse.json({
      record: updatedRecord,
      attachment,
      transcription: transcript,
      summary,
    })
  } catch (error) {
    if (attachment) {
      await patchAttachmentMetadata(attachment, {
        processing_status: "error",
        processing_error: error instanceof Error ? error.message : "Erro ao processar gravação.",
        processing_failed_at: new Date().toISOString(),
      }).catch(() => null)
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível processar a gravação." },
      { status: 500 },
    )
  }
}
