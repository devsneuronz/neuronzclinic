import { getChatStatusLabel, normalizeStatusColor, sortStatusOptions, type ChatStatusOption } from "@/lib/chat-status";
import { getChatTags, type ChatTag } from "@/lib/chat-tags";
import { NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_BASE_ID = "app03ti52QQD3W9L2";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const AIRTABLE_CONTACT_TABLE_CANDIDATES = [process.env.AIRTABLE_CONTACTS_TABLE, "Contatos", "Contato", "Contacts", "Contact", "Pacientes", "Paciente"].filter(Boolean) as string[];
const PAGE_SIZE = 1000;
const STATUS_FIELD_CANDIDATES = ["Status_chat", "Status Chat", "Status do chat", "Status do contato", "Status contato", "Status", "status"];

interface CatalogChatRecord {
  Status_chat: string | null;
  hex_status: string | null;
  finalizada: boolean | null;
  json_tags: unknown;
  json_tags_parsed: unknown;
  tag_chat_array: unknown;
}

type AirtableTable = {
  name?: string;
  fields?: Array<{
    name?: string;
    options?: {
      choices?: Array<{ name?: string }>;
    };
  }>;
};

type SupabaseTagRow = {
  id: string;
  airtable_record_id: string | null;
  label: string;
  color: string | null;
};

async function fetchCatalogChats() {
  if (!SUPABASE_REST_URL || !SUPABASE_PUBLISHABLE_KEY) return [];

  const chats: CatalogChatRecord[] = [];
  let offset = 0;
  const select = ["Status_chat", "hex_status", "finalizada", "json_tags", "json_tags_parsed", "tag_chat_array"].join(",");

  while (true) {
    const url = `${SUPABASE_REST_URL.replace(/\/$/, "")}/chats?select=${select}&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      cache: "no-store",
    });

    if (!response.ok) throw new Error(await response.text());

    const page = (await response.json()) as CatalogChatRecord[];
    chats.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return chats;
}

async function fetchSupabaseTagOptions() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  const response = await fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/tags?select=id,airtable_record_id,label,color&status=eq.active&order=label.asc`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(await response.text());

  const rows = (await response.json()) as SupabaseTagRow[];
  return rows
    .map((row) => ({
      id: row.airtable_record_id || row.id,
      label: row.label,
      uuid: row.id,
      ...(row.color ? { color: row.color } : {}),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function getStatusOptions(chats: CatalogChatRecord[]) {
  const options = new Map<string, ChatStatusOption>();
  for (const chat of chats) {
    const label = getChatStatusLabel(chat);
    if (!label) continue;

    const normalizedLabel = label.toLowerCase();
    if (normalizedLabel === "aberta" || normalizedLabel === "finalizada" || normalizedLabel === "fechada") continue;

    const current = options.get(normalizedLabel);
    const color = normalizeStatusColor(chat.hex_status);
    options.set(normalizedLabel, {
      label,
      color: current?.color || color,
    });
  }

  return sortStatusOptions(Array.from(options.values()));
}

function mergeStatusOptions(...groups: ChatStatusOption[][]) {
  const options = new Map<string, ChatStatusOption>();

  for (const group of groups) {
    for (const status of group) {
      const label = status.label.trim();
      if (!label) continue;

      const key = label.toLowerCase();
      const current = options.get(key);
      options.set(key, {
        label,
        color: current?.color || status.color,
      });
    }
  }

  return sortStatusOptions(Array.from(options.values()));
}

function getTagOptions(chats: CatalogChatRecord[]) {
  const options = new Map<string, ChatTag>();

  for (const chat of chats) {
    for (const tag of getChatTags(chat)) {
      const key = tag.id || tag.label;
      if (!options.has(key)) options.set(key, tag);
    }
  }

  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function getChoiceNames(table: AirtableTable | undefined, fieldCandidates: string[]) {
  const fields = table?.fields ?? [];
  const field = fields.find((candidate) => {
    const fieldName = candidate.name?.toLowerCase();
    return fieldName ? fieldCandidates.some((name) => name.toLowerCase() === fieldName) : false;
  });

  return Array.from(new Set((field?.options?.choices ?? []).map((choice) => choice.name?.trim()).filter((choice): choice is string => Boolean(choice)))).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function getTableByCandidates(tables: AirtableTable[], candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase());

  return tables.find((table) => {
    const tableName = table.name?.toLowerCase();
    return tableName ? normalizedCandidates.includes(tableName) : false;
  });
}

function getTableWithStatusField(tables: AirtableTable[]) {
  return tables.find((table) => getChoiceNames(table, STATUS_FIELD_CANDIDATES).length > 0);
}

async function fetchAirtableStatusOptions() {
  if (!AIRTABLE_TOKEN) return [];

  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return [];

  const data = (await response.json()) as { tables?: AirtableTable[] };
  const tables = data.tables ?? [];
  const contactTable = getTableByCandidates(tables, AIRTABLE_CONTACT_TABLE_CANDIDATES) ?? getTableWithStatusField(tables);
  const choices = getChoiceNames(contactTable, STATUS_FIELD_CANDIDATES);

  return choices.map((label) => ({ label }));
}

export async function GET() {
  const errors: string[] = [];
  let chats: CatalogChatRecord[] = [];
  let supabaseTags: ChatTag[] = [];
  let airtableStatuses: ChatStatusOption[] = [];

  try {
    chats = await fetchCatalogChats();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Não foi possível carregar opções do Supabase.");
  }

  try {
    supabaseTags = await fetchSupabaseTagOptions();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Não foi possível carregar tags do Supabase.");
  }

  try {
    airtableStatuses = await fetchAirtableStatusOptions();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Não foi possível carregar status do Airtable.");
  }

  const fallbackTags = getTagOptions(chats).filter((tag) => /^rec[a-zA-Z0-9]+$/.test(tag.id));

  return NextResponse.json({
    statuses: mergeStatusOptions(getStatusOptions(chats), airtableStatuses),
    tags: supabaseTags.length > 0 ? supabaseTags : fallbackTags,
    errors,
  });
}
