import { isFallbackAdminEmail, normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type RawProcedure = Record<string, unknown>;

type ClinicProcedureRow = {
  id: string;
  legacy_id: string | null;
  name: string | null;
  interest: string | null;
  interest_tag_id: string | null;
  description: string;
  status: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  scheduling_mode: string | null;
  reply_mode: string | null;
  modality: string | null;
  tell_assessment_fee: boolean | null;
  tell_procedure_fee: boolean | null;
  tell_appointment_fee: boolean | null;
  assessment_fee: string | null;
  procedure_fee: string | null;
  appointment_fee: string | null;
  schedules_context: string | null;
  multiple_professionals_rule: string | null;
  schedules_context_config: string | null;
};

type SupabaseTagRow = {
  id: string;
  airtable_record_id: string | null;
  label: string;
};

const DB_SELECT = [
  "id",
  "legacy_id",
  "name",
  "interest",
  "interest_tag_id",
  "description",
  "status",
  "metadata",
  "created_at",
  "updated_at",
  "scheduling_mode",
  "reply_mode",
  "modality",
  "tell_assessment_fee",
  "tell_procedure_fee",
  "tell_appointment_fee",
  "assessment_fee",
  "procedure_fee",
  "appointment_fee",
  "schedules_context",
  "multiple_professionals_rule",
  "schedules_context_config",
].join(",");

const SELECT_FIELD_MAP: Record<string, string> = {
  id: "id",
  legacy_id: "legacy_id",
  name: "name",
  nome: "name",
  interest: "interest",
  interesse: "interest",
  interest_tag_id: "interest_tag_id",
  description: "description",
  info_resposta_ia: "description",
  status: "status",
  metadata: "metadata",
  created_at: "created_at",
  updated_at: "updated_at",
  scheduling_mode: "scheduling_mode",
  modo_agendamento_ia: "scheduling_mode",
  reply_mode: "reply_mode",
  modo_resposta_ia: "reply_mode",
  modality: "modality",
  modalidade: "modality",
  tell_assessment_fee: "tell_assessment_fee",
  informar_valor_avaliacao: "tell_assessment_fee",
  tell_procedure_fee: "tell_procedure_fee",
  informar_valor_procedimento: "tell_procedure_fee",
  tell_appointment_fee: "tell_appointment_fee",
  informar_valor_consulta: "tell_appointment_fee",
  assessment_fee: "assessment_fee",
  valor_avaliacao: "assessment_fee",
  procedure_fee: "procedure_fee",
  valor_procedimento: "procedure_fee",
  appointment_fee: "appointment_fee",
  valor_consulta: "appointment_fee",
  schedules_context: "schedules_context",
  agendas_contexto_ia: "schedules_context",
  multiple_professionals_rule: "multiple_professionals_rule",
  regra_multiplos_profissionais: "multiple_professionals_rule",
  schedules_context_config: "schedules_context_config",
  config_agendamento_contexto_ia: "schedules_context_config",
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(value: unknown) {
  const text = getString(value);
  return text || null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getNullableBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = normalizeText(getString(value));
  if (!text) return null;
  if (["true", "sim", "yes", "1", "ativo", "active"].includes(text)) return true;
  if (["false", "nao", "no", "0", "inativo", "inactive"].includes(text)) return false;
  return null;
}

function getStatusBoolean(value: unknown) {
  return getNullableBoolean(value) ?? true;
}

function getLegacyStatus(value: boolean | null | undefined) {
  return value === false ? "inativo" : "ativo";
}

function getLegacyFlag(value: boolean | null | undefined) {
  return value ? "sim" : "nao";
}

function mapProcedure(row: ClinicProcedureRow) {
  return {
    ...row,
    nome: row.name,
    interesse: row.interest,
    info_resposta_ia: row.description,
    modo_agendamento_ia: row.scheduling_mode,
    modo_resposta_ia: row.reply_mode,
    modalidade: row.modality,
    informar_valor_avaliacao: getLegacyFlag(row.tell_assessment_fee),
    informar_valor_consulta: getLegacyFlag(row.tell_appointment_fee),
    informar_valor_procedimento: getLegacyFlag(row.tell_procedure_fee),
    valor_avaliacao: row.assessment_fee,
    valor_consulta: row.appointment_fee,
    valor_procedimento: row.procedure_fee,
    agendas_contexto_ia: row.schedules_context,
    regra_multiplos_profissionais: row.multiple_professionals_rule,
    config_agendamento_contexto_ia: row.schedules_context_config,
    status: getLegacyStatus(row.status),
    status_active: row.status,
  };
}

function getViewer(request: NextRequest, body?: RawProcedure | null) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role") ?? body?.role);
  const email = getString(request.nextUrl.searchParams.get("email") ?? body?.email).toLowerCase();
  return { role, email };
}

function requireAdmin(request: NextRequest, body?: RawProcedure | null) {
  const viewer = getViewer(request, body);
  if (viewer.role !== "admin" && !isFallbackAdminEmail(viewer.email)) {
    return NextResponse.json({ message: "Apenas administradores podem alterar procedimentos." }, { status: 403 });
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

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for procedures. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.");
  }

  return fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
}

async function resolveInterestTag(body: RawProcedure) {
  const requestedId = getString(body.interest_tag_id);
  const requestedLabel = getString(body.interest ?? body.interesse);

  if ("interest_tag_id" in body && !requestedId) {
    return { interest_tag_id: null, interest: requestedLabel || null };
  }

  if (!requestedId && !requestedLabel) {
    return { interest_tag_id: null, interest: null };
  }

  const response = await supabaseRequest("tags?select=id,airtable_record_id,label&status=eq.active&limit=1000");
  if (!response.ok) throw new Error(await response.text());

  const rows = (await response.json()) as SupabaseTagRow[];
  const normalizedLabel = normalizeText(requestedLabel);
  const tag = rows.find((row) => {
    if (requestedId && (row.id === requestedId || row.airtable_record_id === requestedId)) return true;
    return Boolean(normalizedLabel && normalizeText(row.label) === normalizedLabel);
  });

  if (!tag && requestedId) {
    throw new Error("Tag de interesse nao encontrada no Supabase.");
  }

  return {
    interest_tag_id: tag?.id ?? null,
    interest: tag?.label ?? (requestedLabel || null),
  };
}

async function buildProcedurePayload(body: RawProcedure, mode: "create" | "patch") {
  const patch: RawProcedure = {};
  const setText = (dbField: string, ...bodyFields: string[]) => {
    for (const field of bodyFields) {
      if (field in body) {
        patch[dbField] = getNullableString(body[field]);
        return;
      }
    }
  };
  const setBoolean = (dbField: string, ...bodyFields: string[]) => {
    for (const field of bodyFields) {
      if (field in body) {
        patch[dbField] = getNullableBoolean(body[field]);
        return;
      }
    }
  };

  setText("name", "name", "nome");
  setText("legacy_id", "legacy_id");
  setText("description", "description", "info_resposta_ia");
  setText("scheduling_mode", "scheduling_mode", "modo_agendamento_ia");
  setText("reply_mode", "reply_mode", "modo_resposta_ia");
  setText("modality", "modality", "modalidade");
  setText("assessment_fee", "assessment_fee", "valor_avaliacao");
  setText("procedure_fee", "procedure_fee", "valor_procedimento");
  setText("appointment_fee", "appointment_fee", "valor_consulta");
  setText("schedules_context", "schedules_context", "agendas_contexto_ia");
  setText("multiple_professionals_rule", "multiple_professionals_rule", "regra_multiplos_profissionais");
  setText("schedules_context_config", "schedules_context_config", "config_agendamento_contexto_ia");
  setBoolean("tell_assessment_fee", "tell_assessment_fee", "informar_valor_avaliacao");
  setBoolean("tell_procedure_fee", "tell_procedure_fee", "informar_valor_procedimento");
  setBoolean("tell_appointment_fee", "tell_appointment_fee", "informar_valor_consulta");

  if ("status" in body) patch.status = getStatusBoolean(body.status);
  if ("metadata" in body && body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) patch.metadata = body.metadata;

  if ("interest_tag_id" in body || "interest" in body || "interesse" in body) {
    const interest = await resolveInterestTag(body);
    patch.interest_tag_id = interest.interest_tag_id;
    patch.interest = interest.interest;
  }

  if (mode === "create") {
    patch.name = getNullableString(patch.name ?? body.name ?? body.nome);
    patch.description = getNullableString(patch.description ?? body.description ?? body.info_resposta_ia ?? patch.name ?? patch.interest);
    patch.status = "status" in patch ? patch.status : true;
  }

  return patch;
}

export async function GET(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));
    const fields = getString(request.nextUrl.searchParams.get("fields"));
    const select = getAllowedSelect(fields);

    if (id) {
      const response = await supabaseRequest(`clinic_procedures?select=${select}&id=eq.${encodeURIComponent(id)}`);
      if (!response.ok) return NextResponse.json({ message: await response.text() }, { status: response.status });

      const data = (await response.json()) as ClinicProcedureRow[];
      return NextResponse.json({ procedure: data[0] ? mapProcedure(data[0]) : null });
    }

    const response = await supabaseRequest(`clinic_procedures?select=${select}&order=created_at.desc`);
    if (!response.ok) return NextResponse.json({ message: await response.text() }, { status: response.status });

    const data = (await response.json()) as ClinicProcedureRow[];
    return NextResponse.json({ procedures: data.map(mapProcedure) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel carregar os procedimentos." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawProcedure | null;
    const unauthorized = requireAdmin(request, body);
    if (unauthorized) return unauthorized;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
    }

    const procedure = await buildProcedurePayload(body, "create");
    if (!getString(procedure.name) && !getString(procedure.interest)) {
      return NextResponse.json({ message: "Informe o nome ou interesse do procedimento." }, { status: 400 });
    }
    if (!getString(procedure.description)) {
      return NextResponse.json({ message: "A descricao do procedimento e obrigatoria." }, { status: 400 });
    }

    const response = await supabaseRequest(`clinic_procedures?select=${DB_SELECT}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(procedure),
    });

    if (!response.ok) return NextResponse.json({ message: await response.text() }, { status: response.status });

    const data = (await response.json()) as ClinicProcedureRow[];
    return NextResponse.json({ procedure: data[0] ? mapProcedure(data[0]) : procedure });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel salvar o procedimento." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawProcedure | null;
    const unauthorized = requireAdmin(request, body);
    if (unauthorized) return unauthorized;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
    }

    const id = getString(body.id) || getString(request.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ message: "O ID e obrigatorio." }, { status: 400 });

    const patch = await buildProcedurePayload(body, "patch");
    if ("name" in patch && patch.name === null && !("interest" in patch)) {
      return NextResponse.json({ message: "O nome nao pode ser vazio sem um interesse vinculado." }, { status: 400 });
    }
    if ("description" in patch && patch.description === null) {
      return NextResponse.json({ message: "A descricao nao pode ser vazia." }, { status: 400 });
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ message: "Nenhum campo para atualizar." }, { status: 400 });
    }

    const response = await supabaseRequest(`clinic_procedures?id=eq.${encodeURIComponent(id)}&select=${DB_SELECT}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });

    if (!response.ok) return NextResponse.json({ message: await response.text() }, { status: response.status });

    const data = (await response.json()) as ClinicProcedureRow[];
    const procedure = data[0];
    if (!procedure) return NextResponse.json({ message: "Procedimento nao encontrado." }, { status: 404 });

    return NextResponse.json({ procedure: mapProcedure(procedure) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel editar o procedimento." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const unauthorized = requireAdmin(request);
    if (unauthorized) return unauthorized;

    const id = getString(request.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ message: "ID do procedimento e obrigatorio." }, { status: 400 });

    const response = await supabaseRequest(`clinic_procedures?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    if (!response.ok) return NextResponse.json({ message: await response.text() }, { status: response.status });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel apagar o procedimento." }, { status: 500 });
  }
}
