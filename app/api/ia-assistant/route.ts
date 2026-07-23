import { getBool, getNullableString, getString, supabaseJson } from "@/lib/supabase-server";
import { isFallbackAdminEmail, normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

type RawAssistant = Record<string, unknown>;

type AssistantRow = {
  id: string;
  name: string;
  general_info: string;
  initial_message: string;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  emoji: boolean | null;
  gender: string | null;
  prompt_initial_message: string | null;
  prompt_identity: string | null;
  prompt_personality: string | null;
  prompt_security: string | null;
  prompt_general_info: string | null;
  prompt_procedures: string | null;
  prompt_scope: string | null;
  prompt_special_scope: string | null;
  prompt_security_reinforcement: string | null;
  prompt_final: string | null;
  schedule_alert: boolean | null;
  fowarding_alert: boolean | null;
  client_name: string | null;
  client_whats: string | null;
  user_01_name: string | null;
  user_01_whats: string | null;
  user_02_name: string | null;
  user_02_whats: string | null;
  user_03_name: string | null;
  user_03_whats: string | null;
  prompt_procedures_list: string | null;
  speaking_style: string | null;
  prompt_ia_tools: string | null;
};

const DB_SELECT = [
  "id",
  "name",
  "general_info",
  "initial_message",
  "active",
  "metadata",
  "created_at",
  "updated_at",
  "emoji",
  "gender",
  "prompt_initial_message",
  "prompt_identity",
  "prompt_personality",
  "prompt_security",
  "prompt_general_info",
  "prompt_procedures",
  "prompt_scope",
  "prompt_special_scope",
  "prompt_security_reinforcement",
  "prompt_final",
  "schedule_alert",
  "fowarding_alert",
  "client_name",
  "client_whats",
  "user_01_name",
  "user_01_whats",
  "user_02_name",
  "user_02_whats",
  "user_03_name",
  "user_03_whats",
  "prompt_procedures_list",
  "speaking_style",
  "prompt_ia_tools",
].join(",");

const SELECT_FIELD_MAP: Record<string, string> = {
  id: "id",
  name: "name",
  gender: "gender",
  emoji: "emoji",
  dados_empresa: "general_info",
  general_info: "general_info",
  generalInfo: "general_info",
  msg_inicial: "initial_message",
  initial_message: "initial_message",
  initialMessage: "initial_message",
  estilo_conversa: "speaking_style",
  speaking_style: "speaking_style",
  speakingStyle: "speaking_style",
  avisar_agendamento: "schedule_alert",
  schedule_alert: "schedule_alert",
  scheduleAlert: "schedule_alert",
  avisar_encaminhamento: "fowarding_alert",
  fowarding_alert: "fowarding_alert",
  forwardingAlert: "fowarding_alert",
  cliente_nome: "client_name",
  client_name: "client_name",
  clientName: "client_name",
  cliente_whats: "client_whats",
  client_whats: "client_whats",
  clientWhats: "client_whats",
  prompt_msg_inicial: "prompt_initial_message",
  prompt_initial_message: "prompt_initial_message",
  prompt_identidade: "prompt_identity",
  prompt_identity: "prompt_identity",
  prompt_personalidade: "prompt_personality",
  prompt_personality: "prompt_personality",
  prompt_seguranca: "prompt_security",
  prompt_security: "prompt_security",
  prompt_empresa: "prompt_general_info",
  prompt_general_info: "prompt_general_info",
  prompt_procedimentos: "prompt_procedures",
  prompt_procedures: "prompt_procedures",
  prompt_escopo: "prompt_scope",
  prompt_scope: "prompt_scope",
  prompt_escopo_especial: "prompt_special_scope",
  prompt_special_scope: "prompt_special_scope",
  prompt_seguranca_reforco: "prompt_security_reinforcement",
  prompt_security_reinforcement: "prompt_security_reinforcement",
  prompt_final: "prompt_final",
  prompt_lista_procedimentos: "prompt_procedures_list",
  prompt_procedures_list: "prompt_procedures_list",
  prompt_ia_tools: "prompt_ia_tools",
  active: "active",
  metadata: "metadata",
  created_at: "created_at",
  updated_at: "updated_at",
};

function getViewer(request: NextRequest, body?: RawAssistant | null) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role") ?? body?.role);
  const email = getString(request.nextUrl.searchParams.get("email") ?? body?.email).toLowerCase();
  return { role, email };
}

