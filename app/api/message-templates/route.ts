import type { RoutineMessageTemplate } from "@/lib/routines";
import { NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseMessageTemplateRecord = {
  id: string;
  label: string;
  content: string | null;
  description: string | null;
  type: string | null;
  color: string | null;
  media: RoutineMessageTemplate["media"] | null;
  is_active: boolean;
};

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function mapSupabaseTemplate(record: SupabaseMessageTemplateRecord): RoutineMessageTemplate {
  return {
    id: record.id,
    label: record.label,
    content: record.content || "",
    description: record.description || "",
    type: record.type || "",
    color: record.color || "",
    media: record.media,
    active: record.is_active,
  };
}

function buildSupabaseTemplatePayload(input: Partial<RoutineMessageTemplate>) {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const type = typeof input.type === "string" ? input.type.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const color = typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color.trim()) ? input.color.trim() : null;

  if (!label) throw new Error("Informe o nome do template.");
  if (!content && !input.media?.url) throw new Error("Informe uma mensagem ou selecione uma midia.");

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

  if (!record?.id) throw new Error("Supabase nao retornou o template criado.");

  return record;
}

async function updateSupabaseTemplate(id: string, input: Partial<RoutineMessageTemplate>) {
  const [record] = await supabaseRequest<SupabaseMessageTemplateRecord[]>(
    `message_templates?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(buildSupabaseTemplatePayload(input)),
    },
    true,
  );

  if (!record?.id) throw new Error("Supabase nao retornou o template atualizado.");

  return record;
}

async function deleteSupabaseTemplate(id: string) {
  await supabaseRequest<unknown>(
    `message_templates?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false, deleted_at: new Date().toISOString(), source: "supabase" }),
    },
    true,
  );
}

function getApiErrorMessage(error: unknown, fallback: string) {
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
    const templates = (
      await supabaseRequest<SupabaseMessageTemplateRecord[]>(
        "message_templates?select=id,label,content,description,type,color,media,is_active&is_active=is.true&deleted_at=is.null&order=label.asc",
      )
    ).map(mapSupabaseTemplate);

    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json({ templates: [], message: getApiErrorMessage(error, "Nao foi possivel carregar templates de mensagem.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RoutineMessageTemplate>;
    const template = mapSupabaseTemplate(await createSupabaseTemplate(body));

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: getApiErrorMessage(error, "Nao foi possivel criar o template de mensagem.") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<RoutineMessageTemplate>;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!isUuid(id)) return NextResponse.json({ message: "Template invalido." }, { status: 400 });

    const template = mapSupabaseTemplate(await updateSupabaseTemplate(id, body));

    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ message: getApiErrorMessage(error, "Nao foi possivel atualizar o template de mensagem.") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim() || "";

    if (!isUuid(id)) return NextResponse.json({ message: "Template invalido." }, { status: 400 });

    await deleteSupabaseTemplate(id);

    return NextResponse.json({ id, message: "Template removido." });
  } catch (error) {
    return NextResponse.json({ message: getApiErrorMessage(error, "Nao foi possivel remover o template de mensagem.") }, { status: 500 });
  }
}
