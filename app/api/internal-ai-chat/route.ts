import { getInternalAiChatId } from "@/lib/internal-ai-chat";
import { normalizeUserRole } from "@/lib/user-roles";
import { NextResponse } from "next/server";

const INTERNAL_AI_WEBHOOK_URL = process.env.INTERNAL_AI_CHAT_WEBHOOK_URL;
const INTERNAL_AI_TIMEOUT_MS = 90000;
const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_AI_INSTANCE_ID = process.env.INTERNAL_AI_CHAT_INSTANCE_ID;
const INTERNAL_AI_CHAT_ENABLED = false;

const CHAT_SELECT = [
  "id",
  "chat_id",
  "nome_contato",
  "pushname",
  "phone_contact",
  "cidade_residencia",
  "cidade_desejada",
  "email_contato",
  "ida_contato",
  "url_foto_perfil",
  "text_last_message",
  "last_message_time",
  "last_time_formatado",
  "unread_count",
  "pinned",
  "archived",
  "finalizada",
  "ia_responde",
  "last_message_fromMe",
  "Status_chat",
  "hex_status",
  "json_tags",
  "json_tags_parsed",
  "tag_chat_array",
  "json_interesses",
  "dono",
  "setor",
  "grupo",
  "draft",
  "lid_id",
  "updated_at",
  "chat_state_override",
].join(",");

const MESSAGE_SELECT = [
  "id",
  "message_id",
  "from_me",
  "chat_id",
  "participant",
  "message_type",
  "content",
  "media_url",
  "media_path",
  "media_mime_type",
  "public_media_url",
  "public_midia_thumb",
  "timestamp_msg",
  "status",
  "quoted_message_id",
  "metadata",
  "is_deleted",
].join(",");

type AuthUserResponse = {
  id?: string;
  email?: string;
};

type UserProfileRow = {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  role: string | null;
  status: string | null;
};

type ChatRow = {
  id: string;
  chat_id: string;
  nome_contato: string | null;
  pushname: string | null;
  text_last_message: string | null;
  last_message_time: string | null;
};

type MessageRow = {
  id: string;
  message_id: string;
  from_me: boolean;
  chat_id: string;
  content: string | null;
  timestamp_msg: string;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requireWebhookUrl(value: string | undefined, envName: string) {
  if (!value) throw new Error(`Configure ${envName} no .env.local.`);
  return value;
}

function getSupabaseBaseUrl() {
  const baseUrl = SUPABASE_URL ?? SUPABASE_REST_URL?.replace(/\/rest\/v1\/?$/, "");
  return baseUrl?.replace(/\/$/, "") ?? null;
}

function getRestConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration.");
  }

  return { url: SUPABASE_REST_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function findText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value !== "object") return "";

  if (Array.isArray(value)) {
    return value.map(findText).find(Boolean) || "";
  }

  const record = value as Record<string, unknown>;
  const directText = ["reply", "response", "answer", "message", "text", "output", "content", "body"].map((key) => getString(record[key])).find(Boolean);

  if (directText) return directText;

  return ["data", "result", "json"].map((key) => findText(record[key])).find(Boolean) || "";
}

