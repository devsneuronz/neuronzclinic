import { NextResponse } from "next/server";
import {
  actionLabels,
  type Routine,
  type RoutineAction,
  type RoutineActionType,
  type RoutineComparisonOperator,
  type RoutineCondition,
  type RoutineConditionGroup,
  type RoutineConditionOperator,
  type RoutineTrigger,
} from "@/lib/routines";
import { validateRoutineTriggerLogic } from "@/lib/routine-trigger-rules";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROUTINES_WEBHOOK_SECRET = process.env.ROUTINES_WEBHOOK_SECRET;
const ROUTINES_AI_CLASSIFIER_WEBHOOK_URL = process.env.ROUTINES_AI_CLASSIFIER_WEBHOOK_URL;

type RawRecord = Record<string, unknown>;
type RoutineEventType = "manual" | "message_received" | "tag_added" | "status_changed" | "specific_date" | "birthday";

type EventBody = {
  eventId?: unknown;
  eventType?: unknown;
  occurredAt?: unknown;
  contactId?: unknown;
  contactAirtableId?: unknown;
  chatId?: unknown;
  contactName?: unknown;
  contactPhone?: unknown;
  messageId?: unknown;
  messageText?: unknown;
  tagId?: unknown;
  tagLabel?: unknown;
  status?: unknown;
  previousStatus?: unknown;
  routineId?: unknown;
  correlationId?: unknown;
  causationId?: unknown;
  dryRun?: unknown;
};

type NormalizedEvent = {
  eventId: string;
  eventType: RoutineEventType;
  occurredAt: string;
  contactId: string;
  contactAirtableId: string;
  chatId: string;
  contactName: string;
  contactPhone: string;
  messageId: string;
  messageText: string;
  tagId: string;
  tagLabel: string;
  status: string;
  previousStatus: string;
  routineId: string;
  correlationId: string;
  causationId: string;
  dryRun: boolean;
};

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
  blocks_ai_reply: boolean | null;
  position: number | null;
  responsible_user_profiles?: UserProfileRow | null;
  message_templates?: TemplateRow | null;
  tags?: TagRow | null;
};
type RoutineConditionRow = {
  id: string;
  condition_type: string;
  comparison_operator: string;
  value_text: string | null;
  position: number | null;
  is_active: boolean | null;
  target_tag?: TagRow | null;
};
type RoutineConditionGroupRow = {
  id: string;
  operator: string;
  position: number | null;
  routine_conditions?: RoutineConditionRow[];
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
  condition_operator: string | null;
  is_active: boolean | null;
  target_tag?: TagRow | null;
  routine_actions?: RoutineActionRow[];
  routine_condition_groups?: RoutineConditionGroupRow[];
};

type ContactState = {
  id: string;
  chatId: string;
  name: string;
  phone: string;
  status: string;
  tags: Array<{ id: string; label: string }>;
};

type EvaluationContext = {
  event: NormalizedEvent;
  contact: ContactState;
  aiMatches: Record<string, boolean>;
};

type ConditionResult = { conditionId: string; type: RoutineTrigger; matched: boolean; activated: boolean };
type GroupResult = { groupId: string; matched: boolean; activated: boolean; conditions: ConditionResult[] };

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeEventType(value: unknown): RoutineEventType {
  const normalized = normalizeText(getString(value)).replace(/ /g, "_");
  if (["manual", "message_received", "tag_added", "status_changed", "specific_date", "birthday"].includes(normalized)) return normalized as RoutineEventType;
  throw new Error("eventType invalido.");
}

function normalizeTrigger(value: unknown): RoutineTrigger {
  const normalized = normalizeText(getString(value));
  if (normalized === "ai_message" || (normalized.includes("mensagem") && normalized.includes("ia"))) return "ai_message";
  if (normalized === "specific_message" || normalized.includes("mensagem especifica")) return "specific_message";
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

function normalizeConditionOperator(value: unknown): RoutineConditionOperator {
  return normalizeText(getString(value)) === "any" ? "any" : "all";
}

function normalizeComparisonOperator(value: unknown, type: RoutineTrigger): RoutineComparisonOperator {
  const normalized = normalizeText(getString(value)).replace(/ /g, "_");
  if (["exists", "equals", "contains", "starts_with", "regex", "is_today", "ai_matches"].includes(normalized)) return normalized as RoutineComparisonOperator;
  if (type === "manual") return "exists";
  if (type === "birthday") return "is_today";
  if (type === "ai_message") return "ai_matches";
  return "equals";
}

function externalId(row: { id: string; airtable_record_id: string | null }) {
  return row.airtable_record_id || row.id;
}

function getSupabaseRestUrl() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Configure NEXT_PUBLIC_SUPABASE_REST_URL e SUPABASE_SERVICE_ROLE_KEY.");
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
  return text.trim() ? (JSON.parse(text) as T) : (null as T);
}

