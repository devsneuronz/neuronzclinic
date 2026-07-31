"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { messageDirectives } from "@/lib/message-directives";
import { createQuickReply, deleteQuickReply, fetchQuickReplies, updateQuickReply, type QuickReplyRecord } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquarePlus, MessageSquareQuote, Pen, PenLine, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { SkeletonShimmer } from "../ui/skeleton-shimmer";
import { toast } from "../ui/sonner";

type QuickReplyForm = {
  shortcut: string;
  content: string;
  isActive: boolean;
};

const emptyForm: QuickReplyForm = {
  shortcut: "",
  content: "",
  isActive: true,
};

function normalizeShortcut(value: string) {
  return value.replace(/^\/+/, "").replace(/[^\p{L}\p{N}._-]+/gu, "");
}

function getInitialForm(reply?: QuickReplyRecord | null): QuickReplyForm {
  if (!reply) return emptyForm;
  return {
    shortcut: reply.shortcut,
    content: reply.content,
    isActive: reply.is_active ?? true,
  };
}

function sortQuickReplies(replies: QuickReplyRecord[]) {
  return [...replies].sort((a, b) => a.shortcut.localeCompare(b.shortcut, "pt-BR", { sensitivity: "base" }));
}

function DirectiveTextarea({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caretPosition, setCaretPosition] = useState(value.length);
  const textBeforeCaret = value.slice(0, caretPosition);
  const directiveMatch = textBeforeCaret.match(/(^|[\s\n])%([\w.-]*)$/);
  const directiveQuery = directiveMatch?.[2]?.toLowerCase() ?? "";

  const directiveSuggestions = useMemo(() => {
    if (!directiveMatch) return [];
    return messageDirectives.filter((directive) => directive.key.toLowerCase().startsWith(directiveQuery) || directive.label.toLowerCase().includes(directiveQuery)).slice(0, 6);
  }, [directiveMatch, directiveQuery]);

  function updateCaretPosition(element: HTMLTextAreaElement) {
    setCaretPosition(element.selectionStart ?? element.value.length);
  }

  function insertDirective(key: string) {
    if (!directiveMatch) return;

    const matchStart = directiveMatch.index ?? 0;
    const directiveStart = matchStart + directiveMatch[1].length;
    const prefix = value.slice(0, directiveStart);
    const suffix = value.slice(caretPosition);
    const insertedDirective = `%${key}% `;
    const nextCaretPosition = prefix.length + insertedDirective.length;

    onChange(`${prefix}${insertedDirective}${suffix}`);
    setCaretPosition(nextCaretPosition);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaretPosition, nextCaretPosition);
    });
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-[200px] lg:min-h-0 w-full">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateCaretPosition(event.target);
        }}
        onClick={(event) => updateCaretPosition(event.currentTarget)}
        onKeyUp={(event) => updateCaretPosition(event.currentTarget)}
        onSelect={(event) => updateCaretPosition(event.currentTarget)}
        placeholder="Texto que será inserido no campo de mensagens..."
        className="resize-none h-full w-full flex-1 overflow-y-auto custom-scrollbar"
      />
      {directiveSuggestions.length > 0 && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-full sm:w-80 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm shadow-xl">
          {directiveSuggestions.map((directive) => (
            <button key={directive.key} type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-foreground transition hover:bg-accent" onClick={() => insertDirective(directive.key)}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-theme-primary/10 text-[10px] font-bold text-theme-primary">%</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{directive.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{directive.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function QuickRepliesManager() {
  const [replies, setReplies] = useState<QuickReplyRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editingReply, setEditingReply] = useState<QuickReplyRecord | null>(null);
  const [form, setForm] = useState<QuickReplyForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmationReply, setDeleteConfirmationReply] = useState<QuickReplyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchQuickReplies()
      .then((data) => {
        if (isMounted) setReplies(sortQuickReplies(data));
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Não foi possível carregar respostas rápidas.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredReplies = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return replies;
    return replies.filter((reply) => [reply.shortcut, reply.content].join(" ").toLowerCase().includes(term));
  }, [replies, search]);

  function resetForm() {
    setEditingReply(null);
    setForm(emptyForm);
  }

  function editReply(reply: QuickReplyRecord) {
    setEditingReply(reply);
    setForm(getInitialForm(reply));

    if (window.innerWidth < 1024) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  }

  async function saveReply() {
    const shortcut = normalizeShortcut(form.shortcut);
    const content = form.content.trim();

    if (!shortcut) return toast.warning("Informe um atalho.");
    if (!content) return toast.warning("Informe o texto da resposta.");

    setIsSaving(true);

    try {
      const isEditing = Boolean(editingReply);
      const input = { shortcut, content, isActive: form.isActive };
      const saved = editingReply ? await updateQuickReply(editingReply.id, input) : await createQuickReply(input);

      setReplies((current) => sortQuickReplies([...current.filter((reply) => reply.id !== saved.id), saved]));
      setEditingReply(saved);
      setForm(getInitialForm(saved));
      toast.success(isEditing ? "Resposta rápida atualizada." : "Resposta rápida criada.");
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a resposta rápida.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteReply() {
    if (!deleteConfirmationReply) return;

    const previousReplies = replies;
    const reply = deleteConfirmationReply;
    setDeletingId(reply.id);
    setError(null);
    setReplies((current) => current.filter((item) => item.id !== reply.id));

    try {
      await deleteQuickReply(reply.id);
      if (editingReply?.id === reply.id) resetForm();
      setDeleteConfirmationReply(null);
      toast.success("Resposta rápida excluída.");
    } catch (err) {
      setReplies(previousReplies);
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir a resposta rápida.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="flex min-h-0 w-full flex-col items-start gap-6 lg:h-full lg:flex-row">
        <div className="flex min-h-[320px] w-full flex-col rounded-xl border border-border bg-background shadow-sm lg:h-full lg:w-[55%] xl:w-[60%]">
          <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
            <div>
              <h3 className="text-base font-semibold text-foreground">Respostas cadastradas</h3>
              <p className="text-sm text-muted-foreground">{isLoading ? "Carregando..." : `${replies.length} atalhos disponíveis no chat`}</p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar atalho..." className="h-10 pl-9 w-full bg-background" />
              </div>
            </div>
          </div>
          {error && <p className="m-5 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-muted/10">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-full rounded-xl border border-border bg-card p-4 flex justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-2">
                        <SkeletonShimmer className="h-5 w-16 rounded-full" />
                        <SkeletonShimmer className="h-5 w-32" />
                      </div>
                      <SkeletonShimmer className="h-4 w-full" />
                      <SkeletonShimmer className="h-4 w-2/3" />
                    </div>
                    <div className="flex gap-2">
                      <SkeletonShimmer className="h-8 w-8 rounded-md" />
                      <SkeletonShimmer className="h-8 w-8 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredReplies.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 rounded-xl border border-dashed border-border/60 bg-background text-center p-6 h-full">
                <MessageSquareQuote className="h-8 w-8 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground">Nenhuma resposta rápida encontrada</p>
                <p className="text-xs text-muted-foreground mt-1">Crie uma nova resposta usando o painel {window.innerWidth >= 1024 ? "ao lado" : "abaixo"}.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {filteredReplies.map((reply) => (
                  <div
                    key={reply.id}
                    onClick={() => editReply(reply)}
                    className={cn("w-full relative rounded-xl border border-border bg-card p-2 text-left transition-all hover:shadow-md", editingReply?.id === reply.id && "border-theme-primary ring-1 ring-theme-primary/50 shadow-sm")}
                  >
                    <div className="flex items-start justify-between gap-4  h-14">
                      <div className=" flex-1  h-full flex flex-col justify-between">
                        <div className="flex min-w-0 items-center gap-2 mb-1.5">
                          <div className="relative flex h-7 max-w-full shrink-0 items-center px-2 border border-black/10 bg-theme-primary text-theme-primary-fg shadow-3xs rounded-md">
                            <span className=" text-[12px] tracking-wide">/{reply.shortcut}</span>
                          </div>
                        </div>
                        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{reply.content}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 h-full">
                        <Badge variant="outline" className="text-[10px] uppercase bg-background absolute right-4 top-0 -translate-y-1/2">
                          {reply.is_active ? "Disponível no chat" : "Inativa"}
                        </Badge>
                        <div className="flex flex-row gap-1 items-center">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-background" title="Editar">
                            <Pen className="h-4! w-4!" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Excluir"
                            disabled={deletingId === reply.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteConfirmationReply(reply);
                            }}
                          >
                            {deletingId === reply.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="w-full flex flex-col gap-5 overflow-visible pt-2 lg:h-full lg:w-[45%] lg:overflow-hidden xl:w-[40%]">
          <div className="relative flex flex-col flex-1 min-h-0 rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
            <div className="absolute -top-2.5 left-4 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary shadow-3xs">{editingReply ? "Editando" : "Nova resposta"}</div>
            <div className="relative flex flex-col flex-1 min-h-0 p-5 sm:p-6">
              <div className="mb-6 flex shrink-0 items-start justify-between gap-3 border-b border-border/50 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-md bg-theme-primary/10 text-theme-primary">{editingReply ? <PenLine className="w-4 h-4" /> : <MessageSquarePlus className="w-4 h-4" />}</div>
                    <h3 className="text-lg font-bold text-foreground">{editingReply ? "Editando resposta" : "Nova resposta rápida"}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">Configure o atalho e a mensagem que será inserida.</p>
                </div>
                <div className="flex gap-2">
                  {editingReply && (
                    <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={resetForm}>
                      <X className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Cancelar</span>
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-col flex-1 min-h-0 gap-5">
                <div className="grid shrink-0 gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground">Atalho</label>
                    <div className="flex shadow-sm rounded-md">
                      <span className="flex h-10 items-center rounded-l-md border border-r-0 border-input bg-muted/50 px-3 text-muted-foreground font-mono">/</span>
                      <Input
                        value={form.shortcut}
                        onChange={(event) => setForm((current) => ({ ...current, shortcut: normalizeShortcut(event.target.value) }))}
                        placeholder="ex: precos"
                        className="h-10 rounded-l-none bg-background focus-visible:z-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground">Status</label>
                    <div className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 shadow-sm">
                      <span className="text-xs font-medium text-muted-foreground">{form.isActive ? "Ativa" : "Inativa"}</span>
                      <Switch checked={form.isActive} onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col flex-1 min-h-0 gap-1.5 w-full">
                  <label className="text-sm font-semibold text-foreground shrink-0">Mensagem da resposta</label>
                  <DirectiveTextarea value={form.content} onChange={(content) => setForm((current) => ({ ...current, content }))} />
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                    Digite <strong className="text-foreground">%</strong> para inserir variáveis dinâmicas (ex: %nome%, %hoje%).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  className="w-full shrink-0 h-9 font-medium shadow-xs"
                  disabled={isSaving}
                  onClick={() => {
                    void saveReply();
                  }}
                >
                  {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  {editingReply ? "Salvar alterações" : "Criar resposta rápida"}
                </Button>
              </div>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-border bg-card p-5 text-sm">
            <div className="flex items-center gap-2 font-bold text-foreground mb-2">
              <MessageSquareQuote className="h-5 w-5 text-theme-primary" />
              Como utilizar?
            </div>
            <p className="leading-relaxed text-muted-foreground text-xs">
              Durante um atendimento no chat, digite <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground font-bold">/</span> para abrir o menu de respostas rápidas.
            </p>
          </div>
        </div>
      </div>
      <Dialog open={Boolean(deleteConfirmationReply)} onOpenChange={(open) => !open && setDeleteConfirmationReply(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir resposta rápida</DialogTitle>
            <DialogDescription>
              A resposta <span className="font-mono text-foreground">/{deleteConfirmationReply?.shortcut}</span> será removida. Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {deleteConfirmationReply && <p className="line-clamp-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{deleteConfirmationReply.content}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmationReply(null)} disabled={Boolean(deletingId)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDeleteReply()} disabled={Boolean(deletingId)}>
              {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

