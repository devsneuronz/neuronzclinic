import { NextResponse } from "next/server";
import { actionLabels, type Routine, type RoutineAction, type RoutineActionType, type RoutineTrigger } from "@/lib/routines";

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const ROUTINES_TABLE = process.env.AIRTABLE_ROUTINES_TABLE || "tblTOHnzJW7tOBTHc";
const PROCESSES_TABLE = process.env.AIRTABLE_ROUTINE_PROCESSES_TABLE || "tblnjiV1h19XRU89j";
const TAGS_TABLE = process.env.AIRTABLE_TAGS_TABLE || "tblP68L7jNYctqKAq";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields?: Record<string, unknown>;
};

type RoutinePayload = Partial<Omit<Routine, "id">>;

const triggerAliases: Record<string, RoutineTrigger> = {
  manual: "manual",
  "data especifica": "specific_date",
  "data específica": "specific_date",
  specific_date: "specific_date",
  tag: "tag",
  status: "status",
  aniversario: "birthday",
  aniversário: "birthday",
  birthday: "birthday",
};

const triggerToAirtable: Record<RoutineTrigger, string> = {
  manual: "Manual",
  specific_date: "Data específica",
  birthday: "Aniversário",
  tag: "Tag",
  status: "Status",
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getStringField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate];

    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const textValue = value.find((item) => typeof item === "string" && item.trim());
      if (typeof textValue === "string") return textValue.trim();
    }
  }

  return "";
}

function getRecordIds(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && /^rec[a-zA-Z0-9]+$/.test(item));
    if (typeof value === "string" && /^rec[a-zA-Z0-9]+$/.test(value)) return [value];
  }

  return [];
}

function getFirstArrayString(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate];
    if (Array.isArray(value)) {
      const textValue = value.find((item) => typeof item === "string" && item.trim());
      if (typeof textValue === "string") return textValue.trim();
    }
  }

  return "";
}

function getBooleanField(fields: Record<string, unknown>, candidates: string[], fallback: boolean) {
  for (const candidate of candidates) {
    const value = fields[candidate];
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && value.trim()) {
      return ["sim", "true", "ativo", "active", "1", "yes"].includes(value.trim().toLowerCase());
    }
  }

  return fallback;
}

function normalizeTrigger(value: string): RoutineTrigger {
  const key = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return triggerAliases[value.toLowerCase()] || triggerAliases[key] || "manual";
}

function normalizeActionType(value: string): RoutineActionType {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("aviso")) return "create_notice";
  if (normalized.includes("mensagem")) return "send_message";
  if (normalized.includes("tag")) return "add_tag";
  if (normalized.includes("aguard")) return "wait";
  if (normalized.includes("webhook")) return "webhook";
  return "create_task";
}

function getAirtableActionType(type: RoutineActionType) {
  if (type === "create_notice") return "Criar Aviso";
  if (type === "send_message") return "Enviar Mensagem";
  if (type === "add_tag") return "Vincular Tag";
  if (type === "wait") return "Aguardar";
  if (type === "webhook") return "Webhook";
  return "Criar Tarefa";
}

function getDelayMinutes(fields: Record<string, unknown>) {
  const interval = getStringField(fields, ["Intervalo"]).toLowerCase();
  const amount = getNumber(fields.numero);

  if (!amount || interval.includes("nenhum")) return 0;
  if (interval.includes("hora")) return amount * 60;
  if (interval.includes("dia")) return amount * 1440;
  return amount;
}

function getIntervalFields(delayMinutes: number) {
  if (!delayMinutes) return { Intervalo: "Nenhum" };
  if (delayMinutes % 1440 === 0) return { Intervalo: "Dias", numero: delayMinutes / 1440 };
  if (delayMinutes % 60 === 0) return { Intervalo: "Horas", numero: delayMinutes / 60 };
  return { Intervalo: "Minutos", numero: delayMinutes };
}

function assertAirtableToken() {
  if (!AIRTABLE_TOKEN) throw new Error("Missing AIRTABLE_TOKEN or AIRTABLE_API_KEY.");
}

