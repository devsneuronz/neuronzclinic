import { NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FINAL_INTERACTION_STATUSES = ["unreviewed", "pending", "processing"];

type AuthUserResponse = {
  id?: string;
  email?: string;
};

type UserProfileRow = {
  id: string;
  status: string | null;
};

type InteractionHistoryDecisionRow = {
  id: string;
  training_batch_id: string | null;
  received: string | null;
  ia_response: string | null;
  corrected_response: string | null;
  quality: string | null;
  training_status: string;
  training_decision: string | null;
  similarity_score: number | string | null;
  training_analysis: string | null;
  training_error: string | null;
  training_issues: unknown;
  has_critical_change: boolean | null;
  human_quality_consistent: boolean | null;
  training_attempts: number;
  training_processed_at: string | null;
  occurred_at: string | null;
  created_at: string;
  updated_at: string;
};

function getSupabaseBaseUrl() {
  const baseUrl = SUPABASE_URL ?? SUPABASE_REST_URL?.replace(/\/rest\/v1\/?$/, "");
  return baseUrl?.replace(/\/$/, "") ?? null;
}

function getRestConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase REST configuration for AI training.");
  return { url: SUPABASE_REST_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function getErrorMessage(error: unknown, fallback: string) {
  const rawMessage = error instanceof Error ? error.message : "";
  try {
    const parsed = JSON.parse(rawMessage) as { message?: string; error?: { message?: string } };
    return parsed.message || parsed.error?.message || rawMessage || fallback;
  } catch {
    return rawMessage || fallback;
  }
}

async function supabaseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, key } = getRestConfig();
  const response = await fetch(`${url}/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text);
  if (!text.trim()) return null as T;
  return JSON.parse(text) as T;
}

async function fetchAuthUser(accessToken: string) {
  const baseUrl = getSupabaseBaseUrl();

  if (!baseUrl || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing Supabase Auth configuration.");

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

async function fetchActiveProfile(authUser: AuthUserResponse) {
  if (authUser.id) {
    const byAuthId = await supabaseRequest<UserProfileRow[]>(`user_profiles?select=id,status&auth_user_id=eq.${encodeURIComponent(authUser.id)}&limit=1`);
    if (byAuthId[0]) return byAuthId[0];
  }

  if (!authUser.email) return null;

  const byEmail = await supabaseRequest<UserProfileRow[]>(`user_profiles?select=id,status&email=eq.${encodeURIComponent(authUser.email.toLowerCase())}&limit=1`);
  return byEmail[0] ?? null;
}

async function requireActiveSession(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) return { error: NextResponse.json({ message: "Sessao ausente." }, { status: 401 }) };

  const authUser = await fetchAuthUser(accessToken);
  if (!authUser?.id || !authUser.email) return { error: NextResponse.json({ message: "Sessao invalida." }, { status: 401 }) };

  const profile = await fetchActiveProfile(authUser);
  if (!profile || profile.status !== "active") return { error: NextResponse.json({ message: "Usuario sem perfil ativo." }, { status: 403 }) };

  return { error: null };
}

export async function GET(request: Request) {
  try {
    const session = await requireActiveSession(request);
    if (session.error) return session.error;

    const decisionsParams = new URLSearchParams({
      select: "id,training_batch_id,received,ia_response,corrected_response,quality,training_status,training_decision,similarity_score,training_analysis,training_error,training_issues,has_critical_change,human_quality_consistent,training_attempts,training_processed_at,occurred_at,created_at,updated_at",
      is_active: "is.true",
      deleted_at: "is.null",
      training_status: `not.in.(${FINAL_INTERACTION_STATUSES.join(",")})`,
      order: "updated_at.desc",
      limit: "500",
    });

    const decisions = await supabaseRequest<InteractionHistoryDecisionRow[]>(`interaction_history?${decisionsParams}`);

    return NextResponse.json({ decisions });
  } catch (error) {
    return NextResponse.json({ decisions: [], message: getErrorMessage(error, "Nao foi possivel carregar os dados de treinamento.") }, { status: 500 });
  }
}