async function supabaseRequest<T>(path: string, init?: RequestInit) {
  const { url, key } = getRestConfig();
  const response = await fetch(`${url}/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text || `Supabase ${response.status}`);
  if (!text.trim()) return null as T;
  return JSON.parse(text) as T;
}

async function fetchAuthUser(accessToken: string) {
  const baseUrl = getSupabaseBaseUrl();

  if (!baseUrl || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase Auth configuration.");
  }

  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  return response.json() as Promise<AuthUserResponse>;
}

async function fetchProfile(authUser: AuthUserResponse) {
  if (authUser.id) {
    const byAuthId = await supabaseRequest<UserProfileRow[]>(`user_profiles?select=id,auth_user_id,email,name,role,status&auth_user_id=eq.${encodeURIComponent(authUser.id)}&limit=1`);
    if (byAuthId[0]) return byAuthId[0];
  }

  if (!authUser.email) return null;

  const byEmail = await supabaseRequest<UserProfileRow[]>(`user_profiles?select=id,auth_user_id,email,name,role,status&email=eq.${encodeURIComponent(authUser.email.toLowerCase())}&limit=1`);
  return byEmail[0] ?? null;
}

async function requireAdminProfile(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) throw new Error("Sessao ausente.");

  const authUser = await fetchAuthUser(accessToken);
  if (!authUser?.id || !authUser.email) throw new Error("Sessao invalida.");

  const profile = await fetchProfile(authUser);
  if (!profile || profile.status !== "active") throw new Error("Usuario sem perfil ativo.");
  if (normalizeUserRole(profile.role) !== "admin") throw new Error("Apenas administradores podem usar este chat.");

  return profile;
}

async function getInternalAiInstanceId() {
  if (INTERNAL_AI_INSTANCE_ID) return INTERNAL_AI_INSTANCE_ID;

  const rows = await supabaseRequest<Array<{ id: string }>>("instances?select=id&order=created_at.asc&limit=1");
  const instanceId = rows[0]?.id;
  if (!instanceId) throw new Error("Nenhuma instancia encontrada para criar o chat interno da IA.");
  return instanceId;
}

async function fetchInternalAiChat(profile: UserProfileRow) {
  const chatId = getInternalAiChatId(profile.id);
  const rows = await supabaseRequest<ChatRow[]>(`chats?select=${CHAT_SELECT}&chat_id=eq.${encodeURIComponent(chatId)}&limit=1`);
  return rows[0] ?? null;
}

async function ensureInternalAiChat(profile: UserProfileRow) {
  const existing = await fetchInternalAiChat(profile);
  if (existing) return existing;

  const instanceId = await getInternalAiInstanceId();
  const now = new Date().toISOString();
  const [created] = await supabaseRequest<ChatRow[]>("chats?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      chat_id: getInternalAiChatId(profile.id),
      instance_id: instanceId,
      user_id: profile.id,
      nome_contato: "Secretaria IA",
      pushname: "Secretaria IA",
      text_last_message: "",
      last_message_time: now,
      unread_count: 0,
      pinned: true,
      archived: false,
      finalizada: false,
      ia_responde: true,
      last_message_fromMe: false,
      Status_chat: "ADM",
      hex_status: "#14b8a6",
      url_foto_perfil: "https://www.imprimerie.lyon.fr/sites/micg/files/styles/vignette_345x345/public/2022-03/happymac_2.jpg?h=58b0b6bf&itok=7kNVXKPq",
      json_tags_parsed: [],
      tag_chat_array: [],
      json_interesses: [],
      setor: [],
      grupo: false,
      chat_state_override: "entrada",
      updated_at: now,
    }),
  });

  return created;
}

async function fetchInternalAiMessages(chatId: string, limit = 80) {
  const rows = await supabaseRequest<MessageRow[]>(`messages?select=${MESSAGE_SELECT}&chat_id=eq.${encodeURIComponent(chatId)}&order=timestamp_msg.desc&limit=${limit}`);
  return [...rows].reverse();
}

async function insertInternalAiMessage({ chat, content, fromMe }: { chat: ChatRow; content: string; fromMe: boolean }) {
  const now = new Date().toISOString();
  const [message] = await supabaseRequest<MessageRow[]>("messages?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      message_id: `internal-ai-${crypto.randomUUID()}`,
      from_me: fromMe,
      chat_id: chat.chat_id,
      chat_table_id: chat.id,
      message_type: "text",
      content,
      timestamp_msg: now,
      status: fromMe ? "sent" : "read",
      metadata: {
        source: "internal_ai_chat",
      },
      instance_id: await getInternalAiInstanceId(),
    }),
  });

  await supabaseRequest(`chats?id=eq.${encodeURIComponent(chat.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      text_last_message: content,
      last_message_time: now,
      last_message_fromMe: fromMe,
      updated_at: now,
    }),
  });

  return message;
}

export async function GET(request: Request) {
  try {
    if (!INTERNAL_AI_CHAT_ENABLED) {
      return NextResponse.json({ chat: null, messages: [] });
    }

    const profile = await requireAdminProfile(request);
    const chat = await ensureInternalAiChat(profile);
    const messages = await fetchInternalAiMessages(chat.chat_id);

    return NextResponse.json({ chat, messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel carregar o chat interno da IA.";
    return NextResponse.json({ message }, { status: /Apenas|Sessao|Usuario/.test(message) ? 403 : 500 });
  }
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INTERNAL_AI_TIMEOUT_MS);

  try {
    if (!INTERNAL_AI_CHAT_ENABLED) {
      return NextResponse.json({ message: "Chat interno da IA temporariamente desativado." }, { status: 404 });
    }

    const profile = await requireAdminProfile(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const text = getString(body?.text);

    if (!text) {
      return NextResponse.json({ message: "Digite uma mensagem para a IA." }, { status: 400 });
    }

    const chat = await ensureInternalAiChat(profile);
    const userMessage = await insertInternalAiMessage({ chat, content: text, fromMe: true });

    const webhookResponse = await fetch(requireWebhookUrl(INTERNAL_AI_WEBHOOK_URL, "INTERNAL_AI_CHAT_WEBHOOK_URL"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: chat.chat_id,
        userId: profile.id,
        text,
        message: text,
        user: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: normalizeUserRole(profile.role),
        },
        chat: {
          id: chat.id,
          chat_id: chat.chat_id,
        },
        source: "neuronzclinic_internal_chat",
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const webhookText = await webhookResponse.text();
    const webhookBody = webhookText
      ? (() => {
          try {
            return JSON.parse(webhookText);
          } catch {
            return webhookText;
          }
        })()
      : null;

    if (!webhookResponse.ok) {
      return NextResponse.json(
        {
          message: "A IA recusou a mensagem.",
          userMessage,
          details: webhookBody,
        },
        { status: webhookResponse.status },
      );
    }

    const reply = findText(webhookBody) || "A IA respondeu sem texto visivel.";
    const assistantMessage = await insertInternalAiMessage({ chat, content: reply, fromMe: false });
    const updatedChat = await fetchInternalAiChat(profile);

    return NextResponse.json({
      chat: updatedChat ?? chat,
      userMessage,
      assistantMessage,
      reply,
      webhook: webhookBody,
    });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "A IA demorou para responder. Tente novamente." : error instanceof Error ? error.message : "Nao foi possivel conversar com a IA.";
    return NextResponse.json({ message }, { status: /Apenas|Sessao|Usuario/.test(message) ? 403 : 500 });
  } finally {
    clearTimeout(timeoutId);
  }
}