async function airtableRequest(table: string, path = "", init?: RequestInit) {
  assertAirtableToken();

  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null;

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

async function fetchRecordsByIds(table: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id) => /^rec[a-zA-Z0-9]+$/.test(id))));
  const records: AirtableRecord[] = [];

  for (let index = 0; index < uniqueIds.length; index += 20) {
    const batch = uniqueIds.slice(index, index + 20);
    const formula = batch.length === 1 ? `RECORD_ID()="${batch[0]}"` : `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    records.push(...(await fetchAirtableRecords(table, new URLSearchParams({ pageSize: "100", filterByFormula: formula }))));
  }

  return records;
}

function getTagLabel(record: AirtableRecord) {
  const fields = record.fields ?? {};
  return getStringField(fields, ["Tag", "tag", "Nome", "Name", "label"]) || record.id;
}

function getTagColor(record: AirtableRecord) {
  return getStringField(record.fields ?? {}, ["HEXCOR", "hexcor", "Cor", "color"]);
}

function mapProcessRecord(record: AirtableRecord): RoutineAction {
  const fields = record.fields ?? {};
  const type = normalizeActionType(getStringField(fields, ["Tipo"]));
  const label = getStringField(fields, ["Tipo"]) || actionLabels[type];
  const description = getStringField(fields, ["Descrição", "Descricao"]);

  return {
    id: record.id,
    type,
    label,
    delayMinutes: getDelayMinutes(fields),
    intervalLabel: getStringField(fields, ["Intervalo"]),
    order: getNumber(fields.ordem),
    responsibleUserId: getRecordIds(fields, ["Responsavel", "Responsável"])[0] || "",
    subject: getStringField(fields, ["Assunto"]),
    message: type === "send_message" ? description : "",
    notes: type === "send_message" ? "" : description,
    templateId: getRecordIds(fields, ["Template_mensagem"])[0] || "",
    templateLabel: getFirstArrayString(fields, ["Template"]),
    tagId: getRecordIds(fields, ["Tags"])[0] || "",
    tagLabel: getFirstArrayString(fields, ["nome_tag"]),
  };
}

function mapRoutineRecord(record: AirtableRecord, processMap: Map<string, RoutineAction>, tagMap: Map<string, AirtableRecord>): Routine {
  const fields = record.fields ?? {};
  const trigger = normalizeTrigger(getStringField(fields, ["Gatilho"]));
  const tagIds = getRecordIds(fields, ["Tag"]);
  const firstTag = tagIds[0] ? tagMap.get(tagIds[0]) : undefined;
  const processIds = getRecordIds(fields, ["Processos"]);
  const actions = processIds
    .map((id) => processMap.get(id))
    .filter((action): action is RoutineAction => Boolean(action))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const status = getStringField(fields, ["Status"]);
  const date = getStringField(fields, ["Data"]);

  return {
    id: record.id,
    name: getStringField(fields, ["Rotina"]) || "Nova rotina",
    description: getStringField(fields, ["Descrição", "Descricao"]),
    trigger,
    targetId: trigger === "tag" ? tagIds[0] || "" : trigger === "status" ? status : "",
    targetLabel: trigger === "tag" ? (firstTag ? getTagLabel(firstTag) : tagIds[0] || "") : trigger === "status" ? status : trigger === "specific_date" ? date : "",
    targetColor: trigger === "tag" ? getFirstArrayString(fields, ["HEXCOR (from Tag)"]) || (firstTag ? getTagColor(firstTag) : "") : trigger === "status" ? getStringField(fields, ["HEX_STATUS"]) : getStringField(fields, ["HEXCOLOR"]),
    specificDate: date,
    birthdayEnabled: trigger === "birthday",
    active: getBooleanField(fields, ["Ativo", "Active", "active"], Boolean(getStringField(fields, ["Gatilho"]))),
    actions,
    processIds,
    createdAt: record.createdTime,
  };
}

async function getRoutineRecordsWithLinks() {
  const routineRecords = await fetchAirtableRecords(ROUTINES_TABLE);
  const processIds = routineRecords.flatMap((record) => getRecordIds(record.fields ?? {}, ["Processos"]));
  const tagIds = routineRecords.flatMap((record) => getRecordIds(record.fields ?? {}, ["Tag"]));
  const [processRecords, tagRecords] = await Promise.all([
    processIds.length ? fetchRecordsByIds(PROCESSES_TABLE, processIds) : Promise.resolve([]),
    tagIds.length ? fetchRecordsByIds(TAGS_TABLE, tagIds).catch(() => []) : Promise.resolve([]),
  ]);

  return {
    routineRecords,
    processMap: new Map(processRecords.map((record) => [record.id, mapProcessRecord(record)])),
    tagMap: new Map(tagRecords.map((record) => [record.id, record])),
  };
}

function normalizePayload(body: unknown): RoutinePayload {
  if (!body || typeof body !== "object") throw new Error("Dados inválidos.");

  const payload = body as RoutinePayload;
  const name = getString(payload.name);
  if (!name) throw new Error("Informe o nome da rotina.");
  const trigger = normalizeTrigger(getString(payload.trigger));
  const targetId = getString(payload.targetId);
  const targetLabel = getString(payload.targetLabel);
  const specificDate = getString(payload.specificDate);
  const actions = Array.isArray(payload.actions) ? payload.actions : [];

  if (trigger === "tag" && !targetId) throw new Error("Escolha a tag que dispara a rotina.");
  if (trigger === "status" && !targetLabel) throw new Error("Escolha o status que dispara a rotina.");
  if (trigger === "specific_date" && !specificDate) throw new Error("Informe a data específica da rotina.");

  const missingActionTarget = actions.find((action) => action.type === "add_tag" && !getString(action.tagId));
  if (missingActionTarget) throw new Error("Escolha a tag da ação Vincular tag.");
  const missingMessageContent = actions.find((action) => action.type === "send_message" && !getString(action.templateId) && !getString(action.message));
  if (missingMessageContent) throw new Error("Digite uma mensagem ou escolha um template para a ação Enviar mensagem.");

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

function getRoutineFields(payload: RoutinePayload) {
  const trigger = payload.trigger ?? "manual";
  const fields: Record<string, unknown> = {
    Rotina: payload.name,
    "Descrição": payload.description || "",
    Gatilho: triggerToAirtable[trigger],
    Ativo: payload.active === false ? "false" : "true",
  };

  fields.Tag = trigger === "tag" && payload.targetId ? [payload.targetId] : [];
  fields.Status = trigger === "status" && payload.targetLabel ? payload.targetLabel : null;
  fields.Data = trigger === "specific_date" && payload.specificDate ? payload.specificDate : null;

  return fields;
}

function getProcessFields(action: RoutineAction, routineId: string, index: number) {
  const isMessageAction = action.type === "send_message";
  const fields: Record<string, unknown> = {
    Rotina: [routineId],
    Tipo: getAirtableActionType(action.type),
    ordem: index,
    Assunto: action.subject || "",
    "Descrição": isMessageAction ? action.message || "" : action.notes || "",
    ...getIntervalFields(action.delayMinutes),
  };

  if (action.responsibleUserId && /^rec[a-zA-Z0-9]+$/.test(action.responsibleUserId)) fields.Responsavel = [action.responsibleUserId];
  fields.Template_mensagem = isMessageAction && action.templateId && /^rec[a-zA-Z0-9]+$/.test(action.templateId) ? [action.templateId] : [];
  if (action.tagId && /^rec[a-zA-Z0-9]+$/.test(action.tagId)) fields.Tags = [action.tagId];

  return fields;
}

async function syncProcesses(routineId: string, actions: RoutineAction[]) {
  const existing = await fetchAirtableRecords(PROCESSES_TABLE, new URLSearchParams({ pageSize: "100", filterByFormula: `FIND("${routineId}", ARRAYJOIN({Rotina}))>0` }));
  const existingIds = new Set(existing.map((record) => record.id));
  const keptIds = new Set<string>();
  const synced: AirtableRecord[] = [];

  for (const [index, action] of actions.entries()) {
    const fields = getProcessFields(action, routineId, index);

    if (/^rec[a-zA-Z0-9]+$/.test(action.id) && existingIds.has(action.id)) {
      const updated = (await airtableRequest(PROCESSES_TABLE, `/${encodeURIComponent(action.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      })) as AirtableRecord;
      keptIds.add(action.id);
      synced.push(updated);
      continue;
    }

    const created = (await airtableRequest(PROCESSES_TABLE, "", {
      method: "POST",
      body: JSON.stringify({ records: [{ fields }] }),
    })) as { records?: AirtableRecord[] };
    if (created.records?.[0]) synced.push(created.records[0]);
  }

  for (const record of existing) {
    if (!keptIds.has(record.id) && !actions.some((action) => action.id === record.id)) {
      await airtableRequest(PROCESSES_TABLE, `/${encodeURIComponent(record.id)}`, { method: "DELETE" });
    }
  }

  return synced;
}

