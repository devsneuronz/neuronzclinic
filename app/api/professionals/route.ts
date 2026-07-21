import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type LinkedExpertise = {
  especialidade?: {
    id: string;
    especialidade: string;
  } | null;
};

type LinkedProcedure = {
  procedimentos?: {
    id: string;
    nome: string;
  } | null;
};

type ProfessionalRow = {
  id_profissional: string;
  nome: string | null;
  email: string | null;
  cidade: string | null;
  cpf: string | null;
  doencas_atendidas: string | null;
  user_id: string | null;
  users?: {
    name: string | null;
    email: string | null;
  } | null;
  professional_especialidades?: LinkedExpertise[];
  professional_procedimentos?: LinkedProcedure[];
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type ProfessionalUserOption = {
  id: string;
  name: string;
  email: string;
  source: "supabase" | "airtable";
};

type SupabaseUserRef = {
  id: string;
};

async function supabaseRequest(path: string, init?: RequestInit) {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase REST configuration for professionals. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.");
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

async function getAirtableUsers(origin: string) {
  try {
    const response = await fetch(`${origin}/api/airtable/users`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as { users?: Array<{ id?: string; name?: string; email?: string }> };

    return (payload.users ?? [])
      .filter((user) => user.id && user.email)
      .map((user) => ({
        id: user.id as string,
        name: user.name || user.email || "Usuario",
        email: user.email || "",
        source: "airtable" as const,
      }));
  } catch {
    return [];
  }
}

async function findSupabaseUserByEmail(email: string) {
  if (!email) return null;

  const response = await supabaseRequest(`users?select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
  const rows = response.ok ? ((await response.json()) as SupabaseUserRef[]) : [];
  return rows[0]?.id ?? null;
}

async function findSupabaseUserById(id: string) {
  if (!id) return null;

  const response = await supabaseRequest(`users?select=id&id=eq.${encodeURIComponent(id)}&limit=1`);
  const rows = response.ok ? ((await response.json()) as SupabaseUserRef[]) : [];
  return rows[0]?.id ?? null;
}

async function ensureSupabaseUserByEmail(email: string, name: string) {
  const existingId = await findSupabaseUserByEmail(email);
  if (existingId) return existingId;

  const payloads = [
    { name: name || email, email, role: "operator" },
    { name: name || email, email },
  ];

  for (const payload of payloads) {
    const response = await supabaseRequest("users?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const rows = (await response.json()) as SupabaseUserRef[];
      return rows[0]?.id ?? null;
    }

    if (response.status === 409) {
      return findSupabaseUserByEmail(email);
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const select = ["*", "users:user_id(id,name,email)", "professional_especialidades(especialidade:id_especialidade(id,especialidade))", "professional_procedimentos(procedimentos:id_procedimento(id,nome))"].join(",");

    const [response, usersResponse] = await Promise.all([supabaseRequest(`professional?select=${select}&order=created_at.desc`), supabaseRequest("users?select=id,name,email&order=name.asc")]);

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as ProfessionalRow[];

    const professionals = data.map((prof) => {
      const isUser = !!prof.users;
      const name = isUser ? prof.users?.name || prof.nome : prof.nome;
      const email = isUser ? prof.users?.email || prof.email : prof.email;

      const expertises = (prof.professional_especialidades || []).map((pe) => pe.especialidade).filter(Boolean);

      const procedures = (prof.professional_procedimentos || []).map((pp) => pp.procedimentos).filter(Boolean);

      return {
        id: prof.id_profissional,
        email: email || "",
        name: name || "",
        cidade: prof.cidade || "",
        cpf: prof.cpf || "",
        doencas_atendidas: prof.doencas_atendidas || "",
        user_id: prof.user_id,
        expertises,
        procedures,
      };
    });

    const supabaseUsers: ProfessionalUserOption[] = usersResponse.ok
      ? ((await usersResponse.json()) as UserRow[]).map((user) => ({
          id: user.id,
          name: user.name || user.email || "Usuario",
          email: user.email || "",
          source: "supabase",
        }))
      : [];

    const supabaseEmails = new Set(supabaseUsers.map((user) => user.email.trim().toLowerCase()).filter(Boolean));
    const airtableUsers = (await getAirtableUsers(request.nextUrl.origin)).filter((user) => !supabaseEmails.has(user.email.trim().toLowerCase()));
    const users = [...supabaseUsers, ...airtableUsers].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return NextResponse.json({ professionals, users });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível carregar os profissionais." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
    }

    const email = getString(body.email);
    const nome = getString(body.nome);
    const cidade = getString(body.cidade);
    const cpf = getString(body.cpf);
    const doencas_atendidas = getString(body.doencas_atendidas);
    const requestedUserId = getString(body.user_id);
    const linkedUserSource = getString(body.linked_user_source);
    const expertises = Array.isArray(body.expertises) ? body.expertises : []; // IDs of specialties
    const procedures = Array.isArray(body.procedures) ? body.procedures : []; // IDs of procedures

    if (!email && !requestedUserId) {
      return NextResponse.json({ message: "O e-mail é obrigatório." }, { status: 400 });
    }

    let user_id: string | null = null;
    if (requestedUserId) {
      user_id = await findSupabaseUserById(requestedUserId);
    } else if (linkedUserSource === "airtable" && email) {
      user_id = await ensureSupabaseUserByEmail(email, nome);
    } else {
      user_id = await findSupabaseUserByEmail(email);
    }

    const professionalPayload = {
      nome: user_id ? null : nome,
      email: user_id ? null : email,
      cidade: cidade || null,
      cpf: cpf || null,
      doencas_atendidas: doencas_atendidas || null,
      user_id: user_id,
    };

    const profResponse = await supabaseRequest("professional?select=*", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(professionalPayload),
    });

    if (!profResponse.ok) {
      return NextResponse.json({ message: await profResponse.text() }, { status: profResponse.status });
    }

    const profData = await profResponse.json();
    const newProf = profData[0];
    const id_profissional = newProf.id_profissional;

    if (expertises.length > 0) {
      const expertisePayload = expertises.map((id_especialidade: string) => ({
        id_professional: id_profissional,
        id_especialidade,
      }));

      await supabaseRequest("professional_especialidades", {
        method: "POST",
        body: JSON.stringify(expertisePayload),
      });
    }

    if (procedures.length > 0) {
      const procedurePayload = procedures.map((id_procedimento: string) => ({
        id_professional: id_profissional,
        id_procedimento,
      }));

      await supabaseRequest("professional_procedimentos", {
        method: "POST",
        body: JSON.stringify(procedurePayload),
      });
    }

    return NextResponse.json({ success: true, professional: newProf });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível salvar o profissional." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
    }
    const id_profissional = getString(body.id);
    if (!id_profissional) {
      return NextResponse.json({ message: "O ID do profissional é obrigatório para edição." }, { status: 400 });
    }

    const email = getString(body.email);
    const nome = getString(body.nome);
    const cidade = getString(body.cidade);
    const cpf = getString(body.cpf);
    const doencas_atendidas = getString(body.doencas_atendidas);
    const requestedUserId = getString(body.user_id);
    const linkedUserSource = getString(body.linked_user_source);
    const expertises = Array.isArray(body.expertises) ? body.expertises : [];
    const procedures = Array.isArray(body.procedures) ? body.procedures : [];

    let user_id: string | null = null;
    if (requestedUserId) {
      user_id = await findSupabaseUserById(requestedUserId);
    } else if (linkedUserSource === "airtable" && email) {
      user_id = await ensureSupabaseUserByEmail(email, nome);
    } else if (email) {
      user_id = await findSupabaseUserByEmail(email);
    }

    const professionalPayload = {
      nome: user_id ? null : nome,
      email: user_id ? null : email,
      cidade: cidade || null,
      cpf: cpf || null,
      doencas_atendidas: doencas_atendidas || null,
      user_id: user_id,
    };

    const profResponse = await supabaseRequest(`professional?id_profissional=eq.${id_profissional}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(professionalPayload),
    });

    if (!profResponse.ok) {
      return NextResponse.json({ message: await profResponse.text() }, { status: profResponse.status });
    }

    const profData = await profResponse.json();
    const updatedProf = profData[0];

    await supabaseRequest(`professional_especialidades?id_professional=eq.${id_profissional}`, {
      method: "DELETE",
    });

    if (expertises.length > 0) {
      const expertisePayload = expertises.map((id_especialidade: string) => ({
        id_professional: id_profissional,
        id_especialidade,
      }));

      await supabaseRequest("professional_especialidades", {
        method: "POST",
        body: JSON.stringify(expertisePayload),
      });
    }

    await supabaseRequest(`professional_procedimentos?id_professional=eq.${id_profissional}`, {
      method: "DELETE",
    });

    if (procedures.length > 0) {
      const procedurePayload = procedures.map((id_procedimento: string) => ({
        id_professional: id_profissional,
        id_procedimento,
      }));

      await supabaseRequest("professional_procedimentos", {
        method: "POST",
        body: JSON.stringify(procedurePayload),
      });
    }

    return NextResponse.json({ success: true, professional: updatedProf });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível atualizar o profissional." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id_profissional = request.nextUrl.searchParams.get("id");

    if (!id_profissional) {
      return NextResponse.json({ message: "O ID do profissional é obrigatório para exclusão." }, { status: 400 });
    }

    console.log("Deletando profissional ID:", id_profissional);

    const espRes = await supabaseRequest(`professional_especialidades?id_professional=eq.${id_profissional}`, {
      method: "DELETE",
    });
    if (!espRes.ok) {
      console.error("Erro ao deletar especialidades do profissional:", await espRes.text());
    }

    const procRes = await supabaseRequest(`professional_procedimentos?id_professional=eq.${id_profissional}`, {
      method: "DELETE",
    });
    if (!procRes.ok) {
      console.error("Erro ao deletar procedimentos do profissional:", await procRes.text());
    }

    const response = await supabaseRequest(`professional?id_profissional=eq.${id_profissional}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erro ao deletar profissional no Supabase:", errText);
      return NextResponse.json({ message: errText }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro na rota DELETE /api/professionals:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível excluir o profissional." }, { status: 500 });
  }
}
