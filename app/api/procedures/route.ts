import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type RawProcedure = Record<string, unknown>;

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(value: unknown) {
  const text = getString(value);
  return text || null;
}

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for procedures. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.");
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
    const fields = getString(request.nextUrl.searchParams.get("fields"));

    const defaultSelect = [
      "id",
      "status",
      "nome",
      "modo_resposta_ia",
      "info_resposta_ia",
      "modo_agendamento_ia",
      "modalidade",
      "informar_valor_avaliacao",
      "informar_valor_consulta",
      "informar_valor_procedimento",
      "valor_avaliacao",
      "valor_consulta",
      "valor_procedimento",
      "agendas_contexto_ia",
      "regra_multiplos_profissionais",
      "config_agendamento_contexto_ia",
      "interesse",
      "created_at"
    ].join(",");

    const select = fields || defaultSelect;

    if (id) {
      const response = await supabaseRequest(`procedimentos?select=${select}&id=eq.${encodeURIComponent(id)}`);

      if (!response.ok) {
        return NextResponse.json({ message: await response.text() }, { status: response.status });
      }

      const data = (await response.json()) as RawProcedure[];
      return NextResponse.json({ procedure: data[0] || null });
    }

    const response = await supabaseRequest(`procedimentos?select=${select}&order=created_at.desc`);

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as RawProcedure[];
    return NextResponse.json({ procedures: data });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível carregar os procedimentos." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawProcedure | null;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
    }

    const nome = getString(body.nome);
    if (!nome) {
      return NextResponse.json({ message: "O nome do procedimento é obrigatório." }, { status: 400 });
    }

    const procedure = {
      nome,
      status: getNullableString(body.status) || "ativo",
      modo_resposta_ia: getNullableString(body.modo_resposta_ia),
      info_resposta_ia: getNullableString(body.info_resposta_ia),
      modo_agendamento_ia: getNullableString(body.modo_agendamento_ia),
      modalidade: getNullableString(body.modalidade),
      informar_valor_avaliacao: getNullableString(body.informar_valor_avaliacao),
      informar_valor_consulta: getNullableString(body.informar_valor_consulta),
      informar_valor_procedimento: getNullableString(body.informar_valor_procedimento),
      valor_avaliacao: getNullableString(body.valor_avaliacao),
      valor_consulta: getNullableString(body.valor_consulta),
      valor_procedimento: getNullableString(body.valor_procedimento),
      agendas_contexto_ia: getNullableString(body.agendas_contexto_ia),
      regra_multiplos_profissionais: getNullableString(body.regra_multiplos_profissionais),
      config_agendamento_contexto_ia: getNullableString(body.config_agendamento_contexto_ia),
      interesse: getNullableString(body.interesse),
    };

    const response = await supabaseRequest("procedimentos?select=*", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(procedure),
    });

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as RawProcedure[];
    return NextResponse.json({ procedure: data[0] ?? procedure });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível salvar o procedimento." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RawProcedure | null;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
    }

    const id = getString(body.id) || getString(request.nextUrl.searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ message: "O ID é obrigatório." }, { status: 400 });
    }

    const patch: RawProcedure = {};

    const textFields = [
      "status",
      "nome",
      "modo_resposta_ia",
      "info_resposta_ia",
      "modo_agendamento_ia",
      "modalidade",
      "informar_valor_avaliacao",
      "informar_valor_consulta",
      "informar_valor_procedimento",
      "valor_avaliacao",
      "valor_consulta",
      "valor_procedimento",
      "agendas_contexto_ia",
      "regra_multiplos_profissionais",
      "config_agendamento_contexto_ia",
      "interesse"
    ];

    for (const field of textFields) {
      if (field in body) {
        patch[field] = getNullableString(body[field]);
      }
    }

    if ("nome" in patch && patch.nome === null) {
      return NextResponse.json({ message: "O nome não pode ser vazio." }, { status: 400 });
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ message: "Nenhum campo para atualizar." }, { status: 400 });
    }

    const response = await supabaseRequest(`procedimentos?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as RawProcedure[];
    const procedure = data[0];

    if (!procedure) {
      return NextResponse.json({ message: "Procedimento não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ procedure });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível editar o procedimento." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = getString(request.nextUrl.searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ message: "ID do procedimento é obrigatório." }, { status: 400 });
    }

    const response = await supabaseRequest(`procedimentos?id=eq.${encodeURIComponent(id)}`, {
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
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível apagar o procedimento." }, { status: 500 });
  }
}
