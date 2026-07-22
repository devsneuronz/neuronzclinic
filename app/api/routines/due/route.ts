import { NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const MESSAGE_TEMPLATES_TABLE = process.env.AIRTABLE_MESSAGE_TEMPLATES_TABLE || "Templates mensagens";
const MESSAGE_TEMPLATES_READ_SOURCE = process.env.MESSAGE_TEMPLATES_READ_SOURCE || "supabase";
const TEMPLATE_CONTENT_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_CONTENT_FIELDS, ["Mensagem", "Conteudo", "Conteúdo", "Texto", "Message", "Content"]);
const TEMPLATE_MEDIA_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_MEDIA_FIELDS, ["Midia", "Mídia", "Media"]);
const SEND_MESSAGE_WEBHOOK_URL = process.env.SEND_MESSAGE_WEBHOOK_URL || "https://n8n.srv1150529.hstgr.cloud/webhook/send-message";
const ROUTINES_WEBHOOK_SECRET = process.env.ROUTINES_WEBHOOK_SECRET;

type RawRecord = Record<string, unknown>;
type SupabaseTemplateRecord = {
  content: string | null;
  media: {
    url?: string;
    fileName?: string;
    mimeType?: string;
  } | null;
};

function splitFields(value: string | undefined, fallback: string[]) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? fallback
  );
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getNestedValue(record: RawRecord, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as RawRecord)[key];
  }, record);
}

function getStringField(fields: RawRecord, candidates: string[]) {
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

function getTemplateMedia(fields: RawRecord) {
  for (const candidate of TEMPLATE_MEDIA_FIELDS) {
    const value = fields[candidate];
    if (!Array.isArray(value)) continue;

    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const attachment = item as RawRecord;
      const url = getString(attachment.url);
      if (!url) continue;

      return {
        url,
        fileName: getString(attachment.filename) || "midia",
        mimeType: getString(attachment.type) || "application/octet-stream",
      };
    }
  }

  return null;
}

function getMediaType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  return "document";
}

