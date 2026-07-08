import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_REST_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

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

export async function GET(request: NextRequest) {
  try {
    // Fetch professionals and their related users, specialties, and procedures
    const select = ["*", "users:user_id(id,name,email)", "professional_especialidades(especialidade:id_especialidade(id,especialidade))", "professional_procedimentos(procedimentos:id_procedimento(id,nome))"].join(",");

    const response = await supabaseRequest(`professional?select=${select}&order=created_at.desc`);

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = await response.json();

    // Map database structures to clean frontend model
    const professionals = data.map((prof: any) => {
      const isUser = !!prof.users;
      const name = isUser ? prof.users.name || prof.nome : prof.nome;
      const email = isUser ? prof.users.email || prof.email : prof.email;

      // Extract specialties
      const expertises = (prof.professional_especialidades || []).map((pe: any) => pe.especialidade?.especialidade).filter(Boolean);

      // Extract procedures
      const procedures = (prof.professional_procedimentos || []).map((pp: any) => pp.procedimentos).filter(Boolean);

      return {
        id: prof.ida_profissional,
        email: email || "",
        name: name || "",
        cidade: prof.cidade || "",
        cpf: prof.cpf || "",
        doenças_atendidas: prof.doeças_atendidas || "",
        user_id: prof.user_id,
        expertises,
        procedures,
      };
    });

    return NextResponse.json({ professionals });
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
    const doenças_atendidas = getString(body.doenças_atendidas) || getString(body.doencas_atendidas);
    const expertises = Array.isArray(body.expertises) ? body.expertises : []; // IDs of specialties
    const procedures = Array.isArray(body.procedures) ? body.procedures : []; // IDs of procedures

    if (!email) {
      return NextResponse.json({ message: "O e-mail é obrigatório." }, { status: 400 });
    }

    // 1. Check if a user with this email exists in the users table
    let user_id: string | null = null;
    const userCheck = await supabaseRequest(`users?select=id&email=eq.${encodeURIComponent(email)}`);
    if (userCheck.ok) {
      const usersData = await userCheck.json();
      if (usersData && usersData.length > 0) {
        user_id = usersData[0].id;
      }
    }

    // 2. Insert the professional record
    const professionalPayload = {
      nome: user_id ? null : nome,
      email: user_id ? null : email,
      cidade: cidade || null,
      cpf: cpf || null,
      doeças_atendidas: doenças_atendidas || null,
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
    const id_professional = newProf.ida_profissional;

    // 3. Link specialties (N to N)
    if (expertises.length > 0) {
      const expertisePayload = expertises.map((id_especialidade: string) => ({
        id_professional,
        id_especialidade,
      }));

      await supabaseRequest("professional_especialidades", {
        method: "POST",
        body: JSON.stringify(expertisePayload),
      });
    }

    // 4. Link procedures (N to N)
    if (procedures.length > 0) {
      const procedurePayload = procedures.map((id_procedimento: string) => ({
        id_professional,
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

