"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Mic, Send, X } from "lucide-react";
import Image from "next/image";
import type { FormEvent } from "react";
import type { AttachmentPreviewKind } from "./chat-attachment-utils";
import { getAttachmentLabel } from "./chat-attachment-utils";

type AttachmentPreviewModalProps = {
  attachment: File;
  attachmentKind: AttachmentPreviewKind | null;
  attachmentPreviewUrl: string | null;
  draft: string;
  isSending: boolean;
  onDraftChange: (value: string) => void;
  onRemoveAttachment: () => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
};

export function AttachmentPreviewModal({ attachment, attachmentKind, attachmentPreviewUrl, draft, isSending, onDraftChange, onRemoveAttachment, onSubmit }: AttachmentPreviewModalProps) {
  return (
    <div className="fixed inset-0 z-100 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between border-b border-border bg-card px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{attachment.name}</p>
          <p className="text-xs text-muted-foreground">
            {getAttachmentLabel(attachment)} · {(attachment.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemoveAttachment} aria-label="Fechar preview">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/5 p-4 sm:p-8">
        {attachmentPreviewUrl && attachmentKind === "image" && <Image src={attachmentPreviewUrl} alt={attachment.name} width={1200} height={900} className="max-h-full w-auto max-w-full rounded-md object-contain shadow-2xl" unoptimized />}

        {attachmentPreviewUrl && attachmentKind === "video" && <video src={attachmentPreviewUrl} className="max-h-full w-auto max-w-full rounded-md bg-black shadow-2xl" controls preload="metadata" />}

        {attachmentPreviewUrl && attachmentKind === "audio" && (
          <div className="flex w-full max-w-xl flex-col items-center gap-5 rounded-lg border border-border bg-card p-8 shadow-2xl">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-500 text-white">
              <Mic className="h-10 w-10" />
            </span>
            <div className="min-w-0 text-center">
              <p className="truncate text-base font-medium text-foreground">{attachment.name}</p>
              <p className="text-sm text-muted-foreground">{attachment.type || "audio"}</p>
            </div>
            <audio src={attachmentPreviewUrl} className="w-full" controls />
          </div>
        )}

        {attachmentKind === "document" && (
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center shadow-2xl">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-600 text-white">
              <FileText className="h-10 w-10" />
            </span>
            <div className="min-w-0">
              <p className="break-words text-base font-medium text-foreground">{attachment.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {attachment.type || "Arquivo"} · {(attachment.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-border bg-card p-4">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <Input value={draft} onChange={(event) => onDraftChange(event.target.value)} disabled={isSending} placeholder="Adicione uma legenda" className="h-11 flex-1 border-0 bg-secondary" />
          <Button type="submit" disabled={isSending} size="icon-lg" className="shrink-0 rounded-full bg-teal-500 text-white hover:bg-teal-600" aria-label="Enviar anexo">
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </form>
    </div>
  );
}
