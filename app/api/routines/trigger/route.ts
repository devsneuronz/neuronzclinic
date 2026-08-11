import { NextResponse } from "next/server";
import { actionLabels, type Routine, type RoutineAction, type RoutineActionType, type RoutineTrigger } from "@/lib/routines";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROUTINES_WEBHOOK_SECRET = process.env.ROUTINES_WEBHOOK_SECRET;

type RawRecord = Record<string, unknown>;

type TriggerBody = {
  eventId?: unknown;
  routineId?: unknown;
  routineAirtableId?: unknown;
  trigger?: unknown;
  contactId?: unknown;
  contactAirtableId?: unknown;
  chatId?: unknown;
  contactName?: unknown;
  contactPhone?: unknown;
  targetId?: unknown;
  targetLabel?: unknown;
  occurredAt?: unknown;
  message?: unknown;
  messageText?: unknown;
  aiMatched?: unknown;
};

type TagRow = { id: string; airtable_record_id: string | null; label: string; color: string | null };
type TemplateRow = { id: string; label: string };
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
  target_tag?: TagRow | null;
  routine_actions?: RoutineActionRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTrigger(value: string): RoutineTrigger {
  const normalized = normalizeText(value);
  if (normalized === "ai_message" || (normalized.includes("mensagem") && normalized.includes("ia"))) return "ai_message";
  if (normalized === "specific_message" || normalized.includes("mensagem especifica")) return "specific_message";
  if (normalized.includes("data") || normalized === "specific_date") return "specific_date";
  if (normalized.includes("tag")) return "tag";
  if (normalized.includes("status")) return "status";
  if (normalized.includes("anivers") || normalized === "birthday") return "birthday";
  return "manual";
}

function normalizeActionType(value: string): RoutineActionType {
  const normalized = normalizeText(value);
  if (normalized === "create_notice" || normalized.includes("aviso")) return "create_notice";
  if (normalized === "send_message" || normalized.includes("mensagem")) return "send_message";
  if (normalized === "add_tag" || normalized.includes("tag")) return "add_tag";
  if (normalized === "wait" || normalized.includes("aguard")) return "wait";
  if (normalized === "webhook" || normalized.includes("webhook")) return "webhook";
  return "create_task";
}

function externalId(row: { id: string; airtable_record_id: string | null }) {
  return row.airtable_record_id || row.id;
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!origin || !host) return false;

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host && (!fetchSite || fetchSite === "same-origin");
  } catch {
    return false;
  }
}

function isManualAppRequest(request: Request, body: TriggerBody) {
  const trigger = normalizeTrigger(getString(body.trigger));
  const routineId = getString(body.routineId) || getString(body.routineAirtableId);

  return trigger === "manual" && Boolean(routineId) && isSameOriginRequest(request);
}

function isAuthorized(request: Request, body: TriggerBody) {
  if (isManualAppRequest(request, body)) return true;
  if (!ROUTINES_WEBHOOK_SECRET) return false;

  const authorization = request.headers.get("authorization") || "";
  const secret = request.headers.get("x-routines-secret") || "";

  return authorization === `Bearer ${ROUTINES_WEBHOOK_SECRET}` || secret === ROUTINES_WEBHOOK_SECRET;
}

function getSupabaseRestUrl() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_REST_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }

  return SUPABASE_REST_URL.replace(/\/$/, "");
}

async function supabaseRequest(path: string, init?: RequestInit) {
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
  if (!text.trim()) return null;

  return JSON.parse(text);
}

async function parseTriggerBody(request: Request): Promise<TriggerBody> {
  const contentType = request.headers.get("content-type") || "";
  const rawBody = await request.text();
  const trimmedBody = rawBody.trim();

  if (!trimmedBody) {
    throw new Error("Envie um JSON no body da requisicao.");
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(trimmedBody);
    return Object.fromEntries(params.entries()) as TriggerBody;
  }

  const objectPreviewMatch = trimmedBody.match(/^\[Object:\s*(\{[\s\S]*\})\]$/);
  const jsonText = objectPreviewMatch?.[1] ?? trimmedBody;
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("O body precisa ser um objeto JSON.");
  }

  return parsed as TriggerBody;
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
    tagId: tag ? externalId(tag) : "",
    tagLabel: tag?.label || "",
    order: row.position ?? 0,
  };
}

function mapRoutine(row: RoutineRow): Routine {
  const trigger = normalizeTrigger(row.trigger);
  const targetTag = row.target_tag;
  const actions = (row.routine_actions ?? []).map(mapAction).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const targetId = trigger === "tag" && targetTag ? externalId(targetTag) : trigger === "status" ? row.target_status || "" : "";
  const targetLabel = trigger === "tag" ? targetTag?.label || "" : trigger === "status" || trigger === "specific_message" || trigger === "ai_message" ? row.target_status || "" : trigger === "specific_date" ? row.specific_date || "" : "";

  return {
    id: externalId(row),
    name: row.name,
    description: row.description || "",
    trigger,
    targetId,
    targetLabel,
    targetColor: trigger === "tag" ? targetTag?.color || "" : "",
    specificDate: row.specific_date || "",
    birthdayEnabled: row.birthday_enabled === true,
    conditionOperator: "all",
    conditionGroups: [{ id: `legacy-${row.id}`, operator: "all", conditions: [{ id: `legacy-condition-${row.id}`, type: trigger, comparisonOperator: trigger === "manual" ? "exists" : trigger === "birthday" ? "is_today" : trigger === "ai_message" ? "ai_matches" : "equals", value: targetLabel, targetId, targetLabel, targetColor: targetTag?.color || "", active: true }] }],
    active: row.is_active !== false,
    actions,
  };
}

