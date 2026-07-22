import { ensureContactAndChat } from "@/lib/contact-chat-sync";
import { getBrazilPhoneVariants, isUuid } from "@/lib/supabase-server";
import { normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_STATUS_ID = "30ab85a3-b35d-4065-b173-a6a029a4b58f";
const APPOINTMENT_SELECT =
  "id,appointment_status_id,modality,appointment_procedure_type_id,dataHoraInicio,dataHoraFim,professional_id,chat_id,observacoes,appointment_status:appointment_status_id(id,status),appointment_procedure_type:appointment_procedure_type_id(id,tipo),chats:chat_id(id,nome_contato,phone_contact,chat_id)";

type ProfessionalRow = {
  id: string;
  name: string | null;
  email: string | null;
  user_id: string | null;
};

type AgendaRow = {
  id: string;
  id_profissional: string;
  title: string | null;
  status: string | null;
};

type BookingRow = {
  id: string;
  professional_schedule_id: string;
  professional_id: string;
  appointment_id: string | null;
  source: string | null;
  status: string | null;
  starts_at: string;
  ends_at: string | null;
};

type AppointmentRow = {
  id: string;
  professional_id: string | null;
  appointment_status_id: string;
  modality: string;
  appointment_procedure_type_id: string | null;
  dataHoraInicio: string;
  dataHoraFim: string;
  chat_id: string;
  observacoes: string | null;
  appointment_status?: { id: string; status: string } | null;
  appointment_procedure_type?: { id: string; tipo: string } | null;
  chats?: { id: string; nome_contato: string | null; phone_contact: string | null; chat_id: string | null } | null;
};

type ContactRow = {
  id: string;
  chat_id: string | null;
  alt_chat_id: string | null;
  name: string | null;
  phone: string | null;
};
type ChatRow = { id: string; chat_id: string | null; phone_contact: string | null };

type IaRequestRow = {
  id: string;
  status: string | null;
  chosen_date: string | null;
  procedure_id: string | null;
  situation: string | null;
  context: string | null;
  chat_id: string | null;
  action: string | null;
  professional_schedule_id: string | null;
};

type ProcedureRow = { id: string; name: string | null; interest: string | null };
type RuleRow = { id: string; schedule_id: string; weekday: string | null };
type PeriodRow = { rule_id: string; id_procedure: string; start_time: string; end_time: string; slot_duration_minutes: number | null };

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function localDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function weekdayFromLocalDateKey(dateKey: string) {
  const [year = "0", month = "1", day = "1"] = dateKey.split("-");
  const date = new Date(`${year}-${month}-${day}T12:00:00-03:00`);
  return weekdays[date.getUTCDay()] || "";
}

function localTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

function timeToMinutes(time: string) {
  const [hour = "0", minute = "0"] = time.slice(0, 5).split(":");
  return Number(hour) * 60 + Number(minute);
}

function getSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration.");
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
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));

  const response = await supabaseRequest(`${table}?${params}`);
  return response.json() as Promise<T[]>;
}

async function findChatRow({ patientId, chatId, contactPhone }: { patientId: string; chatId: string; contactPhone: string }) {
  if (isUuid(patientId)) {
    const rows = await selectRows<ChatRow>("chats", {
      select: "id,chat_id,phone_contact",
      id: `eq.${patientId}`,
      limit: 1,
    });
    if (rows[0]) return rows[0];
  }

  const filters: string[] = [];
  if (chatId) {
    const value = encodeURIComponent(chatId);
    filters.push(`chat_id.eq.${value}`);
    if (isUuid(chatId)) filters.push(`id.eq.${value}`);
  }
  for (const variant of getBrazilPhoneVariants(contactPhone || chatId)) {
    filters.push(`phone_contact.eq.${encodeURIComponent(variant)}`, `chat_id.ilike.*${encodeURIComponent(variant)}*`);
  }
  if (filters.length === 0) return null;

  const rows = await selectRows<ChatRow>("chats", {
    select: "id,chat_id,phone_contact",
    or: `(${filters.join(",")})`,
    limit: 1,
  });
  return rows[0] ?? null;
}

