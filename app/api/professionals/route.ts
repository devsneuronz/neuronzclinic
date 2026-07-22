import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type LinkedExpertise = {
  id_professional: string;
  especialidade?: {
    id: string;
    especialidade: string;
  } | null;
};

type LinkedProcedure = {
  id_professional: string;
  clinic_procedures?: {
    id: string;
    name: string | null;
    interest: string | null;
  } | null;
};

type ProfessionalRow = {
  id: string;
  legacy_professional_id: string | null;
  airtable_record_id: string | null;
  name: string | null;
  email: string | null;
  city: string | null;
  tax_id: string | null;
  treated_conditions: string | null;
  user_id: string | null;
  status: string | null;
  user_profile?: {
    name: string | null;
    email: string | null;
  } | null;
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
  source: "supabase";
};

type UserProfileRef = {
  id: string;
};

type ProfessionalPayload = {
  name: string;
  email: string;
  city: string;
  taxId: string;
  treatedConditions: string;
  userId: string | null;
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

async function findUserProfileByEmail(email: string) {
  if (!email) return null;

  const response = await supabaseRequest(`user_profiles?select=id&email=eq.${encodeURIComponent(email.toLowerCase())}&status=eq.active&limit=1`);
  const rows = response.ok ? ((await response.json()) as UserProfileRef[]) : [];
  return rows[0]?.id ?? null;
}

async function findUserProfileById(id: string) {
  if (!id) return null;

  const response = await supabaseRequest(`user_profiles?select=id&id=eq.${encodeURIComponent(id)}&status=eq.active&limit=1`);
  const rows = response.ok ? ((await response.json()) as UserProfileRef[]) : [];
  return rows[0]?.id ?? null;
}

function mapProfessional(
  prof: ProfessionalRow,
  expertisesByProfessionalId: Map<string, LinkedExpertise[]>,
  proceduresByProfessionalId: Map<string, LinkedProcedure[]>,
) {
  const isUser = !!prof.user_profile;
  const name = isUser ? prof.user_profile?.name || prof.name : prof.name;
  const email = isUser ? prof.user_profile?.email || prof.email : prof.email;

  const expertises = (expertisesByProfessionalId.get(prof.id) || []).map((pe) => pe.especialidade).filter(Boolean);
  const procedures = (proceduresByProfessionalId.get(prof.id) || [])
    .map((pp) => pp.clinic_procedures)
    .filter((procedure): procedure is NonNullable<LinkedProcedure["clinic_procedures"]> => Boolean(procedure?.id))
    .map((procedure) => ({
      id: procedure.id,
      nome: procedure.name || procedure.interest || "Procedimento",
      name: procedure.name,
      interest: procedure.interest,
    }));

  return {
    id: prof.id,
    legacy_professional_id: prof.legacy_professional_id,
    airtable_record_id: prof.airtable_record_id,
    email: email || "",
    name: name || "",
    cidade: prof.city || "",
    cpf: prof.tax_id || "",
    doencas_atendidas: prof.treated_conditions || "",
    user_id: prof.user_id,
    status: prof.status || "active",
    expertises,
    procedures,
  };
}

async function getProfessionalLinks(professionalIds: string[]) {
  if (professionalIds.length === 0) {
    return {
      expertisesByProfessionalId: new Map<string, LinkedExpertise[]>(),
      proceduresByProfessionalId: new Map<string, LinkedProcedure[]>(),
    };
  }

  const filter = professionalIds.map(encodeURIComponent).join(",");
  const [expertisesResponse, proceduresResponse] = await Promise.all([
    supabaseRequest(`professional_especialidades?select=id_professional,especialidade:id_especialidade(id,especialidade)&id_professional=in.(${filter})`),
    supabaseRequest(`professional_procedimentos?select=id_professional,clinic_procedures:id_procedimento(id,name,interest)&id_professional=in.(${filter})`),
  ]);

  const expertises = expertisesResponse.ok ? ((await expertisesResponse.json()) as LinkedExpertise[]) : [];
  const procedures = proceduresResponse.ok ? ((await proceduresResponse.json()) as LinkedProcedure[]) : [];
  const expertisesByProfessionalId = new Map<string, LinkedExpertise[]>();
  const proceduresByProfessionalId = new Map<string, LinkedProcedure[]>();

  for (const expertise of expertises) {
    const list = expertisesByProfessionalId.get(expertise.id_professional) || [];
    list.push(expertise);
    expertisesByProfessionalId.set(expertise.id_professional, list);
  }

  for (const procedure of procedures) {
    const list = proceduresByProfessionalId.get(procedure.id_professional) || [];
    list.push(procedure);
    proceduresByProfessionalId.set(procedure.id_professional, list);
  }

  return { expertisesByProfessionalId, proceduresByProfessionalId };
}

async function resolveUserId(payload: ProfessionalPayload, linkedUserSource: string) {
  if (payload.userId) return findUserProfileById(payload.userId);
  if (linkedUserSource === "supabase" && payload.email) return findUserProfileByEmail(payload.email);
  if (payload.email) return findUserProfileByEmail(payload.email);
  return null;
}

function getProfessionalPayload(body: Record<string, unknown>, userId: string | null): ProfessionalPayload {
  return {
    name: getString(body.nome),
    email: getString(body.email),
    city: getString(body.cidade),
    taxId: getString(body.cpf),
    treatedConditions: getString(body.doencas_atendidas),
    userId,
  };
}

async function replaceProfessionalLinks(professionalId: string, expertises: unknown[], procedures: unknown[]) {
  await supabaseRequest(`professional_especialidades?id_professional=eq.${encodeURIComponent(professionalId)}`, {
    method: "DELETE",
  });

  if (expertises.length > 0) {
    const expertisePayload = expertises
      .map((id_especialidade) => (typeof id_especialidade === "string" ? id_especialidade : ""))
      .filter(Boolean)
      .map((id_especialidade) => ({
        id_professional: professionalId,
        id_especialidade,
      }));

    if (expertisePayload.length > 0) {
      await supabaseRequest("professional_especialidades", {
        method: "POST",
        body: JSON.stringify(expertisePayload),
      });
    }
  }

  await supabaseRequest(`professional_procedimentos?id_professional=eq.${encodeURIComponent(professionalId)}`, {
    method: "DELETE",
  });

  if (procedures.length > 0) {
    const procedurePayload = procedures
      .map((id_procedimento) => (typeof id_procedimento === "string" ? id_procedimento : ""))
      .filter(Boolean)
      .map((id_procedimento) => ({
        id_professional: professionalId,
        id_procedimento,
      }));

    if (procedurePayload.length > 0) {
      await supabaseRequest("professional_procedimentos", {
        method: "POST",
        body: JSON.stringify(procedurePayload),
      });
    }
  }
}

export async function GET() {
  try {
    const select = "id,legacy_professional_id,airtable_record_id,name,email,city,tax_id,treated_conditions,user_id,status,user_profile:user_profiles!professionals_user_id_fkey(id,name,email)";
    const [response, usersResponse] = await Promise.all([supabaseRequest(`professionals?select=${select}&order=created_at.desc`), supabaseRequest("user_profiles?select=id,name,email&status=eq.active&order=name.asc")]);

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = (await response.json()) as ProfessionalRow[];
    const professionalIds = Array.from(new Set(data.map((prof) => prof.id).filter(Boolean)));
    const { expertisesByProfessionalId, proceduresByProfessionalId } = await getProfessionalLinks(professionalIds);
    const professionals = data.map((prof) => mapProfessional(prof, expertisesByProfessionalId, proceduresByProfessionalId));

    const supabaseUsers: ProfessionalUserOption[] = usersResponse.ok
      ? ((await usersResponse.json()) as UserRow[]).map((user) => ({
          id: user.id,
          name: user.name || user.email || "Usuario",
          email: user.email || "",
          source: "supabase",
        }))
      : [];

    const users = supabaseUsers.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return NextResponse.json({ professionals, users });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel carregar os profissionais." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
    }

    const requestedUserId = getString(body.user_id);
    const linkedUserSource = getString(body.linked_user_source);
    const userId = await resolveUserId(
      {
        name: getString(body.nome),
        email: getString(body.email),
        city: getString(body.cidade),
        taxId: getString(body.cpf),
        treatedConditions: getString(body.doencas_atendidas),
        userId: requestedUserId || null,
      },
      linkedUserSource,
    );
    const payload = getProfessionalPayload(body as Record<string, unknown>, userId);
    const expertises = Array.isArray(body.expertises) ? body.expertises : [];
    const procedures = Array.isArray(body.procedures) ? body.procedures : [];

    if (!payload.email && !requestedUserId) {
      return NextResponse.json({ message: "O e-mail e obrigatorio." }, { status: 400 });
    }

    const profResponse = await supabaseRequest("professionals?select=*", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        name: payload.userId ? "" : payload.name,
        email: payload.userId ? null : payload.email,
        city: payload.city || null,
        tax_id: payload.taxId || null,
        treated_conditions: payload.treatedConditions || null,
        user_id: payload.userId,
        status: "active",
        source: "supabase",
      }),
    });

    if (!profResponse.ok) {
      return NextResponse.json({ message: await profResponse.text() }, { status: profResponse.status });
    }

    const profData = (await profResponse.json()) as ProfessionalRow[];
    const newProf = profData[0];
    await replaceProfessionalLinks(newProf.id, expertises, procedures);

    return NextResponse.json({ success: true, professional: newProf });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel salvar o profissional." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
    }

    const id = getString(body.id);
    if (!id) {
      return NextResponse.json({ message: "O ID do profissional e obrigatorio para edicao." }, { status: 400 });
    }

    const requestedUserId = getString(body.user_id);
    const linkedUserSource = getString(body.linked_user_source);
    const userId = await resolveUserId(
      {
        name: getString(body.nome),
        email: getString(body.email),
        city: getString(body.cidade),
        taxId: getString(body.cpf),
        treatedConditions: getString(body.doencas_atendidas),
        userId: requestedUserId || null,
      },
      linkedUserSource,
    );
    const payload = getProfessionalPayload(body as Record<string, unknown>, userId);
    const expertises = Array.isArray(body.expertises) ? body.expertises : [];
    const procedures = Array.isArray(body.procedures) ? body.procedures : [];

    const profResponse = await supabaseRequest(`professionals?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        name: payload.userId ? "" : payload.name,
        email: payload.userId ? null : payload.email,
        city: payload.city || null,
        tax_id: payload.taxId || null,
        treated_conditions: payload.treatedConditions || null,
        user_id: payload.userId,
      }),
    });

    if (!profResponse.ok) {
      return NextResponse.json({ message: await profResponse.text() }, { status: profResponse.status });
    }

    const profData = (await profResponse.json()) as ProfessionalRow[];
    const updatedProf = profData[0];
    if (!updatedProf) return NextResponse.json({ message: "Profissional nao encontrado." }, { status: 404 });

    await replaceProfessionalLinks(updatedProf.id, expertises, procedures);

    return NextResponse.json({ success: true, professional: updatedProf });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel atualizar o profissional." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ message: "O ID do profissional e obrigatorio para exclusao." }, { status: 400 });
    }

    await supabaseRequest(`professional_especialidades?id_professional=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    await supabaseRequest(`professional_procedimentos?id_professional=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    const deleteProfessionalResponse = await supabaseRequest(`professionals?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!deleteProfessionalResponse.ok) {
      return NextResponse.json({ message: await deleteProfessionalResponse.text() }, { status: deleteProfessionalResponse.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel excluir o profissional." }, { status: 500 });
  }
}