function isAuthorized(request: Request) {
  if (!ROUTINES_WEBHOOK_SECRET) return true;
  if (isSameOriginRequest(request)) return true;

  const authorization = request.headers.get("authorization") || "";
  const secret = request.headers.get("x-routines-secret") || "";

  return authorization === `Bearer ${ROUTINES_WEBHOOK_SECRET}` || secret === ROUTINES_WEBHOOK_SECRET;
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

function getValidActionRunIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item));
}

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]+$/.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getSupabaseTemplateId(value: string) {
  const templateId = getString(value);
  const supabaseTemplateMatch = templateId.match(/^supabase_template:([0-9a-f-]{36})$/i);

  if (supabaseTemplateMatch?.[1] && isUuid(supabaseTemplateMatch[1])) {
    return supabaseTemplateMatch[1];
  }

  return templateId;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function airtableRequest(table: string, path = "", init?: RequestInit) {
  if (!AIRTABLE_TOKEN) throw new Error("Configure AIRTABLE_TOKEN.");

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

async function fetchAirtableRecordById(table: string, id: string) {
  if (!isAirtableRecordId(id)) throw new Error("ID de registro do Airtable inválido.");

  return airtableRequest(table, `/${encodeURIComponent(id)}`) as Promise<{ id: string; fields?: RawRecord }>;
}

async function fetchSupabaseTemplateById(templateId: string) {
  const normalizedTemplateId = getSupabaseTemplateId(templateId);
  const idFilter = isAirtableRecordId(normalizedTemplateId)
    ? `airtable_record_id=eq.${encodeURIComponent(normalizedTemplateId)}`
    : isUuid(normalizedTemplateId)
      ? `id=eq.${encodeURIComponent(normalizedTemplateId)}`
      : "";

  if (!idFilter) return null;

  const templates = (await supabaseRequest(
    `message_templates?select=content,media&${idFilter}&is_active=is.true&deleted_at=is.null&limit=1`,
  )) as SupabaseTemplateRecord[] | null;
  const template = templates?.[0];

  if (!template) return null;

  const media = template.media?.url
    ? {
        url: getString(template.media.url),
        fileName: getString(template.media.fileName) || "midia",
        mimeType: getString(template.media.mimeType) || "application/octet-stream",
      }
    : null;

  return {
    content: getString(template.content),
    media,
  };
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function getBrazilPhoneVariants(value: string) {
  const digits = onlyDigits(value);
  const variants = new Set<string>();

  if (digits) variants.add(digits);
  if (digits.startsWith("55")) variants.add(digits.slice(2));
  if (digits.length >= 10 && !digits.startsWith("55")) variants.add(`55${digits}`);

  return Array.from(variants).filter(Boolean);
}

async function resolveUserProfile(userId: string) {
  if (!userId) return null;

  const filter = isUuid(userId) ? `id=eq.${encodeURIComponent(userId)}` : `airtable_record_id=eq.${encodeURIComponent(userId)}`;
  const rows = (await supabaseRequest(`user_profiles?select=id,airtable_record_id,name&${filter}&limit=1`)) as Array<{ id: string; airtable_record_id: string | null; name: string }>;
  return rows[0] ?? null;
}

async function resolveContactAndChat(run: RawRecord) {
  const contactId = getString(run.contact_id);
  const contactAirtableId = getString(run.contact_airtable_id);
  const chatId = getString(run.chat_id);
  const contactPhone = getString(run.contact_phone);
  const phoneVariants = getBrazilPhoneVariants(contactPhone || chatId);

  let chat: RawRecord | null = null;
  const chatFilters = [];
  if (isUuid(contactId)) chatFilters.push(`id.eq.${encodeURIComponent(contactId)}`);
  if (contactAirtableId) chatFilters.push(`ida_contato.eq.${encodeURIComponent(contactAirtableId)}`);
  if (chatId) chatFilters.push(`chat_id.eq.${encodeURIComponent(chatId)}`);
  for (const phone of phoneVariants) chatFilters.push(`phone_contact.eq.${encodeURIComponent(phone)}`, `chat_id.ilike.*${encodeURIComponent(phone)}*`);

  if (chatFilters.length > 0) {
    const rows = (await supabaseRequest(`chats?select=id,contact_id,ida_contato,chat_id,phone_contact,nome_contato&or=(${chatFilters.join(",")})&limit=1`)) as RawRecord[];
    chat = rows[0] ?? null;
  }

  let contact: RawRecord | null = null;
  const contactFilters = [];
  const linkedContactId = getString(chat?.contact_id);
  if (isUuid(contactId)) contactFilters.push(`id.eq.${encodeURIComponent(contactId)}`);
  if (isUuid(linkedContactId)) contactFilters.push(`id.eq.${encodeURIComponent(linkedContactId)}`);
  if (contactAirtableId) contactFilters.push(`ida_contato.eq.${encodeURIComponent(contactAirtableId)}`);
  for (const phone of phoneVariants) contactFilters.push(`phone.eq.${encodeURIComponent(phone)}`, `phone_id_chat.ilike.*${encodeURIComponent(phone)}*`);

  if (contactFilters.length > 0) {
    const rows = (await supabaseRequest(`contacts?select=id,ida_contato,phone,phone_id_chat,name&or=(${contactFilters.join(",")})&limit=1`)) as RawRecord[];
    contact = rows[0] ?? null;
  }

  return { contact, chat };
}

async function createTask(run: RawRecord, action: RawRecord, type: "Aviso" | "Tarefa") {
  const responsible = await resolveUserProfile(getString(action.responsibleUserId));
  const { contact, chat } = await resolveContactAndChat(run);
  const now = new Date();
  const subject = getString(action.subject) || getString(action.label) || type;
  const notes = getString(action.notes);

  const rows = (await supabaseRequest("tasks?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      type,
      status: "Aguardando",
      status_normalized: "aguardando",
      subject,
      description: notes || null,
      responsible_user_profile_id: responsible?.id ?? null,
      responsible_airtable_record_id: responsible?.airtable_record_id ?? null,
      responsible_name: responsible?.name ?? null,
      creator_user_profile_id: responsible?.id ?? null,
      creator_airtable_record_id: responsible?.airtable_record_id ?? null,
      creator_name: responsible?.name || "Sistema",
      contact_id: getString(contact?.id) || getString(chat?.contact_id) || null,
      chat_row_id: getString(chat?.id) || null,
      contact_airtable_record_id: getString(run.contact_airtable_id) || getString(contact?.ida_contato) || getString(chat?.ida_contato) || null,
      chat_id: getString(run.chat_id) || getString(chat?.chat_id) || null,
      patient_name: getString(run.contact_name) || getString(contact?.name) || getString(chat?.nome_contato) || null,
      patient_phone: getString(run.contact_phone) || getString(contact?.phone) || getString(contact?.phone_id_chat) || getString(chat?.phone_contact) || null,
      due_date: now.toISOString().slice(0, 10),
      source: "routine",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }),
  })) as Array<{ id: string }>;

  return { type: "create_task", taskId: rows[0]?.id ?? null, taskType: type, subject };
}
async function fetchTemplate(templateId: string) {
  const normalizedTemplateId = getSupabaseTemplateId(templateId);
  const supabaseTemplate = await fetchSupabaseTemplateById(normalizedTemplateId);

  if (supabaseTemplate?.content || supabaseTemplate?.media) {
    return supabaseTemplate;
  }

  if (MESSAGE_TEMPLATES_READ_SOURCE !== "airtable" || !isAirtableRecordId(normalizedTemplateId)) {
    throw new Error(`Template de mensagem nao encontrado ou sem conteudo/midia no Supabase: ${templateId}.`);
  }

  const template = await fetchAirtableRecordById(MESSAGE_TEMPLATES_TABLE, normalizedTemplateId);
  const fields = template.fields ?? {};
  const content = getStringField(fields, TEMPLATE_CONTENT_FIELDS);
  const media = getTemplateMedia(fields);

  if (!content && !media) {
    throw new Error(`Template de mensagem sem conteúdo ou mídia configurada: ${templateId}.`);
  }

  return { content, media };
}

