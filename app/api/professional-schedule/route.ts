import { createDefaultRules, ProfessionalAgenda, ProfessionalScheduleRule, WeekdayName, WEEKDAYS } from "@/lib/professional-schedule";
import { normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseProfessional = {
  id: string;
  name: string | null;
  email: string | null;
  user_id: string | null;
  metadata?: Record<string, unknown> | null;
  user_profile?: { id: string; name: string | null; email: string | null } | null;
};

type SupabaseProcedure = {
  id: string;
  name: string | null;
  interest: string | null;
  interest_tag_id: string | null;
  status: boolean | null;
};

type LinkedProcedureRow = {
  id_professional: string;
  clinic_procedures?: SupabaseProcedure | null;
};

type TagRow = {
  id: string;
  color: string | null;
};

type AgendaRow = {
  id: string;
  id_profissional: string;
  status: string | null;
  title: string | null;
};

type RuleRow = {
  id: string;
  schedule_id: string;
  weekday: WeekdayName;
  is_open: boolean;
  position: number | null;
};

type PeriodRow = {
  id: string;
  rule_id: string;
  id_procedure: string;
  is_enabled: boolean;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  position: number | null;
  clinic_procedures?: SupabaseProcedure | null;
};

type BookingRow = {
  starts_at: string;
  ends_at: string | null;
  status: string | null;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown) {
  return value === "inactive" ? "inactive" : "active";
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function getSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for professional agendas.");
  }

  return {
    url: SUPABASE_REST_URL.replace(/\/$/, ""),
    key: SUPABASE_SERVICE_ROLE_KEY,
  };
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

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  }

  return response;
}

async function selectRows<T>(table: string, query: Record<string, string | number>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    params.set(key, String(value));
  }

  const response = await supabaseRequest(`${table}?${params}`);
  return response.json() as Promise<T[]>;
}

