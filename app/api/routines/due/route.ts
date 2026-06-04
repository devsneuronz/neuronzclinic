import { NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const TASK_TABLE = process.env.AIRTABLE_TASKS_TABLE || "Encaminhamentos";
const CONTACTS_TABLE = process.env.AIRTABLE_CONTACTS_TABLE || "Contatos";
const MESSAGE_TEMPLATES_TABLE = process.env.AIRTABLE_MESSAGE_TEMPLATES_TABLE || "Templates mensagens";
const TEMPLATE_CONTENT_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_CONTENT_FIELDS, ["Mensagem", "Conteudo", "Conteúdo", "Texto", "Message", "Content"]);
const SEND_MESSAGE_WEBHOOK_URL = process.env.SEND_MESSAGE_WEBHOOK_URL || "https://n8n.srv1150529.hstgr.cloud/webhook/send-message";
const ROUTINES_WEBHOOK_SECRET = process.env.ROUTINES_WEBHOOK_SECRET;

type RawRecord = Record<string, unknown>;

function splitFields(value: string | undefined, fallback: string[]) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? fallback;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function isAuthorized(request: Request) {
  if (!ROUTINES_WEBHOOK_SECRET) return true;

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
  if (!/^rec[a-zA-Z0-9]+$/.test(id)) throw new Error("ID de registro do Airtable inválido.");

  return airtableRequest(table, `/${encodeURIComponent(id)}`) as Promise<{ id: string; fields?: RawRecord }>;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formulaString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function fieldText(fieldName: string) {
  return `{${fieldName}}&""`;
}

function getBrazilPhoneVariants(value: string) {
  const digits = onlyDigits(value);
  const variants = new Set<string>();

  if (digits) variants.add(digits);
  if (digits.startsWith("55")) variants.add(digits.slice(2));
  if (digits.length >= 10 && !digits.startsWith("55")) variants.add(`55${digits}`);

  return Array.from(variants).filter(Boolean);
}

async function findContactAirtableId(run: RawRecord) {
  const existing = getString(run.contact_airtable_id);
  if (existing) return existing;

  const chatId = getString(run.chat_id);
  const contactPhone = getString(run.contact_phone);
  const formulas: string[] = [];

  if (chatId) {
    const chatValue = formulaString(chatId);
    formulas.push(`{SUPABASE_CHAT}=${chatValue}`);
    formulas.push(`{ALT_CHAT_ID}=${chatValue}`);
    formulas.push(`{N_WHATS_API}=${chatValue}`);
    formulas.push(`{N_WHATS_WEB}=${chatValue}`);
    formulas.push(`FIND(${chatValue}, ${fieldText("SUPABASE_CHAT")})>0`);
    formulas.push(`FIND(${chatValue}, ${fieldText("ALT_CHAT_ID")})>0`);
  }

  for (const phone of getBrazilPhoneVariants(contactPhone || chatId)) {
    const phoneValue = formulaString(phone);
    formulas.push(`{N_WHATS_API}=${phoneValue}`);
    formulas.push(`{N_WHATS_WEB}=${phoneValue}`);
    formulas.push(`{Telefone Princial}=${phoneValue}`);
    formulas.push(`{Telefone Principal}=${phoneValue}`);
    formulas.push(`{Telefone Secundário}=${phoneValue}`);
    formulas.push(`{Telefone Secundario}=${phoneValue}`);
    formulas.push(`{celular-so-numero}=${phoneValue}`);
    formulas.push(`{Celularsupabase}=${phoneValue}`);
    formulas.push(`FIND(${phoneValue}, ${fieldText("N_WHATS_API")})>0`);
    formulas.push(`FIND(${phoneValue}, ${fieldText("N_WHATS_WEB")})>0`);
    formulas.push(`FIND(${phoneValue}, ${fieldText("celular-so-numero")})>0`);
    formulas.push(`FIND(${phoneValue}, ${fieldText("Celularsupabase")})>0`);
  }

  if (formulas.length === 0) return "";

  for (const formula of formulas) {
    const params = new URLSearchParams({
      maxRecords: "1",
      pageSize: "1",
      filterByFormula: formula,
    });

    try {
      const data = (await airtableRequest(CONTACTS_TABLE, `?${params}`)) as { records?: Array<{ id: string }> };
      const id = data.records?.[0]?.id;
      if (id) return id;
    } catch {
      continue;
    }
  }

  return "";
}

async function createTask(run: RawRecord, action: RawRecord, type: "Aviso" | "Tarefa") {
  const contactAirtableId = await findContactAirtableId(run);
  if (!contactAirtableId) throw new Error("contact_airtable_id é obrigatório para criar aviso/tarefa no Airtable.");

  const responsibleUserId = getString(action.responsibleUserId);
  const fields: RawRecord = {
    Tipo: type,
    Status: "Aguardando",
    "Data e Hora": new Date().toISOString(),
    Data_prazo: new Date().toISOString().slice(0, 10),
    Contato: [contactAirtableId],
    Assunto: getString(action.subject) || getString(action.label) || type,
  };

  if (responsibleUserId) {
    fields.User = [responsibleUserId];
    fields.User_criador = [responsibleUserId];
  }

  const notes = getString(action.notes);
  if (notes) fields["Observações"] = notes;

  return airtableRequest(TASK_TABLE, "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
}

async function fetchTemplateContent(templateId: string) {
  const template = await fetchAirtableRecordById(MESSAGE_TEMPLATES_TABLE, templateId);
  const content = getStringField(template.fields ?? {}, TEMPLATE_CONTENT_FIELDS);

  if (!content) {
    throw new Error(`Template de mensagem sem conteúdo configurado: ${templateId}.`);
  }

  return content;
}

function getPayloadRecord(run: RawRecord) {
  return run.payload && typeof run.payload === "object" && !Array.isArray(run.payload) ? (run.payload as RawRecord) : {};
}

function renderTemplate(template: string, run: RawRecord) {
  const payload = getPayloadRecord(run);
  const contactName = getString(run.contact_name) || getString(payload.contactName) || getString(payload.contact_name);
  const firstName = contactName.split(/\s+/).filter(Boolean)[0] || contactName;
  const values: RawRecord = {
    nome: contactName,
    nome_contato: contactName,
    primeiro_nome: firstName,
    telefone: getString(run.contact_phone) || getString(payload.contactPhone) || getString(payload.contact_phone),
    chat_id: getString(run.chat_id) || getString(payload.chatId) || getString(payload.chat_id),
    data: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()),
  };

  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => {
    const normalizedKey = key.toLowerCase();
    const directValue = getString(values[normalizedKey]);
    if (directValue) return directValue;

    const payloadValue = getString(getNestedValue(payload, key));
    return payloadValue || match;
  });
}

