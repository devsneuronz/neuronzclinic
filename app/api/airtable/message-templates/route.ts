import type { RoutineMessageTemplate } from "@/lib/routines";
import { NextResponse } from "next/server";

const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MESSAGE_TEMPLATES_READ_SOURCE = process.env.MESSAGE_TEMPLATES_READ_SOURCE || "supabase";
const MESSAGE_TEMPLATES_WRITE_SOURCE = process.env.MESSAGE_TEMPLATES_WRITE_SOURCE || "supabase";
const MESSAGE_TEMPLATES_TABLE = process.env.AIRTABLE_MESSAGE_TEMPLATES_TABLE || "Templates mensagens";
const TEMPLATE_NAME_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_NAME_FIELDS, ["Template", "Nome", "Name"]);
const TEMPLATE_CONTENT_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_CONTENT_FIELDS, ["Mensagem", "Conteudo", "Conteúdo", "Texto", "Message", "Content"]);
const TEMPLATE_DESCRIPTION_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_DESCRIPTION_FIELDS, ["Descrição", "Descricao", "Description"]);
const TEMPLATE_TYPE_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_TYPE_FIELDS, ["Tipo", "Tipo_mensagem", "Categoria"]);
const TEMPLATE_COLOR_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_COLOR_FIELDS, ["HEXCOLOR", "HEXCOR", "Cor", "Color"]);
const TEMPLATE_MEDIA_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_MEDIA_FIELDS, ["Midia", "Mídia", "Media"]);
const TEMPLATE_ACTIVE_FIELDS = splitFields(process.env.AIRTABLE_MESSAGE_TEMPLATE_ACTIVE_FIELDS, ["Ativo", "Active", "Status"]);

type AirtableAttachment = {
  url?: unknown;
  filename?: unknown;
  type?: unknown;
  size?: unknown;
};

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

type SupabaseMessageTemplateRecord = {
  id: string;
  airtable_record_id: string | null;
  label: string;
  content: string | null;
  description: string | null;
  type: string | null;
  color: string | null;
  media: RoutineMessageTemplate["media"] | null;
  is_active: boolean;
};

function splitFields(value: string | undefined, fallback: string[]) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? fallback
  );
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

function getMediaField(fields: Record<string, unknown>) {
  for (const candidate of TEMPLATE_MEDIA_FIELDS) {
    const value = fields[candidate];
    if (!Array.isArray(value)) continue;

    const attachment = value.find((item): item is AirtableAttachment => Boolean(item && typeof item === "object" && !Array.isArray(item) && typeof (item as AirtableAttachment).url === "string"));
    if (!attachment || typeof attachment.url !== "string") continue;

    return {
      url: attachment.url,
      fileName: typeof attachment.filename === "string" ? attachment.filename : "midia",
      mimeType: typeof attachment.type === "string" ? attachment.type : "application/octet-stream",
      size: typeof attachment.size === "number" ? attachment.size : undefined,
    };
  }

  return null;
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

async function supabaseRequest<T>(path: string, init?: RequestInit, useServiceRole = false): Promise<T> {
  const key = useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_REST_URL || !key) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_REST_URL e a chave do Supabase.");
  }

  const response = await fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null as T;

  return response.json() as Promise<T>;
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
    media: getMediaField(fields),
    active: getActiveValue(fields),
  };
}

