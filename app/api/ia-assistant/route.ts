import { isFallbackAdminEmail, normalizeUserRole } from "@/lib/user-roles";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type RawAssistant = Record<string, unknown>;

const DEFAULT_SELECT = ["id", "name", "gender", "emoji", "dados_empresa", "msg_inicial", "estilo_conversa", "avisar_agendamento", "avisar_encaminhamento"].join(",");
const ALLOWED_SELECT_FIELDS = new Set(DEFAULT_SELECT.split(","));

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(value: unknown) {
  const text = getString(value);
  return text || null;
}

function getNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getViewer(request: NextRequest, body?: RawAssistant | null) {
  const role = normalizeUserRole(request.nextUrl.searchParams.get("role") ?? body?.role);
  const email = getString(request.nextUrl.searchParams.get("email") ?? body?.email).toLowerCase();
  return { role, email };
}

function requireAdmin(request: NextRequest, body?: RawAssistant | null) {
  const viewer = getViewer(request, body);
  if (viewer.role !== "admin" && !isFallbackAdminEmail(viewer.email)) {
    return NextResponse.json({ message: "Apenas administradores podem alterar as configuracoes da IA." }, { status: 403 });
  }
  return null;
}

function getAllowedSelect(fields: string) {
  if (!fields) return DEFAULT_SELECT;

  const requested = fields
    .split(",")
    .map((field) => field.trim())
    .filter((field) => ALLOWED_SELECT_FIELDS.has(field));

  return requested.length > 0 ? requested.join(",") : DEFAULT_SELECT;
}

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for IA assistants. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.");
  }

  return fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
}

export async function GET(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));

    const select = getAllowedSelect(getString(request.nextUrl.searchParams.get("fields")));

    if (id) {
      const response = await supabaseRequest(`ia_assistant?select=${select}&id=eq.${encodeURIComponent(id)}`);

      if (!response.ok) {
        return NextResponse.json({ message: await response.text() }, { status: response.status });
      }

      const data = (await response.json()) as RawAssistant[];
      return NextResponse.json({ assistant: data[0] || null });
    }

    const response = await supabaseRequest(`ia_assistant?select=${select}&order=created_at.desc`);

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as RawAssistant[];
    return NextResponse.json({ assistants: data });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível carregar os assistentes." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawAssistant | null;
    const unauthorized = requireAdmin(request, body);
    if (unauthorized) return unauthorized;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
    }

    const name = getString(body.name);
    if (!name) {
      return NextResponse.json({ message: "O nome é obrigatório." }, { status: 400 });
    }

    const assistant = {
      name,
      gender: getNullableString(body.gender),
      emoji: getNullableBoolean(body.emoji),
      dados_empresa: getNullableString(body.dados_empresa),
      msg_inicial: getNullableString(body.msg_inicial),
      estilo_conversa: getNullableString(body.estilo_conversa),
      avisar_agendamento: getNullableBoolean(body.avisar_agendamento),
      avisar_encaminhamento: getNullableBoolean(body.avisar_encaminhamento),
      cliente_nome: getNullableString(body.cliente_nome),
      cliente_whats: getNullableString(body.cliente_whats),
    };

    const response = await supabaseRequest("ia_assistant?select=*", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(assistant),
    });

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as RawAssistant[];
    return NextResponse.json({ assistant: data[0] ?? assistant });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível salvar o assistente." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawAssistant | null;
    const unauthorized = requireAdmin(request, body);
    if (unauthorized) return unauthorized;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
    }

    const id = getString(body.id) || getString(request.nextUrl.searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ message: "O ID é obrigatório." }, { status: 400 });
    }

    const patch: RawAssistant = {};

    const textFields = ["name", "gender", "dados_empresa", "msg_inicial", "estilo_conversa", "cliente_nome", "cliente_whats"];

    const booleanFields = ["emoji", "avisar_agendamento", "avisar_encaminhamento"];

    for (const field of textFields) {
      if (field in body) {
        patch[field] = getNullableString(body[field]);
      }
    }

    for (const field of booleanFields) {
      if (field in body) {
        patch[field] = getNullableBoolean(body[field]);
      }
    }

    if ("name" in patch && patch.name === null) {
      return NextResponse.json({ message: "O nome não pode ser vazio." }, { status: 400 });
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ message: "Nenhum campo para atualizar." }, { status: 400 });
    }

    const response = await supabaseRequest(`ia_assistant?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as RawAssistant[];
    const assistant = data[0];

    if (!assistant) {
      return NextResponse.json({ message: "Assistente não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ assistant });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível editar o assistente." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const unauthorized = requireAdmin(request);
    if (unauthorized) return unauthorized;

    const id = getString(request.nextUrl.searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ message: "ID do assistente é obrigatório." }, { status: 400 });
    }

    const response = await supabaseRequest(`ia_assistant?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível apagar o assistente." }, { status: 500 });
  }
}

