import type { ClinicAssistantInfo, ClinicProcedure } from "@/lib/clinic-info";
import { getBool, getNullableString, getString, isUuid, supabaseJson } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

type AssistantRow = {
  id: string;
  name: string | null;
  general_info: string | null;
  initial_message: string | null;
  active: boolean | null;
  gender: string | null;
  emoji: boolean | null;
  speaking_style: string | null;
  schedule_alert: boolean | null;
  fowarding_alert: boolean | null;
  direct_response_enabled: boolean | null;
  interaction_history_enabled: boolean | null;
  client_name: string | null;
  client_whats: string | null;
};
type ProcedureRow = {
  id: string;
  name: string | null;
  interest: string | null;
  interest_tag_id: string | null;
  description: string | null;
  status: boolean | null;
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
  created_at: string | null;
};
type TagRow = { id: string; label: string; color: string | null };
type AssistantPayload = Partial<ClinicAssistantInfo> & Record<string, unknown>;
type ProcedurePayload = Partial<ClinicProcedure> & Record<string, unknown>;

const ASSISTANT_INFO_TABLE = "clinic_assistant_settings";

const assistantSelect = [
  "id",
  "name",
  "general_info",
  "initial_message",
  "active",
  "gender",
  "emoji",
  "speaking_style",
  "schedule_alert",
  "fowarding_alert",
  "direct_response_enabled",
  "interaction_history_enabled",
  "client_name",
  "client_whats",
].join(",");
const procedureSelect = [
  "id",
  "name",
  "interest",
  "interest_tag_id",
  "description",
  "status",
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
  "created_at",
].join(",");

function mapAssistant(row: AssistantRow | null): ClinicAssistantInfo & Record<string, unknown> {
  const aiEnabled = row?.active !== false;
  let directResponseEnabled = aiEnabled && row?.direct_response_enabled !== false;
  let interactionHistoryEnabled = aiEnabled && row?.interaction_history_enabled !== false;

  if (aiEnabled && !directResponseEnabled && !interactionHistoryEnabled) {
    directResponseEnabled = true;
    interactionHistoryEnabled = true;
  }

  return {
    id: row?.id ?? null,
    name: row?.name || "Ia",
    generalInfo: row?.general_info || "",
    initialMessage: row?.initial_message || "",
    gender: row?.gender || "ia",
    emoji: row?.emoji !== false,
    speakingStyle: row?.speaking_style || "formal",
    scheduleAlert: !!row?.schedule_alert,
    forwardingAlert: !!row?.fowarding_alert,
    active: row?.active,
    directResponseEnabled,
    interactionHistoryEnabled,
    clientName: row?.client_name || "",
    clientWhats: row?.client_whats || "",
    dados_empresa: row?.general_info || "",
    msg_inicial: row?.initial_message || "",
    estilo_conversa: row?.speaking_style || "formal",
    avisar_agendamento: !!row?.schedule_alert,
    avisar_encaminhamento: !!row?.fowarding_alert,
    cliente_nome: row?.client_name || "",
    cliente_whats: row?.client_whats || "",
  };
}

function pickString(input: Record<string, unknown>, fields: string[], fallback = "") {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      return getString(input[field]);
    }
  }
  return fallback;
}

function pickNullableString(input: Record<string, unknown>, fields: string[]) {
  const value = pickString(input, fields);
  return value || null;
}

function normalizeAssistant(input: AssistantPayload) {
  const name = getString(input.name) || "Lia";
  const scheduleAlert = getBool(input.scheduleAlert ?? input.avisar_agendamento, false);
  const forwardingAlert = scheduleAlert || getBool(input.forwardingAlert ?? input.avisar_encaminhamento, false);
  const aiEnabled = getBool(input.active, true);
  let directResponseEnabled = aiEnabled && getBool(input.directResponseEnabled, true);
  let interactionHistoryEnabled = aiEnabled && getBool(input.interactionHistoryEnabled, true);

  if (aiEnabled && !directResponseEnabled && !interactionHistoryEnabled) {
    directResponseEnabled = true;
    interactionHistoryEnabled = true;
  }

  return {
    name,
    general_info: pickString(input, ["dados_empresa", "generalInfo"]),
    initial_message: pickString(input, ["msg_inicial", "initialMessage"]),
    active: true,
    gender: getNullableString(input.gender),
    emoji: getBool(input.emoji, true),
    speaking_style: pickNullableString(input, ["estilo_conversa", "speakingStyle"]) ?? "formal",
    schedule_alert: scheduleAlert,
    fowarding_alert: forwardingAlert,
    direct_response_enabled: directResponseEnabled,
    interaction_history_enabled: interactionHistoryEnabled,
    client_name: pickNullableString(input, ["cliente_nome", "clientName"]),
    client_whats: pickNullableString(input, ["cliente_whats", "clientWhats"]),
  };
}

