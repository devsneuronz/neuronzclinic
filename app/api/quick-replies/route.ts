import type { QuickReplyInput, QuickReplyRecord } from "@/lib/supabase-rest";
import { NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type AuthUserResponse = {
  id?: string;
  email?: string;
};

type UserProfileRow = {
  id: string;
  email: string;
  status: string | null;
};

async function supabaseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_REST_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null as T;

  return response.json() as Promise<T>;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getSupabaseBaseUrl() {
  const baseUrl = SUPABASE_URL ?? SUPABASE_REST_URL?.replace(/\/rest\/v1\/?$/, "");
  return baseUrl?.replace(/\/$/, "") ?? null;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
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
    const byAuthId = await supabaseRequest<UserProfileRow[]>(`user_profiles?select=id,email,status&auth_user_id=eq.${encodeURIComponent(authUser.id)}&limit=1`);
    if (byAuthId[0]) return byAuthId[0];
  }

  if (!authUser.email) return null;

  const byEmail = await supabaseRequest<UserProfileRow[]>(`user_profiles?select=id,email,status&email=eq.${encodeURIComponent(authUser.email.toLowerCase())}&limit=1`);
  return byEmail[0] ?? null;
}

async function requireCurrentUser(request: Request) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    throw Object.assign(new Error("Sessão ausente."), { status: 401 });
  }

  const authUser = await fetchAuthUser(accessToken);

  if (!authUser?.id || !authUser.email) {
    throw Object.assign(new Error("Sessão inválida."), { status: 401 });
  }

  const profile = await fetchProfile(authUser);

  if (!profile || profile.status !== "active") {
    throw Object.assign(new Error("Usuário sem perfil ativo."), { status: 403 });
  }

  return { authUser, profile };
}

function normalizeShortcut(value: string) {
  return value.trim().replace(/^\/+/, "");
}

function buildPayload(input: Partial<QuickReplyInput>) {
  const shortcut = typeof input.shortcut === "string" ? normalizeShortcut(input.shortcut) : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";

  if (!shortcut) throw new Error("Informe o atalho.");
  if (!/^[\p{L}\p{N}._-]+$/u.test(shortcut)) throw new Error("Use apenas letras, números, ponto, hífen ou underline no atalho.");
  if (!content) throw new Error("Informe o texto da resposta rápida.");

  return {
    shortcut,
    content,
    is_active: input.isActive ?? true,
  };
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const rawMessage = error instanceof Error ? error.message : "";

  try {
    const parsed = JSON.parse(rawMessage) as { message?: string; error?: { message?: string } };
    return parsed.message || parsed.error?.message || rawMessage || fallback;
  } catch {
    return rawMessage || fallback;
  }
}

function getErrorStatus(error: unknown) {
  if (error instanceof Error && "status" in error && typeof error.status === "number") return error.status;
  return 500;
}

export async function GET(request: Request) {
  try {
    const { authUser } = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const activeFilter = activeOnly ? "&is_active=is.true" : "";
    const replies = await supabaseRequest<QuickReplyRecord[]>(`quick_replies?select=*&auth_user_id=eq.${encodeURIComponent(authUser.id)}&order=shortcut.asc&order=created_at.desc${activeFilter}`);

    return NextResponse.json({ replies });
  } catch (error) {
    return NextResponse.json({ replies: [], message: getApiErrorMessage(error, "Não foi possível carregar respostas rápidas.") }, { status: getErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { authUser, profile } = await requireCurrentUser(request);
    const body = (await request.json()) as Partial<QuickReplyInput>;
    const payload = {
      ...buildPayload(body),
      auth_user_id: authUser.id,
      user_profile_id: profile.id,
      created_by: authUser.email,
      updated_by: authUser.email,
    };
    const [reply] = await supabaseRequest<QuickReplyRecord[]>("quick_replies", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: getApiErrorMessage(error, "Não foi possível criar a resposta rápida.") }, { status: getErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { authUser } = await requireCurrentUser(request);
    const body = (await request.json()) as Partial<QuickReplyInput> & { id?: string };
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!isUuid(id)) return NextResponse.json({ message: "Resposta rápida inválida." }, { status: 400 });

    const [reply] = await supabaseRequest<QuickReplyRecord[]>(`quick_replies?id=eq.${encodeURIComponent(id)}&auth_user_id=eq.${encodeURIComponent(authUser.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ ...buildPayload(body), updated_by: authUser.email }),
    });

    if (!reply) return NextResponse.json({ message: "Resposta rápida não encontrada." }, { status: 404 });

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json({ message: getApiErrorMessage(error, "Não foi possível atualizar a resposta rápida.") }, { status: getErrorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const { authUser } = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim() || "";

    if (!isUuid(id)) return NextResponse.json({ message: "Resposta rápida inválida." }, { status: 400 });

    await supabaseRequest<unknown>(`quick_replies?id=eq.${encodeURIComponent(id)}&auth_user_id=eq.${encodeURIComponent(authUser.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    return NextResponse.json({ id, message: "Resposta rápida removida." });
  } catch (error) {
    return NextResponse.json({ message: getApiErrorMessage(error, "Não foi possível remover a resposta rápida.") }, { status: getErrorStatus(error) });
  }
}
