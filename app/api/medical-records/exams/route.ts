import { NextRequest, NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type RawExamRecord = Record<string, unknown>

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function escapePostgrestPattern(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[%*_]/g, (character) => `\\${character}`)
}

async function supabaseRequest(path: string) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for medical records.")
  }

  return fetch(`${SUPABASE_REST_URL.replace(/\/$/, "")}/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    cache: "no-store",
  })
}

export async function GET(request: NextRequest) {
  try {
    const idaContato = getString(request.nextUrl.searchParams.get("idaContato"))
    const idaAgendamento = getString(request.nextUrl.searchParams.get("idaAgendamento"))
    const patientName = getString(request.nextUrl.searchParams.get("patientName"))
    const filters: string[] = []

    if (idaContato) filters.push(`ida-contato.eq.${encodeURIComponent(idaContato)}`)
    if (idaAgendamento) filters.push(`ida-agendamento.eq.${encodeURIComponent(idaAgendamento)}`)
    if (patientName) filters.push(`paciente_nome.ilike."*${escapePostgrestPattern(patientName)}*"`)

    if (filters.length === 0) {
      return NextResponse.json({ exams: [] })
    }

    const params = new URLSearchParams({
      select: [
        "id",
        "paciente_nome",
        "codigo_tuss",
        "analitos",
        "historico_analitos",
        "data_realizacao",
        "status",
        "observacoes",
        "arquivo_url",
        "nome_arquivo",
        "mime_type",
        "storage_path",
        "processamento_status",
        "texto_extraido",
        "tipo_exame",
        "grupo_comparacao",
        "arquivo_url_expira_em",
        "ida-contato",
        "ida-agendamento",
        "created_at",
        "updated_at",
      ].join(","),
    })
    params.set("or", `(${filters.join(",")})`)
    params.set("order", "data_realizacao.desc.nullslast")
    params.set("limit", "100")

    const response = await supabaseRequest(`exames?${params}`)

    if (!response.ok) {
      return NextResponse.json({ exams: [], message: await response.text() }, { status: response.status })
    }

    return NextResponse.json({ exams: (await response.json()) as RawExamRecord[] })
  } catch (error) {
    return NextResponse.json(
      { exams: [], message: error instanceof Error ? error.message : "Não foi possível carregar os exames." },
      { status: 500 },
    )
  }
}