async function findOrCreateChatRowId(body: Record<string, unknown>) {
  const patientId = getString(body.patientId);

  const chatId = getString(body.chatId);
  const phone = getString(body.patientPhone) || getString(body.contactPhone);
  const name = getString(body.patientName);
  const found = await findChatRow({ patientId, chatId, contactPhone: phone });
  if (found) return found.id;
  if (!name && !phone && !chatId) return null;

  const { chat } = await ensureContactAndChat({ patientId, name: name || phone || chatId, phone, chatId, status: "Novo" });
  return chat?.id ?? null;
}

function getProfessionalEmail(professional: ProfessionalRow) {
  return professional.email || "";
}

function getProfessionalName(professional: ProfessionalRow) {
  return professional.name || professional.email || "Profissional";
}

function isActiveIaRequest(row: IaRequestRow) {
  const status = normalizeText(row.status || "");
  return !["confirmed", "confirmado", "done", "completed", "resolved", "resolvido", "canceled", "cancelled", "cancelado"].includes(status);
}

function canManageProfessional(viewer: { role: string; email: string }, professional: ProfessionalRow) {
  if (viewer.role === "admin") return true;
  const professionalEmail = getProfessionalEmail(professional).trim().toLowerCase();
  return Boolean(viewer.email && professionalEmail && professionalEmail === viewer.email);
}

async function getProfessionals() {
  return selectRows<ProfessionalRow>("professionals", {
    select: "id,name,email,user_id",
    active: "is.true",
    order: "name.asc",
    limit: 1000,
  });
}

async function getAgenda(professionalId: string) {
  const rows = await selectRows<AgendaRow>("professional_schedule", {
    select: "id,id_profissional,title,status",
    id_profissional: `eq.${professionalId}`,
    limit: 1,
  });

  return rows[0] ?? null;
}

async function getAgendas(professionalIds: string[]) {
  if (professionalIds.length === 0) return [];

  return selectRows<AgendaRow>("professional_schedule", {
    select: "id,id_profissional,title,status",
    id_profissional: `in.(${professionalIds.map(encodeURIComponent).join(",")})`,
    limit: 1000,
  });
}

async function getContext(request: NextRequest, requestedProfessionalId?: string) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role"));
  const email = getString(request.nextUrl.searchParams.get("email")).toLowerCase();
  const professionals = await getProfessionals();
  const manageableProfessionals = role === "admin" ? professionals : professionals.filter((professional) => canManageProfessional({ role, email }, professional));
  const professional = requestedProfessionalId
    ? manageableProfessionals.find((item) => item.id === requestedProfessionalId)
    : manageableProfessionals[0] ?? null;

  if (!professional) throw new Error("Nenhum profissional vinculado a este usuario.");

  const agenda = await getAgenda(professional.id);
  if (!agenda) throw new Error("Agenda profissional ainda nao criada.");

  return { role, email, professional, agenda };
}

async function insertAppointment(body: Record<string, unknown>, context: { professional: ProfessionalRow }) {
  const chatRowId = await findOrCreateChatRowId(body);
  const startsAt = getString(body.startDateTime);
  if (!startsAt) throw new Error("Informe a data e hora do agendamento.");
  if (!chatRowId) throw new Error("Paciente nao encontrado.");

  const response = await supabaseRequest(`appointments?select=${APPOINTMENT_SELECT}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      professional_id: context.professional.id,
      appointment_status_id: isUuid(getString(body.status)) ? getString(body.status) : DEFAULT_STATUS_ID,
      appointment_procedure_type_id: isUuid(getString(body.type)) ? getString(body.type) : null,
      modality: getString(body.attendanceMode) || "Presencial",
      dataHoraInicio: new Date(startsAt).toISOString(),
      dataHoraFim: getString(body.endDateTime) ? new Date(getString(body.endDateTime)).toISOString() : new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(),
      chat_id: chatRowId,
      observacoes: getString(body.observations) || null,
    }),
  });

  const rows = (await response.json()) as AppointmentRow[];
  return rows[0] ?? null;
}

async function updateAppointment(appointmentId: string, body: Record<string, unknown>, context: { professional: ProfessionalRow }) {
  const chatRowId = await findOrCreateChatRowId(body);
  const startsAt = getString(body.startDateTime);
  if (!startsAt) throw new Error("Informe a data e hora do agendamento.");
  if (!chatRowId) throw new Error("Paciente nao encontrado.");

  const response = await supabaseRequest(`appointments?id=eq.${encodeURIComponent(appointmentId)}&select=${APPOINTMENT_SELECT}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      professional_id: context.professional.id,
      appointment_status_id: isUuid(getString(body.status)) ? getString(body.status) : DEFAULT_STATUS_ID,
      appointment_procedure_type_id: isUuid(getString(body.type)) ? getString(body.type) : null,
      modality: getString(body.attendanceMode) || "Presencial",
      dataHoraInicio: new Date(startsAt).toISOString(),
      dataHoraFim: getString(body.endDateTime) ? new Date(getString(body.endDateTime)).toISOString() : new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(),
      chat_id: chatRowId,
      observacoes: getString(body.observations) || null,
    }),
  });

  const rows = (await response.json()) as AppointmentRow[];
  return rows[0] ?? null;
}

