import { NextResponse } from "next/server";
import { actionLabels, type Routine, type RoutineAction, type RoutineActionType, type RoutineTrigger } from "@/lib/routines";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type RoutinePayload = Partial<Omit<Routine, "id">>;
type RoutineBody = RoutinePayload & { id?: unknown };

type TagRow = { id: string; airtable_record_id: string | null; label: string; color: string | null };
type TemplateRow = { id: string; label: string; content: string | null };
type UserProfileRow = { id: string; airtable_record_id: string | null; name: string; email: string };
type RoutineActionRow = {
  id: string;
  airtable_record_id: string | null;
  action_type: string;
  label: string | null;
  delay_minutes: number | string | null;
  interval_amount: number | string | null;
  interval_label: string | null;
  subject: string | null;
  message: string | null;
  notes: string | null;
  webhook_url: string | null;
  position: number | null;
  responsible_user_profiles?: UserProfileRow | null;
  message_templates?: TemplateRow | null;
  tags?: TagRow | null;
};
type RoutineRow = {
  id: string;
  airtable_record_id: string | null;
  name: string;
  description: string | null;
  trigger: string;
  target_status: string | null;
  specific_date: string | null;
  birthday_enabled: boolean | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  target_tag?: TagRow | null;
  routine_actions?: RoutineActionRow[];
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeTrigger(value: unknown): RoutineTrigger {
  const normalized = normalizeText(getString(value));
  if (normalized.includes("data") || normalized === "specific_date") return "specific_date";
  if (normalized.includes("tag")) return "tag";
  if (normalized.includes("status")) return "status";
  if (normalized.includes("anivers") || normalized === "birthday") return "birthday";
  return "manual";
}

function normalizeActionType(value: unknown): RoutineActionType {
  const normalized = normalizeText(getString(value));
  if (normalized === "create_notice" || normalized.includes("aviso")) return "create_notice";
  if (normalized === "send_message" || normalized.includes("mensagem")) return "send_message";
  if (normalized === "add_tag" || normalized.includes("tag")) return "add_tag";
  if (normalized === "wait" || normalized.includes("aguard")) return "wait";
  if (normalized === "webhook" || normalized.includes("webhook")) return "webhook";
  return "create_task";
}

function getSupabaseRestUrl() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_REST_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }
  return SUPABASE_REST_URL.replace(/\/$/, "");
}

async function supabaseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getSupabaseRestUrl()}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text);
  if (!text.trim()) return null as T;
  return JSON.parse(text) as T;
}

function externalId(row: { id: string; airtable_record_id: string | null }) {
  return row.airtable_record_id || row.id;
}

function mapAction(row: RoutineActionRow): RoutineAction {
  const type = normalizeActionType(row.action_type);
  const template = row.message_templates;
  const tag = row.tags;
  const responsible = row.responsible_user_profiles;

  return {
    id: externalId(row),
    type,
    label: row.label || actionLabels[type],
    delayMinutes: getNumber(row.delay_minutes),
    intervalAmount: row.interval_amount === null ? undefined : getNumber(row.interval_amount),
    intervalLabel: row.interval_label || undefined,
    responsibleUserId: responsible ? externalId(responsible) : "",
    subject: row.subject || "",
    message: row.message || "",
    notes: row.notes || "",
    webhookUrl: row.webhook_url || "",
    templateId: template?.id || "",
    templateLabel: template?.label || "",
    templateContent: template?.content || "",
    tagId: tag ? externalId(tag) : "",
    tagLabel: tag?.label || "",
    order: row.position ?? 0,
  };
}