function getPayloadRecord(run: RawRecord) {
  return run.payload && typeof run.payload === "object" && !Array.isArray(run.payload) ? (run.payload as RawRecord) : {};
}

function renderTemplate(template: string, run: RawRecord) {
  const payload = getPayloadRecord(run);
  const contactName = getString(run.contact_name) || getString(payload.contactName) || getString(payload.contact_name);
  const firstName = contactName.split(/\s+/).filter(Boolean)[0] || contactName;
  const phone = getString(run.contact_phone) || getString(payload.contactPhone) || getString(payload.contact_phone);
  const today = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  const values: RawRecord = {
    nome: contactName,
    primeiro_nome: firstName,
    telefone: phone,
    celular: phone,
    hoje: today,
  };

  function resolveDirective(match: string, key: string) {
    const normalizedKey = key.toLowerCase();
    const directValue = getString(values[normalizedKey]);
    if (directValue) return directValue;

    const payloadValue = getString(getNestedValue(payload, key));
    return payloadValue || match;
  }

  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, resolveDirective).replace(/%([\w.-]+)%/g, resolveDirective);
}

async function resolveMessage(run: RawRecord, action: RawRecord) {
  const manualMessage = getString(action.message);
  if (manualMessage) return { text: renderTemplate(manualMessage, run), media: null };

  const templateId = getString(action.templateId);
  if (templateId) {
    const template = await fetchTemplate(templateId);
    return {
      text: template.content ? renderTemplate(template.content, run) : "",
      media: template.media,
    };
  }

  const subject = getString(action.subject);
  if (subject) return { text: renderTemplate(subject, run), media: null };

  throw new Error("A ação de mensagem precisa de texto/template.");
}

async function readWebhookResponse(response: Response) {
  const rawText = await response.text();
  if (!rawText.trim()) return {};

  try {
    return JSON.parse(rawText) as RawRecord;
  } catch {
    return { raw: rawText.slice(0, 500) };
  }
}

async function sendMessage(run: RawRecord, action: RawRecord) {
  const chatId = getString(run.chat_id);
  if (!chatId) throw new Error("chat_id é obrigatório para enviar mensagem.");

  const { text, media } = await resolveMessage(run, action);
  const contactName = getString(run.contact_name);

  const response = await fetch(SEND_MESSAGE_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      media
        ? {
            type: getMediaType(media.mimeType),
            chat_id: chatId,
            number: chatId,
            contact_name: contactName,
            nome_contato: contactName,
            caption: text,
            filename: media.fileName,
            media_url: media.url,
            media_mime_type: media.mimeType,
            routine_run_id: run.id,
            routine_action_id: getString(action.id),
          }
        : {
            type: "text",
            chat_id: chatId,
            number: chatId,
            contact_name: contactName,
            nome_contato: contactName,
            text,
            content: text,
            routine_run_id: run.id,
            routine_action_id: getString(action.id),
          },
    ),
  });
  const webhookResponse = await readWebhookResponse(response);

  if (!response.ok) {
    throw new Error(typeof webhookResponse.raw === "string" ? webhookResponse.raw : JSON.stringify(webhookResponse));
  }

  return {
    type: "send_message",
    chatId,
    textPreview: text.slice(0, 120),
    mediaType: media ? getMediaType(media.mimeType) : null,
    templateId: getString(action.templateId) || null,
    webhookStatus: response.status,
    webhookResponse,
  };
}

