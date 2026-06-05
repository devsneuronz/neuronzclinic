import { NextResponse } from "next/server";
import type { RoutineMessageTemplate } from "@/lib/routines";

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const MESSAGE_TEMPLATES_TABLE = process.env.AIRTABLE_MESSAGE_TEMPLATES_TABLE || "Templates mensagens";
const TEMPLATE_NAME_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_NAME_FIELDS, ["Template", "Nome", "Name"]);
const TEMPLATE_CONTENT_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_CONTENT_FIELDS, ["Mensagem", "Conteudo", "Conteúdo", "Texto", "Message", "Content"]);
const TEMPLATE_DESCRIPTION_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_DESCRIPTION_FIELDS, ["Descrição", "Descricao", "Description"]);
const TEMPLATE_TYPE_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_TYPE_FIELDS, ["Tipo_mensagem", "Tipo", "Categoria"]);
const TEMPLATE_COLOR_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_COLOR_FIELDS, ["HEXCOLOR", "HEXCOR", "Cor", "Color"]);
const TEMPLATE_ACTIVE_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_ACTIVE_FIELDS, ["Ativo", "Active", "Status"]);

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

function splitFields(value: string | undefined, fallback: string[]) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? fallback;
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

function getActiveValue(fields: Record<string, unknown>) {
  for (const candidate of TEMPLATE_ACTIVE_FIELDS) {
    const value = fields[candidate];
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && value.trim()) {
      const normalized = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

      if (["inativo", "inactive", "false", "nao", "no", "0"].includes(normalized)) return false;
      if (["ativo", "active", "true", "sim", "yes", "1"].includes(normalized)) return true;
    }
  }

  return true;
}

async function airtableRequest(path = "", init?: RequestInit) {
  if (!AIRTABLE_TOKEN) throw new Error("Configure AIRTABLE_TOKEN.");

  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(MESSAGE_TEMPLATES_TABLE)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function fetchTemplateRecords() {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);

    const data = (await airtableRequest(`?${params}`)) as { offset?: string; records?: AirtableRecord[] };
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return records;
}

function mapTemplate(record: AirtableRecord): RoutineMessageTemplate {
  const fields = record.fields ?? {};
  const type = getStringField(fields, TEMPLATE_TYPE_FIELDS);
  const label = getStringField(fields, TEMPLATE_NAME_FIELDS) || type || record.id;

  return {
    id: record.id,
    label,
    content: getStringField(fields, TEMPLATE_CONTENT_FIELDS),
    description: getStringField(fields, TEMPLATE_DESCRIPTION_FIELDS),
    type,
    color: getStringField(fields, TEMPLATE_COLOR_FIELDS),
    active: getActiveValue(fields),
  };
}

function getFirstFieldName(candidates: string[]) {
  return candidates[0];
}

function buildTemplateFields(input: Partial<RoutineMessageTemplate>) {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const type = typeof input.type === "string" ? input.type.trim() : "";

  if (!label) throw new Error("Informe o nome do template.");
  if (!content) throw new Error("Informe o conteúdo da mensagem.");

  const fields: Record<string, unknown> = {
    [getFirstFieldName(TEMPLATE_NAME_FIELDS)]: label,
    [getFirstFieldName(TEMPLATE_CONTENT_FIELDS)]: content,
  };

  if (type) fields[getFirstFieldName(TEMPLATE_TYPE_FIELDS)] = type;

  return fields;
}

async function createTemplate(fields: Record<string, unknown>) {
  const data = (await airtableRequest("", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  })) as { records?: AirtableRecord[] };

  const record = data.records?.[0];
  if (!record) throw new Error("Airtable não retornou o template criado.");

  return record;
}

async function updateTemplate(id: string, fields: Record<string, unknown>) {
  const record = (await airtableRequest(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  })) as AirtableRecord;

  if (!record?.id) throw new Error("Airtable não retornou o template atualizado.");

  return record;
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
    const templates = (await fetchTemplateRecords())
      .map(mapTemplate)
      .filter((template) => template.active)
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json({ templates: [], message: getAirtableErrorMessage(error, "Não foi possível carregar templates de mensagem.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RoutineMessageTemplate>;
    const record = await createTemplate(buildTemplateFields(body));
    const template = mapTemplate(record);

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: getAirtableErrorMessage(error, "Não foi possível criar o template de mensagem.") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<RoutineMessageTemplate>;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) return NextResponse.json({ message: "Informe o template que será editado." }, { status: 400 });

    const record = await updateTemplate(id, buildTemplateFields(body));
    const template = mapTemplate(record);

    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ message: getAirtableErrorMessage(error, "Não foi possível atualizar o template de mensagem.") }, { status: 500 });
  }
}
