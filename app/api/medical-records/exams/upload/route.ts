import { NextRequest, NextResponse } from "next/server"

const EXAM_WEBHOOK_URL = process.env.MEDICAL_EXAM_WEBHOOK_URL || "https://n8n.srv1150529.hstgr.cloud/webhook/pdf-exame"
const MAX_FILE_SIZE = 25 * 1024 * 1024

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isAllowedExamFile(file: File) {
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  return mimeType === "application/pdf" || mimeType.startsWith("image/") || fileName.endsWith(".pdf")
}

async function readWebhookResponse(response: Response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function POST(request: NextRequest) {
  try {
    const incomingForm = await request.formData()
    const fileValue = incomingForm.get("file")
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null

    if (!file) {
      return NextResponse.json({ message: "Selecione um PDF ou imagem para enviar." }, { status: 400 })
    }

    if (!isAllowedExamFile(file)) {
      return NextResponse.json({ message: "Envie apenas PDF ou imagem para resultado/exame." }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: "O arquivo deve ter no máximo 25 MB." }, { status: 400 })
    }

    const patientName = getString(incomingForm.get("paciente_nome")) || getString(incomingForm.get("contact_name"))
    const status = getString(incomingForm.get("status")) || "Recebido"
    const idaContato = getString(incomingForm.get("ida-contato")) || getString(incomingForm.get("contact_id"))
    const idaAgendamento = getString(incomingForm.get("ida-agendamento")) || getString(incomingForm.get("appointment_id"))

    if (!patientName) {
      return NextResponse.json({ message: "Paciente obrigatório para envio do exame." }, { status: 400 })
    }

    const mimeType = file.type || "application/octet-stream"
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64")
    const webhookPayload: Record<string, string> = {
      paciente_nome: patientName,
      status,
      mime_type: mimeType,
      arquivo_nome: file.name || "exame",
      arquivo_base64: `data:${mimeType};base64,${base64}`,
      source: "medical-records",
    }

    if (idaContato) webhookPayload["ida-contato"] = idaContato
    if (idaAgendamento) webhookPayload["ida-agendamento"] = idaAgendamento

    const metadataFields = [
      "chat_id",
      "contact_phone",
      "appointment_label",
      "medical_record_id",
      "user_email",
    ]

    for (const field of metadataFields) {
      const value = getString(incomingForm.get(field))
      if (value) webhookPayload[field] = value
    }

    const webhookResponse = await fetch(EXAM_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload),
    })

    const webhookBody = await readWebhookResponse(webhookResponse)

    if (!webhookResponse.ok) {
      return NextResponse.json(
        {
          message: "Webhook recusou o envio do exame.",
          details: webhookBody,
        },
        { status: webhookResponse.status },
      )
    }

    return NextResponse.json({ ok: true, webhook: webhookBody })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível enviar o exame." },
      { status: 500 },
    )
  }
}
