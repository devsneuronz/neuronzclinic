import type { ChatRecord } from "@/lib/supabase-rest";

export interface ChatStatusOption {
  label: string;
  color?: string;
}

const STATUS_ORDER = ["PRIMEIRO CONTATO", "CONEXÃO", "LEAD QUALIFICADO", "CONSULTA AGENDADA", "CONSULTA CANCELADA", "CONSULTA REALIZADA", "PACIENTE ATIVO", "PACIENTE INATIVO", "ADM", "FORNECEDOR", "MKT", "OUTRO", "PARCEIRO", "PERDIDO"];

export function sortStatusOptions(statuses: ChatStatusOption[]) {
  const orderMap = new Map(STATUS_ORDER.map((label, index) => [label.toLowerCase(), index]));

  return statuses.sort((a, b) => {
    const aIndex = orderMap.get(a.label.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = orderMap.get(b.label.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;

    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }

    return a.label.localeCompare(b.label, "pt-BR", {
      sensitivity: "base",
    });
  });
}

export function getChatStatusColor(chat?: Partial<ChatRecord>) {
  if (chat?.hex_status && /^#[0-9a-f]{6}$/i.test(chat.hex_status)) {
    return chat.hex_status;
  }

  return "#ff0000";
}

export function getChatStatusLabel(chat?: Partial<ChatRecord>) {
  return chat?.Status_chat;
}