function getTagFromCandidate(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return getTagFromCandidate(JSON.parse(value));
    } catch {
      const id = getString(value);
      return id ? { id, label: id } : null;
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as RawRecord;
  const id = getString(source.id) || getString(source["IDA TAG"]);
  const label = getString(source.label) || getString(source.Tag) || getString(source.tag) || getString(source.name) || id;
  const color = getString(source.color) || getString(source.HEXCOR) || getString(source.hexcor);
  return id && label ? { id, label, ...(color ? { color } : {}) } : null;
}

function getTagsFromChat(chat: RawRecord) {
  const tags: Array<{ id: string; label: string; color?: string }> = [];
  const seen = new Set<string>();
  const candidates = [chat.json_tags_parsed, chat.json_tags, chat.tag_chat_array];

  for (const candidate of candidates) {
    const values = Array.isArray(candidate) ? candidate : typeof candidate === "string" ? candidate.split(",").map((item) => item.trim()) : [];
    for (const value of values) {
      const tag = getTagFromCandidate(value);
      if (!tag || seen.has(tag.id)) continue;
      seen.add(tag.id);
      tags.push(tag);
    }
  }

  return tags;
}

async function fetchTag(tagId: string) {
  const filter = isUuid(tagId) ? `id=eq.${encodeURIComponent(tagId)}` : `airtable_record_id=eq.${encodeURIComponent(tagId)}`;
  const tags = (await supabaseRequest(`tags?select=id,airtable_record_id,label,color&${filter}&limit=1`)) as Array<{ id: string; airtable_record_id: string | null; label: string; color: string | null }>;
  const tag = tags[0];
  if (!tag) return null;
  return { id: tag.airtable_record_id || tag.id, label: tag.label, ...(tag.color ? { color: tag.color } : {}) };
}

async function fetchChatForRoutine(run: RawRecord) {
  const contactId = getString(run.contact_id);
  const chatId = getString(run.chat_id);
  const filters = [];
  if (isUuid(contactId)) filters.push(`id=eq.${encodeURIComponent(contactId)}`);
  if (chatId) filters.push(`chat_id=eq.${encodeURIComponent(chatId)}`);
  if (filters.length === 0 && contactId) filters.push(`chat_id=eq.${encodeURIComponent(contactId)}`);

  for (const filter of filters) {
    const rows = (await supabaseRequest(`chats?select=id,json_tags,json_tags_parsed,tag_chat_array&${filter}&limit=1`)) as RawRecord[];
    if (rows[0]) return rows[0];
  }

  return null;
}

async function addTag(run: RawRecord, action: RawRecord) {
  const tagId = getString(action.tagId);
  if (!tagId) throw new Error("tagId e obrigatorio para vincular tag.");

  const [chat, tag] = await Promise.all([fetchChatForRoutine(run), fetchTag(tagId)]);
  if (!chat?.id) throw new Error("Chat do Supabase nao encontrado para vincular tag.");
  if (!tag) throw new Error("Tag do Supabase nao encontrada para vincular ao chat.");

  const tags = getTagsFromChat(chat);
  if (!tags.some((current) => current.id === tag.id)) tags.push(tag);

  await supabaseRequest(`chats?id=eq.${encodeURIComponent(getString(chat.id))}`, {
    method: "PATCH",
    body: JSON.stringify({ json_tags_parsed: tags }),
  });

  return { type: "add_tag", chatId: getString(chat.id), tagId: tag.id, tagLabel: tag.label };


}

async function executeAction(actionRun: RawRecord) {
  const action = (actionRun.payload && typeof actionRun.payload === "object" ? actionRun.payload : {}) as RawRecord;
  const runs = (await supabaseRequest(`routine_runs?id=eq.${encodeURIComponent(getString(actionRun.routine_run_id))}&select=*`)) as RawRecord[];
  const run = runs[0];
  if (!run) throw new Error("Execução de rotina não encontrada.");

  const actionType = getString(actionRun.action_type) || getString(action.type);

  if (actionType === "create_notice") return createTask(run, action, "Aviso");
  if (actionType === "create_task") return createTask(run, action, "Tarefa");
  if (actionType === "send_message") return sendMessage(run, action);
  if (actionType === "add_tag") return addTag(run, action);

  return { skipped: true, actionType };
}

