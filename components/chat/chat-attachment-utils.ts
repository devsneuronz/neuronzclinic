export type AttachmentPreviewKind = "image" | "video" | "audio" | "document";

export function getAttachmentType(file: File | null) {
  if (!file) return null;
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

export function getAttachmentLabel(file: File) {
  const kind = getAttachmentType(file);

  if (kind === "image") return "Foto";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  return "Documento";
}
