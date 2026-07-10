import { NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type RawRecord = Record<string, unknown>;

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
      ...init?.headers,
    },
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) throw new Error(text);
  if (!text.trim()) return null;

  return JSON.parse(text);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function GET(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = getString(searchParams.get("chatId"));
    if (!chatId) return NextResponse.json({ runs: [] });

    const runs = (await supabaseRequest(
      `routine_runs?chat_id=eq.${encodeURIComponent(chatId)}&status=eq.running&order=started_at.desc&limit=20&select=id,routine_name`,
    )) as RawRecord[];
    if (runs.length === 0) return NextResponse.json({ runs: [] });

    const runIds = unique(runs.map((run) => getString(run.id)));
    const actionRuns = (await supabaseRequest(
      `routine_action_runs?routine_run_id=in.(${runIds.map(encodeURIComponent).join(",")})&select=id,routine_run_id,status`,
    )) as RawRecord[];

    const mappedRuns = runs
      .map((run) => {
        const routineRunId = getString(run.id);
        const actions = actionRuns.filter((actionRun) => getString(actionRun.routine_run_id) === routineRunId);
        const pendingActions = actions.filter((actionRun) => getString(actionRun.status) === "pending");
        const doneActions = actions.filter((actionRun) => getString(actionRun.status) === "done");

        return {
          routineName: getString(run.routine_name) || "Automacao manual",
          routineRunIds: [routineRunId],
          actionRunIds: pendingActions.map((actionRun) => getString(actionRun.id)),
          executedCount: doneActions.length,
          scheduledCount: pendingActions.length,
        };
      })
      .filter((run) => run.scheduledCount > 0);

    if (mappedRuns.length === 0) return NextResponse.json({ runs: [] });

    return NextResponse.json({
      runs: [
        {
          routineName: mappedRuns.length === 1 ? mappedRuns[0].routineName : `${mappedRuns.length} automacoes em andamento`,
          routineRunIds: mappedRuns.flatMap((run) => run.routineRunIds),
          actionRunIds: mappedRuns.flatMap((run) => run.actionRunIds),
          executedCount: mappedRuns.reduce((total, run) => total + run.executedCount, 0),
          scheduledCount: mappedRuns.reduce((total, run) => total + run.scheduledCount, 0),
        },
      ],
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel carregar automacoes em andamento." }, { status: 500 });
  }
}
