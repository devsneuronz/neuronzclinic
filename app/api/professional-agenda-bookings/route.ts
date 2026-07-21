import { normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type ProfessionalRow = {
  id_profissional: string;
  nome: string | null;
  email: string | null;
  user_id: string | null;
  users?: { email: string | null; name: string | null } | null;
};

type AgendaRow = {
  id: string;
  id_profissional: string;
  title: string | null;
  status: string | null;
};

type BookingRow = {
  id: string;
  agenda_id: string;
  appointment_id: string | null;
  professional_id: string | null;
  source: string | null;
  status: string | null;
  starts_at: string;
  ends_at: string | null;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function getProfessionalEmail(professional: ProfessionalRow) {
  return professional.users?.email || professional.email || "";
}

function getProfessionalName(professional: ProfessionalRow) {
  return professional.users?.name || professional.nome || professional.email || professional.users?.email || "Profissional";
}

function canManageProfessional(viewer: { role: string; email: string }, professional: ProfessionalRow) {
  if (viewer.role === "admin") return true;
  const professionalEmail = getProfessionalEmail(professional).trim().toLowerCase();
  return Boolean(viewer.email && professionalEmail && professionalEmail === viewer.email);
}

async function getProfessionals() {
  return selectRows<ProfessionalRow>("professional", {
    select: "id_profissional,nome,email,user_id,users:user_id(name,email)",
    limit: 1000,
  });
}

async function getAgenda(professionalId: string) {
  const rows = await selectRows<AgendaRow>("professional_agendas", {
    select: "id,id_profissional,title,status",
    id_profissional: `eq.${professionalId}`,
    limit: 1,
  });

  return rows[0] ?? null;
}

async function getContext(request: NextRequest, requestedProfessionalId?: string) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role"));
  const email = getString(request.nextUrl.searchParams.get("email")).toLowerCase();
  const professionals = await getProfessionals();
  const manageableProfessionals = role === "admin" ? professionals : professionals.filter((professional) => canManageProfessional({ role, email }, professional));
  if (requestedProfessionalId && !manageableProfessionals.some((item) => item.id_profissional === requestedProfessionalId)) {
    throw new Error("Voce nao pode acessar a agenda deste profissional.");
  }
  const professional = manageableProfessionals.find((item) => item.id_profissional === requestedProfessionalId) ?? manageableProfessionals[0] ?? null;

  if (!professional) throw new Error("Nenhum profissional vinculado a este usuario.");

  const agenda = await getAgenda(professional.id_profissional);
  if (!agenda) throw new Error("Agenda profissional ainda nao criada.");

  return { role, email, professional, agenda };
}

function encodeManualSource(patientName: string, patientPhone: string) {
  return JSON.stringify({
    kind: "manual",
    patientName,
    patientPhone: patientPhone || null,
  });
}

function getManualSourceDetails(source: string | null) {
  if (!source) return { patientName: "Paciente", patientPhone: "" };

  try {
    const parsed = JSON.parse(source) as { kind?: unknown; patientName?: unknown; patientPhone?: unknown };
    if (parsed.kind === "manual") {
      return {
        patientName: getString(parsed.patientName) || "Paciente",
        patientPhone: getString(parsed.patientPhone),
      };
    }
  } catch {
    // Legacy text source; keep rendering a neutral patient label.
  }

  return { patientName: "Paciente", patientPhone: "" };
}

function mapBooking(row: BookingRow, professional: ProfessionalRow) {
  const sourceDetails = getManualSourceDetails(row.source);
  return {
    id: row.id,
    status: row.status || "scheduled",
    type: "Consulta",
    attendanceMode: "Manual",
    startDateTime: row.starts_at,
    endDateTime: row.ends_at || row.starts_at,
    professionalId: professional.id_profissional,
    professional: getProfessionalName(professional),
    patientId: "",
    patient: sourceDetails.patientName,
    phone: sourceDetails.patientPhone,
    observations: row.source || "manual",
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const professionalId = getString(searchParams.get("professionalId"));
    const start = getString(searchParams.get("start"));
    const end = getString(searchParams.get("end"));
    const context = await getContext(request, professionalId);

    const query: Record<string, string | number> = {
      select: "id,appointment_id,agenda_id,professional_id,source,status,starts_at,ends_at",
      agenda_id: `eq.${context.agenda.id}`,
      order: "starts_at.asc",
      limit: 1000,
    };

    if (start) query.starts_at = `gte.${new Date(start).toISOString()}`;
    if (end) query.and = `(starts_at.lt.${new Date(end).toISOString()})`;

    const rows = await selectRows<BookingRow>("professional_agenda_bookings", query);

    return NextResponse.json({
      appointments: rows.map((row) => mapBooking(row, context.professional)),
      professional: { id: context.professional.id_profissional, label: getProfessionalName(context.professional) },
      agendaId: context.agenda.id,
    });
  } catch (error) {
    return NextResponse.json({ appointments: [], message: error instanceof Error ? error.message : "Nao foi possivel carregar os agendamentos." }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const professionalId = getString(body?.professionalId);
    const context = await getContext(request, professionalId);
    const startsAt = getString(body?.startDateTime);
    const endsAt = getString(body?.endDateTime);
    const patientName = getString(body?.patientName);
    const patientPhone = getString(body?.patientPhone);
    const status = getString(body?.status) || "scheduled";

    if (!startsAt || !patientName) {
      return NextResponse.json({ message: "Informe inicio e nome do paciente." }, { status: 400 });
    }

    const startDate = new Date(startsAt);
    const endDate = endsAt ? new Date(endsAt) : new Date(startDate.getTime() + 60 * 60_000);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      return NextResponse.json({ message: "Horario invalido." }, { status: 400 });
    }

    const response = await supabaseRequest("professional_agenda_bookings?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        agenda_id: context.agenda.id,
        professional_id: context.professional.id_profissional,
        source: encodeManualSource(patientName, patientPhone),
        status,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
      }),
    });

    const rows = (await response.json()) as BookingRow[];
    return NextResponse.json({ appointment: rows[0] ? mapBooking(rows[0], context.professional) : null, message: "Agendamento criado com sucesso." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel criar o agendamento." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const professionalId = getString(body?.professionalId);
    const context = await getContext(request, professionalId);
    const startsAt = getString(body?.startDateTime);
    const endsAt = getString(body?.endDateTime);
    const patientName = getString(body?.patientName);
    const patientPhone = getString(body?.patientPhone);
    const status = getString(body?.status) || "scheduled";

    if (!id) return NextResponse.json({ message: "Agendamento obrigatorio." }, { status: 400 });
    if (!startsAt || !patientName) return NextResponse.json({ message: "Informe inicio e nome do paciente." }, { status: 400 });

    const startDate = new Date(startsAt);
    const endDate = endsAt ? new Date(endsAt) : new Date(startDate.getTime() + 60 * 60_000);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      return NextResponse.json({ message: "Horario invalido." }, { status: 400 });
    }

    const response = await supabaseRequest(`professional_agenda_bookings?id=eq.${id}&agenda_id=eq.${context.agenda.id}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        source: encodeManualSource(patientName, patientPhone),
      }),
    });

    const rows = (await response.json()) as BookingRow[];
    return NextResponse.json({ appointment: rows[0] ? mapBooking(rows[0], context.professional) : null, message: "Agendamento atualizado." });
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

    await supabaseRequest(`professional_agenda_bookings?id=eq.${id}&agenda_id=eq.${context.agenda.id}`, {
      method: "DELETE",
    });

    return NextResponse.json({ id, message: "Agendamento excluido." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel excluir o agendamento." }, { status: 400 });
  }
}
