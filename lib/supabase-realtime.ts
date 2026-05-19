const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

type PostgresChangeEvent = "INSERT" | "UPDATE" | "DELETE" | "*"

export interface SupabasePostgresChangePayload<T = Record<string, unknown>> {
  eventType: PostgresChangeEvent
  schema: string
  table: string
  record: T | null
  oldRecord: Partial<T> | null
}

interface RealtimeChangeConfig {
  event?: PostgresChangeEvent
  schema?: string
  table: string
}

interface RealtimeMessage {
  event?: string
  topic?: string
  payload?: unknown
  ref?: string | null
}

type RealtimePayload = Record<string, unknown>

function getRealtimeUrl() {
  if (!SUPABASE_REST_URL || !SUPABASE_PUBLISHABLE_KEY) return null

  try {
    const restUrl = new URL(SUPABASE_REST_URL)
    const basePath = restUrl.pathname.replace(/\/rest\/v1\/?$/, "")
    restUrl.protocol = restUrl.protocol === "http:" ? "ws:" : "wss:"
    restUrl.pathname = `${basePath}/realtime/v1/websocket`
    restUrl.search = new URLSearchParams({
      apikey: SUPABASE_PUBLISHABLE_KEY,
      vsn: "1.0.0",
    }).toString()

    return restUrl.toString()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is RealtimePayload {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizePayload(payload: unknown): SupabasePostgresChangePayload | null {
  if (!isRecord(payload)) return null

  const data = isRecord(payload.data) ? payload.data : payload
  const table = typeof data.table === "string" ? data.table : typeof payload.table === "string" ? payload.table : ""
  const schema = typeof data.schema === "string" ? data.schema : typeof payload.schema === "string" ? payload.schema : "public"
  const eventType = typeof data.type === "string" ? data.type : typeof data.eventType === "string" ? data.eventType : "*"
  const record = isRecord(data.record) ? data.record : null
  const oldRecord = isRecord(data.old_record) ? data.old_record : isRecord(data.oldRecord) ? data.oldRecord : null

  if (!table) return null

  return {
    eventType: eventType as PostgresChangeEvent,
    schema,
    table,
    record,
    oldRecord,
  }
}

export function createSupabaseRealtimeSubscription(
  changes: RealtimeChangeConfig[],
  onChange: (payload: SupabasePostgresChangePayload) => void,
) {
  const url = getRealtimeUrl()

  if (!url || typeof window === "undefined") return null

  const socketUrl = url
  let ref = 1
  let heartbeatId: number | undefined
  let reconnectId: number | undefined
  let socket: WebSocket | null = null
  let isClosed = false

  const topic = `realtime:neuronzclinic-${crypto.randomUUID()}`

  function nextRef() {
    ref += 1
    return String(ref)
  }

  function send(event: string, payload: unknown, messageTopic = topic) {
    if (socket?.readyState !== WebSocket.OPEN) return

    socket.send(
      JSON.stringify({
        topic: messageTopic,
        event,
        payload,
        ref: nextRef(),
      }),
    )
  }

  function connect() {
    if (isClosed) return

    socket = new WebSocket(socketUrl)

    socket.addEventListener("open", () => {
      send("phx_join", {
        access_token: SUPABASE_PUBLISHABLE_KEY,
        config: {
          postgres_changes: changes.map((change) => ({
            event: change.event ?? "*",
            schema: change.schema ?? "public",
            table: change.table,
          })),
          broadcast: { self: false },
          presence: { key: "" },
        },
      })

      heartbeatId = window.setInterval(() => {
        send("heartbeat", {}, "phoenix")
      }, 25000)
    })

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as RealtimeMessage
      if (message.event !== "postgres_changes") return

      const payload = normalizePayload(message.payload)
      if (payload) onChange(payload)
    })

    socket.addEventListener("close", () => {
      if (heartbeatId) window.clearInterval(heartbeatId)
      heartbeatId = undefined

      if (!isClosed) {
        reconnectId = window.setTimeout(connect, 3000)
      }
    })

    socket.addEventListener("error", () => {
      socket?.close()
    })
  }

  connect()

  return () => {
    isClosed = true
    if (heartbeatId) window.clearInterval(heartbeatId)
    if (reconnectId) window.clearTimeout(reconnectId)
    socket?.close()
  }
}
