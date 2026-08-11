import { NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type RawRecord = Record<string, unknown>;

function getIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item))));
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite === "same-origin" || fetchSite === "none") return true;
  if (!origin || !host) return false;

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host && (!fetchSite || fetchSite === "same-origin");
  } catch {
    return false;
  }
}

function getSupabaseRestUrl() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_REST_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }

  return SUPABASE_REST_URL.replace(/\/$/, "");
}

async function supabaseRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${getSupabaseRestUrl()}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) throw new Error(text);
  if (!text.trim()) return null;

  return JSON.parse(text);
}

function idInFilter(ids: string[]) {
  return `in.(${ids.map(encodeURIComponent).join(",")})`;
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { routineRunIds?: unknown; actionRunIds?: unknown };
    const routineRunIds = getIds(body.routineRunIds);
    const actionRunIds = getIds(body.actionRunIds);

    if (routineRunIds.length === 0 && actionRunIds.length === 0) {
      return NextResponse.json({ message: "Informe a execucao da rotina ou as acoes para cancelar." }, { status: 400 });
    }

    const actionFilter = actionRunIds.length ? `id=${idInFilter(actionRunIds)}` : `routine_run_id=${idInFilter(routineRunIds)}`;
    const canceledActions = (await supabaseRequest(`routine_action_runs?status=in.(pending,retrying)&${actionFilter}&select=id`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "canceled", last_error: "Cancelado manualmente pelo atendimento." }),
    })) as RawRecord[] | null;

    if (routineRunIds.length > 0) {
      await supabaseRequest(`routine_runs?id=${idInFilter(routineRunIds)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "canceled", finished_at: new Date().toISOString() }),
      });
    }

    return NextResponse.json({
      canceledActionRuns: canceledActions?.length ?? 0,
      message: "Acoes pendentes canceladas.",
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel cancelar a rotina." }, { status: 500 });
  }
}