function mapSupabaseTemplate(record: SupabaseMessageTemplateRecord): RoutineMessageTemplate {
  return {
    id: record.airtable_record_id || record.id,
    label: record.label,
    content: record.content || "",
    description: record.description || "",
    type: record.type || "",
    color: record.color || "",
    media: record.media,
    active: record.is_active,
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
  if (!content && !input.media?.url) throw new Error("Informe uma mensagem ou selecione uma mídia.");

  const fields: Record<string, unknown> = {
    [getFirstFieldName(TEMPLATE_NAME_FIELDS)]: label,
    [getFirstFieldName(TEMPLATE_CONTENT_FIELDS)]: content,
  };

  if (type) fields[getFirstFieldName(TEMPLATE_TYPE_FIELDS)] = type;
  if (Object.prototype.hasOwnProperty.call(input, "media")) {
    const media = input.media;
    fields[getFirstFieldName(TEMPLATE_MEDIA_FIELDS)] = media?.url
      ? [
          {
            url: media.url,
            ...(media.fileName ? { filename: media.fileName } : {}),
          },
        ]
      : [];
  }

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

function buildSupabaseTemplatePayload(input: Partial<RoutineMessageTemplate>) {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const type = typeof input.type === "string" ? input.type.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const color = typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color.trim()) ? input.color.trim() : null;

  if (!label) throw new Error("Informe o nome do template.");
  if (!content && !input.media?.url) throw new Error("Informe uma mensagem ou selecione uma mÃ­dia.");

  return {
    label,
    content: content || null,
    description: description || null,
    type: type || null,
    color,
    media: input.media?.url ? input.media : null,
    is_active: input.active ?? true,
    source: "supabase",
  };
}

async function createSupabaseTemplate(input: Partial<RoutineMessageTemplate>) {
  const [record] = await supabaseRequest<SupabaseMessageTemplateRecord[]>(
    "message_templates",
    {
      method: "POST",
      body: JSON.stringify(buildSupabaseTemplatePayload(input)),
    },
    true,
  );

  if (!record?.id) throw new Error("Supabase nÃ£o retornou o template criado.");

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

async function updateSupabaseTemplate(id: string, input: Partial<RoutineMessageTemplate>) {
  const idFilter = id.startsWith("rec") ? `airtable_record_id=eq.${encodeURIComponent(id)}` : `id=eq.${encodeURIComponent(id)}`;
  const [record] = await supabaseRequest<SupabaseMessageTemplateRecord[]>(
    `message_templates?${idFilter}`,
    {
      method: "PATCH",
      body: JSON.stringify(buildSupabaseTemplatePayload(input)),
    },
    true,
  );

  if (!record?.id) throw new Error("Supabase nÃ£o retornou o template atualizado.");

  return record;
}

async function deleteSupabaseTemplate(id: string) {
  const idFilter = id.startsWith("rec") ? `airtable_record_id=eq.${encodeURIComponent(id)}` : `id=eq.${encodeURIComponent(id)}`;

  await supabaseRequest<unknown>(
    `message_templates?${idFilter}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false, deleted_at: new Date().toISOString(), source: "supabase" }),
    },
    true,
  );
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
    const templates =
      MESSAGE_TEMPLATES_READ_SOURCE === "supabase"
        ? (
            await supabaseRequest<SupabaseMessageTemplateRecord[]>(
              "message_templates?select=id,airtable_record_id,label,content,description,type,color,media,is_active&is_active=is.true&deleted_at=is.null&order=label.asc",
            )
          ).map(mapSupabaseTemplate)
        : (await fetchTemplateRecords())
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
    const template =
      MESSAGE_TEMPLATES_WRITE_SOURCE === "supabase"
        ? mapSupabaseTemplate(await createSupabaseTemplate(body))
        : mapTemplate(await createTemplate(buildTemplateFields(body)));

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

    const template =
      MESSAGE_TEMPLATES_WRITE_SOURCE === "supabase"
        ? mapSupabaseTemplate(await updateSupabaseTemplate(id, body))
        : mapTemplate(await updateTemplate(id, buildTemplateFields(body)));

    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ message: getAirtableErrorMessage(error, "Não foi possível atualizar o template de mensagem.") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim() || "";

    if (!/^rec[a-zA-Z0-9]+$/.test(id) && !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Template invalido." }, { status: 400 });

    if (MESSAGE_TEMPLATES_WRITE_SOURCE === "supabase") {
      await deleteSupabaseTemplate(id);
    } else {
      if (!/^rec[a-zA-Z0-9]+$/.test(id)) return NextResponse.json({ message: "Template invalido para Airtable." }, { status: 400 });
      await airtableRequest(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    }

    return NextResponse.json({ id, message: "Template removido." });
  } catch (error) {
    return NextResponse.json({ message: getAirtableErrorMessage(error, "Nao foi possivel remover o template de mensagem.") }, { status: 500 });
  }
}