async function selectRowsFromFirstAvailableTable<T>(tables: string[], query: Record<string, string | number>) {
  let lastError: unknown;

  for (const table of tables) {
    try {
      return await selectRows<T>(table, query);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function getProfessionalName(professional: SupabaseProfessional) {
  return professional.user_profile?.name || professional.name || professional.user_profile?.email || professional.email || "Profissional";
}

function getProfessionalEmail(professional: SupabaseProfessional) {
  return professional.user_profile?.email || professional.email || "";
}

async function getTagColorsById(tagIds: string[]) {
  const ids = Array.from(new Set(tagIds.filter(Boolean)));
  if (ids.length === 0) return new Map<string, string>();

  const tags = await selectRows<TagRow>("tags", {
    select: "id,color",
    id: `in.(${ids.join(",")})`,
    limit: 1000,
  });

  return new Map(tags.filter((tag) => tag.color).map((tag) => [tag.id, tag.color as string]));
}

async function uniqueProcedures(procedures: SupabaseProcedure[]) {
  const byId = new Map<string, SupabaseProcedure>();
  for (const procedure of procedures) {
    if (procedure.id && !byId.has(procedure.id)) byId.set(procedure.id, procedure);
  }
  const tagColors = await getTagColorsById(Array.from(byId.values()).map((procedure) => procedure.interest_tag_id ?? ""));

  return Array.from(byId.values()).map((procedure) => ({
    id: procedure.id,
    name: procedure.name || procedure.interest || "Procedimento",
    status: procedure.status === false ? "inativo" : "ativo",
    color: procedure.interest_tag_id ? tagColors.get(procedure.interest_tag_id) : undefined,
  }));
}

function isLinkedProfessional(viewer: { userId: string; email: string }, professional: SupabaseProfessional) {
  if (viewer.userId && (professional.user_id === viewer.userId || professional.user_profile?.id === viewer.userId)) return true;
  if (!viewer.email) return false;

  const professionalEmail = getProfessionalEmail(professional).trim().toLowerCase();
  return Boolean(professionalEmail && professionalEmail === viewer.email);
}

function canManageProfessional(viewer: { role: string; userId: string; email: string }, professional: SupabaseProfessional) {
  if (viewer.role === "admin") return true;
  return isLinkedProfessional(viewer, professional);
}

async function getProfessionals() {
  return selectRowsFromFirstAvailableTable<SupabaseProfessional>(["professionals"], {
    select: "id,name,email,user_id,user_profile:user_profiles!professionals_user_id_fkey(id,name,email)",
    status: "eq.active",
    order: "name.asc",
    limit: 1000,
  });
}

async function getLinkedProceduresByProfessionalId(professionalId: string) {
  const links = await selectRows<LinkedProcedureRow>("professional_procedimentos", {
    select: "id_professional,clinic_procedures:id_procedimento(id,name,interest,interest_tag_id,status)",
    id_professional: `eq.${professionalId}`,
    limit: 1000,
  });

  const procedures = links.map((link) => link.clinic_procedures).filter((procedure): procedure is SupabaseProcedure => Boolean(procedure?.id));
  return uniqueProcedures(procedures);
}

function localDateFromIso(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "";
}

function localTimeFromIso(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;

  return hour && minute ? `${hour}:${minute}` : "";
}

async function getBookedSlotsByDate(agendaId: string) {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60_000);
    const windowEnd = new Date(now.getTime() + 15 * 24 * 60 * 60_000);
    const bookings = await selectRows<BookingRow>("professional_schedule_bookings", {
      select: "starts_at,ends_at,status",
      professional_schedule_id: `eq.${agendaId}`,
      starts_at: `gte.${windowStart.toISOString()}`,
      and: `(starts_at.lte.${windowEnd.toISOString()})`,
      limit: 1000,
    });
    const blockingStatuses = new Set(["blocked", "scheduled", "confirmed"]);

    const bookedSlotsByDate: Record<string, string[]> = {};
    const bookedIntervalsByDate: Record<string, Array<{ start: string; end: string }>> = {};

    for (const booking of bookings) {
      if (!blockingStatuses.has(booking.status ?? "")) continue;

      const date = localDateFromIso(booking.starts_at);
      const start = localTimeFromIso(booking.starts_at);
      const end = booking.ends_at ? localTimeFromIso(booking.ends_at) : start;
      if (!date || !start || !end) continue;

      bookedSlotsByDate[date] = [...(bookedSlotsByDate[date] ?? []), start];
      bookedIntervalsByDate[date] = [...(bookedIntervalsByDate[date] ?? []), { start, end }];
    }

    return { bookedSlotsByDate, bookedIntervalsByDate };
  } catch {
    return { bookedSlotsByDate: {}, bookedIntervalsByDate: {} };
  }
}

async function getLinkedProceduresForProfessional(professional: SupabaseProfessional) {
  try {
    return await getLinkedProceduresByProfessionalId(professional.id);
  } catch {
    return [];
  }
}

async function getAgenda(professionalId: string) {
  const rows = await selectRows<AgendaRow>("professional_schedule", {
    select: "id,id_profissional,status,title",
    id_profissional: `eq.${professionalId}`,
    limit: 1,
  });

  return rows[0] ?? null;
}

async function createAgenda(professional: SupabaseProfessional, viewerEmail: string) {
  const response = await supabaseRequest("professional_schedule?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id_profissional: professional.id,
      status: "active",
      title: getProfessionalName(professional),
      created_by_email: viewerEmail || null,
      updated_by_email: viewerEmail || null,
    }),
  });

  const rows = (await response.json()) as AgendaRow[];
  return rows[0];
}