function requireAdmin(request: NextRequest, body?: RawAssistant | null) {
  const viewer = getViewer(request, body);
  if (viewer.role !== "admin" && !isFallbackAdminEmail(viewer.email)) {
    return NextResponse.json({ message: "Apenas administradores podem alterar as configuracoes da IA." }, { status: 403 });
  }
  return null;
}

function getAllowedSelect(fields: string) {
  if (!fields) return DB_SELECT;
  const requested = Array.from(
    new Set(
      fields
        .split(",")
        .map((field) => SELECT_FIELD_MAP[field.trim()])
        .filter(Boolean),
    ),
  );
  return requested.length > 0 ? requested.join(",") : DB_SELECT;
}

function mapAssistant(row: Partial<AssistantRow> | null) {
  if (!row) return null;
  return {
    ...row,
    dados_empresa: row.general_info || "",
    msg_inicial: row.initial_message || "",
    estilo_conversa: row.speaking_style || "formal",
    avisar_agendamento: !!row.schedule_alert,
    avisar_encaminhamento: !!row.fowarding_alert,
    cliente_nome: row.client_name || "",
    cliente_whats: row.client_whats || "",
    user_01_nome: row.user_01_name || "",
    user_02_nome: row.user_02_name || "",
    user_03_nome: row.user_03_name || "",
    prompt_msg_inicial: row.prompt_initial_message || "",
    prompt_identidade: row.prompt_identity || "",
    prompt_personalidade: row.prompt_personality || "",
    prompt_seguranca: row.prompt_security || "",
    prompt_empresa: row.prompt_general_info || "",
    prompt_procedimentos: row.prompt_procedures || "",
    prompt_escopo: row.prompt_scope || "",
    prompt_escopo_especial: row.prompt_special_scope || "",
    prompt_seguranca_reforco: row.prompt_security_reinforcement || "",
    prompt_lista_procedimentos: row.prompt_procedures_list || "",
  };
}

function setText(payload: RawAssistant, body: RawAssistant, dbField: string, ...bodyFields: string[]) {
  for (const field of bodyFields) {
    if (field in body) {
      payload[dbField] = getNullableString(body[field]);
      return;
    }
  }
}

function setBool(payload: RawAssistant, body: RawAssistant, dbField: string, fallback = false, ...bodyFields: string[]) {
  for (const field of bodyFields) {
    if (field in body) {
      payload[dbField] = getBool(body[field], fallback);
      return;
    }
  }
}