function mapRoutine(row: RoutineRow): Routine {
  const trigger = normalizeTrigger(row.trigger);
  const targetTag = row.target_tag;
  const actions = (row.routine_actions ?? []).map(mapAction).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return {
    id: externalId(row),
    name: row.name,
    description: row.description || "",
    trigger,
    targetId: trigger === "tag" && targetTag ? externalId(targetTag) : trigger === "status" ? row.target_status || "" : "",
    targetLabel: trigger === "tag" ? targetTag?.label || "" : trigger === "status" ? row.target_status || "" : trigger === "specific_date" ? row.specific_date || "" : "",
    targetColor: trigger === "tag" ? targetTag?.color || "" : "",
    specificDate: row.specific_date || "",
    birthdayEnabled: row.birthday_enabled === true,
    active: row.is_active !== false,
    actions,
    processIds: actions.map((action) => action.id),
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

const ROUTINE_SELECT = [
  "id,airtable_record_id,name,description,trigger,target_status,specific_date,birthday_enabled,is_active,created_at,updated_at",
  "target_tag:target_tag_id(id,airtable_record_id,label,color)",
  "routine_actions(id,airtable_record_id,action_type,label,delay_minutes,interval_amount,interval_label,subject,message,notes,webhook_url,position,responsible_user_profiles:responsible_user_profile_id(id,airtable_record_id,name,email),message_templates:template_id(id,label,content),tags:tag_id(id,airtable_record_id,label,color))",
].join(",");

async function fetchRoutineById(id: string) {
  const filter = isUuid(id) ? `id=eq.${encodeURIComponent(id)}` : `airtable_record_id=eq.${encodeURIComponent(id)}`;
  const rows = await supabaseRequest<RoutineRow[]>(`routines?select=${ROUTINE_SELECT}&${filter}&limit=1`);
  return rows[0] ?? null;
}

async function resolveExternalId(table: string, id: string) {
  if (!id) return null;
  const filter = isUuid(id) ? `id=eq.${encodeURIComponent(id)}` : `airtable_record_id=eq.${encodeURIComponent(id)}`;
  const rows = await supabaseRequest<Array<{ id: string }>>(`${table}?select=id&${filter}&limit=1`);
  return rows[0]?.id ?? null;
}

async function resolveMessageTemplateId(id: string) {
  if (!id || !isUuid(id)) return null;
  const rows = await supabaseRequest<Array<{ id: string }>>(`message_templates?select=id&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows[0]?.id ?? null;
}

function normalizePayload(body: unknown): Required<Pick<Routine, "name" | "description" | "trigger" | "targetId" | "targetLabel" | "specificDate" | "active" | "actions">> {
  if (!body || typeof body !== "object") throw new Error("Dados invalidos.");
  const payload = body as RoutinePayload;
  const name = getString(payload.name);
  if (!name) throw new Error("Informe o nome da rotina.");

  const trigger = normalizeTrigger(payload.trigger);
  const targetId = getString(payload.targetId);
  const targetLabel = getString(payload.targetLabel);
  const specificDate = getString(payload.specificDate);
  const actions = Array.isArray(payload.actions) ? payload.actions : [];

  if (trigger === "tag" && !targetId) throw new Error("Escolha a tag que dispara a rotina.");
  if (trigger === "status" && !targetLabel) throw new Error("Escolha o status que dispara a rotina.");
  if (trigger === "specific_date" && !specificDate) throw new Error("Informe a data especifica da rotina.");
  if (actions.some((action) => action.type === "add_tag" && !getString(action.tagId))) throw new Error("Escolha a tag da acao Vincular tag.");
  if (actions.some((action) => action.type === "send_message" && !getString(action.templateId) && !getString(action.message))) throw new Error("Digite uma mensagem ou escolha um template para a acao Enviar mensagem.");

  return {
    name,
    description: getString(payload.description),
    trigger,
    targetId,
    targetLabel,
    specificDate,
    active: payload.active !== false,
    actions,
  };
}

async function getRoutineWritePayload(payload: ReturnType<typeof normalizePayload>) {
  const targetTagId = payload.trigger === "tag" ? await resolveExternalId("tags", payload.targetId) : null;
  if (payload.trigger === "tag" && !targetTagId) throw new Error("Tag de gatilho nao encontrada no Supabase.");

  return {
    name: payload.name,
    description: payload.description || null,
    trigger: payload.trigger,
    target_tag_id: targetTagId,
    target_status: payload.trigger === "status" ? payload.targetLabel : null,
    specific_date: payload.trigger === "specific_date" ? payload.specificDate : null,
    birthday_enabled: payload.trigger === "birthday",
    is_active: payload.active,
    source: "supabase",
  };
}

async function getActionWritePayload(action: RoutineAction, routineId: string, index: number) {
  const type = normalizeActionType(action.type);
  return {
    routine_id: routineId,
    action_type: type,
    label: getString(action.label) || actionLabels[type],
    delay_minutes: getNumber(action.delayMinutes),
    interval_amount: action.intervalAmount === undefined ? null : getNumber(action.intervalAmount),
    interval_label: getString(action.intervalLabel) || null,
    responsible_user_profile_id: await resolveExternalId("user_profiles", getString(action.responsibleUserId)),
    subject: getString(action.subject) || null,
    message: getString(action.message) || null,
    notes: getString(action.notes) || null,
    webhook_url: getString(action.webhookUrl) || null,
    template_id: await resolveMessageTemplateId(getString(action.templateId)),
    tag_id: await resolveExternalId("tags", getString(action.tagId)),
    position: index,
  };
}

async function replaceActions(routineId: string, actions: RoutineAction[]) {
  await supabaseRequest<unknown>(`routine_actions?routine_id=eq.${encodeURIComponent(routineId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  if (actions.length === 0) return;
  const rows = [];
  for (const [index, action] of actions.entries()) rows.push(await getActionWritePayload(action, routineId, index));

  await supabaseRequest<unknown>("routine_actions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function updateRoutine(id: string, body: unknown) {
  const existing = await fetchRoutineById(id);
  if (!existing) throw new Error("Rotina nao encontrada.");

  const payload = normalizePayload(body);
  await supabaseRequest<unknown>(`routines?id=eq.${encodeURIComponent(existing.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(await getRoutineWritePayload(payload)),
  });
  await replaceActions(existing.id, payload.actions);

  const routine = await fetchRoutineById(existing.id);
  return routine ? mapRoutine(routine) : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  const rawMessage = error instanceof Error ? error.message : "";
  try {
    const parsed = JSON.parse(rawMessage) as { message?: string; error?: { message?: string } };
    return parsed.message || parsed.error?.message || rawMessage || fallback;
  } catch {
    return rawMessage || fallback;
  }
}

export async function GET() {
  try {
    const rows = await supabaseRequest<RoutineRow[]>(`routines?select=${ROUTINE_SELECT}&order=name.asc`);
    return NextResponse.json({ routines: rows.map(mapRoutine) });
  } catch (error) {
    return NextResponse.json({ routines: [], message: getErrorMessage(error, "Nao foi possivel carregar rotinas.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RoutineBody;
    const id = getString(body.id);
    if (id) {
      const routine = await updateRoutine(id, body);
      return NextResponse.json({ routine, message: "Rotina atualizada." });
    }

    const payload = normalizePayload(body);
    const rows = await supabaseRequest<RoutineRow[]>("routines?select=id,airtable_record_id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(await getRoutineWritePayload(payload)),
    });
    const row = rows[0];
    if (!row?.id) throw new Error("Supabase nao retornou a rotina criada.");

    await replaceActions(row.id, payload.actions);
    const routine = await fetchRoutineById(row.id);
    return NextResponse.json({ routine: routine ? mapRoutine(routine) : null, message: "Rotina criada." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, "Nao foi possivel criar a rotina.") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = getString(searchParams.get("id"));
    if (!id) throw new Error("Rotina invalida.");

    const routine = await updateRoutine(id, await request.json());
    return NextResponse.json({ routine, message: "Rotina atualizada." });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, "Nao foi possivel atualizar a rotina.") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = getString(searchParams.get("id"));
    if (!id) throw new Error("Rotina invalida.");

    const existing = await fetchRoutineById(id);
    if (!existing) throw new Error("Rotina nao encontrada.");

    await supabaseRequest<unknown>(`routines?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    return NextResponse.json({ id, message: "Rotina removida." });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, "Nao foi possivel remover a rotina.") }, { status: 500 });
  }
}