function isAuthorized(request: Request) {
  if (!ROUTINES_WEBHOOK_SECRET) return false;
  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${ROUTINES_WEBHOOK_SECRET}` || request.headers.get("x-routines-secret") === ROUTINES_WEBHOOK_SECRET;
}

function normalizeEvent(body: EventBody): NormalizedEvent {
  const eventType = normalizeEventType(body.eventType);
  const messageId = getString(body.messageId);
  const eventId = getString(body.eventId) || (messageId ? `message:${messageId}` : "");
  const contactId = getString(body.contactId) || getString(body.chatId) || getString(body.contactAirtableId);
  if (!eventId) throw new Error("eventId e obrigatorio.");
  if (!contactId) throw new Error("Informe contactId, chatId ou contactAirtableId.");
  if (eventType === "message_received" && !getString(body.messageText)) throw new Error("messageText e obrigatorio para message_received.");
  if (eventType === "manual" && !getString(body.routineId)) throw new Error("routineId e obrigatorio para o evento manual.");

  return {
    eventId,
    eventType,
    occurredAt: getString(body.occurredAt) || new Date().toISOString(),
    contactId,
    contactAirtableId: getString(body.contactAirtableId),
    chatId: getString(body.chatId),
    contactName: getString(body.contactName),
    contactPhone: getString(body.contactPhone),
    messageId,
    messageText: getString(body.messageText),
    tagId: getString(body.tagId),
    tagLabel: getString(body.tagLabel),
    status: getString(body.status),
    previousStatus: getString(body.previousStatus),
    routineId: getString(body.routineId),
    correlationId: getString(body.correlationId) || eventId,
    causationId: getString(body.causationId),
    dryRun: getBoolean(body.dryRun),
  };
}

function mapAction(row: RoutineActionRow): RoutineAction {
  const type = normalizeActionType(row.action_type);
  return {
    id: externalId(row), type, label: row.label || actionLabels[type], delayMinutes: getNumber(row.delay_minutes),
    intervalAmount: row.interval_amount === null ? undefined : getNumber(row.interval_amount), intervalLabel: row.interval_label || undefined,
    responsibleUserId: row.responsible_user_profiles ? externalId(row.responsible_user_profiles) : "", subject: row.subject || "", message: row.message || "",
    notes: row.notes || "", webhookUrl: row.webhook_url || "", templateId: row.message_templates?.id || "", templateLabel: row.message_templates?.label || "",
    templateContent: row.message_templates?.content || "", blocksAiReply: row.blocks_ai_reply !== false,
    tagId: row.tags ? externalId(row.tags) : "", tagLabel: row.tags?.label || "", order: row.position ?? 0,
  };
}

function mapCondition(row: RoutineConditionRow): RoutineCondition {
  const type = normalizeTrigger(row.condition_type);
  const tag = row.target_tag;
  return {
    id: row.id, type, comparisonOperator: normalizeComparisonOperator(row.comparison_operator, type), value: type === "tag" ? tag?.label || "" : row.value_text || "",
    targetId: type === "tag" && tag ? externalId(tag) : "", targetLabel: type === "tag" ? tag?.label || "" : row.value_text || "", targetColor: tag?.color || "", active: row.is_active !== false,
  };
}

function mapRoutine(row: RoutineRow): Routine {
  const groups = (row.routine_condition_groups ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((group): RoutineConditionGroup => ({
    id: group.id,
    operator: normalizeConditionOperator(group.operator),
    conditions: (group.routine_conditions ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(mapCondition),
  }));
  const primary = groups[0]?.conditions[0];
  const legacyTrigger = normalizeTrigger(row.trigger);
  const trigger = primary?.type || legacyTrigger;
  const actions = (row.routine_actions ?? []).map(mapAction).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    id: externalId(row), name: row.name, description: row.description || "", trigger,
    targetId: primary?.targetId || "", targetLabel: primary?.targetLabel || "", targetColor: primary?.targetColor || "",
    specificDate: trigger === "specific_date" ? primary?.value || row.specific_date || "" : "", birthdayEnabled: trigger === "birthday" || row.birthday_enabled === true,
    conditionOperator: normalizeConditionOperator(row.condition_operator), conditionGroups: groups, active: row.is_active !== false, actions,
  };
}

async function fetchRoutines(event: NormalizedEvent) {
  const select = [
    "id,airtable_record_id,name,description,trigger,target_status,specific_date,birthday_enabled,condition_operator,is_active",
    "routine_condition_groups(id,operator,position,routine_conditions(id,condition_type,comparison_operator,value_text,position,is_active,target_tag:target_tag_id(id,airtable_record_id,label,color)))",
    "routine_actions(id,airtable_record_id,action_type,label,delay_minutes,interval_amount,interval_label,subject,message,notes,webhook_url,blocks_ai_reply,position,responsible_user_profiles:responsible_user_profile_id(id,airtable_record_id,name,email),message_templates:template_id(id,label,content),tags:tag_id(id,airtable_record_id,label,color))",
  ].join(",");
  const routineFilter = event.routineId ? (isUuid(event.routineId) ? `&id=eq.${encodeURIComponent(event.routineId)}` : `&airtable_record_id=eq.${encodeURIComponent(event.routineId)}`) : "";
  const rows = await supabaseRequest<RoutineRow[]>(`routines?select=${select}&is_active=is.true${routineFilter}&order=name.asc`);
  return rows.map(mapRoutine);
}

function getTag(value: unknown) {
  if (typeof value === "string") {
    try { return getTag(JSON.parse(value)); } catch { return value.trim() ? { id: value.trim(), label: value.trim() } : null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as RawRecord;
  const id = getString(record.id) || getString(record["IDA TAG"]);
  const label = getString(record.label) || getString(record.Tag) || getString(record.tag) || getString(record.name) || id;
  return id || label ? { id: id || label, label } : null;
}

function getTagsFromChat(chat: RawRecord) {
  const tags: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();
  for (const candidate of [chat.json_tags_parsed, chat.json_tags, chat.tag_chat_array]) {
    const values = Array.isArray(candidate) ? candidate : typeof candidate === "string" ? candidate.split(",") : [];
    for (const value of values) {
      const tag = getTag(value);
      if (!tag) continue;
      const key = `${normalizeText(tag.id)}:${normalizeText(tag.label)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}

async function fetchContactState(event: NormalizedEvent): Promise<ContactState> {
  const filters: string[] = [];
  if (event.chatId) filters.push(`chat_id=eq.${encodeURIComponent(event.chatId)}`);
  if (isUuid(event.contactId)) filters.push(`contact_id=eq.${encodeURIComponent(event.contactId)}`, `id=eq.${encodeURIComponent(event.contactId)}`);
  if (!isUuid(event.contactId) && event.contactId !== event.chatId) filters.push(`chat_id=eq.${encodeURIComponent(event.contactId)}`);
  for (const filter of filters) {
    const rows = await supabaseRequest<RawRecord[]>(`chats?select=id,chat_id,contact_id,Status_chat,json_tags_parsed,json_tags,tag_chat_array,nome_contato,phone_contact&${filter}&limit=1`);
    const chat = rows[0];
    if (!chat) continue;
    return { id: getString(chat.contact_id) || event.contactId, chatId: getString(chat.chat_id) || event.chatId, name: getString(chat.nome_contato) || event.contactName, phone: getString(chat.phone_contact) || event.contactPhone, status: getString(chat.Status_chat) || event.status, tags: getTagsFromChat(chat) };
  }
  return { id: event.contactId, chatId: event.chatId, name: event.contactName, phone: event.contactPhone, status: event.status, tags: event.tagId || event.tagLabel ? [{ id: event.tagId || event.tagLabel, label: event.tagLabel || event.tagId }] : [] };
}

function compareMessage(received: string, expected: string, operator: RoutineComparisonOperator) {
  const left = normalizeText(received);
  const right = normalizeText(expected);
  if (!left || !right) return false;
  if (operator === "contains") return left.includes(right);
  if (operator === "starts_with") return left.startsWith(right);
  if (operator === "regex") {
    try { return new RegExp(expected, "iu").test(received); } catch { return false; }
  }
  return left === right;
}

function hasTag(context: EvaluationContext, condition: RoutineCondition) {
  const expectedId = normalizeText(condition.targetId || "");
  const expectedLabel = normalizeText(condition.targetLabel || condition.value);
  return context.contact.tags.some((tag) => (expectedId && normalizeText(tag.id) === expectedId) || (expectedLabel && normalizeText(tag.label) === expectedLabel));
}

function evaluateCondition(condition: RoutineCondition, context: EvaluationContext): ConditionResult {
  if (!condition.active) return { conditionId: condition.id, type: condition.type, matched: false, activated: false };
  let matched = false;
  let activated = false;
  if (condition.type === "manual") matched = activated = context.event.eventType === "manual" && Boolean(context.event.routineId);
  if (condition.type === "tag") {
    matched = hasTag(context, condition);
    activated = matched && context.event.eventType === "tag_added" && Boolean((context.event.tagId && normalizeText(context.event.tagId) === normalizeText(condition.targetId || "")) || (context.event.tagLabel && normalizeText(context.event.tagLabel) === normalizeText(condition.targetLabel || condition.value)));
  }
  if (condition.type === "status") {
    matched = normalizeText(context.contact.status) === normalizeText(condition.value);
    activated = matched && context.event.eventType === "status_changed" && normalizeText(context.event.status) === normalizeText(condition.value);
  }
  if (condition.type === "specific_message" && context.event.eventType === "message_received") matched = activated = compareMessage(context.event.messageText, condition.value, condition.comparisonOperator);
  if (condition.type === "ai_message" && context.event.eventType === "message_received") matched = activated = context.aiMatches[condition.id] === true;
  if (condition.type === "specific_date") {
    matched = context.event.eventType === "specific_date" && context.event.occurredAt.slice(0, 10) === condition.value;
    activated = matched;
  }
  if (condition.type === "birthday") matched = activated = context.event.eventType === "birthday";
  return { conditionId: condition.id, type: condition.type, matched, activated };
}

function evaluateGroup(group: RoutineConditionGroup, context: EvaluationContext): GroupResult {
  const conditions = group.conditions.map((condition) => evaluateCondition(condition, context));
  const matched = group.operator === "all" ? conditions.length > 0 && conditions.every((result) => result.matched) : conditions.some((result) => result.matched);
  return { groupId: group.id, matched, activated: matched && conditions.some((result) => result.matched && result.activated), conditions };
}

function evaluateRoutine(routine: Routine, context: EvaluationContext) {
  const groups = routine.conditionGroups.map((group) => evaluateGroup(group, context));
  const matched = routine.conditionOperator === "all" ? groups.length > 0 && groups.every((group) => group.matched) : groups.some((group) => group.matched);
  const activated = routine.conditionOperator === "all" ? matched && groups.some((group) => group.activated) : groups.some((group) => group.matched && group.activated);
  return { routineId: routine.id, routineName: routine.name, matched: matched && activated, groups };
}

function parseAiMatches(value: unknown) {
  const matches: Record<string, boolean> = {};
  if (typeof value === "string") {
    try { return parseAiMatches(JSON.parse(value)); } catch { return matches; }
  }
  if (Array.isArray(value)) {
    for (const item of value) Object.assign(matches, parseAiMatches(item));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  const record = value as RawRecord;
  if (typeof record.output === "string") Object.assign(matches, parseAiMatches(record.output));
  const raw = record.matches;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, matched] of Object.entries(raw)) matches[id] = matched === true;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const record = item as RawRecord;
      const id = getString(record.conditionId) || getString(record.id);
      if (id) matches[id] = record.matched === true;
    }
  }
  return matches;
}