async function fetchRoutines(): Promise<Routine[]> {
  const select = [
    "id,airtable_record_id,name,description,trigger,target_status,specific_date,birthday_enabled,is_active",
    "target_tag:target_tag_id(id,airtable_record_id,label,color)",
    "routine_actions(id,airtable_record_id,action_type,label,delay_minutes,interval_amount,interval_label,subject,message,notes,webhook_url,position,responsible_user_profiles:responsible_user_profile_id(id,airtable_record_id,name,email),message_templates:template_id(id,label),tags:tag_id(id,airtable_record_id,label,color))",
  ].join(",");
  const rows = (await supabaseRequest(`routines?select=${select}&is_active=is.true&order=name.asc`)) as RoutineRow[];
  return rows.map(mapRoutine);
}

function matchesRoutine(routine: Routine, body: TriggerBody) {
  const trigger = normalizeTrigger(getString(body.trigger));
  const routineId = getString(body.routineId) || getString(body.routineAirtableId);
  const targetId = getString(body.targetId);
  const targetLabel = getString(body.targetLabel);
  const message = getString(body.message) || getString(body.messageText) || targetLabel;

  if (!routine.active || routine.trigger !== trigger) return false;
  if (routineId && routine.id !== routineId) return false;
  if (trigger === "manual" || trigger === "birthday") return true;
  if (trigger === "tag") return Boolean(targetId && routine.targetId === targetId);
  if (trigger === "status") return Boolean(targetLabel && routine.targetLabel.toLowerCase() === targetLabel.toLowerCase());
  if (trigger === "specific_date") return Boolean(routine.specificDate && routine.specificDate === targetLabel);
  if (trigger === "specific_message") return Boolean(message && normalizeText(routine.targetLabel) === normalizeText(message));
  if (trigger === "ai_message") return body.aiMatched === true && Boolean(routineId);

  return false;
}

export async function POST(request: Request) {
  try {
    const body = await parseTriggerBody(request);

    if (!isAuthorized(request, body)) {
      return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
    }

    const contactId = getString(body.contactId) || getString(body.chatId) || getString(body.contactAirtableId);

    if (!contactId) {
      return NextResponse.json({ message: "Informe contactId, chatId ou contactAirtableId." }, { status: 400 });
    }

    const routines = (await fetchRoutines()).filter((routine) => matchesRoutine(routine, body));
    const runs: RawRecord[] = [];
    let actionRuns = 0;
    let duplicates = 0;
    const actionRunIds: string[] = [];
    const eventId = getString(body.eventId) || crypto.randomUUID();

    for (const routine of routines) {
      let accumulatedDelayMinutes = 0;
      const actions = routine.actions.map((action, index) => {
        accumulatedDelayMinutes += action.delayMinutes;
        return {
          action_id: action.id,
          action_index: index,
          action_type: action.type,
          execute_at: new Date(Date.now() + accumulatedDelayMinutes * 60_000).toISOString(),
          payload: action as unknown as RawRecord,
        };
      });

      const resultRows = (await supabaseRequest("rpc/start_routine_run", {
        method: "POST",
        body: JSON.stringify({
          p_routine_airtable_id: routine.id,
          p_routine_name: routine.name,
          p_contact_id: contactId,
          p_contact_airtable_id: getString(body.contactAirtableId),
          p_chat_id: getString(body.chatId),
          p_contact_name: getString(body.contactName),
          p_contact_phone: getString(body.contactPhone),
          p_trigger_type: routine.trigger,
          p_trigger_target: getString(body.targetId) || getString(body.targetLabel),
          p_event_id: eventId,
          p_payload: body as RawRecord,
          p_actions: actions,
        }),
      })) as Array<{ run_id?: string; created?: boolean; action_count?: number }>;
      const result = resultRows[0];
      if (!result?.run_id) continue;
      actionRuns += getNumber(result.action_count);
      if (result.created !== true) { duplicates += 1; continue; }
      runs.push({ id: result.run_id });
      const pendingActions = (await supabaseRequest(
        `routine_action_runs?routine_run_id=eq.${encodeURIComponent(result.run_id)}&status=in.(pending,retrying)&select=id&order=action_index.asc`,
      )) as Array<{ id?: string }>;
      actionRunIds.push(...pendingActions.map((actionRun) => getString(actionRun.id)).filter(Boolean));
    }

    return NextResponse.json({ matched: routines.length, runs, duplicates, actionRuns, actionRunIds });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel disparar rotinas." }, { status: 500 });
  }
}