function mapBooking(row: BookingRow, professional: ProfessionalRow, appointment?: AppointmentRow | null) {
  const isAppointment = Boolean(appointment);

  return {
    id: row.id,
    status: appointment?.appointment_status?.status || row.status || "scheduled",
    type: appointment?.appointment_procedure_type?.tipo || "Consulta",
    attendanceMode: appointment?.modality || "Manual",
    startDateTime: appointment?.dataHoraInicio || row.starts_at,
    endDateTime: appointment?.dataHoraFim || row.ends_at || row.starts_at,
    professionalId: professional.id,
    professional: getProfessionalName(professional),
    patientId: appointment?.chat_id || "",
    patient: isAppointment ? appointment?.chats?.nome_contato || appointment?.chats?.phone_contact || "Paciente sem nome" : "Bloqueio",
    phone: appointment?.chats?.phone_contact || "",
    observations: appointment?.observacoes || row.source || "manual",
  };
}

async function mapBookings(rows: BookingRow[], professional: ProfessionalRow) {
  const appointmentIds = Array.from(new Set(rows.map((row) => row.appointment_id).filter((id): id is string => Boolean(id))));
  const appointments =
    appointmentIds.length > 0
      ? await selectRows<AppointmentRow>("appointments", {
          select: APPOINTMENT_SELECT,
          id: `in.(${appointmentIds.map(encodeURIComponent).join(",")})`,
          limit: 1000,
        })
      : [];

  const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment]));

  return rows.map((row) => {
    const appointment = row.appointment_id ? appointmentById.get(row.appointment_id) : null;
    return mapBooking(row, professional, appointment);
  });
}

async function mapBookingsForProfessionals(rows: BookingRow[], professionalsById: Map<string, ProfessionalRow>) {
  const rowsByProfessionalId = new Map<string, BookingRow[]>();
  for (const row of rows) {
    if (!row.professional_id) continue;
    rowsByProfessionalId.set(row.professional_id, [...(rowsByProfessionalId.get(row.professional_id) ?? []), row]);
  }

  const mapped = await Promise.all(
    Array.from(rowsByProfessionalId.entries()).map(([professionalId, professionalRows]) => {
      const professional = professionalsById.get(professionalId);
      return professional ? mapBookings(professionalRows, professional) : Promise.resolve([]);
    }),
  );

  return mapped.flat();
}