async function classifyAiConditions(message: string, routines: Routine[]) {
  const conditions = routines.flatMap((routine) => routine.conditionGroups.flatMap((group) => group.conditions.filter((condition) => condition.active && condition.type === "ai_message"))).map((condition) => ({ id: condition.id, intent: condition.value }));
  if (!conditions.length || !ROUTINES_AI_CLASSIFIER_WEBHOOK_URL) return { matches: {}, configured: Boolean(ROUTINES_AI_CLASSIFIER_WEBHOOK_URL), requested: conditions.length, error: "" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(ROUTINES_AI_CLASSIFIER_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json", ...(ROUTINES_WEBHOOK_SECRET ? { "x-routines-secret": ROUTINES_WEBHOOK_SECRET } : {}) }, body: JSON.stringify({ message, conditions }), signal: controller.signal, cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Classificador de IA recusou a requisicao (${response.status}).`);
    return { matches: parseAiMatches(data), configured: true, requested: conditions.length, error: "" };
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "O classificador de IA excedeu o tempo limite." : error instanceof Error ? error.message : "Falha no classificador de IA.";
    return { matches: {}, configured: true, requested: conditions.length, error: message };
  } finally { clearTimeout(timeout); }
}

async function startRoutineRun(routine: Routine, context: EvaluationContext) {
  let accumulatedDelayMinutes = 0;
  const actions = routine.actions.map((action, index) => {
    accumulatedDelayMinutes += action.delayMinutes;
    return { action_id: action.id, action_index: index, action_type: action.type, execute_at: new Date(Date.now() + accumulatedDelayMinutes * 60_000).toISOString(), payload: action };
  });

  const rows = await supabaseRequest<Array<{ run_id: string; created: boolean; action_count: number }>>("rpc/start_routine_run", {
    method: "POST",
    body: JSON.stringify({
      p_routine_airtable_id: routine.id,
      p_routine_name: routine.name,
      p_contact_id: context.contact.id || context.event.contactId,
      p_contact_airtable_id: context.event.contactAirtableId || "",
      p_chat_id: context.contact.chatId || context.event.chatId || "",
      p_contact_name: context.contact.name || "",
      p_contact_phone: context.contact.phone || "",
      p_trigger_type: context.event.eventType,
      p_trigger_target: context.event.tagId || context.event.tagLabel || context.event.status || context.event.messageText || "",
      p_event_id: context.event.eventId,
      p_payload: context.event,
      p_actions: actions,
    }),
  });

  return rows[0] || null;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
    const body = (await request.json()) as EventBody;
    const event = normalizeEvent(body);
    const [routines, contact] = await Promise.all([fetchRoutines(event), fetchContactState(event)]);
    const invalidRoutines = routines.flatMap((routine) => {
      const issues = validateRoutineTriggerLogic(routine.conditionGroups, routine.conditionOperator);
      return issues.length > 0 ? [{ routineId: routine.id, routineName: routine.name, issues: issues.map((issue) => issue.message) }] : [];
    });
    const eligibleRoutines = routines.filter((routine) => !invalidRoutines.some((invalid) => invalid.routineId === routine.id));
    const ai = await classifyAiConditions(event.messageText, eligibleRoutines);
    const context: EvaluationContext = { event, contact, aiMatches: ai.matches };
    const evaluations = eligibleRoutines.map((routine) => ({ routine, result: evaluateRoutine(routine, context) }));
    const matched = evaluations.filter((evaluation) => evaluation.result.matched);
    const blockingRoutineIds = event.eventType === "message_received"
      ? matched.filter(({ routine }) => routine.actions.some((action) => action.type === "send_message" && action.blocksAiReply !== false)).map(({ routine }) => routine.id)
      : [];
    const aiReplySuppression = {
      suppressAiReply: blockingRoutineIds.length > 0,
      suppressionReason: blockingRoutineIds.length > 0 ? "routine_will_send_message" : null,
      blockingRoutineIds,
    };

    if (event.dryRun) return NextResponse.json({ dryRun: true, evaluated: eligibleRoutines.length, invalidRoutines, matched: matched.length, ...aiReplySuppression, ai: { configured: ai.configured, requested: ai.requested, error: ai.error || undefined }, evaluations: evaluations.map((evaluation) => evaluation.result) });

    const runs: RawRecord[] = [];
    let actionRuns = 0;
    let duplicates = 0;
    for (const evaluation of matched) {
      const result = await startRoutineRun(evaluation.routine, context);
      if (!result?.run_id) continue;
      actionRuns += getNumber(result.action_count);
      if (!result.created) { duplicates += 1; continue; }
      runs.push({ id: result.run_id });
    }

    return NextResponse.json({ evaluated: eligibleRoutines.length, invalidRoutines, matched: matched.length, created: runs.length, duplicates, actionRuns, runIds: runs.map((run) => run.id).filter(Boolean), ...aiReplySuppression, ai: { configured: ai.configured, requested: ai.requested, error: ai.error || undefined } });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "O classificador de IA excedeu o tempo limite." : error instanceof Error ? error.message : "Nao foi possivel avaliar as rotinas.";
    return NextResponse.json({ message }, { status: /obrigatorio|invalido/i.test(message) ? 400 : 500 });
  }
}
