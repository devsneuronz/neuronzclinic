"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  createSavedAttachment,
  deleteSavedAttachment,
  fetchSavedAttachments,
  updateSavedAttachment,
  uploadSavedAttachmentFile,
  type SavedAttachmentKind,
  type SavedAttachmentRecord,
} from "@/lib/supabase-rest";
import { FileAudio, FileImage, FileText, Loader2, MessageSquareText, PenLine, Plus, Search, Trash2, Upload, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const kindLabels: Record<SavedAttachmentKind, string> = {
  text: "Mensagem",
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  document: "Documento",
};

const kindIcons = {
  text: MessageSquareText,
  image: FileImage,
  video: Video,
  audio: FileAudio,
  document: FileText,
};

type AttachmentFormState = {
  title: string;
  kind: SavedAttachmentKind;
  body: string;
  mediaUrl: string;
  mediaPath: string;
  mediaMimeType: string;
  fileName: string;
  isActive: boolean;
};

const emptyForm: AttachmentFormState = {
  title: "",
  kind: "text",
  body: "",
  mediaUrl: "",
  mediaPath: "",
  mediaMimeType: "",
  fileName: "",
  isActive: true,
};

function getInitialForm(attachment?: SavedAttachmentRecord | null): AttachmentFormState {
  if (!attachment) return emptyForm;

  return {
    title: attachment.title,
    kind: attachment.kind,
    body: attachment.body || "",
    mediaUrl: attachment.media_url || "",
    mediaPath: attachment.media_path || "",
    mediaMimeType: attachment.media_mime_type || "",
    fileName: attachment.file_name || "",
    isActive: attachment.is_active ?? true,
  };
}

function sortAttachmentsByTitle(attachments: SavedAttachmentRecord[]) {
  return [...attachments].sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }) || Date.parse(b.created_at) - Date.parse(a.created_at));
}

function getAttachmentPreview(attachment: SavedAttachmentRecord) {
  if (attachment.body?.trim()) return attachment.body.trim();
  if (attachment.file_name?.trim()) return attachment.file_name.trim();
  if (attachment.media_url?.trim()) return attachment.media_url.trim();
  return kindLabels[attachment.kind];
}

function getAcceptForKind(kind: SavedAttachmentKind) {
  if (kind === "image") return "image/*";
  if (kind === "video") return "video/*";
  if (kind === "audio") return "audio/*";
  if (kind === "document") return ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp";
  return undefined;
}

