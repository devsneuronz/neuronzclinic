import { NextResponse } from "next/server";

import type { IaRequest } from "@/lib/ia-request";
import { getNullableString, getString, isUuid, supabaseJson } from "@/lib/supabase-server";
import { normalizeUserRole } from "@/lib/user-roles";

type IaRequestRow = {
  id: string;
  status: string | null;
  chosen_date: string | null;
  procedure_id: string | null;
  situation: string | null;
  context: string | null;
  created_at: string;
  chat_id: string | null;
  action: string | null;
  professional_schedule_id: string | null;
};
type ProcedureRow = { id: string; name: string | null; interest: string | null; modality?: string | null };
type ProfessionalScheduleRow = { id: string; id_profissional: string | null };
type ProfessionalRow = { id: string; name: string | null; email: string | null; user_id: string | null; user_profile?: { name: string | null; email: string | null } | null };
type ScheduleRuleRow = { id: string; weekday: string | null };
type SchedulePeriodRow = { start_time: string; end_time: string; slot_duration_minutes: number | null };
type AppointmentStatusRow = { id: string; status: string };
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
};
type BookingRow = { id: string; appointment_id: string | null; source: string | null; status: string | null; starts_at: string; ends_at: string | null };
type ContactRow = { id: string };
type IaRequestBody = {
  status?: unknown;
  chosenDate?: unknown;
  procedureId?: unknown;
  situation?: unknown;
  context?: unknown;
  action?: unknown;
  professionalScheduleId?: unknown;
};

const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const blockingBookingStatuses = new Set(["blocked", "scheduled", "confirmed"]);
const DEFAULT_STATUS_ID = "30ab85a3-b35d-4065-b173-a6a029a4b58f";
const DEFAULT_WAITING_STATUS_LABEL = "Aguardando";

function hasOwn(object: object, key: keyof IaRequestBody) {
  return Object.prototype.hasOwnProperty.call(object, key);
}
function mapIaRequest(row: IaRequestRow, proceduresById: Map<string, ProcedureRow>, professionalNameByScheduleId = new Map<string, string>()): IaRequest {
  const procedure = row.procedure_id ? proceduresById.get(row.procedure_id) : null;

  return {
    id: row.id,
    status: row.status || "",
    chosenDate: row.chosen_date || "",
    procedureId: row.procedure_id || "",
    procedureName: procedure?.name || procedure?.interest || "",
    situation: row.situation || "",
    context: row.context || "",
    createdAt: row.created_at,
    chatId: row.chat_id || "",
    action: row.action || "",
    professionalScheduleId: row.professional_schedule_id || "",
    professionalName: row.professional_schedule_id ? professionalNameByScheduleId.get(row.professional_schedule_id) || "" : "",
  };
}

function normalizeStatus(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getProfessionalName(professional: ProfessionalRow) {
  return professional.user_profile?.name || professional.name || professional.user_profile?.email || professional.email || "Profissional";
}

function normalizeAppointmentModality(value: string | null | undefined) {
  const normalized = normalizeStatus(value || "");
  if (normalized === "online") return "Online";
  return "Presencial";
}

function getIaRequestActionKind(action: string) {
  const normalized = normalizeStatus(action);
  if (normalized === "agendamento") return "agendamento";
  if (normalized === "intencao") return "intencao";
  return "aviso";
}

function isActiveIaRequest(row: Pick<IaRequestRow, "status">) {
  const status = normalizeStatus(row.status || "");
  return !["confirmed", "confirmado", "done", "completed", "resolved", "resolvido", "canceled", "cancelled", "cancelado"].includes(status);
}

function isCompletionStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status || "");
  return ["done", "completed", "resolved", "resolvido", "concluido"].includes(normalized);
}

async function getViewerProfessionalId({ userId, email }: { userId: string; email: string }) {
  const conditions: string[] = [];
  if (isUuid(userId)) conditions.push(`user_id.eq.${encodeURIComponent(userId)}`);
  if (email) conditions.push(`email.eq.${encodeURIComponent(email)}`);
  if (conditions.length === 0) return "";

  const rows = await supabaseJson<ProfessionalRow[]>(`professionals?select=id,email,user_id,user_profile:user_profiles!professionals_user_id_fkey(name,email)&status=eq.active&or=(${conditions.join(",")})&limit=1`);
  return rows[0]?.id || "";
}