async function mapProcedures(rows: ProcedureRow[]) {
  const tagIds = Array.from(new Set(rows.map((row) => row.interest_tag_id).filter((id): id is string => Boolean(id))));
  const tags = tagIds.length > 0 ? await supabaseJson<TagRow[]>(`tags?select=id,label,color&id=in.(${tagIds.map(encodeURIComponent).join(",")})`) : [];
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));

  return rows.map((row): ClinicProcedure & Record<string, unknown> => {
    const tag = row.interest_tag_id ? tagById.get(row.interest_tag_id) : null;
    const active = row.status !== false;
    return {
      id: row.id,
      name: row.name || "",
      interestId: row.interest_tag_id || undefined,
      interest: row.interest || tag?.label || "",
      interestColor: tag?.color || undefined,
      description: row.description || "",
      active,
      status: active ? "ativo" : "inativo",
      nome: row.name || "",
      modo_resposta_ia: row.reply_mode || "usar_como_base",
      info_resposta_ia: row.description || "",
      modo_agendamento_ia: row.scheduling_mode || "nao_conduzir_criar_aviso",
      modalidade: row.modality || "presencial",
      informar_valor_avaliacao: row.tell_assessment_fee ? "sim" : "nao",
      informar_valor_consulta: row.tell_appointment_fee ? "sim" : "nao",
      informar_valor_procedimento: row.tell_procedure_fee ? "sim" : "nao",
      valor_avaliacao: row.assessment_fee || "",
      valor_consulta: row.appointment_fee || "",
      valor_procedimento: row.procedure_fee || "",
      agendas_contexto_ia: row.schedules_context || "",
      regra_multiplos_profissionais: row.multiple_professionals_rule || "",
      config_agendamento_contexto_ia: row.schedules_context_config || "",
      interesse: row.interest || tag?.label || "",
      created_at: row.created_at || "",
    };
  });
}

async function resolveInterestTagId(interest: string, interestId?: string) {
  if (isUuid(interestId || "")) return interestId || null;
  const label = interest.trim();
  if (!label) return null;

  const rows = await supabaseJson<TagRow[]>(`tags?select=id,label,color&label=eq.${encodeURIComponent(label)}&limit=1`);
  if (rows[0]) return rows[0].id;

  const [tag] = await supabaseJson<TagRow[]>("tags?select=id,label,color", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ label, color: "#0d9488", active: true }),
  });
  return tag?.id ?? null;
}

function normalizeProcedure(input: ProcedurePayload) {
  const name = getString(input.name) || getString(input.nome);
  const interest = getString(input.interest) || getString(input.interesse);
  const description = getString(input.description) || getString(input.info_resposta_ia);
  const active = "status" in input ? getString(input.status) !== "inativo" : getBool(input.active, true);
  if (!name && !interest) throw new Error("Informe o nome ou interesse do procedimento.");
  if (!description) throw new Error("Informe a descricao do procedimento.");
  return {
    name,
    interest,
    description,
    active,
    interestId: getString(input.interestId),
    schedulingMode: getNullableString(input.schedulingMode) ?? getNullableString(input.modo_agendamento_ia),
    replyMode: getNullableString(input.replyMode) ?? getNullableString(input.modo_resposta_ia),
    modality: getNullableString(input.modality) ?? getNullableString(input.modalidade),
    tellAssessmentFee: getBool(input.tellAssessmentFee ?? input.informar_valor_avaliacao, false),
    tellProcedureFee: getBool(input.tellProcedureFee ?? input.informar_valor_procedimento, false),
    tellAppointmentFee: getBool(input.tellAppointmentFee ?? input.informar_valor_consulta, false),
    assessmentFee: getNullableString(input.assessmentFee) ?? getNullableString(input.valor_avaliacao),
    procedureFee: getNullableString(input.procedureFee) ?? getNullableString(input.valor_procedimento),
    appointmentFee: getNullableString(input.appointmentFee) ?? getNullableString(input.valor_consulta),
    schedulesContext: getNullableString(input.schedulesContext) ?? getNullableString(input.agendas_contexto_ia),
    multipleProfessionalsRule: getNullableString(input.multipleProfessionalsRule) ?? getNullableString(input.regra_multiplos_profissionais),
    schedulesContextConfig: getNullableString(input.schedulesContextConfig) ?? getNullableString(input.config_agendamento_contexto_ia),
  };
}

