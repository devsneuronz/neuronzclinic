import { NextRequest, NextResponse } from "next/server"

const SEND_MESSAGE_WEBHOOK_URL = process.env.SEND_MESSAGE_WEBHOOK_URL || "https://n8n.srv1150529.hstgr.cloud/webhook/send-message"
const FORWARD_MESSAGE_WEBHOOK_URL = process.env.FORWARD_MESSAGE_WEBHOOK_URL || SEND_MESSAGE_WEBHOOK_URL
const DELETE_MESSAGE_WEBHOOK_URL = process.env.DELETE_MESSAGE_WEBHOOK_URL || "https://n8n.srv1150529.hstgr.cloud/webhook/apagar-mensagem"
const READ_MESSAGE_WEBHOOK_URL = process.env.READ_MESSAGE_WEBHOOK_URL || "https://n8n.srv1150529.hstgr.cloud/webhook/520de9de-1b62-4987-97bf-49ee2ba938d9"

type MessageActionBody = Record<string, unknown>
type ForwardPayload = ReturnType<typeof buildForwardPayload>
type DeletePayload = ReturnType<typeof buildDeletePayload>
type ReadPayload = ReturnType<typeof buildReadPayload>

function isMessageActionBody(value: unknown): value is MessageActionBody {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getMessageType(message: MessageActionBody) {
  const source = `${getString(message.message_type)} ${getString(message.type)} ${getString(message.media_mime_type)}`.toLowerCase()

  if (source.includes("audio")) return "audio"
  if (source.includes("image") || source.includes("sticker")) return "image"
  if (source.includes("video")) return "video"
  if (source.includes("document") || source.includes("application/") || source.includes("file")) return "document"
  if (getString(message.media_url)) return "document"
  return "text"
}

function getFileName(message: MessageActionBody) {
  const explicitName = getString(message.filename) || getString(message.fileName)
  if (explicitName) return explicitName

  const source = getString(message.media_path) || getString(message.media_url)
  const name = source.split("?")[0]?.split("/").pop()
  return name ? decodeURIComponent(name) : "file"
}

function buildForwardPayload(message: MessageActionBody, targetChatId: string) {
  const type = getMessageType(message)
  const content = getString(message.content) || getString(message.text) || getString(message.caption)
  const mediaUrl = getString(message.public_media_url) || getString(message.media_url)

  if (type === "text") {
    return {
      type: "text",
      chat_id: targetChatId,
      number: targetChatId,
      text: content,
      content,
    }
  }

  return {
    type,
    chat_id: targetChatId,
    number: targetChatId,
    media_url: mediaUrl,
    caption: content,
    filename: getFileName(message),
    media_mime_type: getString(message.media_mime_type) || null,
  }
}

function buildDeletePayload(message: MessageActionBody, fallbackChatId: string) {
  return {
    remoteJid: getString(message.chat_id) || getString(message.remoteJid) || fallbackChatId,
    messageId: getString(message.message_id) || getString(message.messageId) || getString(message.id),
    fromMe: Boolean(message.from_me ?? message.fromMe),
  }
}

function buildReadPayload(chatId: string, messages: MessageActionBody[]) {
  const readMessages = messages
    .map((message) => ({
      remoteJid: getString(message.chat_id) || getString(message.remoteJid) || chatId,
      messageId: getString(message.message_id) || getString(message.messageId) || getString(message.id),
      fromMe: Boolean(message.from_me ?? message.fromMe),
      participant: getString(message.participant) || null,
    }))
    .filter((message) => message.messageId)

  return {
    type: "read",
    action: "read",
    chat_id: chatId,
    number: chatId,
    remoteJid: chatId,
    message_ids: readMessages.map((message) => message.messageId),
    read_messages: readMessages,
    messages: readMessages,
  }
}

async function postWebhook(webhookUrl: string, payload: unknown) {
  const webhookResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const webhookText = await webhookResponse.text()
  const webhookBody = webhookText
    ? (() => {
        try {
          return JSON.parse(webhookText)
        } catch {
          return webhookText
        }
      })()
    : null

  return {
    ok: webhookResponse.ok,
    status: webhookResponse.status,
    body: webhookBody,
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsedBody = await request.json()
    const body = isMessageActionBody(parsedBody) ? parsedBody : {}
    const action = String(body.action || "").trim()

    if (action !== "forward" && action !== "delete" && action !== "read") {
      return NextResponse.json({ message: "Acao de mensagem invalida." }, { status: 400 })
    }

    if (action === "forward") {
      const targetChatId = getString(body.target_chat_id) || getString(body.chat_id)
      const messages: MessageActionBody[] = Array.isArray(body.messages) ? body.messages.filter(isMessageActionBody) : [body]
      const payloads: ForwardPayload[] = messages.map((message) => buildForwardPayload(message, targetChatId))

      if (!targetChatId || payloads.length === 0) {
        return NextResponse.json({ message: "target_chat_id e mensagens sao obrigatórios." }, { status: 400 })
      }

      const invalidMediaPayload = payloads.find((payload: ForwardPayload) => payload.type !== "text" && !("media_url" in payload && payload.media_url))
      const invalidTextPayload = payloads.find((payload: ForwardPayload) => payload.type === "text" && !payload.text)

      if (invalidMediaPayload || invalidTextPayload) {
        return NextResponse.json({ message: "Mensagem sem conteudo encaminhavel." }, { status: 400 })
      }

      const results: Array<{ payload: ForwardPayload; webhook: unknown; status: number }> = []

      for (const payload of payloads) {
        const result = await postWebhook(FORWARD_MESSAGE_WEBHOOK_URL, payload)
        results.push({ payload, webhook: result.body, status: result.status })

        if (!result.ok) {
          return NextResponse.json(
            {
              message: "Webhook recusou o encaminhamento.",
              details: result.body,
              payload,
            },
            { status: result.status },
          )
        }
      }

      return NextResponse.json({ ok: true, count: results.length, results })
    }

    if (action === "read") {
      const chatId = getString(body.chat_id) || getString(body.remoteJid)
      const messages: MessageActionBody[] = Array.isArray(body.messages) ? body.messages.filter(isMessageActionBody) : []
      const payload: ReadPayload = buildReadPayload(chatId, messages)

      if (!chatId) {
        return NextResponse.json({ message: "chat_id e obrigatório." }, { status: 400 })
      }

      const result = await postWebhook(READ_MESSAGE_WEBHOOK_URL, payload)

      if (!result.ok) {
        return NextResponse.json(
          {
            message: "Webhook recusou a confirmação de leitura.",
            details: result.body,
            payload,
          },
          { status: result.status },
        )
      }

      return NextResponse.json({ ok: true, count: payload.read_messages.length, payload, webhook: result.body })
    }

    const fallbackChatId = getString(body.chat_id) || getString(body.remoteJid)
    const messages: MessageActionBody[] = Array.isArray(body.messages) ? body.messages.filter(isMessageActionBody) : [body]
    const payloads: DeletePayload[] = messages.map((message) => buildDeletePayload(message, fallbackChatId))

    if (payloads.some((payload: DeletePayload) => !payload.remoteJid || !payload.messageId)) {
      return NextResponse.json({ message: "remoteJid e messageId sao obrigatórios." }, { status: 400 })
    }

    const results: Array<{ payload: DeletePayload; webhook: unknown; status: number }> = []

    for (const payload of payloads) {
      const result = await postWebhook(DELETE_MESSAGE_WEBHOOK_URL, payload)
      results.push({ payload, webhook: result.body, status: result.status })

      if (!result.ok) {
        return NextResponse.json(
          {
            message: "Webhook recusou o apagamento.",
            details: result.body,
            payload,
          },
          { status: result.status },
        )
      }
    }

    return NextResponse.json({ ok: true, count: results.length, results })
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Não foi possível executar a ação da mensagem.",
      },
      { status: 500 },
    )
  }
}