async function mapIaRequestIntentions(rows: IaRequestRow[], professional: ProfessionalRow, agendaId: string, bookingsBySource: Map<string, BookingRow>) {
  const activeRows = rows.filter((row) => row.chosen_date && isActiveIaRequest(row));
  const procedureIds = Array.from(new Set(activeRows.map((row) => row.procedure_id).filter((id): id is string => Boolean(id))));
  const contactIds = Array.from(new Set(activeRows.map((row) => row.chat_id).filter((id): id is string => typeof id === "string" && isUuid(id))));

  const rules = activeRows.length
    ? await selectRows<RuleRow>("professional_schedule_rules", {
        select: "id,schedule_id,weekday",
        schedule_id: `eq.${agendaId}`,
        is_open: "is.true",
        limit: 1000,
      })
    : [];
  const ruleIds = rules.map((rule) => rule.id);
  const [procedures, contacts, periods] = await Promise.all([
    procedureIds.length > 0
      ? selectRows<ProcedureRow>("clinic_procedures", {
          select: "id,name,interest",
          id: `in.(${procedureIds.map(encodeURIComponent).join(",")})`,
          limit: 1000,
        })
      : Promise.resolve([]),
    contactIds.length > 0
      ? selectRows<ContactRow>("contacts", {
          select: "id,chat_id,alt_chat_id,name,phone",
          id: `in.(${contactIds.map(encodeURIComponent).join(",")})`,
          limit: 1000,
        })
      : Promise.resolve([]),
    ruleIds.length > 0 && procedureIds.length > 0
      ? selectRows<PeriodRow>("professional_schedule_periods", {
          select: "rule_id,id_procedure,start_time,end_time,slot_duration_minutes",
          rule_id: `in.(${ruleIds.map(encodeURIComponent).join(",")})`,
          id_procedure: `in.(${procedureIds.map(encodeURIComponent).join(",")})`,
          is_enabled: "is.true",
          limit: 1000,
        })
      : Promise.resolve([]),
  ]);

  const procedureById = new Map(procedures.map((procedure) => [procedure.id, procedure]));
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

  function getDuration(row: IaRequestRow, startDate: Date) {
    const dateKey = localDateKey(startDate);
    const weekday = weekdayFromLocalDateKey(dateKey);
    const start = timeToMinutes(localTime(startDate));
    const period = periods.find((item) => {
      const rule = ruleById.get(item.rule_id);
      if (rule?.weekday !== weekday || item.id_procedure !== row.procedure_id) return false;
      return start >= timeToMinutes(item.start_time) && start < timeToMinutes(item.end_time);
    });

    return Number(period?.slot_duration_minutes) > 0 ? Number(period?.slot_duration_minutes) : 60;
  }

  return activeRows.map((row) => {
    const startDate = new Date(row.chosen_date || "");
    const booking = bookingsBySource.get(`ia_request:${row.id}`);
    const endDate = Number.isNaN(startDate.getTime()) ? null : booking?.ends_at ? new Date(booking.ends_at) : new Date(startDate.getTime() + getDuration(row, startDate) * 60_000);
    const procedure = row.procedure_id ? procedureById.get(row.procedure_id) : null;
    const contact = row.chat_id ? contactById.get(row.chat_id) : null;

    return {
      id: `ia-request:${row.id}`,
      status: "Aguardando confirmação",
      type: procedure?.name || procedure?.interest || "Solicitação IA",
      attendanceMode: "IA",
      startDateTime: row.chosen_date || "",
      endDateTime: endDate ? endDate.toISOString() : row.chosen_date || "",
      professionalId: professional.id,
      professional: getProfessionalName(professional),
      patientId: contact?.id || "",
      patient: contact?.name || contact?.phone || "Intenção de agendamento",
      phone: contact?.phone || "",
      observations: [row.situation, row.context].filter(Boolean).join("\n\n") || row.action || "Intenção de agendamento criada pela IA.",
      source: "ia_request",
      iaRequestId: row.id,
    };
  });
}