function buildPayload(body: RawAssistant, mode: "create" | "patch") {
  const payload: RawAssistant = {};
  setText(payload, body, "name", "name");
  setText(payload, body, "general_info", "general_info", "generalInfo", "dados_empresa");
  setText(payload, body, "initial_message", "initial_message", "initialMessage", "msg_inicial");
  setText(payload, body, "gender", "gender");
  setText(payload, body, "speaking_style", "speaking_style", "speakingStyle", "estilo_conversa");
  setText(payload, body, "client_name", "client_name", "clientName", "cliente_nome");
  setText(payload, body, "client_whats", "client_whats", "clientWhats", "cliente_whats");
  setText(payload, body, "user_01_name", "user_01_name", "user_01_nome");
  setText(payload, body, "user_01_whats", "user_01_whats");
  setText(payload, body, "user_02_name", "user_02_name", "user_02_nome");
  setText(payload, body, "user_02_whats", "user_02_whats");
  setText(payload, body, "user_03_name", "user_03_name", "user_03_nome");
  setText(payload, body, "user_03_whats", "user_03_whats");
  setText(payload, body, "prompt_initial_message", "prompt_initial_message", "prompt_msg_inicial");
  setText(payload, body, "prompt_identity", "prompt_identity", "prompt_identidade");
  setText(payload, body, "prompt_personality", "prompt_personality", "prompt_personalidade");
  setText(payload, body, "prompt_security", "prompt_security", "prompt_seguranca");
  setText(payload, body, "prompt_general_info", "prompt_general_info", "prompt_empresa");
  setText(payload, body, "prompt_procedures", "prompt_procedures", "prompt_procedimentos");
  setText(payload, body, "prompt_scope", "prompt_scope", "prompt_escopo");
  setText(payload, body, "prompt_special_scope", "prompt_special_scope", "prompt_escopo_especial");
  setText(payload, body, "prompt_security_reinforcement", "prompt_security_reinforcement", "prompt_seguranca_reforco");
  setText(payload, body, "prompt_final", "prompt_final");
  setText(payload, body, "prompt_procedures_list", "prompt_procedures_list", "prompt_lista_procedimentos");
  setText(payload, body, "prompt_ia_tools", "prompt_ia_tools");
  setBool(payload, body, "emoji", false, "emoji");
  setBool(payload, body, "schedule_alert", false, "schedule_alert", "scheduleAlert", "avisar_agendamento");
  setBool(payload, body, "fowarding_alert", false, "fowarding_alert", "forwardingAlert", "avisar_encaminhamento");
  setBool(payload, body, "active", true, "active");
  if ("metadata" in body && body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) payload.metadata = body.metadata;

  if (mode === "create") {
    payload.name = getString(payload.name) || "";
    payload.general_info = getString(payload.general_info) || "";
    payload.initial_message = getString(payload.initial_message) || "";
    payload.active = "active" in payload ? payload.active : true;
    payload.metadata = payload.metadata ?? {};
  }

  return payload;
}

export async function GET(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));
    const select = getAllowedSelect(getString(request.nextUrl.searchParams.get("fields")));
    const path = id
      ? `clinic_assistant_settings?select=${select}&id=eq.${encodeURIComponent(id)}`
      : `clinic_assistant_settings?select=${select}&active=is.true&order=created_at.desc`;
    const rows = await supabaseJson<AssistantRow[]>(path);
    const assistants = rows.map(mapAssistant).filter(Boolean);
    return NextResponse.json({ assistant: assistants[0] ?? null, assistants });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel carregar os assistentes." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawAssistant | null;
    const unauthorized = requireAdmin(request, body);
    if (unauthorized) return unauthorized;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ message: "Payload invalido." }, { status: 400 });

    const payload = buildPayload(body, "create");
    const rows = await supabaseJson<AssistantRow[]>(`clinic_assistant_settings?select=${DB_SELECT}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    return NextResponse.json({ assistant: mapAssistant(rows[0] ?? null) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel salvar o assistente." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawAssistant | null;
    const unauthorized = requireAdmin(request, body);
    if (unauthorized) return unauthorized;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ message: "Payload invalido." }, { status: 400 });

    const id = getString(body.id) || getString(request.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ message: "O ID e obrigatorio." }, { status: 400 });

    const payload = buildPayload(body, "patch");
    if (Object.keys(payload).length === 0) return NextResponse.json({ message: "Nenhum campo para atualizar." }, { status: 400 });

    const rows = await supabaseJson<AssistantRow[]>(`clinic_assistant_settings?id=eq.${encodeURIComponent(id)}&select=${DB_SELECT}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    const assistant = mapAssistant(rows[0] ?? null);
    if (!assistant) return NextResponse.json({ message: "Assistente nao encontrado." }, { status: 404 });
    return NextResponse.json({ assistant });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel editar o assistente." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const unauthorized = requireAdmin(request);
    if (unauthorized) return unauthorized;
    const id = getString(request.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ message: "ID do assistente e obrigatorio." }, { status: 400 });

    await supabaseJson<unknown>(`clinic_assistant_settings?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel apagar o assistente." }, { status: 500 });
  }
}
