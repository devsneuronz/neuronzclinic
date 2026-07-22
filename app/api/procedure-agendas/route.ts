import { WEEKDAY_LABELS, type WeekdayName } from "@/lib/schedule/professional-agenda";
import { isFallbackAdminEmail, normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type AgendaRow = {
  id: string;
  id_profissional: string;
  status: string | null;
  professional?: {
    id: string;
    name: string | null;
    email: string | null;
    users?: { name: string | null; email: string | null } | null;
  } | null;
};

type RuleRow = {
  id: string;
  agenda_id: string;
  weekday: WeekdayName;
};

type PeriodRow = {
  rule_id: string;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_enabled: boolean;
};

type LinkRow = {
  agenda_id: string;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function getProfessionalName(agenda: AgendaRow) {
  const professional = agenda.professional;
  return professional?.users?.name || professional?.name || professional?.email || professional?.users?.email || "Profissional";
}

function getSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration.");
  }

  return { url: SUPABASE_REST_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY };
}

function getViewer(request: NextRequest, body?: { role?: unknown; email?: unknown } | null) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role") ?? body?.role);
  const email = getString(request.nextUrl.searchParams.get("email") ?? body?.email).toLowerCase();
  return { role, email };
}

function requireAdmin(request: NextRequest, body?: { role?: unknown; email?: unknown } | null) {
  const viewer = getViewer(request, body);
  if (viewer.role !== "admin" && !isFallbackAdminEmail(viewer.email)) {
    return NextResponse.json({ message: "Apenas administradores podem vincular agendas a procedimentos." }, { status: 403 });
  }
  return null;
}

async function supabaseRequest(path: string, init?: RequestInit) {
  const { url, key } = getSupabaseConfig();
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

  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response;
}

async function selectRows<T>(table: string, query: Record<string, string | number>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));

  const response = await supabaseRequest(`${table}?${params}`);
  return response.json() as Promise<T[]>;
}

async function getSavedLinks(procedureId: string) {
  try {
    return await selectRows<LinkRow>("procedure_agendas", {
      select: "agenda_id",
      id_procedimento: `eq.${procedureId}`,
      limit: 1000,
    });
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const procedureId = getString(request.nextUrl.searchParams.get("procedureId"));
    if (!procedureId) return NextResponse.json({ message: "Procedimento obrigatorio." }, { status: 400 });

    const agendas = await selectRows<AgendaRow>("professional_agendas", {
      select: "id,id_profissional,status,professional:professionals!professional_agendas_ida_profissional_fkey(id,name,email,users:user_id(name,email))",
      order: "created_at.desc",
      limit: 1000,
    });
    const agendaIds = agendas.map((agenda) => agenda.id).filter(Boolean);

    if (agendaIds.length === 0) return NextResponse.json({ agendas: [] });

    const rules = await selectRows<RuleRow>("professional_schedule_rules", {
      select: "id,agenda_id,weekday",
      agenda_id: `in.(${agendaIds.join(",")})`,
      limit: 1000,
    });
    const ruleIds = rules.map((rule) => rule.id).filter(Boolean);

    if (ruleIds.length === 0) return NextResponse.json({ agendas: [] });

    const periods = await selectRows<PeriodRow>("professional_schedule_periods", {
      select: "rule_id,start_time,end_time,slot_duration_minutes,is_enabled",
      rule_id: `in.(${ruleIds.join(",")})`,
      id_procedimento: `eq.${procedureId}`,
      is_enabled: "eq.true",
      order: "start_time.asc",
      limit: 1000,
    });
    const linkedAgendaIds = new Set((await getSavedLinks(procedureId)).map((link) => link.agenda_id));
    const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
    const periodsByAgenda = new Map<string, Array<{ weekday: WeekdayName; label: string }>>();

    for (const period of periods) {
      const rule = rulesById.get(period.rule_id);
      if (!rule) continue;

      const items = periodsByAgenda.get(rule.agenda_id) ?? [];
      items.push({
        weekday: rule.weekday,
        label: `${WEEKDAY_LABELS[rule.weekday]} ${normalizeTime(period.start_time)}-${normalizeTime(period.end_time)} (${period.slot_duration_minutes}min)`,
      });
      periodsByAgenda.set(rule.agenda_id, items);
    }

    const availableAgendas = agendas
      .filter((agenda) => periodsByAgenda.has(agenda.id))
      .map((agenda) => ({
        id: agenda.id,
        professionalId: agenda.id_profissional,
        professionalName: getProfessionalName(agenda),
        status: agenda.status || "active",
        periods: periodsByAgenda.get(agenda.id) ?? [],
        linked: linkedAgendaIds.has(agenda.id),
      }));

    return NextResponse.json({ agendas: availableAgendas });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel carregar as agendas do procedimento." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { procedureId?: unknown; agendaIds?: unknown; role?: unknown; email?: unknown } | null;
    const unauthorized = requireAdmin(request, body);
    if (unauthorized) return unauthorized;

    const procedureId = getString(body?.procedureId);
    const agendaIds = Array.isArray(body?.agendaIds) ? Array.from(new Set(body.agendaIds.map(getString).filter(Boolean))) : [];

    if (!procedureId) return NextResponse.json({ message: "Procedimento obrigatorio." }, { status: 400 });

    await supabaseRequest(`procedure_agendas?id_procedimento=eq.${encodeURIComponent(procedureId)}`, { method: "DELETE" });

    if (agendaIds.length > 0) {
      await supabaseRequest("procedure_agendas", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(agendaIds.map((agendaId) => ({ id_procedimento: procedureId, agenda_id: agendaId }))),
      });
    }

    return NextResponse.json({ ok: true, agendaIds });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel salvar as agendas vinculadas." }, { status: 500 });
  }
}