function procedurePayload(input: ReturnType<typeof normalizeProcedure>, interestTagId: string | null) {
  return {
    name: input.name || null,
    interest: input.interest || null,
    interest_tag_id: interestTagId,
    description: input.description,
    status: input.active,
    scheduling_mode: input.schedulingMode,
    reply_mode: input.replyMode,
    modality: input.modality,
    tell_assessment_fee: input.tellAssessmentFee,
    tell_procedure_fee: input.tellProcedureFee,
    tell_appointment_fee: input.tellAppointmentFee,
    assessment_fee: input.tellAssessmentFee ? input.assessmentFee : null,
    procedure_fee: input.tellProcedureFee ? input.procedureFee : null,
    appointment_fee: input.tellAppointmentFee ? input.appointmentFee : null,
    schedules_context: input.schedulesContext,
    multiple_professionals_rule: input.multipleProfessionalsRule,
    schedules_context_config: input.schedulesContextConfig,
  };
}

export async function GET() {
  try {
    const [assistants, procedures] = await Promise.all([
      supabaseJson<AssistantRow[]>(`${ASSISTANT_INFO_TABLE}?select=${assistantSelect}&active=is.true&order=created_at.desc&limit=1`),
      supabaseJson<ProcedureRow[]>(`clinic_procedures?select=${procedureSelect}&order=created_at.desc`),
    ]);

    const assistant = mapAssistant(assistants[0] ?? null);
    return NextResponse.json({ assistant, assistants: assistants[0] ? [assistant] : [], procedures: await mapProcedures(procedures) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel carregar informacoes da clinica." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProcedurePayload;
    const payload = normalizeProcedure(body);
    const interestTagId = await resolveInterestTagId(payload.interest, payload.interestId);
    const [row] = await supabaseJson<ProcedureRow[]>(`clinic_procedures?select=${procedureSelect}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(procedurePayload(payload, interestTagId)),
    });
    const [procedure] = await mapProcedures(row ? [row] : []);
    return NextResponse.json({ procedure }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel adicionar o procedimento." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { type?: unknown; assistant?: Partial<ClinicAssistantInfo>; procedure?: ProcedurePayload };
    const type = getString(body.type);

    if (type === "assistant") {
      const assistant = body.assistant ?? {};
      const id = getString(assistant.id);
      const payload = normalizeAssistant(assistant as AssistantPayload);
      const path = isUuid(id) ? `${ASSISTANT_INFO_TABLE}?id=eq.${encodeURIComponent(id)}&select=${assistantSelect}` : `${ASSISTANT_INFO_TABLE}?select=${assistantSelect}`;
      const [row] = await supabaseJson<AssistantRow[]>(path, {
        method: isUuid(id) ? "PATCH" : "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      return NextResponse.json({ assistant: mapAssistant(row ?? null) });
    }

    if (type === "procedure") {
      const procedure = body.procedure ?? {};
      const id = getString(procedure.id);
      if (!isUuid(id)) throw new Error("Procedimento nao encontrado.");
      const payload = normalizeProcedure(procedure);
      const interestTagId = await resolveInterestTagId(payload.interest, payload.interestId);
      const [row] = await supabaseJson<ProcedureRow[]>(`clinic_procedures?id=eq.${encodeURIComponent(id)}&select=${procedureSelect}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(procedurePayload(payload, interestTagId)),
      });
      const [mapped] = await mapProcedures(row ? [row] : []);
      return NextResponse.json({ procedure: mapped });
    }

    return NextResponse.json({ message: "Tipo de atualizacao invalido." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel salvar." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));
    if (!isUuid(id)) throw new Error("Procedimento nao encontrado.");

    await supabaseJson<unknown>(`clinic_procedures?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel excluir o procedimento." }, { status: 500 });
  }
}
