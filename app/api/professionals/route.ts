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
    const select = ["*", "users:user_id(id,name,email)", "professional_especialidades(especialidade:id_especialidade(id,especialidade))", "professional_procedimentos(procedimentos:id_procedimento(id,nome))"].join(",");

    const response = await supabaseRequest(`professional?select=${select}&order=created_at.desc`);

    if (!response.ok) {
      return NextResponse.json({ message: await response.text() }, { status: response.status });
    }

    const data = await response.json();

    const professionals = data.map((prof: any) => {
      const isUser = !!prof.users;
      const name = isUser ? prof.users.name || prof.nome : prof.nome;
      const email = isUser ? prof.users.email || prof.email : prof.email;

      const expertises = (prof.professional_especialidades || []).map((pe: any) => pe.especialidade).filter(Boolean);

      const procedures = (prof.professional_procedimentos || []).map((pp: any) => pp.procedimentos).filter(Boolean);

      return {
        id: prof.ida_profissional,
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
    const doencas_atendidas = getString(body.doencas_atendidas);
    const expertises = Array.isArray(body.expertises) ? body.expertises : []; // IDs of specialties
    const procedures = Array.isArray(body.procedures) ? body.procedures : []; // IDs of procedures

    if (!email) {
      return NextResponse.json({ message: "O e-mail é obrigatório." }, { status: 400 });
    }

    let user_id: string | null = null;
    const userCheck = await supabaseRequest(`users?select=id&email=eq.${encodeURIComponent(email)}`);
    if (userCheck.ok) {
      const usersData = await userCheck.json();
      if (usersData && usersData.length > 0) {
        user_id = usersData[0].id;
      }
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
    const ida_profissional = newProf.ida_profissional;

    if (expertises.length > 0) {
      const expertisePayload = expertises.map((id_especialidade: string) => ({
        ida_profissional,
        id_especialidade,
      }));

      await supabaseRequest("professional_especialidades", {
        method: "POST",
        body: JSON.stringify(expertisePayload),
      });
    }

    if (procedures.length > 0) {
      const procedurePayload = procedures.map((id_procedimento: string) => ({
        ida_profissional,
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
    const id_professional = getString(body.id);
    if (!id_professional) {
      return NextResponse.json({ message: "O ID do profissional é obrigatório para edição." }, { status: 400 });
    }

    const email = getString(body.email);
    const nome = getString(body.nome);
    const cidade = getString(body.cidade);
    const cpf = getString(body.cpf);
    const doencas_atendidas = getString(body.doencas_atendidas);
    const expertises = Array.isArray(body.expertises) ? body.expertises : [];
    const procedures = Array.isArray(body.procedures) ? body.procedures : [];

    let user_id: string | null = null;
    if (email) {
      const userCheck = await supabaseRequest(`users?select=id&email=eq.${encodeURIComponent(email)}`);
      if (userCheck.ok) {
        const usersData = await userCheck.json();
        if (usersData && usersData.length > 0) {
          user_id = usersData[0].id;
        }
      }
    }

    const professionalPayload = {
      nome: user_id ? null : nome,
      email: user_id ? null : email,
      cidade: cidade || null,
      cpf: cpf || null,
      doencas_atendidas: doencas_atendidas || null,
      user_id: user_id,
    };

    const profResponse = await supabaseRequest(`professional?ida_profissional=eq.${id_professional}`, {
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

    await supabaseRequest(`professional_especialidades?id_professional=eq.${id_professional}`, {
      method: "DELETE",
    });

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

    await supabaseRequest(`professional_procedimentos?id_professional=eq.${id_professional}`, {
      method: "DELETE",
    });

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

    return NextResponse.json({ success: true, professional: updatedProf });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível atualizar o profissional." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id_professional = request.nextUrl.searchParams.get("id");

    if (!id_professional) {
      return NextResponse.json({ message: "O ID do profissional é obrigatório para exclusão." }, { status: 400 });
    }

    console.log("Deletando profissional ID:", id_professional);

    const espRes = await supabaseRequest(`professional_especialidades?id_professional=eq.${id_professional}`, {
      method: "DELETE",
    });
    if (!espRes.ok) {
      console.error("Erro ao deletar especialidades do profissional:", await espRes.text());
    }

    const procRes = await supabaseRequest(`professional_procedimentos?id_professional=eq.${id_professional}`, {
      method: "DELETE",
    });
    if (!procRes.ok) {
      console.error("Erro ao deletar procedimentos do profissional:", await procRes.text());
    }

    const response = await supabaseRequest(`professional?ida_profissional=eq.${id_professional}`, {
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