function getActionDelayMinutes(actionRun: RawRecord) {
  const payload = actionRun.payload && typeof actionRun.payload === "object" && !Array.isArray(actionRun.payload) ? (actionRun.payload as RawRecord) : {};
  return Math.max(0, getNumber(payload.delayMinutes));
}

function getOneDueActionPerRoutineRun(actionRuns: RawRecord[]) {
  const seenRoutineRuns = new Set<string>();
  const runnable: RawRecord[] = [];

  for (const actionRun of actionRuns) {
    const routineRunId = getString(actionRun.routine_run_id);
    if (!routineRunId || seenRoutineRuns.has(routineRunId)) continue;

    seenRoutineRuns.add(routineRunId);
    runnable.push(actionRun);
  }

  return runnable;
}

async function reschedulePendingActionsAfter(actionRun: RawRecord, executedAt: Date) {
  const routineRunId = getString(actionRun.routine_run_id);
  const actionIndex = getNumber(actionRun.action_index);
  if (!routineRunId) return 0;

  const pendingActions = (await supabaseRequest(
    `routine_action_runs?routine_run_id=eq.${encodeURIComponent(routineRunId)}&status=eq.pending&action_index=gt.${actionIndex}&order=action_index.asc&select=id,payload,action_index`,
  )) as RawRecord[];

  let nextExecuteAt = executedAt.getTime();

  for (const pendingAction of pendingActions) {
    nextExecuteAt += getActionDelayMinutes(pendingAction) * 60_000;

    await supabaseRequest(`routine_action_runs?id=eq.${encodeURIComponent(getString(pendingAction.id))}`, {
      method: "PATCH",
      body: JSON.stringify({ execute_at: new Date(nextExecuteAt).toISOString() }),
    });
  }

  return pendingActions.length;
}

async function finishRoutineRunIfComplete(actionRun: RawRecord) {
  const routineRunId = getString(actionRun.routine_run_id);
  if (!routineRunId) return false;

  const unfinishedActions = (await supabaseRequest(
    `routine_action_runs?routine_run_id=eq.${encodeURIComponent(routineRunId)}&status=in.(pending,processing)&limit=1&select=id`,
  )) as RawRecord[];

  if (unfinishedActions.length > 0) return false;

  await supabaseRequest(`routine_runs?id=eq.${encodeURIComponent(routineRunId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "done", finished_at: new Date().toISOString() }),
  });

  return true;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { actionRunIds?: unknown; limit?: number };
    const actionRunIds = getValidActionRunIds(body.actionRunIds);
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
    const now = new Date().toISOString();
    const dueRunsPath = actionRunIds.length
      ? `routine_action_runs?status=eq.pending&execute_at=lte.${encodeURIComponent(now)}&id=in.(${actionRunIds.map(encodeURIComponent).join(",")})&order=execute_at.asc,action_index.asc&limit=${limit}&select=*`
      : `routine_action_runs?status=eq.pending&execute_at=lte.${encodeURIComponent(now)}&order=execute_at.asc,action_index.asc&limit=${limit}&select=*`;
    const dueRuns = (await supabaseRequest(dueRunsPath)) as RawRecord[];
    const runnableDueRuns = getOneDueActionPerRoutineRun(dueRuns);
    const results: RawRecord[] = [];

    for (const [index, actionRun] of runnableDueRuns.entries()) {
      const id = getString(actionRun.id);

      try {
        await supabaseRequest(`routine_action_runs?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "processing" }),
        });
        const result = await executeAction(actionRun);
        const executedAt = new Date();
        await supabaseRequest(`routine_action_runs?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "done", executed_at: executedAt.toISOString(), result }),
        });
        const rescheduledActions = await reschedulePendingActionsAfter(actionRun, executedAt);
        const routineFinished = await finishRoutineRunIfComplete(actionRun);
        results.push({ id, status: "done", result, rescheduledActions, routineFinished });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao executar ação.";
        await supabaseRequest(`routine_action_runs?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "failed", executed_at: new Date().toISOString(), last_error: message }),
        });
        results.push({ id, status: "failed", message });
      }

      if (index < runnableDueRuns.length - 1) {
        await wait(750);
      }
    }

    return NextResponse.json({ processed: results.length, deferred: dueRuns.length - runnableDueRuns.length, results });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível processar ações." }, { status: 500 });
  }
}
