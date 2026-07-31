import type { ChatRecord } from "./supabase-rest";

export const messageDirectives = [
  { key: "nome", label: "%nome%", description: "Nome completo do contato" },
  { key: "primeiro_nome", label: "%primeiro_nome%", description: "Primeiro nome do contato" },
  { key: "telefone", label: "%telefone%", description: "Telefone do contato" },
  { key: "celular", label: "%celular%", description: "Telefone do contato" },
  { key: "hoje", label: "%hoje%", description: "Data de hoje" },
];

function getDisplayName(chat: ChatRecord) {
  return chat.nome_contato || chat.pushname || chat.chat_id?.replace("@s.whatsapp.net", "") || "";
}

function getPhone(chat: ChatRecord) {
  return chat.phone_contact?.trim() || chat.chat_id?.replace(/@.+$/, "") || "";
}

function getTodayLabel() {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

export function renderMessageDirectives(content: string, chat: ChatRecord) {
  const name = getDisplayName(chat);
  const firstName = name.split(/\s+/).filter(Boolean)[0] || name;
  const phone = getPhone(chat);

  const values: Record<string, string> = {
    nome: name,
    primeiro_nome: firstName,
    telefone: phone,
    celular: phone,
    hoje: getTodayLabel(),
  };

  return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => values[key] ?? "").replace(/%([\w.-]+)%/g, (_, key: string) => values[key] ?? "");
}
