import { createDefaultRules, ProfessionalAgenda, ProfessionalScheduleRule, WeekdayName, WEEKDAYS } from "@/lib/schedule/professional-agenda";
import { normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseProfessional = {
  id_profissional: string;
  nome: string | null;
  email: string | null;
  user_id: string | null;
  users?: { id: string; name: string | null; email: string | null } | null;
  professional_procedimentos?: Array<{ procedimentos?: SupabaseProcedure | null }>;
};

type SupabaseProcedure = {
  id: string;
  nome: string | null;
  status: string | null;
};

type AgendaRow = {
  id: string;
  id_profissional: string;
  status: string | null;
  title: string | null;
};

type RuleRow = {
  id: string;
  agenda_id: string;
  weekday: WeekdayName;
  is_open: boolean;
  position: number | null;
};

type PeriodRow = {
  id: string;
  rule_id: string;
  id_procedimento: string;
  is_enabled: boolean;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  position: number | null;
  procedimentos?: SupabaseProcedure | null;
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
  return professional.users?.name || professional.nome || professional.email || professional.users?.email || "Profissional";
}

function getProfessionalEmail(professional: SupabaseProfessional) {
  return professional.users?.email || professional.email || "";
}

function uniqueProcedures(procedures: SupabaseProcedure[]) {
  const byId = new Map<string, SupabaseProcedure>();
  for (const procedure of procedures) {
    if (procedure.id && !byId.has(procedure.id)) byId.set(procedure.id, procedure);
  }

  return Array.from(byId.values()).map((procedure) => ({
    id: procedure.id,
    name: procedure.nome || "Procedimento",
    status: procedure.status || "ativo",
  }));
}

function canManageProfessional(viewer: { role: string; email: string }, professional: SupabaseProfessional) {
  if (viewer.role === "admin") return true;
  if (!viewer.email) return false;

  const professionalEmail = getProfessionalEmail(professional).trim().toLowerCase();
  return Boolean(professionalEmail && professionalEmail === viewer.email);
}

async function getProfessionals() {
  const select = ["id_profissional,nome,email,user_id", "users:user_id(id,name,email)", "professional_procedimentos(procedimentos:id_procedimento(id,nome,status))"].join(",");

  return selectRowsFromFirstAvailableTable<SupabaseProfessional>(["profissional", "professional"], {
    select,
    order: "created_at.desc",
    limit: 1000,
  });
}

function getLinkedProcedures(professional: SupabaseProfessional) {
  const procedures = (professional.professional_procedimentos ?? []).map((link) => link.procedimentos).filter(Boolean) as SupabaseProcedure[];
  return uniqueProcedures(procedures);
}

async function getLinkedProceduresByProfessionalId(professionalId: string) {
  const links = await selectRows<{ id_procedimento: string }>("professional_procedimentos", {
    select: "id_procedimento",
    id_professional: `eq.${professionalId}`,
    limit: 1000,
  });
  const procedureIds = Array.from(new Set(links.map((link) => link.id_procedimento).filter(Boolean)));

  if (procedureIds.length === 0) return [];

  const procedures = await selectRows<SupabaseProcedure>("procedimentos", {
    select: "id,nome,status",
    id: `in.(${procedureIds.join(",")})`,
    limit: 1000,
  });

  return uniqueProcedures(procedures);
}

function localDateFromIso(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeFromIso(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function getBookedSlotsByDate(agendaId: string) {
  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 15 * 24 * 60 * 60_000);
    const bookings = await selectRows<BookingRow>("professional_agenda_bookings", {
      select: "starts_at,ends_at,status",
      agenda_id: `eq.${agendaId}`,
      starts_at: `gte.${now.toISOString()}`,
      and: `(starts_at.lte.${windowEnd.toISOString()})`,
      limit: 1000,
    });
    const blockingStatuses = new Set(["scheduled", "confirmed"]);

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
  const embeddedProcedures = getLinkedProcedures(professional);
  if (embeddedProcedures.length > 0) return embeddedProcedures;

  try {
    return await getLinkedProceduresByProfessionalId(professional.id_profissional);
  } catch {
    return [];
  }
}

async function getAgenda(professionalId: string) {
  const rows = await selectRows<AgendaRow>("professional_agendas", {
    select: "id,id_profissional,status,title",
    id_profissional: `eq.${professionalId}`,
    limit: 1,
  });

  return rows[0] ?? null;
}

async function createAgenda(professional: SupabaseProfessional, viewerEmail: string) {
  const response = await supabaseRequest("professional_agendas?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id_profissional: professional.id_profissional,
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
  const response = await supabaseRequest(`professional_agendas?id=eq.${agendaId}&select=*`, {
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
      professionalId: professional.id_profissional,
      professionalName: getProfessionalName(professional),
      professionalEmail: getProfessionalEmail(professional),
      status: "inactive",
      rules: createDefaultRules(),
    };
  }

  const rules = await selectRows<RuleRow>("professional_schedule_rules", {
    select: "id,agenda_id,weekday,is_open,position",
    agenda_id: `eq.${agenda.id}`,
    order: "position.asc",
    limit: 20,
  });

  if (rules.length === 0) {
    return {
      id: agenda.id,
      professionalId: professional.id_profissional,
      professionalName: getProfessionalName(professional),
      professionalEmail: getProfessionalEmail(professional),
      status: normalizeStatus(agenda.status),
      rules: createDefaultRules(),
    };
  }

  const ruleIds = rules.map((rule) => rule.id).join(",");
  const periods = ruleIds
    ? await selectRows<PeriodRow>("professional_schedule_periods", {
        select: "id,rule_id,id_procedimento,is_enabled,start_time,end_time,slot_duration_minutes,position,procedimentos:id_procedimento(id,nome,status)",
        rule_id: `in.(${ruleIds})`,
        order: "position.asc",
        limit: 500,
      })
    : [];

  return {
    id: agenda.id,
    professionalId: professional.id_profissional,
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
          procedureId: period.id_procedimento,
          procedureName: period.procedimentos?.nome || "Procedimento",
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
  await supabaseRequest(`professional_schedule_rules?agenda_id=eq.${agendaId}`, {
    method: "DELETE",
  });

  const ruleRows = WEEKDAYS.map((weekday, index) => {
    const rule = rules.find((item) => item.weekday === weekday);
    return {
      agenda_id: agendaId,
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
      id_procedimento: period.procedureId,
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
  const email = getString(request.nextUrl.searchParams.get("email")).toLowerCase();
  return { role, email };
}

export async function GET(request: NextRequest) {
  try {
    const viewer = getViewer(request);
    const requestedProfessionalId = getString(request.nextUrl.searchParams.get("professionalId"));
    const professionals = await getProfessionals();
    const manageableProfessionals = viewer.role === "admin" ? professionals : professionals.filter((professional) => canManageProfessional(viewer, professional));
    if (requestedProfessionalId && !manageableProfessionals.some((professional) => professional.id_profissional === requestedProfessionalId)) {
      return NextResponse.json({ message: "Voce nao pode acessar a agenda deste profissional." }, { status: 403 });
    }
    const selectedProfessional = manageableProfessionals.find((professional) => professional.id_profissional === requestedProfessionalId) ?? manageableProfessionals[0] ?? null;

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

    const agenda = await getAgenda(selectedProfessional.id_profissional);
    const procedures = await getLinkedProceduresForProfessional(selectedProfessional);
    const agendaDetails = await loadAgendaRules(selectedProfessional, agenda);
    const bookedAvailability = agenda?.id ? await getBookedSlotsByDate(agenda.id) : { bookedSlotsByDate: {}, bookedIntervalsByDate: {} };

    return NextResponse.json({
      professionals: manageableProfessionals.map((professional) => ({
        id: professional.id_profissional,
        name: getProfessionalName(professional),
        email: getProfessionalEmail(professional),
        hasUser: Boolean(professional.user_id || getProfessionalEmail(professional)),
      })),
      selectedProfessionalId: selectedProfessional.id_profissional,
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
    const professional = professionals.find((item) => item.id_profissional === professionalId);

    if (!professional || !canManageProfessional(viewer, professional)) {
      return NextResponse.json({ message: "Voce nao pode editar esta agenda." }, { status: 403 });
    }

    let agenda = await getAgenda(professional.id_profissional);
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
