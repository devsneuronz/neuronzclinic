import { ensureContactAndChat } from "@/lib/contact-chat-sync";
import { getString } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
    }

    const name = getString(body.name);
    const phone = getString(body.phone);
    const email = getString(body.email);
    const notes = getString(body.observations) || getString(body.notes);

    if (!name) {
      return NextResponse.json({ message: "Informe o nome do contato." }, { status: 400 });
    }

    const { contact, chat } = await ensureContactAndChat({
      name,
      phone,
      email,
      notes,
      status: "Novo",
    });

    const id = chat?.id || contact?.id;
    if (!id) throw new Error("Nao foi possivel criar o contato.");

    return NextResponse.json({
      contact: {
        id,
        label: contact?.name || chat?.nome_contato || name,
        phone: chat?.phone_contact || contact?.phone || phone,
      },
      message: "Contato criado com sucesso.",
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel criar o contato." }, { status: 500 });
  }
}