async function getScheduleProfessionalIds(records: IaRequestRow[]) {
  const scheduleIds = Array.from(new Set(records.map((record) => record.professional_schedule_id).filter((id): id is string => Boolean(id))));
  if (scheduleIds.length === 0) return new Map<string, string>();

  const schedules = await supabaseJson<ProfessionalScheduleRow[]>(`professional_schedule?select=id,id_profissional&id=in.(${scheduleIds.map(encodeURIComponent).join(",")})`);
  return new Map(schedules.map((schedule) => [schedule.id, schedule.id_profissional || ""]));
}

async function getProfessionalNamesByScheduleId(records: IaRequestRow[]) {
  const professionalIdByScheduleId = await getScheduleProfessionalIds(records);
  const professionalIds = Array.from(new Set(Array.from(professionalIdByScheduleId.values()).filter(Boolean)));
  if (professionalIds.length === 0) return new Map<string, string>();

  const professionals = await supabaseJson<ProfessionalRow[]>(`professionals?select=id,name,email,user_id,user_profile:user_profiles!professionals_user_id_fkey(name,email)&id=in.(${professionalIds.map(encodeURIComponent).join(",")})`);
  const professionalNameById = new Map(professionals.map((professional) => [professional.id, getProfessionalName(professional)]));
  return new Map(Array.from(professionalIdByScheduleId.entries()).map(([scheduleId, professionalId]) => [scheduleId, professionalNameById.get(professionalId) || ""]));
}