async function resolveMessageText(run: RawRecord, action: RawRecord) {
  const manualMessage = getString(action.message);
  if (manualMessage) return renderTemplate(manualMessage, run);

  const templateId = getString(action.templateId);
  if (templateId) {
    return renderTemplate(await fetchTemplateContent(templateId), run);
  }

  const subject = getString(action.subject);
  if (subject) return renderTemplate(subject, run);

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

  const text = await resolveMessageText(run, action);

  const response = await fetch(SEND_MESSAGE_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "text",
      chat_id: chatId,
      number: chatId,
      contact_name: getString(run.contact_name),
      text,
      content: text,
      routine_run_id: run.id,
      routine_action_id: getString(action.id),
    }),
  });
  const webhookResponse = await readWebhookResponse(response);

  if (!response.ok) {
    throw new Error(typeof webhookResponse.raw === "string" ? webhookResponse.raw : JSON.stringify(webhookResponse));
  }

  return {
    type: "send_message",
    chatId,
    textPreview: text.slice(0, 120),
    templateId: getString(action.templateId) || null,
    webhookStatus: response.status,
    webhookResponse,
  };
}

async function addTag(run: RawRecord, action: RawRecord) {
  const contactAirtableId = await findContactAirtableId(run);
  const tagId = getString(action.tagId);
  if (!contactAirtableId || !tagId) throw new Error("contact_airtable_id e tagId são obrigatórios para vincular tag.");

  return airtableRequest(CONTACTS_TABLE, `/${encodeURIComponent(contactAirtableId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Tag: [tagId] } }),
  });
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

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
    const now = new Date().toISOString();
    const dueRuns = (await supabaseRequest(`routine_action_runs?status=eq.pending&execute_at=lte.${encodeURIComponent(now)}&order=execute_at.asc&limit=${limit}&select=*`)) as RawRecord[];
    const results: RawRecord[] = [];

    for (const actionRun of dueRuns) {
      const id = getString(actionRun.id);

      try {
        await supabaseRequest(`routine_action_runs?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "processing" }),
        });
        const result = await executeAction(actionRun);
        await supabaseRequest(`routine_action_runs?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "done", executed_at: new Date().toISOString(), result }),
        });
        results.push({ id, status: "done", result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao executar ação.";
        await supabaseRequest(`routine_action_runs?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "failed", executed_at: new Date().toISOString(), last_error: message }),
        });
        results.push({ id, status: "failed", message });
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível processar ações." }, { status: 500 });
  }
}
