import { normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_STATUS_ID = "30ab85a3-b35d-4065-b173-a6a029a4b58f";
const APPOINTMENT_SELECT =
  "id,appointment_status_id,modality,appointment_procedure_type_id,dataHoraInicio,dataHoraFim,professional_id,chat_id,observacoes,appointment_status:appointment_status_id(id,status,hex),appointment_procedure_type:appointment_procedure_type_id(id,tipo),professional:professionals!appointments_professional_id_fkey(id,name,email,user_profile:user_profiles!professionals_user_id_fkey(name,email)),chats:chat_id(id,nome_contato,phone_contact,chat_id)";

type ProfessionalRow = {
  id: string;
  name: string | null;
  email: string | null;
  user_id: string | null;
  user_profile?: { name: string | null; email: string | null } | null;
};

type AgendaRow = {
  id: string;
  id_profissional: string;
};

type AppointmentRow = {
  id: string;
  appointment_status_id: string;
  modality: string;
  appointment_procedure_type_id: string | null;
  dataHoraInicio: string;
  dataHoraFim: string;
  professional_id: string | null;
  chat_id: string;
  observacoes: string | null;
  appointment_status?: { id: string; status: string; hex: string } | null;
  appointment_procedure_type?: { id: string; tipo: string } | null;
  professional?: { id: string; name: string | null; email: string | null; user_profile?: { name: string | null; email: string | null } | null } | null;
  chats?: { id: string; nome_contato: string | null; phone_contact: string | null; chat_id: string | null } | null;
};

type ChatRow = {
  id: string;
  nome_contato: string | null;
  phone_contact: string | null;
  chat_id: string | null;
};

type StatusRow = {
  id: string;
  status: string;
};

type TypeRow = {
  id: string;
  tipo: string;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function getBrazilPhoneVariants(value: string) {
  const digits = onlyDigits(value);
  const variants = new Set<string>();

  if (digits) variants.add(digits);
  if (digits.startsWith("55")) variants.add(digits.slice(2));
  if (digits.length >= 10 && !digits.startsWith("55")) variants.add(`55${digits}`);

  return Array.from(variants).filter(Boolean);
}

function getSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase REST configuration.");
  return { url: SUPABASE_REST_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY };
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

async function getRows<T>(path: string) {
  const response = await supabaseRequest(path);
  return response.json() as Promise<T[]>;
}

function getProfessionalEmail(professional: ProfessionalRow) {
  return professional.user_profile?.email || professional.email || "";
}

function getProfessionalName(professional: ProfessionalRow | NonNullable<AppointmentRow["professional"]> | null | undefined) {
  if (!professional) return "Profissional";
  return professional.user_profile?.name || professional.name || professional.email || "Profissional";
}

function canUseProfessional(viewer: { role: string; email: string }, professional: ProfessionalRow) {
  if (viewer.role === "admin" || viewer.role === "manager") return true;
  return getProfessionalEmail(professional).trim().toLowerCase() === viewer.email;
}

async function getProfessionals() {
  return selectRows<ProfessionalRow>("professionals", {
    select: "id,name,email,user_id,user_profile:user_profiles!professionals_user_id_fkey(name,email)",
    order: "created_at.desc",
    limit: 1000,
  });
}

async function findChat({ patientId, chatId, contactPhone }: { patientId: string; chatId: string; contactPhone: string }) {
  if (patientId) {
    const rows = await selectRows<ChatRow>("chats", {
      select: "id,nome_contato,phone_contact,chat_id",
      id: `eq.${patientId}`,
      limit: 1,
    });
    if (rows[0]) return rows[0];
  }

  const filters: string[] = [];
  if (chatId) {
    filters.push(`chat_id.eq.${encodeURIComponent(chatId)}`);
    filters.push(`id.eq.${encodeURIComponent(chatId)}`);
  }

  for (const phone of getBrazilPhoneVariants(contactPhone || chatId)) {
    filters.push(`phone_contact.eq.${encodeURIComponent(phone)}`);
    filters.push(`chat_id.ilike.*${encodeURIComponent(phone)}*`);
  }

  if (filters.length === 0) return null;

  const rows = await getRows<ChatRow>(`chats?select=id,nome_contato,phone_contact,chat_id&or=(${filters.join(",")})&limit=1`);
  return rows[0] ?? null;
}

async function getAgenda(professionalId: string) {
  const rows = await selectRows<AgendaRow>("professional_agendas", {
    select: "id,id_profissional",
    id_profissional: `eq.${professionalId}`,
    limit: 1,
  });
  return rows[0] ?? null;
}

async function resolveStatusId(value: string) {
  if (!value) return DEFAULT_STATUS_ID;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value;
  const rows = await selectRows<StatusRow>("appointment_status", { select: "id,status", status: `eq.${value}`, limit: 1 });
  return rows[0]?.id ?? DEFAULT_STATUS_ID;
}

async function resolveTypeId(value: string) {
  if (!value) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value;
  const rows = await selectRows<TypeRow>("appointment_procedure_type", { select: "id,tipo", tipo: `eq.${value}`, limit: 1 });
  return rows[0]?.id ?? null;
}

function mapAppointment(row: AppointmentRow) {
  const professional = row.professional;
  const chat = row.chats;
  return {
    id: row.id,
    status: row.appointment_status?.status || row.appointment_status_id,
    type: row.appointment_procedure_type?.tipo || "",
    attendanceMode: row.modality,
    startDateTime: row.dataHoraInicio,
    endDateTime: row.dataHoraFim,
    professionalId: row.professional_id || "",
    professional: getProfessionalName(professional),
    patientId: row.chat_id,
    patient: chat?.nome_contato || chat?.phone_contact || chat?.chat_id || "Contato",
    phone: chat?.phone_contact || "",
    observations: row.observacoes || "",
  };
}

async function syncBooking(appointment: AppointmentRow) {
  if (!appointment.professional_id) return;
  const agenda = await getAgenda(appointment.professional_id);
  if (!agenda) return;

  await supabaseRequest(`professional_agenda_bookings?appointment_id=eq.${appointment.id}`, { method: "DELETE" });
  await supabaseRequest("professional_agenda_bookings", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      appointment_id: appointment.id,
      agenda_id: agenda.id,
      professional_id: appointment.professional_id,
      starts_at: appointment.dataHoraInicio,
      ends_at: appointment.dataHoraFim,
      source: "appointment",
      status: "blocked",
    }),
  });
}