async function mapIaRequestIntentionsForAgendas(rows: IaRequestRow[], agendasById: Map<string, AgendaRow>, professionalsById: Map<string, ProfessionalRow>, bookingsBySource: Map<string, BookingRow>) {
  const rowsByAgendaId = new Map<string, IaRequestRow[]>();
  for (const row of rows) {
    if (!row.professional_schedule_id) continue;
    rowsByAgendaId.set(row.professional_schedule_id, [...(rowsByAgendaId.get(row.professional_schedule_id) ?? []), row]);
  }

  const mapped = await Promise.all(
    Array.from(rowsByAgendaId.entries()).map(([agendaId, agendaRows]) => {
      const agenda = agendasById.get(agendaId);
      const professional = agenda ? professionalsById.get(agenda.id_profissional) : null;
      return professional ? mapIaRequestIntentions(agendaRows, professional, agendaId, bookingsBySource) : Promise.resolve([]);
    }),
  );

  return mapped.flat();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const professionalId = getString(searchParams.get("professionalId"));
    const start = getString(searchParams.get("start"));
    const end = getString(searchParams.get("end"));
    const role = normalizeUserRole(searchParams.get("role"));
    const email = getString(searchParams.get("email")).toLowerCase();
    const professionals = await getProfessionals();
    const manageableProfessionals = role === "admin" ? professionals : professionals.filter((professional) => canManageProfessional({ role, email }, professional));
    const shouldLoadAllProfessionals = role === "admin" && !professionalId;
    const context = shouldLoadAllProfessionals ? null : await getContext(request, professionalId);
    const selectedProfessionals = shouldLoadAllProfessionals ? manageableProfessionals : context ? [context.professional] : [];
    const agendas = shouldLoadAllProfessionals ? await getAgendas(selectedProfessionals.map((professional) => professional.id)) : context ? [context.agenda] : [];
    const agendaIds = agendas.map((agenda) => agenda.id);
    const agendasById = new Map(agendas.map((agenda) => [agenda.id, agenda]));
    const professionalsById = new Map(selectedProfessionals.map((professional) => [professional.id, professional]));

    if (agendaIds.length === 0) {
      return NextResponse.json({ appointments: [] });
    }

    const query: Record<string, string | number> = {
      select: "id,professional_schedule_id,professional_id,appointment_id,source,status,starts_at,ends_at",
      professional_schedule_id: agendaIds.length === 1 ? `eq.${agendaIds[0]}` : `in.(${agendaIds.map(encodeURIComponent).join(",")})`,
      order: "starts_at.asc",
      limit: 1000,
    };

    if (start) query.starts_at = `gte.${new Date(start).toISOString()}`;
    if (end) query.and = `(starts_at.lt.${new Date(end).toISOString()})`;

    const rows = await selectRows<BookingRow>("professional_schedule_bookings", query);
    const regularRows = rows.filter((row) => !row.source?.startsWith("ia_request:"));
    const bookingsBySource = new Map(rows.filter((row) => row.source).map((row) => [row.source as string, row]));
    const iaQuery: Record<string, string | number> = {
      select: "id,status,chosen_date,procedure_id,situation,context,chat_id,action,professional_schedule_id",
      professional_schedule_id: agendaIds.length === 1 ? `eq.${agendaIds[0]}` : `in.(${agendaIds.map(encodeURIComponent).join(",")})`,
      order: "chosen_date.asc",
      limit: 1000,
    };
    if (start) iaQuery.chosen_date = `gte.${new Date(start).toISOString()}`;
    if (end) iaQuery.and = `(chosen_date.lt.${new Date(end).toISOString()})`;

    const iaRequests = await selectRows<IaRequestRow>("ia_request", iaQuery);
    const mappedBookings = context ? await mapBookings(regularRows, context.professional) : await mapBookingsForProfessionals(regularRows, professionalsById);
    const mappedIaRequests = context ? await mapIaRequestIntentions(iaRequests, context.professional, context.agenda.id, bookingsBySource) : await mapIaRequestIntentionsForAgendas(iaRequests, agendasById, professionalsById, bookingsBySource);
    const appointments = [...mappedBookings, ...mappedIaRequests].sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());

    return NextResponse.json({
      appointments,
      professional: context ? { id: context.professional.id, label: getProfessionalName(context.professional) } : null,
      agendaId: context?.agenda.id ?? null,
    });
  } catch (error) {
    return NextResponse.json({ appointments: [], message: error instanceof Error ? error.message : "Nao foi possivel carregar os agendamentos." }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ message: "Dados do agendamento invalidos." }, { status: 400 });

    const professionalId = getString(body?.professionalId);
    const context = await getContext(request, professionalId);
    const startsAt = getString(body?.startDateTime);
    const endsAt = getString(body?.endDateTime);
    const status = getString(body?.status) || "blocked";

    if (!startsAt) {
      return NextResponse.json({ message: "Informe o inicio do bloqueio." }, { status: 400 });
    }

    const startDate = new Date(startsAt);
    const endDate = endsAt ? new Date(endsAt) : new Date(startDate.getTime() + 60 * 60_000);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      return NextResponse.json({ message: "Horario invalido." }, { status: 400 });
    }
    const appointment = await insertAppointment(body, context);

    const response = await supabaseRequest("professional_schedule_bookings?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        professional_schedule_id: context.agenda.id,
        professional_id: context.professional.id,
        appointment_id: appointment?.id ?? null,
        source: appointment?.id ? "appointment" : "manual",
        status: appointment?.id ? "blocked" : status,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
      }),
    });

    const rows = (await response.json()) as BookingRow[];
    const [mapped] = rows.length > 0 ? await mapBookings(rows, context.professional) : [];
    return NextResponse.json({ appointment: mapped ?? null, message: "Agendamento criado com sucesso." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel criar o agendamento." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ message: "Dados do agendamento invalidos." }, { status: 400 });

    const startsAt = getString(body?.startDateTime);
    const endsAt = getString(body?.endDateTime);
    const status = getString(body?.status) || "blocked";

    if (!id) return NextResponse.json({ message: "Agendamento obrigatorio." }, { status: 400 });
    if (!startsAt) return NextResponse.json({ message: "Informe o inicio do bloqueio." }, { status: 400 });

    const startDate = new Date(startsAt);
    const endDate = endsAt ? new Date(endsAt) : new Date(startDate.getTime() + 60 * 60_000);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      return NextResponse.json({ message: "Horario invalido." }, { status: 400 });
    }

    const [existing] = await selectRows<BookingRow>("professional_schedule_bookings", {
      select: "id,professional_schedule_id,professional_id,appointment_id,source,status,starts_at,ends_at",
      id: `eq.${id}`,
      limit: 1,
    });
    if (!existing) return NextResponse.json({ message: "Agendamento nao encontrado." }, { status: 404 });

    const professionalId = getString(body?.professionalId) || existing.professional_id;
    const context = await getContext(request, professionalId);
    const appointment = existing?.appointment_id ? await updateAppointment(existing.appointment_id, body, context) : await insertAppointment(body, context);

    const response = await supabaseRequest(`professional_schedule_bookings?id=eq.${id}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        professional_schedule_id: context.agenda.id,
        professional_id: context.professional.id,
        appointment_id: appointment?.id ?? existing?.appointment_id ?? null,
        source: appointment?.id ? "appointment" : existing?.source || "manual",
        status: appointment?.id ? "blocked" : status,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
      }),
    });

    const rows = (await response.json()) as BookingRow[];
    const [mapped] = rows.length > 0 ? await mapBookings(rows, context.professional) : [];
    return NextResponse.json({ appointment: mapped ?? null, message: "Agendamento atualizado." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel atualizar o agendamento." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));
    const professionalId = getString(request.nextUrl.searchParams.get("professionalId"));

    if (!id) return NextResponse.json({ message: "Agendamento obrigatorio." }, { status: 400 });

    if (id.startsWith("ia-request:")) {
      const iaRequestId = id.replace("ia-request:", "").trim();
      if (!isUuid(iaRequestId)) return NextResponse.json({ message: "Agendamento da IA invalido." }, { status: 400 });

      await supabaseRequest(`professional_schedule_bookings?source=eq.${encodeURIComponent(`ia_request:${iaRequestId}`)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      await supabaseRequest(`ia_request?id=eq.${encodeURIComponent(iaRequestId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "completed" }),
      });

      return NextResponse.json({ id, message: "Agendamento da IA removido." });
    }

    const [existing] = await selectRows<BookingRow>("professional_schedule_bookings", {
      select: "id,professional_schedule_id,professional_id,appointment_id,source,status,starts_at,ends_at",
      id: `eq.${id}`,
      limit: 1,
    });
    if (!existing) return NextResponse.json({ message: "Agendamento nao encontrado." }, { status: 404 });
    await getContext(request, professionalId || existing.professional_id);

    await supabaseRequest(`professional_schedule_bookings?id=eq.${id}`, {
      method: "DELETE",
    });
    if (existing?.appointment_id) {
      await supabaseRequest(`appointments?id=eq.${encodeURIComponent(existing.appointment_id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      });
    }

    return NextResponse.json({ id, message: "Agendamento excluido." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel excluir o agendamento." }, { status: 400 });
  }
}
