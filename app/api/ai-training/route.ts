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

type AiTrainingExampleEmbeddingRow = {
  interaction_history_id: string;
  embedding_model: string | null;
};

type InteractionHistoryDecisionWithEmbedding = InteractionHistoryDecisionRow & {
  embedding_model: string | null;
};

type UpdateTrainingBody = {
  id?: unknown;
  quality?: unknown;
  correctedResponse?: unknown;
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

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

async function fetchEmbeddingModelByInteractionId(id: string) {
  const params = new URLSearchParams({
    select: "embedding_model",
    interaction_history_id: `eq.${id}`,
    is_active: "is.true",
    embedding_model: "not.is.null",
    limit: "1",
  });
  const rows = await supabaseRequest<Array<{ embedding_model: string | null }>>(`ai_training_examples?${params}`);
  return rows[0]?.embedding_model ?? null;
}

async function fetchInteractionById(id: string) {
  const params = new URLSearchParams({
    select: "id,quality,corrected_response",
    id: `eq.${id}`,
    is_active: "is.true",
    deleted_at: "is.null",
    limit: "1",
  });
  const rows = await supabaseRequest<Array<{ id: string; quality: string | null; corrected_response: string | null }>>(`interaction_history?${params}`);
  return rows[0] ?? null;
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
    const embeddingsParams = new URLSearchParams({
      select: "interaction_history_id,embedding_model",
      is_active: "is.true",
      embedding_model: "not.is.null",
      limit: "10000",
    });

    const [decisions, embeddings] = await Promise.all([
      supabaseRequest<InteractionHistoryDecisionRow[]>(`interaction_history?${decisionsParams}`),
      supabaseRequest<AiTrainingExampleEmbeddingRow[]>(`ai_training_examples?${embeddingsParams}`),
    ]);
    const embeddingModelByInteractionId = new Map(embeddings.map((example) => [example.interaction_history_id, example.embedding_model]));
    const decisionsWithEmbeddings: InteractionHistoryDecisionWithEmbedding[] = decisions.map((decision) => ({
      ...decision,
      embedding_model: embeddingModelByInteractionId.get(decision.id) ?? null,
    }));

    return NextResponse.json({ decisions: decisionsWithEmbeddings });
  } catch (error) {
    return NextResponse.json({ decisions: [], message: getErrorMessage(error, "Nao foi possivel carregar os dados de treinamento.") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireActiveSession(request);
    if (session.error) return session.error;

    const body = (await request.json()) as UpdateTrainingBody;
    const id = getString(body.id);
    const quality = getString(body.quality);
    const correctedResponse = getString(body.correctedResponse);
    const shouldUpdateQuality = Object.prototype.hasOwnProperty.call(body, "quality");
    const shouldUpdateCorrectedResponse = Object.prototype.hasOwnProperty.call(body, "correctedResponse");

    if (!id) return NextResponse.json({ message: "Interacao invalida." }, { status: 400 });
    if (!shouldUpdateQuality && !shouldUpdateCorrectedResponse) return NextResponse.json({ message: "Nenhuma alteracao informada." }, { status: 400 });

    const embeddingModel = await fetchEmbeddingModelByInteractionId(id);
    if (embeddingModel) {
      return NextResponse.json({ message: "Este item ja foi transformado em embedding e nao pode ser editado." }, { status: 409 });
    }

    const existing = await fetchInteractionById(id);
    if (!existing) return NextResponse.json({ message: "Interacao nao encontrada." }, { status: 404 });

    const nextQuality = shouldUpdateQuality ? quality : getString(existing.quality);
    const nextCorrectedResponse = shouldUpdateCorrectedResponse ? correctedResponse : getString(existing.corrected_response);
    const nextTrainingStatus = nextQuality || nextCorrectedResponse ? "pending" : "unreviewed";
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      quality: nextQuality || null,
      corrected_response: nextCorrectedResponse || null,
      training_status: nextTrainingStatus,
      training_decision: null,
      similarity_score: null,
      training_analysis: null,
      training_error: null,
      training_issues: null,
      has_critical_change: null,
      human_quality_consistent: null,
      training_processed_at: null,
      training_processing_started_at: null,
      training_batch_id: null,
      source: "supabase",
    };

    await supabaseRequest<unknown>(`interaction_history?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({ message: nextTrainingStatus === "pending" ? "Item atualizado e reenfileirado." : "Item atualizado como nao revisado.", trainingStatus: nextTrainingStatus });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, "Nao foi possivel atualizar o item de treinamento.") }, { status: 500 });
  }
}