function getAirtableErrorMessage(error: unknown, fallback: string) {
  const rawMessage = error instanceof Error ? error.message : "";

  try {
    const parsed = JSON.parse(rawMessage) as { error?: { message?: string } };
    return parsed.error?.message || rawMessage || fallback;
  } catch {
    return rawMessage || fallback;
  }
}

export async function GET() {
  try {
    const { routineRecords, processMap, tagMap } = await getRoutineRecordsWithLinks();
    const routines = routineRecords.map((record) => mapRoutineRecord(record, processMap, tagMap)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return NextResponse.json({ routines });
  } catch (error) {
    return NextResponse.json({ routines: [], message: getAirtableErrorMessage(error, "Não foi possível carregar rotinas.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = normalizePayload(await request.json());
    const data = (await airtableRequest(ROUTINES_TABLE, "", {
      method: "POST",
      body: JSON.stringify({ records: [{ fields: getRoutineFields(payload) }] }),
    })) as { records?: AirtableRecord[] };
    const routineRecord = data.records?.[0];
    if (!routineRecord) throw new Error("Airtable não retornou a rotina criada.");

    const processRecords = await syncProcesses(routineRecord.id, payload.actions ?? []);
    const processMap = new Map(processRecords.map((record) => [record.id, mapProcessRecord(record)]));
    const routine = mapRoutineRecord(
      { ...routineRecord, fields: { ...(routineRecord.fields ?? {}), Processos: processRecords.map((record) => record.id) } },
      processMap,
      new Map(),
    );

    return NextResponse.json({ routine, message: "Rotina criada." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: getAirtableErrorMessage(error, "Não foi possível criar a rotina.") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = getString(searchParams.get("id"));
    if (!/^rec[a-zA-Z0-9]+$/.test(id)) throw new Error("Rotina inválida.");

    const payload = normalizePayload(await request.json());
    const routineRecord = (await airtableRequest(ROUTINES_TABLE, `/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: getRoutineFields(payload) }),
    })) as AirtableRecord;
    const processRecords = await syncProcesses(id, payload.actions ?? []);
    const processMap = new Map(processRecords.map((record) => [record.id, mapProcessRecord(record)]));
    const routine = mapRoutineRecord(
      { ...routineRecord, fields: { ...(routineRecord.fields ?? {}), Processos: processRecords.map((record) => record.id) } },
      processMap,
      new Map(),
    );

    return NextResponse.json({ routine, message: "Rotina atualizada." });
  } catch (error) {
    return NextResponse.json({ message: getAirtableErrorMessage(error, "Não foi possível atualizar a rotina.") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = getString(searchParams.get("id"));
    if (!/^rec[a-zA-Z0-9]+$/.test(id)) throw new Error("Rotina inválida.");

    const processes = await fetchAirtableRecords(PROCESSES_TABLE, new URLSearchParams({ pageSize: "100", filterByFormula: `FIND("${id}", ARRAYJOIN({Rotina}))>0` }));
    for (const process of processes) {
      await airtableRequest(PROCESSES_TABLE, `/${encodeURIComponent(process.id)}`, { method: "DELETE" });
    }
    await airtableRequest(ROUTINES_TABLE, `/${encodeURIComponent(id)}`, { method: "DELETE" });

    return NextResponse.json({ id, message: "Rotina removida." });
  } catch (error) {
    return NextResponse.json({ message: getAirtableErrorMessage(error, "Não foi possível remover a rotina.") }, { status: 500 });
  }
}
