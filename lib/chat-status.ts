import type { ChatRecord } from "@/lib/supabase-rest";

export interface ChatStatusOption {
  label: string;
  color?: string;
}

export function getChatStatusColor(chat?: Partial<ChatRecord>) {
  if (chat?.finalizada === true) {
    return "#6b7280";
  }

  if (chat?.hex_status && /^#[0-9a-f]{6}$/i.test(chat.hex_status)) {
    return chat.hex_status;
  }

  return "#22c55e";
}

export function getChatStatusLabel(chat?: Partial<ChatRecord>) {
  return chat?.finalizada ? "Finalizada" : chat?.Status_chat || "Aberta";
}
