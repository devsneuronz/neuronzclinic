import { normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type ProfessionalRow = {
  id: string;
  name: string | null;
  email: string | null;
  user_id: string | null;
  user_profile?: { name: string | null; email: string | null } | null;
  professional_procedimentos?: Array<{ procedimentos?: { id: string; nome: string | null; interest_tag_id?: string | null; interesse: string | null } | null }>;
};

type ChatRow = {
  id: string;
  nome_contato: string | null;
  phone_contact: string | null;
  chat_id: string | null;
  json_interesses: unknown;
};

type StatusRow = {
  id: string;
  status: string;
  hex: string;
};

type TypeRow = {
  id: string;
  tipo: string;
};

type TagRow = {
  id: string;
  airtable_record_id: string | null;
  label: string;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function getProfessionalEmail(professional: ProfessionalRow) {
  return professional.user_profile?.email || professional.email || "";
}

function getProfessionalName(professional: ProfessionalRow) {
  return professional.user_profile?.name || professional.name || professional.email || professional.user_profile?.email || "Profissional";
}

function canUseProfessional(viewer: { role: string; email: string }, professional: ProfessionalRow) {
  if (viewer.role === "admin" || viewer.role === "manager") return true;
  return getProfessionalEmail(professional).trim().toLowerCase() === viewer.email;
}

async function getProfessionals() {
  return selectRows<ProfessionalRow>("professionals", {
    select: "id,name,email,user_id,user_profile:user_profiles!professionals_user_id_fkey(name,email),professional_procedimentos!professional_procedimentos_id_professional_fkey(procedimentos:id_procedimento(id,nome,interest_tag_id,interesse))",
    order: "created_at.desc",
    limit: 1000,
  });
}

function interestText(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function chatMatchesInterests(chat: ChatRow, interests: string[]) {
  if (interests.length === 0) return true;
  const haystack = normalize(interestText(chat.json_interesses));
  return interests.some((interest) => haystack.includes(normalize(interest)));
}

function getProcedureInterestKeys(
  procedure: { nome: string | null; interest_tag_id?: string | null; interesse: string | null },
  tagsByUuid: Map<string, TagRow>,
) {
  const keys = new Set<string>();
  if (procedure.interesse) keys.add(procedure.interesse);
  if (procedure.nome) keys.add(procedure.nome);

  const tag = procedure.interest_tag_id ? tagsByUuid.get(procedure.interest_tag_id) : null;
  if (tag) {
    keys.add(tag.id);
    if (tag.airtable_record_id) keys.add(tag.airtable_record_id);
    keys.add(tag.label);
  }

  return Array.from(keys).filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const rawRole = request.nextUrl.searchParams.get("role");
    const email = getString(request.nextUrl.searchParams.get("email")).toLowerCase();
    const role = !rawRole && !email ? "admin" : normalizeUserRole(rawRole);
    const requestedProfessionalId = getString(request.nextUrl.searchParams.get("professionalId"));

    const [professionals, statuses, types, chats, tags] = await Promise.all([
      getProfessionals(),
      selectRows<StatusRow>("appointment_status", { select: "id,status,hex", order: "status.asc", limit: 1000 }),
      selectRows<TypeRow>("appointment_procedure_type", { select: "id,tipo", order: "tipo.asc", limit: 1000 }),
      selectRows<ChatRow>("chats", { select: "id,nome_contato,phone_contact,chat_id,json_interesses", archived: "is.false", order: "last_message_time.desc", limit: 1000 }),
      selectRows<TagRow>("tags", { select: "id,airtable_record_id,label", status: "eq.active", limit: 1000 }),
    ]);

    const allowedProfessionals = professionals.filter((professional) => canUseProfessional({ role, email }, professional));
    const selectedProfessional = allowedProfessionals.find((professional) => professional.id === requestedProfessionalId) ?? allowedProfessionals[0] ?? null;
    const tagsByUuid = new Map(tags.map((tag) => [tag.id, tag]));
    const procedures = (selectedProfessional?.professional_procedimentos ?? [])
      .map((link) => link.procedimentos)
      .filter((procedure): procedure is { id: string; nome: string | null; interest_tag_id?: string | null; interesse: string | null } => Boolean(procedure?.id));
    const interests = procedures.flatMap((procedure) => getProcedureInterestKeys(procedure, tagsByUuid));
    const filteredChats = selectedProfessional ? chats.filter((chat) => chatMatchesInterests(chat, interests)) : chats;

    return NextResponse.json({
      status: statuses.map((status) => status.status),
      statusOptions: statuses.map((status) => ({ id: status.id, label: status.status, hex: status.hex })),
      types: types.map((type) => type.tipo),
      typeOptions: types.map((type) => ({ id: type.id, label: type.tipo })),
      attendanceModes: ["Presencial", "Online"],
      professionals: allowedProfessionals.map((professional) => ({ id: professional.id, label: getProfessionalName(professional) })),
      procedures: procedures.map((procedure) => ({
        id: procedure.id,
        label: procedure.nome || "Procedimento",
        interest: procedure.interesse || "",
      })),
      patients: filteredChats.map((chat) => ({
        id: chat.id,
        label: chat.nome_contato || chat.phone_contact || chat.chat_id || "Contato",
        phone: chat.phone_contact || "",
      })),
      selectedProfessionalId: selectedProfessional?.id ?? "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: [],
        statusOptions: [],
        types: [],
        typeOptions: [],
        attendanceModes: [],
        professionals: [],
        procedures: [],
        patients: [],
        message: error instanceof Error ? error.message : "Nao foi possivel carregar as opcoes.",
      },
      { status: 200 },
    );
  }
}
