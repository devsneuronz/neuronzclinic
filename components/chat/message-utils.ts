import { extractQuotedMessageInfo } from "@/lib/message-replies";
import type { ChatRecord, MessageRecord } from "@/lib/supabase-rest";

export function getDisplayName(chat?: ChatRecord) {
  return chat?.nome_contato || chat?.pushname || chat?.chat_id?.replace("@s.whatsapp.net", "") || "Selecione um chat";
}

export function getDateLabel(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function getTimeLabel(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function getMessageText(message: MessageRecord) {
  if (message.content) return message.content;
  if (message.message_type) return `Midia: ${message.message_type}`;
  return "Mensagem sem conteudo";
}

export function getMessagePreviewText(message: MessageRecord) {
  if (message.content?.trim()) return message.content.trim();
  const kind = getMediaKind(message);
  if (kind === "image") return "Foto";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "sticker") return "Figurinha";
  if (kind === "file") return "Arquivo";
  return "Mensagem";
}

function getMessageExtraField(message: MessageRecord, keys: string[]) {
  const record = message as MessageRecord & Record<string, unknown>;
  const value = keys.map((key) => record[key]).find((item) => typeof item === "string" && item.trim());

  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasDeletedMarker(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) return false;

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized.includes("deleted") || normalized.includes("delete") || normalized.includes("revoked") || normalized.includes("revoke") || normalized.includes("apagada");
  }

  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.some((item) => hasDeletedMarker(item, depth + 1));
  }

  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, item]) => {
    const normalizedKey = key.toLowerCase();
    const keyLooksDeleted =
      normalizedKey.includes("deleted") ||
      normalizedKey.includes("delete") ||
      normalizedKey.includes("revoked") ||
      normalizedKey.includes("revoke") ||
      normalizedKey.includes("apagada") ||
      normalizedKey === "messagestubtype" ||
      normalizedKey === "protocolmessage";

    if (keyLooksDeleted && hasDeletedMarker(item, depth + 1)) return true;
    return isRecord(item) || Array.isArray(item) ? hasDeletedMarker(item, depth + 1) : false;
  });
}

function getMessageJsonField(message: MessageRecord, keys: string[]) {
  const record = message as MessageRecord & Record<string, unknown>;
  return keys.map((key) => record[key]).find((value) => value != null);
}

export function getQuotedMessage(message: MessageRecord) {
  return extractQuotedMessageInfo(message);
}

export function getMediaUrl(message: MessageRecord) {
  if (message.public_media_url) return message.public_media_url;
  if (message.media_url) return message.media_url;

  const path = message.media_path?.replace(/^file\//, "");
  if (!path) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_REST_URL?.replace(/\/rest\/v1\/?$/, "");
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/file/${path}` : null;
}

export function getMediaKind(message: MessageRecord) {
  const type = `${message.media_mime_type || ""} ${message.message_type || ""}`.toLowerCase();

  if (type.includes("sticker") || type.includes("figurinha")) return "sticker";
  if (type.includes("image")) return "image";
  if (type.includes("video")) return "video";
  if (type.includes("audio")) return "audio";
  return "file";
}

export function getFileName(message: MessageRecord, mediaUrl: string) {
  const source = message.media_path || mediaUrl;
  const name = source.split("?")[0]?.split("/").pop();
  return name ? decodeURIComponent(name) : message.media_mime_type || message.message_type || "Arquivo";
}

export function isDeletedMessage(message: MessageRecord) {
  const status = message.status?.toLowerCase() || "";
  const type = message.message_type?.toLowerCase() || "";
  const content = message.content?.toLowerCase() || "";
  const deletedAt = getMessageExtraField(message, ["deleted_at", "deletedAt"]);
  const flags = message as MessageRecord & { deleted?: boolean | null; is_revoked?: boolean | null };
  const nestedData = getMessageJsonField(message, ["metadata", "raw_message", "message", "data", "json", "message_json", "message_data"]);

  return (
    !!deletedAt ||
    !!message.is_deleted ||
    !!message.revoked ||
    !!flags.deleted ||
    !!flags.is_revoked ||
    hasDeletedMarker(nestedData) ||
    status.includes("deleted") ||
    status.includes("revoked") ||
    type.includes("deleted") ||
    type.includes("revoked") ||
    type.includes("protocol") ||
    content.includes("mensagem apagada") ||
    content.includes("message deleted")
  );
}

export function formatTime(time: number) {
  if (isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
