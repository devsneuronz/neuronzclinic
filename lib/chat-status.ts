import type { ChatRecord } from "@/lib/supabase-rest";

export interface ChatStatusOption {
  label: string;
  color?: string;
}

export function getChatStatusColor(chat?: Partial<ChatRecord>) {
  if (chat?.hex_status && /^#[0-9a-f]{6}$/i.test(chat.hex_status)) {
    return chat.hex_status;
  }

  return "#22c55e";
}

export function getChatStatusLabel(chat?: Partial<ChatRecord>) {
  return chat?.Status_chat;
}
