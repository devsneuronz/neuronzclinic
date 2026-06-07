"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getReadableTextColor, type ChatTag } from "@/lib/chat-tags";
import { Check, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type EditableTag = ChatTag & {
  draftLabel: string;
  draftColor: string;
  isEditing: boolean;
};

const DEFAULT_COLOR = "#0d9488";

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function toEditableTag(tag: ChatTag): EditableTag {
  return {
    ...tag,
    draftLabel: tag.label,
    draftColor: tag.color || DEFAULT_COLOR,
    isEditing: false,
  };
}

async function readApiError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error || fallback;
}

export function TagsManager() {
  const [tags, setTags] = useState<EditableTag[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedTags = useMemo(() => tags.slice().sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })), [tags]);

  async function loadTags() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/airtable/tags", { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel carregar as tags."));

      const data = (await response.json()) as { tags?: ChatTag[] };
      setTags((data.tags ?? []).map(toEditableTag));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar as tags.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    fetch("/api/airtable/tags", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel carregar as tags."));

        return (await response.json()) as { tags?: ChatTag[] };
      })
      .then((data) => {
        if (isMounted) setTags((data.tags ?? []).map(toEditableTag));
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Nao foi possivel carregar as tags.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const label = newLabel.trim();
    if (!label) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/airtable/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color: newColor }),
      });

      if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel criar a tag."));

      const data = (await response.json()) as { tag?: ChatTag | null };
      if (data.tag) setTags((current) => [...current, toEditableTag(data.tag!)]);
      setNewLabel("");
      setNewColor(DEFAULT_COLOR);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel criar a tag.");
    } finally {
      setIsCreating(false);
    }
  }

  function updateDraft(id: string, values: Partial<Pick<EditableTag, "draftLabel" | "draftColor" | "isEditing">>) {
    setTags((current) => current.map((tag) => (tag.id === id ? { ...tag, ...values } : tag)));
  }

  function cancelEdit(tag: EditableTag) {
    updateDraft(tag.id, {
      draftLabel: tag.label,
      draftColor: tag.color || DEFAULT_COLOR,
      isEditing: false,
    });
  }

  async function saveTag(tag: EditableTag) {
    const label = tag.draftLabel.trim();
    if (!label) return;

    setSavingId(tag.id);
    setError(null);

    try {
      const response = await fetch(`/api/airtable/tags?id=${encodeURIComponent(tag.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color: tag.draftColor }),
      });

      if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel atualizar a tag."));

      const data = (await response.json()) as { tag?: ChatTag | null };
      const nextTag = data.tag ?? { id: tag.id, label, color: tag.draftColor };
      setTags((current) => current.map((item) => (item.id === tag.id ? toEditableTag(nextTag) : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar a tag.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteTag(tag: EditableTag) {
    if (!window.confirm(`Apagar a tag "${tag.label}"?`)) return;

    setSavingId(tag.id);
    setError(null);

    try {
      const response = await fetch(`/api/airtable/tags?id=${encodeURIComponent(tag.id)}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel apagar a tag."));
      setTags((current) => current.filter((item) => item.id !== tag.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel apagar a tag.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full w-full min-h-0 space-y-4">
      <form onSubmit={handleCreate} className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-[1fr_12rem_auto] md:items-end shrink-0">
        <div className="space-y-2">
          <Label htmlFor="new-tag-label" className="text-sm font-medium">
            Nome da Tag
          </Label>
          <Input id="new-tag-label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Nova tag..." disabled={isCreating} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-tag-color" className="text-sm font-medium">
            Cor de Identificação
          </Label>
          <div className="flex items-center gap-2 bg-background border border-input rounded-md px-2 h-9 focus-within:ring-1 focus-within:ring-ring">
            <Input
              id="new-tag-color"
              type="color"
              value={isHexColor(newColor) ? newColor : DEFAULT_COLOR}
              onChange={(event) => setNewColor(event.target.value)}
              className="h-6 w-5 border-0  shrink-0 p-0 cursor-pointer bg-transparent!"
              disabled={isCreating}
            />
            <Input
              value={newColor}
              onChange={(event) => setNewColor(event.target.value)}
              className="font-mono text-xs uppercase border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent! "
              placeholder="#000000"
              disabled={isCreating}
            />
          </div>
        </div>

        <Button type="submit" disabled={isCreating || !newLabel.trim()} className="w-full md:w-auto">
          {isCreating ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          Criar Tag
        </Button>
      </form>

      <div className="flex items-center justify-between gap-3 shrink-0 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-foreground bg-muted px-2.5 py-0.5 rounded-full">{sortedTags.length} tags</span>
          {error ? <span className="truncate text-sm text-destructive font-medium">{error}</span> : null}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={() => void loadTags()} disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground bg-card/50">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando tags do sistema...
          </div>
        ) : sortedTags.length > 0 ? (
          <div className="grid gap-2.5 pb-2">
            {sortedTags.map((tag) => {
              const isSaving = savingId === tag.id;
              const previewColor = tag.isEditing ? tag.draftColor : tag.color || DEFAULT_COLOR;

              return (
                <div key={tag.id} className="flex justify-between gap-3 rounded-lg border border-border bg-background shadow-sm p-3.5 md:grid-cols-[1fr_10rem_auto] md:items-center overflow-hidden transition-all hover:border-border/80">
                  {tag.isEditing ? (
                    <>
                      <Input value={tag.draftLabel} onChange={(event) => updateDraft(tag.id, { draftLabel: event.target.value })} disabled={isSaving} className="h-9" />

                      <div className="flex items-center gap-2 bg-background border border-input rounded-md px-2.5 h-9 focus-within:ring-1 focus-within:ring-ring">
                        <Input
                          type="color"
                          value={isHexColor(tag.draftColor) ? tag.draftColor : DEFAULT_COLOR}
                          onChange={(event) => updateDraft(tag.id, { draftColor: event.target.value })}
                          className="h-5 w-7 shrink-0 p-0 border-0 cursor-pointer bg-transparent"
                          disabled={isSaving}
                        />
                        <Input
                          value={tag.draftColor}
                          onChange={(event) => updateDraft(tag.id, { draftColor: event.target.value })}
                          className="font-mono text-xs uppercase border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                          disabled={isSaving}
                        />
                      </div>

                      <div className="flex justify-end gap-1.5">
                        <Button type="button" size="icon-sm" onClick={() => void saveTag(tag)} disabled={isSaving || !tag.draftLabel.trim()} aria-label="Salvar tag">
                          {isSaving ? <Loader2 className="animate-spin" /> : <Check className="w-4 h-4" />}
                        </Button>
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => cancelEdit(tag)} disabled={isSaving} aria-label="Cancelar edição">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex min-w-0 items-center gap-3">
                        <Badge className="max-w-[180px] sm:max-w-xs border-0 px-3 py-1 font-medium text-xs rounded-md shadow-sm" style={{ backgroundColor: previewColor, color: getReadableTextColor(previewColor) }}>
                          <span className="truncate">{tag.label}</span>
                        </Badge>
                        <span className="truncate font-mono text-[10px] text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded">ID: {tag.id}</span>
                      </div>

                      <span className="font-mono text-xs uppercase text-muted-foreground hidden md:inline">{previewColor}</span>

                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => updateDraft(tag.id, { isEditing: true })} disabled={isSaving} className="hover:bg-muted" aria-label="Editar tag">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => void deleteTag(tag)} disabled={isSaving} className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label="Apagar tag">
                          {isSaving ? <Loader2 className="animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground bg-card/50">Nenhuma tag cadastrada no sistema.</div>
        )}
      </div>
    </div>
  );
}