function getExpectedMimePrefix(kind: SavedAttachmentKind) {
  if (kind === "image") return "image/";
  if (kind === "video") return "video/";
  if (kind === "audio") return "audio/";
  return "";
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function SavedAttachmentsManager() {
  const [attachments, setAttachments] = useState<SavedAttachmentRecord[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAttachment, setEditingAttachment] = useState<SavedAttachmentRecord | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<AttachmentFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteConfirmationAttachment, setDeleteConfirmationAttachment] = useState<SavedAttachmentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { user } = useCurrentUser();

  useEffect(() => {
    let isMounted = true;

    fetchSavedAttachments()
      .then((data) => {
        if (isMounted) setAttachments(sortAttachmentsByTitle(data));
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Não foi possível carregar os anexos.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAttachments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return attachments;

    return attachments.filter((attachment) => {
      const haystack = [attachment.title, kindLabels[attachment.kind], attachment.body, attachment.media_url, attachment.file_name].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [attachments, search]);

  function openCreateDialog() {
    setEditingAttachment(null);
    setForm(emptyForm);
    setSelectedFile(null);
    setFormError(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(attachment: SavedAttachmentRecord) {
    setEditingAttachment(attachment);
    setForm(getInitialForm(attachment));
    setSelectedFile(null);
    setFormError(null);
    setIsDialogOpen(true);
  }

  function handleKindChange(kind: SavedAttachmentKind) {
    setSelectedFile(null);
    setForm((current) => ({
      ...current,
      kind,
      mediaUrl: kind === "text" ? "" : current.mediaUrl,
      mediaPath: kind === "text" ? "" : current.mediaPath,
      mediaMimeType: kind === "text" ? "" : current.mediaMimeType,
      fileName: kind === "text" ? "" : current.fileName,
    }));
  }

  function handleFileChange(file?: File | null) {
    const nextFile = file ?? null;
    const expectedPrefix = getExpectedMimePrefix(form.kind);

    setFormError(null);

    if (nextFile && expectedPrefix && !nextFile.type.toLowerCase().startsWith(expectedPrefix)) {
      setSelectedFile(null);
      setFormError("O arquivo selecionado não corresponde ao tipo escolhido.");
      return;
    }

    setSelectedFile(nextFile);
  }

  async function handleSave() {
    const title = form.title.trim();
    const body = form.body.trim();
    const isText = form.kind === "text";

    if (!title) {
      setFormError("Informe um nome para o anexo.");
      return;
    }

    if (isText && !body) {
      setFormError("Mensagens normais precisam ter texto.");
      return;
    }

    if (!isText && !selectedFile && !form.mediaUrl.trim()) {
      setFormError("Selecione um arquivo para este tipo de anexo.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const uploaded = selectedFile && form.kind !== "text" ? await uploadSavedAttachmentFile(selectedFile, form.kind) : null;
      const input = {
        title,
        kind: form.kind,
        body,
        mediaUrl: isText ? null : uploaded?.mediaUrl || form.mediaUrl,
        mediaPath: isText ? null : uploaded?.mediaPath || form.mediaPath,
        mediaMimeType: isText ? null : uploaded?.mediaMimeType || form.mediaMimeType,
        fileName: isText ? null : uploaded?.fileName || form.fileName || title,
        isActive: form.isActive,
        userEmail: user?.email || null,
      };
      const saved = editingAttachment ? await updateSavedAttachment(editingAttachment.id, input) : await createSavedAttachment(input);

      setAttachments((current) => sortAttachmentsByTitle([...current.filter((attachment) => attachment.id !== saved.id), saved]));
      setIsDialogOpen(false);
      setSelectedFile(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar o anexo.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteConfirmationAttachment) return;

    const previousAttachments = attachments;
    const attachment = deleteConfirmationAttachment;
    setDeletingId(attachment.id);
    setError(null);
    setAttachments((current) => current.filter((currentAttachment) => currentAttachment.id !== attachment.id));

    try {
      await deleteSavedAttachment(attachment.id);
      setDeleteConfirmationAttachment(null);
    } catch (err) {
      setAttachments(previousAttachments);
      setError(err instanceof Error ? err.message : "Não foi possível excluir o anexo.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, texto ou arquivo" className="pl-9" />
          </div>
          <Button type="button" className="bg-teal-500 text-white hover:bg-teal-600" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Novo anexo
          </Button>
        </div>

        {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}

        {isLoading ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">Carregando anexos...</div>
        ) : filteredAttachments.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">Nenhum anexo encontrado.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredAttachments.map((attachment) => {
              const Icon = kindIcons[attachment.kind];

              return (
                <article key={attachment.id} className="flex min-w-0 gap-3 rounded-md border border-border bg-background p-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-teal-500/10 text-teal-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{attachment.title}</p>
                      <Badge variant={attachment.is_active ? "secondary" : "outline"}>{attachment.is_active ? "Ativo" : "Inativo"}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{getAttachmentPreview(attachment)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{kindLabels[attachment.kind]}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-teal-500" onClick={() => openEditDialog(attachment)} aria-label="Editar anexo">
                      <PenLine className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-red-500" onClick={() => setDeleteConfirmationAttachment(attachment)} disabled={deletingId === attachment.id} aria-label="Excluir anexo">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAttachment ? "Editar anexo" : "Novo anexo"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Nome</span>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex: Feliz aniversário" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Tipo</span>
              <Select value={form.kind} onValueChange={(value) => handleKindChange(value as SavedAttachmentKind)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Mensagem</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">{form.kind === "text" ? "Mensagem" : "Descrição/legenda"}</span>
              <Textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} className="min-h-24 resize-y" placeholder={form.kind === "text" ? "Texto que será enviado no chat" : "Legenda opcional para o arquivo"} />
            </div>
            {form.kind !== "text" && (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium text-muted-foreground">Arquivo</span>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-5 text-center transition hover:bg-muted/40">
                    <Upload className="h-5 w-5 text-teal-500" />
                    <span className="text-sm font-medium text-foreground">{selectedFile ? selectedFile.name : form.fileName || "Selecionar arquivo"}</span>
                    <span className="text-xs text-muted-foreground">
                      {selectedFile ? formatFileSize(selectedFile.size) : form.fileName ? "Arquivo atual mantido ao salvar" : "Imagem, vídeo, áudio ou documento conforme o tipo escolhido"}
                    </span>
                    <input type="file" accept={getAcceptForKind(form.kind)} className="hidden" onChange={(event) => handleFileChange(event.target.files?.[0])} />
                  </label>
                </div>
              </>
            )}
            <label className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 sm:col-span-2">
              <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} />
              <span className="text-sm text-foreground">Disponível no menu dos chats</span>
            </label>
            {formError && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500 sm:col-span-2">{formError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="bg-teal-500 text-white hover:bg-teal-600" onClick={handleSave} disabled={isSaving}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmationAttachment} onOpenChange={(open) => !open && setDeleteConfirmationAttachment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-md bg-red-500/10 text-red-500">
              <Trash2 className="h-5 w-5" />
            </div>
            <DialogTitle>Excluir anexo</DialogTitle>
            <DialogDescription>
              O anexo &quot;{deleteConfirmationAttachment?.title}&quot; será removido da lista de anexos rápidos. Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmationAttachment(null)} disabled={!!deletingId}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeleteConfirmed} disabled={!!deletingId}>
              {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