async function updateAgenda(agendaId: string, status: string, viewerEmail: string) {
  const response = await supabaseRequest(`professional_schedule?id=eq.${agendaId}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: normalizeStatus(status),
      updated_by_email: viewerEmail || null,
      updated_at: new Date().toISOString(),
    }),
  });

  const rows = (await response.json()) as AgendaRow[];
  return rows[0];
}

async function loadAgendaRules(professional: SupabaseProfessional, agenda: AgendaRow | null): Promise<ProfessionalAgenda> {
  if (!agenda) {
    return {
      id: null,
      professionalId: professional.id,
      professionalName: getProfessionalName(professional),
      professionalEmail: getProfessionalEmail(professional),
      status: "inactive",
      rules: createDefaultRules(),
    };
  }

  const rules = await selectRows<RuleRow>("professional_schedule_rules", {
    select: "id,schedule_id,weekday,is_open,position",
    schedule_id: `eq.${agenda.id}`,
    order: "position.asc",
    limit: 20,
  });

  if (rules.length === 0) {
    return {
      id: agenda.id,
      professionalId: professional.id,
      professionalName: getProfessionalName(professional),
      professionalEmail: getProfessionalEmail(professional),
      status: normalizeStatus(agenda.status),
      rules: createDefaultRules(),
    };
  }

  const ruleIds = rules.map((rule) => rule.id).join(",");
  const periods = ruleIds
    ? await selectRows<PeriodRow>("professional_schedule_periods", {
        select: "id,rule_id,id_procedure,is_enabled,start_time,end_time,slot_duration_minutes,position,clinic_procedures:id_procedure(id,name,interest,interest_tag_id,status)",
        rule_id: `in.(${ruleIds})`,
        order: "position.asc",
        limit: 500,
      })
    : [];
  const tagColors = await getTagColorsById(periods.map((period) => period.clinic_procedures?.interest_tag_id ?? ""));

  return {
    id: agenda.id,
    professionalId: professional.id,
    professionalName: getProfessionalName(professional),
    professionalEmail: getProfessionalEmail(professional),
    status: normalizeStatus(agenda.status),
    rules: WEEKDAYS.map((weekday, index) => {
      const rule = rules.find((item) => item.weekday === weekday);
      const rulePeriods = rule ? periods.filter((period) => period.rule_id === rule.id) : [];

      return {
        id: rule?.id ?? `new-${weekday}`,
        weekday,
        isOpen: rule?.is_open ?? (index >= 1 && index <= 5),
        periods: rulePeriods.map((period) => ({
          id: period.id,
          procedureId: period.id_procedure,
          procedureName: period.clinic_procedures?.name || period.clinic_procedures?.interest || "Procedimento",
          procedureColor: period.clinic_procedures?.interest_tag_id ? tagColors.get(period.clinic_procedures.interest_tag_id) : undefined,
          enabled: period.is_enabled,
          startTime: normalizeTime(period.start_time),
          endTime: normalizeTime(period.end_time),
          slotDurationMinutes: period.slot_duration_minutes,
        })),
      };
    }),
  };
}

function validateRules(rules: ProfessionalScheduleRule[], allowedProcedureIds: Set<string>) {
  if (!Array.isArray(rules) || rules.length !== 7) {
    throw new Error("A agenda precisa conter os 7 dias da semana.");
  }

  for (const rule of rules) {
    if (!WEEKDAYS.includes(rule.weekday)) throw new Error("Dia da semana invalido.");
    if (!Array.isArray(rule.periods)) throw new Error("Periodos invalidos.");

    for (const period of rule.periods) {
      if (!allowedProcedureIds.has(period.procedureId)) {
        throw new Error("Procedimento indisponivel para este profissional.");
      }

      if (!/^\d{2}:\d{2}$/.test(period.startTime) || !/^\d{2}:\d{2}$/.test(period.endTime)) {
        throw new Error("Horario invalido.");
      }

      const duration = Number(period.slotDurationMinutes);
      if (!Number.isInteger(duration) || duration < 5 || duration > 240) {
        throw new Error("A duracao deve ficar entre 5 e 240 minutos.");
      }

      if (timeToMinutes(period.startTime) >= timeToMinutes(period.endTime)) {
        throw new Error("O inicio do bloco precisa ser antes do fim.");
      }
    }

    if (!rule.isOpen) continue;

    const activePeriods = rule.periods
      .filter((period) => period.enabled)
      .map((period) => ({
        startTime: period.startTime,
        endTime: period.endTime,
        start: timeToMinutes(period.startTime),
        end: timeToMinutes(period.endTime),
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end);

    for (let index = 1; index < activePeriods.length; index += 1) {
      const previous = activePeriods[index - 1];
      const current = activePeriods[index];

      if (current.start < previous.end) {
        throw new Error(`Blocos ativos nao podem sobrepor horarios. Ajuste ${previous.startTime}-${previous.endTime} e ${current.startTime}-${current.endTime}.`);
      }
    }
  }
}

async function replaceRules(agendaId: string, rules: ProfessionalScheduleRule[]) {
  await supabaseRequest(`professional_schedule_rules?schedule_id=eq.${agendaId}`, {
    method: "DELETE",
  });

  const ruleRows = WEEKDAYS.map((weekday, index) => {
    const rule = rules.find((item) => item.weekday === weekday);
    return {
      schedule_id: agendaId,
      weekday,
      is_open: rule?.isOpen ?? false,
      position: index,
    };
  });

  const rulesResponse = await supabaseRequest("professional_schedule_rules", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(ruleRows),
  });
  const insertedRules = (await rulesResponse.json()) as RuleRow[];
  const insertedByWeekday = new Map(insertedRules.map((rule) => [rule.weekday, rule]));

  const periodRows = rules.flatMap((rule) => {
    const insertedRule = insertedByWeekday.get(rule.weekday);
    if (!insertedRule) return [];

    return rule.periods.map((period, index) => ({
      rule_id: insertedRule.id,
      id_procedure: period.procedureId,
      is_enabled: period.enabled,
      start_time: period.startTime,
      end_time: period.endTime,
      slot_duration_minutes: Number(period.slotDurationMinutes),
      position: index,
    }));
  });

  if (periodRows.length > 0) {
    await supabaseRequest("professional_schedule_periods", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(periodRows),
    });
  }
}

function getViewer(request: NextRequest) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role"));
  const userId = getString(request.nextUrl.searchParams.get("userId"));
  const email = getString(request.nextUrl.searchParams.get("email")).toLowerCase();
  return { role, userId, email };
}

export async function GET(request: NextRequest) {
  try {
    const viewer = getViewer(request);
    const requestedProfessionalId = getString(request.nextUrl.searchParams.get("professionalId"));
    const preferLinkedOnly = request.nextUrl.searchParams.get("preferLinkedOnly") === "true";
    const professionals = await getProfessionals();
    const manageableProfessionals = viewer.role === "admin" ? professionals : professionals.filter((professional) => canManageProfessional(viewer, professional));
    const linkedProfessional = manageableProfessionals.find((professional) => isLinkedProfessional(viewer, professional));
    const selectedProfessional = manageableProfessionals.find((professional) => professional.id === requestedProfessionalId) ?? linkedProfessional ?? (preferLinkedOnly ? null : manageableProfessionals[0] ?? null);

    if (!selectedProfessional) {
      return NextResponse.json({
        professionals: [],
        procedures: [],
        agenda: null,
        canCreateAgenda: false,
        canEditAgenda: false,
        message: "Nenhum profissional vinculado a este usuario.",
      });
    }

    const agenda = await getAgenda(selectedProfessional.id);
    const procedures = await getLinkedProceduresForProfessional(selectedProfessional);
    const agendaDetails = await loadAgendaRules(selectedProfessional, agenda);
    const bookedAvailability = agenda?.id ? await getBookedSlotsByDate(agenda.id) : { bookedSlotsByDate: {}, bookedIntervalsByDate: {} };

    return NextResponse.json({
      professionals: manageableProfessionals.map((professional) => ({
        id: professional.id,
        name: getProfessionalName(professional),
        email: getProfessionalEmail(professional),
        hasUser: Boolean(professional.user_id || getProfessionalEmail(professional)),
      })),
      selectedProfessionalId: selectedProfessional.id,
      procedures,
      agenda: agendaDetails,
      bookedSlotsByDate: bookedAvailability.bookedSlotsByDate,
      bookedIntervalsByDate: bookedAvailability.bookedIntervalsByDate,
      canCreateAgenda: viewer.role === "admin",
      canEditAgenda: viewer.role === "admin" || Boolean(agenda),
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel carregar a agenda." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = getViewer(request);
    const body = (await request.json().catch(() => null)) as { professionalId?: unknown; status?: unknown; rules?: ProfessionalScheduleRule[] } | null;
    const professionalId = getString(body?.professionalId);

    if (!professionalId) {
      return NextResponse.json({ message: "Profissional obrigatorio." }, { status: 400 });
    }

    const professionals = await getProfessionals();
    const professional = professionals.find((item) => item.id === professionalId);

    if (!professional || !canManageProfessional(viewer, professional)) {
      return NextResponse.json({ message: "Voce nao pode editar esta agenda." }, { status: 403 });
    }

    let agenda = await getAgenda(professional.id);
    if (!agenda && viewer.role !== "admin") {
      return NextResponse.json({ message: "A agenda ainda nao existe. Apenas administradores podem criar agendas." }, { status: 403 });
    }

    const procedures = await getLinkedProceduresForProfessional(professional);
    validateRules(body?.rules ?? [], new Set(procedures.map((procedure) => procedure.id)));

    if (!agenda) {
      agenda = await createAgenda(professional, viewer.email);
    }

    const updatedAgenda = await updateAgenda(agenda.id, getString(body?.status), viewer.email);
    await replaceRules(updatedAgenda.id, body?.rules ?? []);

    return NextResponse.json({
      agenda: await loadAgendaRules(professional, updatedAgenda),
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel salvar a agenda." }, { status: 400 });
  }
}