async function filterIaRequestsForViewer(records: IaRequestRow[], searchParams: URLSearchParams) {
  const role = normalizeUserRole(searchParams.get("role"));
  if (role === "admin" || role === "manager") return records;

  const userId = getString(searchParams.get("userId"));
  const email = getString(searchParams.get("email")).toLowerCase();
  const viewerProfessionalId = await getViewerProfessionalId({ userId, email });
  const schedulingRecords = records.filter((record) => getIaRequestActionKind(record.action || "") === "agendamento" && record.professional_schedule_id);
  const professionalIdByScheduleId = viewerProfessionalId ? await getScheduleProfessionalIds(schedulingRecords) : new Map<string, string>();

  return records.filter((record) => {
    const actionKind = getIaRequestActionKind(record.action || "");
    if (actionKind === "aviso" || actionKind === "intencao") return true;
    if (actionKind !== "agendamento" || !viewerProfessionalId || !record.professional_schedule_id) return false;

    return professionalIdByScheduleId.get(record.professional_schedule_id) === viewerProfessionalId;
  });
}

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const localNoon = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00-03:00`);

  return {
    weekday: weekdayNames[localNoon.getUTCDay()] ?? "",
    time: `${get("hour")}:${get("minute")}`,
  };
}

function timeToMinutes(time: string) {
  const [hour = "0", minute = "0"] = time.slice(0, 5).split(":");
  return Number(hour) * 60 + Number(minute);
}

async function getChatRowId(chatId: string) {
  if (!chatId) return null;

  if (isUuid(chatId)) {
    const [chat] = await supabaseJson<ContactRow[]>(`chats?select=id&id=eq.${encodeURIComponent(chatId)}&limit=1`);
    if (chat?.id) return chat.id;
  }

  const value = encodeURIComponent(chatId);
  const [chat] = await supabaseJson<ContactRow[]>(`chats?select=id&chat_id=eq.${value}&limit=1`);
  return chat?.id ?? null;
}

async function getAppointmentDurationMinutes(request: IaRequestRow, chosenDate: Date) {
  if (!request.professional_schedule_id || !request.procedure_id) return 60;

  const { weekday, time } = localParts(chosenDate);
  const rules = await supabaseJson<ScheduleRuleRow[]>(
    `professional_schedule_rules?select=id,weekday&schedule_id=eq.${encodeURIComponent(request.professional_schedule_id)}&weekday=eq.${encodeURIComponent(weekday)}&is_open=is.true`,
  );
  const ruleIds = rules.map((rule) => rule.id);
  if (ruleIds.length === 0) return 60;

  const periods = await supabaseJson<SchedulePeriodRow[]>(
    `professional_schedule_periods?select=start_time,end_time,slot_duration_minutes&rule_id=in.(${ruleIds.map(encodeURIComponent).join(",")})&id_procedure=eq.${encodeURIComponent(request.procedure_id)}&is_enabled=is.true`,
  );

  const chosenMinutes = timeToMinutes(time);
  const period = periods.find((item) => {
    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);
    return chosenMinutes >= start && chosenMinutes < end;
  });

  return Number(period?.slot_duration_minutes) > 0 ? Number(period?.slot_duration_minutes) : 60;
}

async function getAppointmentStatusId(statusLabel: string) {
  const rows = await supabaseJson<AppointmentStatusRow[]>(
    `appointment_status?select=id,status&status=eq.${encodeURIComponent(statusLabel)}&limit=1`,
  );

  return rows[0]?.id || DEFAULT_STATUS_ID;
}

async function assertNoBookingConflict(scheduleId: string, startDate: Date, endDate: Date, sourceToIgnore: string) {
  const rows = await supabaseJson<BookingRow[]>(
    `professional_schedule_bookings?select=id,appointment_id,source,status,starts_at,ends_at&professional_schedule_id=eq.${encodeURIComponent(scheduleId)}&starts_at=lt.${encodeURIComponent(endDate.toISOString())}&ends_at=gt.${encodeURIComponent(startDate.toISOString())}&limit=20`,
  );

  const conflict = rows.find((row) => row.source !== sourceToIgnore && blockingBookingStatuses.has(row.status || ""));
  if (conflict) throw new Error("Este horario ja esta bloqueado na agenda do profissional.");
}

async function confirmIaRequest(id: string) {
  const [request] = await supabaseJson<IaRequestRow[]>(
    `ia_request?id=eq.${encodeURIComponent(id)}&select=id,status,chosen_date,procedure_id,situation,context,created_at,chat_id,action,professional_schedule_id&limit=1`,
  );
  if (!request) throw new Error("Aviso da IA nao encontrado.");
  if (!isActiveIaRequest(request)) throw new Error("Este aviso da IA ja foi confirmado ou encerrado.");
  if (!request.chosen_date) throw new Error("O aviso da IA nao possui horario escolhido.");
  if (!request.professional_schedule_id) throw new Error("O aviso da IA nao possui agenda profissional vinculada.");

  const [schedule] = await supabaseJson<ProfessionalScheduleRow[]>(
    `professional_schedule?select=id,id_profissional&id=eq.${encodeURIComponent(request.professional_schedule_id)}&limit=1`,
  );
  if (!schedule?.id || !schedule.id_profissional) throw new Error("Agenda profissional nao encontrada.");

  const procedureRows = request.procedure_id
    ? await supabaseJson<ProcedureRow[]>(`clinic_procedures?select=id,name,interest,modality&id=eq.${encodeURIComponent(request.procedure_id)}&limit=1`)
    : [];
  const procedure = procedureRows[0] ?? null;
  const startDate = new Date(request.chosen_date);
  if (Number.isNaN(startDate.getTime())) throw new Error("Horario escolhido invalido.");

  const durationMinutes = await getAppointmentDurationMinutes(request, startDate);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
  const source = `ia_request:${request.id}`;

  await assertNoBookingConflict(schedule.id, startDate, endDate, source);

  const chatRowId = await getChatRowId(request.chat_id || "");
  if (!chatRowId) throw new Error("Chat do contato nao encontrado para criar o agendamento.");
  const observations = [request.situation, request.context].filter(Boolean).join("\n\n");
  const waitingStatusId = await getAppointmentStatusId(DEFAULT_WAITING_STATUS_LABEL);
  const [appointment] = await supabaseJson<AppointmentRow[]>("appointments?select=id,appointment_status_id,modality,appointment_procedure_type_id,dataHoraInicio,dataHoraFim,professional_id,chat_id,observacoes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      appointment_status_id: waitingStatusId,
      appointment_procedure_type_id: null,
      modality: normalizeAppointmentModality(procedure?.modality),
      dataHoraInicio: startDate.toISOString(),
      dataHoraFim: endDate.toISOString(),
      professional_id: schedule.id_profissional,
      chat_id: chatRowId,
      observacoes: observations || `Agendamento confirmado a partir de aviso da IA. Procedimento: ${procedure?.name || procedure?.interest || "Consulta"}`,
    }),
  });
  if (!appointment?.id) throw new Error("Nao foi possivel criar o agendamento.");

  const existingBookings = await supabaseJson<BookingRow[]>(
    `professional_schedule_bookings?select=id,appointment_id,source,status,starts_at,ends_at&professional_schedule_id=eq.${encodeURIComponent(schedule.id)}&source=eq.${encodeURIComponent(source)}&limit=1`,
  );
  const bookingPayload = {
    professional_schedule_id: schedule.id,
    professional_id: schedule.id_profissional,
    appointment_id: appointment.id,
    source: "appointment",
    status: "blocked",
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
  };

  if (existingBookings[0]?.id) {
    await supabaseJson<unknown>(`professional_schedule_bookings?id=eq.${encodeURIComponent(existingBookings[0].id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(bookingPayload),
    });
  } else {
    await supabaseJson<unknown>("professional_schedule_bookings", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(bookingPayload),
    });
  }

  const [updatedRequest] = await supabaseJson<IaRequestRow[]>(
    `ia_request?id=eq.${encodeURIComponent(request.id)}&select=id,status,chosen_date,procedure_id,situation,context,created_at,chat_id,action,professional_schedule_id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "done" }),
    },
  );

  const proceduresById = new Map(procedure ? [[procedure.id, procedure]] : []);
  return { request: updatedRequest ? mapIaRequest(updatedRequest, proceduresById) : null, appointment };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = getString(searchParams.get("status"));
    const role = normalizeUserRole(searchParams.get("role"));
    const filters = ["select=id,status,chosen_date,procedure_id,situation,context,created_at,chat_id,action,professional_schedule_id"];

    if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);

    const records = await supabaseJson<IaRequestRow[]>(`ia_request?${filters.join("&")}&order=created_at.desc&limit=500`);
    const visibleRecords = await filterIaRequestsForViewer(records, searchParams);
    const procedureIds = Array.from(new Set(visibleRecords.map((record) => record.procedure_id).filter((id): id is string => Boolean(id))));
    const procedures =
      procedureIds.length > 0
        ? await supabaseJson<ProcedureRow[]>(`clinic_procedures?select=id,name,interest&id=in.(${procedureIds.map(encodeURIComponent).join(",")})`)
        : [];
    const proceduresById = new Map(procedures.map((procedure) => [procedure.id, procedure]));
    const professionalNameByScheduleId = role === "admin" || role === "manager" ? await getProfessionalNamesByScheduleId(visibleRecords) : new Map<string, string>();

    return NextResponse.json({ requests: visibleRecords.map((record) => mapIaRequest(record, proceduresById, professionalNameByScheduleId)) });
  } catch (error) {
    return NextResponse.json({ requests: [], message: error instanceof Error ? error.message : "Nao foi possivel carregar avisos da IA." }, { status: 500 });
  }
}
export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = getString(searchParams.get("id"));
    if (!isUuid(id)) throw new Error("Aviso da IA nao encontrado.");

    const body = (await request.json().catch(() => null)) as IaRequestBody | null;
    if (!body) throw new Error("Informe os dados para atualizar.");

    const payload: Record<string, string | null> = {};
    if (hasOwn(body, "status")) payload.status = getNullableString(body.status);
    if (hasOwn(body, "chosenDate")) payload.chosen_date = getNullableString(body.chosenDate);
    if (hasOwn(body, "procedureId")) payload.procedure_id = isUuid(getString(body.procedureId)) ? getString(body.procedureId) : null;
    if (hasOwn(body, "situation")) payload.situation = getNullableString(body.situation);
    if (hasOwn(body, "context")) payload.context = getNullableString(body.context);
    if (hasOwn(body, "action")) payload.action = getNullableString(body.action);
    if (hasOwn(body, "professionalScheduleId")) payload.professional_schedule_id = isUuid(getString(body.professionalScheduleId)) ? getString(body.professionalScheduleId) : null;
    if (Object.keys(payload).length === 0) throw new Error("Informe os dados para atualizar.");

    if (hasOwn(body, "status") && isCompletionStatus(payload.status)) {
      await supabaseJson<unknown>(`professional_schedule_bookings?source=eq.${encodeURIComponent(`ia_request:${id}`)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
    }

    const [record] = await supabaseJson<IaRequestRow[]>(`ia_request?id=eq.${encodeURIComponent(id)}&select=id,status,chosen_date,procedure_id,situation,context,created_at,chat_id,action,professional_schedule_id`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    const procedureIds = record?.procedure_id ? [record.procedure_id] : [];
    const procedures =
      procedureIds.length > 0
        ? await supabaseJson<ProcedureRow[]>(`clinic_procedures?select=id,name,interest&id=in.(${procedureIds.map(encodeURIComponent).join(",")})`)
        : [];
    const proceduresById = new Map(procedures.map((procedure) => [procedure.id, procedure]));

    return NextResponse.json({ request: record ? mapIaRequest(record, proceduresById) : null });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel atualizar o aviso da IA." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = getString(searchParams.get("id"));
    if (!isUuid(id)) throw new Error("Aviso da IA nao encontrado.");

    return NextResponse.json(await confirmIaRequest(id));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel confirmar o aviso da IA." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = getString(searchParams.get("id"));
    if (!isUuid(id)) throw new Error("Aviso da IA nao encontrado.");

    await supabaseJson<unknown>(`professional_schedule_bookings?source=eq.${encodeURIComponent(`ia_request:${id}`)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    await supabaseJson<unknown>(`ia_request?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel excluir o aviso da IA." }, { status: 500 });
  }
}
