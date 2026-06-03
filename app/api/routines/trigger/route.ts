import { NextResponse } from "next/server";
import type { Routine, RoutineActionType, RoutineTrigger } from "@/lib/routines";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const ROUTINES_TABLE = process.env.AIRTABLE_ROUTINES_TABLE || "tblTOHnzJW7tOBTHc";
const PROCESSES_TABLE = process.env.AIRTABLE_ROUTINE_PROCESSES_TABLE || "tblnjiV1h19XRU89j";
const ROUTINES_WEBHOOK_SECRET = process.env.ROUTINES_WEBHOOK_SECRET;

type RawRecord = Record<string, unknown>;
type AirtableRecord = { id: string; createdTime?: string; fields?: Record<string, unknown> };

type TriggerBody = {
  trigger?: unknown;
  contactId?: unknown;
  contactAirtableId?: unknown;
  chatId?: unknown;
  contactName?: unknown;
  contactPhone?: unknown;
  targetId?: unknown;
  targetLabel?: unknown;
  occurredAt?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAuthorized(request: Request) {
  if (!ROUTINES_WEBHOOK_SECRET) return true;

  const authorization = request.headers.get("authorization") || "";
  const secret = request.headers.get("x-routines-secret") || "";

  return authorization === `Bearer ${ROUTINES_WEBHOOK_SECRET}` || secret === ROUTINES_WEBHOOK_SECRET;
}

function normalizeTrigger(value: string): RoutineTrigger {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("data")) return "specific_date";
  if (normalized.includes("tag")) return "tag";
  if (normalized.includes("status")) return "status";
  if (normalized.includes("anivers")) return "birthday";
  return "manual";
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
    throw new Error("Envie um JSON no body da requisição.");
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

async function airtableRequest(table: string, path = "") {
  if (!AIRTABLE_TOKEN) throw new Error("Configure AIRTABLE_TOKEN.");

  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${path}`, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function fetchAirtableRecords(table: string, params = new URLSearchParams({ pageSize: "100" })) {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const pageParams = new URLSearchParams(params);
    if (offset) pageParams.set("offset", offset);
    const data = (await airtableRequest(table, `?${pageParams}`)) as { offset?: string; records?: AirtableRecord[] };
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return records;
}

function getRecordIds(fields: Record<string, unknown>, field: string) {
  const value = fields[field];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && /^rec[a-zA-Z0-9]+$/.test(item)) : [];
}

function getStringField(fields: Record<string, unknown>, field: string) {
  const value = fields[field];
  return typeof value === "string" ? value.trim() : "";
}

function getBooleanField(fields: Record<string, unknown>, field: string, fallback: boolean) {
  const value = fields[field];
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && value.trim()) return ["sim", "true", "ativo", "active", "1", "yes"].includes(value.trim().toLowerCase());
  return fallback;
}

function getDelayMinutes(fields: Record<string, unknown>) {
  const interval = getStringField(fields, "Intervalo").toLowerCase();
  const amount = Number(fields.numero);

  if (!Number.isFinite(amount) || !amount || interval.includes("nenhum")) return 0;
  if (interval.includes("hora")) return amount * 60;
  if (interval.includes("dia")) return amount * 1440;
  return amount;
}

function getActionType(value: string): RoutineActionType {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("aviso")) return "create_notice";
  if (normalized.includes("mensagem")) return "send_message";
  if (normalized.includes("tag")) return "add_tag";
  return "create_task";
}

async function fetchRoutines(): Promise<Routine[]> {
  const routines = await fetchAirtableRecords(ROUTINES_TABLE);
  const processIds = routines.flatMap((record) => getRecordIds(record.fields ?? {}, "Processos"));
  const processFormula = processIds.length ? `OR(${processIds.map((id) => `RECORD_ID()="${id}"`).join(",")})` : "";
  const processes = processFormula ? await fetchAirtableRecords(PROCESSES_TABLE, new URLSearchParams({ pageSize: "100", filterByFormula: processFormula })) : [];
  const processMap = new Map(processes.map((record) => [record.id, record]));

  return routines.map((record) => {
    const fields = record.fields ?? {};
    const trigger = normalizeTrigger(getStringField(fields, "Gatilho"));
    const actions = getRecordIds(fields, "Processos")
      .map((id) => processMap.get(id))
      .filter((process): process is AirtableRecord => Boolean(process))
      .map((process, index) => {
        const processFields = process.fields ?? {};
        const type = getActionType(getStringField(processFields, "Tipo"));

        return {
          id: process.id,
          type,
          label: getStringField(processFields, "Tipo") || type,
          delayMinutes: getDelayMinutes(processFields),
          order: Number(processFields.ordem) || index,
          responsibleUserId: getRecordIds(processFields, "Responsavel")[0] || "",
          subject: getStringField(processFields, "Assunto"),
          notes: getStringField(processFields, "Descrição"),
          templateId: getRecordIds(processFields, "Template_mensagem")[0] || "",
          tagId: getRecordIds(processFields, "Tags")[0] || "",
        };
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return {
      id: record.id,
      name: getStringField(fields, "Rotina") || record.id,
      description: getStringField(fields, "Descrição"),
      trigger,
      targetId: trigger === "tag" ? getRecordIds(fields, "Tag")[0] || "" : trigger === "status" ? getStringField(fields, "Status") : "",
      targetLabel: trigger === "status" ? getStringField(fields, "Status") : "",
      specificDate: getStringField(fields, "Data"),
      birthdayEnabled: trigger === "birthday",
      active: getBooleanField(fields, "Ativo", Boolean(getStringField(fields, "Gatilho"))),
      actions,
    } satisfies Routine;
  });
}

function matchesRoutine(routine: Routine, body: TriggerBody) {
  const trigger = normalizeTrigger(getString(body.trigger));
  const targetId = getString(body.targetId);
  const targetLabel = getString(body.targetLabel);

  if (!routine.active || routine.trigger !== trigger) return false;
  if (trigger === "manual" || trigger === "birthday") return true;
  if (trigger === "tag") return Boolean(targetId && routine.targetId === targetId);
  if (trigger === "status") return Boolean(targetLabel && routine.targetLabel.toLowerCase() === targetLabel.toLowerCase());
  if (trigger === "specific_date") return Boolean(routine.specificDate && routine.specificDate === targetLabel);

  return false;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
    }

    const body = await parseTriggerBody(request);
    const contactId = getString(body.contactId) || getString(body.chatId) || getString(body.contactAirtableId);

    if (!contactId) {
      return NextResponse.json({ message: "Informe contactId, chatId ou contactAirtableId." }, { status: 400 });
    }

    const routines = (await fetchRoutines()).filter((routine) => matchesRoutine(routine, body));
    const runs: RawRecord[] = [];
    const actionRuns: RawRecord[] = [];

    for (const routine of routines) {
      const runPayload = {
        routine_airtable_id: routine.id,
        routine_name: routine.name,
        contact_id: contactId,
        contact_airtable_id: getString(body.contactAirtableId) || null,
        chat_id: getString(body.chatId) || null,
        contact_name: getString(body.contactName) || null,
        contact_phone: getString(body.contactPhone) || null,
        trigger_type: routine.trigger,
        trigger_target: getString(body.targetId) || getString(body.targetLabel) || null,
        status: "running",
        payload: body as RawRecord,
      };
      const createdRuns = (await supabaseRequest("routine_runs?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(runPayload),
      })) as RawRecord[];
      const run = createdRuns[0];
      if (!run?.id) continue;
      runs.push(run);

      let accumulatedDelayMinutes = 0;

      for (const [index, action] of routine.actions.entries()) {
        accumulatedDelayMinutes += action.delayMinutes;
        const executeAt = new Date(Date.now() + accumulatedDelayMinutes * 60_000).toISOString();
        actionRuns.push({
          routine_run_id: run.id,
          action_id: action.id,
          action_index: index,
          action_type: action.type,
          execute_at: executeAt,
          status: "pending",
          payload: action as unknown as RawRecord,
        });
      }
    }

    if (actionRuns.length > 0) {
      await supabaseRequest("routine_action_runs", {
        method: "POST",
        body: JSON.stringify(actionRuns),
      });
    }

    return NextResponse.json({ matched: routines.length, runs, actionRuns: actionRuns.length });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível disparar rotinas." }, { status: 500 });
  }
}
