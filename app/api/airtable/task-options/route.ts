import { NextResponse } from "next/server"

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type TaskOptionRow = {
  type: string | null
  status: string | null
}

type UserProfileRow = {
  id: string
  airtable_record_id: string | null
  name: string
  status: string
}

function getSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase REST configuration for task options.")
  return { url: SUPABASE_REST_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY }
}

async function supabaseRequest<T>(path: string): Promise<T> {
  const { url, key } = getSupabaseConfig()
  const response = await fetch(`${url}/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<T>
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  )
}

function externalId(row: UserProfileRow) {
  return row.airtable_record_id || row.id
}

export async function GET() {
  try {
    const [taskRows, userRows] = await Promise.all([
      supabaseRequest<TaskOptionRow[]>("tasks?select=type,status&is_active=is.true&deleted_at=is.null&limit=10000"),
      supabaseRequest<UserProfileRow[]>("user_profiles?select=id,airtable_record_id,name,status&status=eq.active&order=name.asc&limit=1000"),
    ])

    const types = uniqueSorted(taskRows.map((row) => row.type))
    const statuses = uniqueSorted(taskRows.map((row) => row.status))
    const users = userRows.map((row) => ({ id: externalId(row), label: row.name })).filter((user) => user.label)

    return NextResponse.json({
      types: types.length ? types : ["Tarefa"],
      statuses: statuses.length ? statuses : ["Aguardando", "Resolvendo", "Finalizado"],
      users,
      errors: [],
    })
  } catch (error) {
    return NextResponse.json({
      types: ["Tarefa"],
      statuses: ["Aguardando", "Resolvendo", "Finalizado"],
      users: [],
      errors: [error instanceof Error ? error.message : "Nao foi possivel carregar opcoes de tarefas."],
    })
  }
}
