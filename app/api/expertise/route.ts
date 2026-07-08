import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for expertise. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.");
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
    const response = await supabaseRequest("especialidade?select=*&order=especialidade.asc");

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ expertises: data });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível carregar as especialidades." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
    }

    const name = getString(body.especialidade);
    if (!name) {
      return NextResponse.json({ message: "O nome da especialidade é obrigatório." }, { status: 400 });
    }

    // Check if it already exists to avoid duplication
    const checkResponse = await supabaseRequest(`especialidade?select=*&especialidade=eq.${encodeURIComponent(name)}`);
    if (checkResponse.ok) {
      const existing = await checkResponse.json();
      if (existing && existing.length > 0) {
        return NextResponse.json({ expertise: existing[0] });
      }
    }

    const response = await supabaseRequest("especialidade?select=*", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({ especialidade: name }),
    });

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ expertise: data[0] });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível criar a especialidade." }, { status: 500 });
  }
}