async function getContext(request: NextRequest, requestedProfessionalId = "") {
  const rawRole = request.nextUrl.searchParams.get("role");
  const email = getString(request.nextUrl.searchParams.get("email")).toLowerCase();
  const role = !rawRole && !email ? "admin" : normalizeUserRole(rawRole);
  const professionals = await getProfessionals();
  const allowedProfessionals = professionals.filter((professional) => canUseProfessional({ role, email }, professional));
  const selectedProfessional = allowedProfessionals.find((professional) => professional.id === requestedProfessionalId) ?? allowedProfessionals[0] ?? null;
  return { role, email, allowedProfessionals, selectedProfessional };
}

async function getAppointmentsForChat(chat: ChatRow) {
  const rows = await selectRows<AppointmentRow>("appointments", {
    select: APPOINTMENT_SELECT,
    chat_id: `eq.${chat.id}`,
    deleted_at: "is.null",
    order: "dataHoraInicio.desc",
    limit: 1000,
  });

  return rows.map(mapAppointment);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const start = getString(searchParams.get("start"));
    const end = getString(searchParams.get("end"));
    const requestedProfessionalId = getString(searchParams.get("professionalId"));
    const chatId = getString(searchParams.get("chatId"));
    const contactPhone = getString(searchParams.get("contactPhone"));
    const contactIdParam = getString(searchParams.get("contactId"));
    const status = getString(searchParams.get("status"));
    const type = getString(searchParams.get("type"));

    if (chatId || contactPhone || contactIdParam) {
      const chat = await findChat({ patientId: contactIdParam, chatId, contactPhone });
      if (!chat) return NextResponse.json({ appointments: [], latestAppointment: null });

      const appointments = await getAppointmentsForChat(chat);
      return NextResponse.json({ appointments, latestAppointment: appointments[0] ?? null });
    }

    const context = await getContext(request, requestedProfessionalId);
    const selectedProfessionalId = context.selectedProfessional?.id ?? "";
    const requestedProfessionalAllowed =
      !requestedProfessionalId || context.allowedProfessionals.some((professional) => professional.id === requestedProfessionalId);
    if (!requestedProfessionalAllowed) {
      return NextResponse.json({ appointments: [], message: "Voce nao pode acessar a agenda deste profissional." }, { status: 403 });
    }
    const professionalIds =
      context.role === "admin" || context.role === "manager" ? context.allowedProfessionals.map((professional) => professional.id) : context.selectedProfessional ? [context.selectedProfessional.id] : [];

    const query: Record<string, string | number> = {
      select: APPOINTMENT_SELECT,
      deleted_at: "is.null",
      order: "dataHoraInicio.asc",
      limit: 1000,
    };

    if (start) query.dataHoraInicio = `gte.${new Date(start).toISOString()}`;
    if (end) query.and = `(dataHoraInicio.lt.${new Date(end).toISOString()})`;
    if (requestedProfessionalId) query.professional_id = `eq.${selectedProfessionalId}`;
    else if (professionalIds.length > 0 && context.role !== "admin" && context.role !== "manager") query.professional_id = `in.(${professionalIds.join(",")})`;
    if (status) query.appointment_status_id = `eq.${await resolveStatusId(status)}`;
    if (type) {
      const typeId = await resolveTypeId(type);
      if (typeId) query.appointment_procedure_type_id = `eq.${typeId}`;
    }

    const rows = await selectRows<AppointmentRow>("appointments", query);
    return NextResponse.json({ appointments: rows.map(mapAppointment) });
  } catch (error) {
    return NextResponse.json({ appointments: [], message: error instanceof Error ? error.message : "Nao foi possivel carregar os agendamentos." }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const professionalId = getString(body?.professionalId);
    const patientId = getString(body?.patientId);
    const chatId = getString(body?.chatId);
    const contactPhone = getString(body?.contactPhone) || getString(body?.patientPhone);
    const startsAt = getString(body?.startDateTime);
    const endsAt = getString(body?.endDateTime);
    const modality = getString(body?.attendanceMode) || "Presencial";
    const observations = getString(body?.observations);
    const statusId = await resolveStatusId(getString(body?.status));
    const typeId = await resolveTypeId(getString(body?.type));
    const context = await getContext(request, professionalId);
    const chat = await findChat({ patientId, chatId, contactPhone });

    if (!professionalId || !chat || !startsAt) return NextResponse.json({ message: "Informe profissional, paciente e horario." }, { status: 400 });
    if (!context.allowedProfessionals.some((professional) => professional.id === professionalId)) {
      return NextResponse.json({ message: "Voce nao pode criar agendamento para este profissional." }, { status: 403 });
    }

    const startDate = new Date(startsAt);
    const endDate = endsAt ? new Date(endsAt) : new Date(startDate.getTime() + 60 * 60_000);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      return NextResponse.json({ message: "Horario invalido." }, { status: 400 });
    }

    const response = await supabaseRequest(
      `appointments?select=${APPOINTMENT_SELECT}`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          appointment_status_id: statusId,
          modality,
          appointment_procedure_type_id: typeId,
          dataHoraInicio: startDate.toISOString(),
          dataHoraFim: endDate.toISOString(),
          professional_id: professionalId,
          chat_id: chat.id,
          observacoes: observations || null,
        }),
      },
    );
    const rows = (await response.json()) as AppointmentRow[];
    if (rows[0]) await syncBooking(rows[0]);
    return NextResponse.json({ appointment: rows[0] ? mapAppointment(rows[0]) : null, message: "Agendamento criado com sucesso." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel criar o agendamento." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const professionalId = getString(body?.professionalId);
    const patientId = getString(body?.patientId);
    const chatId = getString(body?.chatId);
    const contactPhone = getString(body?.contactPhone) || getString(body?.patientPhone);
    const startsAt = getString(body?.startDateTime);
    const endsAt = getString(body?.endDateTime);
    const modality = getString(body?.attendanceMode) || "Presencial";
    const observations = getString(body?.observations);
    const statusId = await resolveStatusId(getString(body?.status));
    const typeId = await resolveTypeId(getString(body?.type));
    const context = await getContext(request, professionalId);
    const chat = await findChat({ patientId, chatId, contactPhone });

    if (!id || !professionalId || !chat || !startsAt) return NextResponse.json({ message: "Informe os dados obrigatorios." }, { status: 400 });
    if (!context.allowedProfessionals.some((professional) => professional.id === professionalId)) {
      return NextResponse.json({ message: "Voce nao pode editar agendamento deste profissional." }, { status: 403 });
    }

    const startDate = new Date(startsAt);
    const endDate = endsAt ? new Date(endsAt) : new Date(startDate.getTime() + 60 * 60_000);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      return NextResponse.json({ message: "Horario invalido." }, { status: 400 });
    }

    const response = await supabaseRequest(
      `appointments?id=eq.${id}&select=${APPOINTMENT_SELECT}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          appointment_status_id: statusId,
          modality,
          appointment_procedure_type_id: typeId,
          dataHoraInicio: startDate.toISOString(),
          dataHoraFim: endDate.toISOString(),
          professional_id: professionalId,
          chat_id: chat.id,
          observacoes: observations || null,
        }),
      },
    );
    const rows = (await response.json()) as AppointmentRow[];
    if (rows[0]) await syncBooking(rows[0]);
    return NextResponse.json({ appointment: rows[0] ? mapAppointment(rows[0]) : null, message: "Agendamento atualizado." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel atualizar o agendamento." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));
    const professionalId = getString(request.nextUrl.searchParams.get("professionalId"));
    const context = await getContext(request, professionalId);
    if (!id) return NextResponse.json({ message: "Agendamento obrigatorio." }, { status: 400 });
    if (professionalId && !context.allowedProfessionals.some((professional) => professional.id === professionalId)) {
      return NextResponse.json({ message: "Voce nao pode excluir agendamento deste profissional." }, { status: 403 });
    }
    if (!professionalId && context.role !== "admin" && context.role !== "manager") {
      return NextResponse.json({ message: "Informe o profissional para excluir este agendamento." }, { status: 400 });
    }
    const allowedIds = context.allowedProfessionals.map((professional) => professional.id).filter(Boolean);
    const filter = professionalId ? `id=eq.${id}&professional_id=eq.${professionalId}` : `id=eq.${id}&professional_id=in.(${allowedIds.join(",")})`;
    await supabaseRequest(`professional_agenda_bookings?appointment_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    await supabaseRequest(`appointments?${filter}`, { method: "DELETE" });
    return NextResponse.json({ id, message: "Agendamento excluido." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel excluir o agendamento." }, { status: 400 });
  }
}

