"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getReadableTextColor, type ChatTag } from "@/lib/chat-tags";
import { Check, Info, Loader2, Pencil, Plus, RefreshCw, Tag, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "../ui/badge";

type EditableTag = ChatTag & {
  draftLabel: string;
  draftColor: string;
  isEditing: boolean;
};

type TagSectorRecord = {
  tagIds: string[];
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
  const [sectors, setSectors] = useState<TagSectorRecord[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedTags = useMemo(() => tags.slice().sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })), [tags]);
  const sectorTagIds = useMemo(() => new Set(sectors.flatMap((sector) => sector.tagIds)), [sectors]);

  async function loadTags() {
    setIsLoading(true);
    setError(null);

    try {
      const [tagResponse, sectorResponse] = await Promise.all([fetch("/api/airtable/tags", { cache: "no-store" }), fetch("/api/airtable/sectors", { cache: "no-store" })]);
      if (!tagResponse.ok) throw new Error(await readApiError(tagResponse, "Nao foi possivel carregar as tags."));
      if (!sectorResponse.ok) throw new Error(await readApiError(sectorResponse, "Nao foi possivel carregar os setores."));

      const tagData = (await tagResponse.json()) as { tags?: ChatTag[] };
      const sectorData = (await sectorResponse.json()) as { sectorRecords?: TagSectorRecord[] };
      setTags((tagData.tags ?? []).map(toEditableTag));
      setSectors(sectorData.sectorRecords ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar as tags.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetch("/api/airtable/tags", { cache: "no-store" }), fetch("/api/airtable/sectors", { cache: "no-store" })])
      .then(async ([tagResponse, sectorResponse]) => {
        if (!tagResponse.ok) throw new Error(await readApiError(tagResponse, "Nao foi possivel carregar as tags."));
        if (!sectorResponse.ok) throw new Error(await readApiError(sectorResponse, "Nao foi possivel carregar os setores."));

        const tagData = (await tagResponse.json()) as { tags?: ChatTag[] };
        const sectorData = (await sectorResponse.json()) as { sectorRecords?: TagSectorRecord[] };
        return { tagData, sectorData };
      })
      .then(({ tagData, sectorData }) => {
        if (isMounted) {
          setTags((tagData.tags ?? []).map(toEditableTag));
          setSectors(sectorData.sectorRecords ?? []);
        }
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
    <div className="flex flex-col h-full w-full min-h-0 space-y-4 pt-2">
      <form onSubmit={handleCreate} className="relative grid gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-5 md:grid-cols-[1fr_11rem_auto] md:items-end shrink-0">
        <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-background border border-border rounded-md text-[10px] font-bold uppercase tracking-wider text-primary shadow-3xs">Nova tag</div>

        <div className="space-y-2">
          <Label htmlFor="new-tag-label" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nome da tag
          </Label>

          <div className="relative flex items-center gap-3 w-full">
            <div
              className="relative flex h-9 max-w-[9rem] shrink-0 items-center justify-center pl-6 pr-5 rounded-l-md rounded-r-[17px] border border-black/10 shadow-3xs transition-all [corner-shape:round_bevel_bevel_round]"
              style={{
                backgroundColor: isHexColor(newColor) ? newColor : DEFAULT_COLOR,
                color: getReadableTextColor(isHexColor(newColor) ? newColor : DEFAULT_COLOR),
              }}
            >
              <div className="absolute left-2 h-2 w-2 rounded-full bg-muted shadow-inner" />
              <span className="text-[11px] font-bold tracking-wide truncate uppercase select-none">{newLabel.trim() ? newLabel : "Amostra"}</span>
            </div>

            <div className="relative flex-1">
              <Input id="new-tag-label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Digitar nome da nova tag..." disabled={isCreating} className="h-9 focus-visible:ring-primary pl-3" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-tag-color" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cor de Identificação
          </Label>
          <div className="flex items-center gap-2 bg-background border border-input rounded-md px-2.5 h-9 focus-within:ring-1 focus-within:ring-primary transition-all">
            <Input
              id="new-tag-color"
              type="color"
              value={isHexColor(newColor) ? newColor : DEFAULT_COLOR}
              onChange={(event) => setNewColor(event.target.value)}
              className="h-5 w-6 border-0 shrink-0 p-0 cursor-pointer bg-transparent! rounded-sm"
              disabled={isCreating}
            />
            <Input
              value={newColor}
              onChange={(event) => setNewColor(event.target.value)}
              className="font-mono text-xs uppercase border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent! w-full"
              placeholder="#000000"
              disabled={isCreating}
            />
          </div>
        </div>

        <Button type="submit" disabled={isCreating || !newLabel.trim()} className="w-full md:w-auto h-9 font-medium shadow-xs">
          {isCreating ? (
            <>
              <Loader2 className="animate-spin w-4 h-4 mr-2" />
              Criando...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2 stroke-[2.5]" />
              Criar Tag
            </>
          )}
        </Button>
      </form>

      <div className="flex items-end justify-between gap-3 shrink-0 px-1">
        <div className="flex min-w-0 items-center">
          {isLoading ? (
            <Loader2 className="animate-spin w-4 h-4" />
          ) : (
            <span className="font-semibold bg-muted px-2.5 py-0.5 rounded-full text-xs text-muted-foreground">{sortedTags.length < 1 ? "Nenhuma" : `${sortedTags.length} ${sortedTags.length === 1 ? "Tag" : "Tags"}`}</span>
          )}

          {error ? <span className="truncate text-sm text-destructive font-medium">{error}</span> : null}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={() => void loadTags()} disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
        {isLoading ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground bg-card/50">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando tags do sistema...
          </div>
        ) : sortedTags.length > 0 ? (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-2">
            {sortedTags.map((tag) => {
              const isSaving = savingId === tag.id;
              const previewColor = tag.isEditing ? tag.draftColor : tag.color || DEFAULT_COLOR;
              const isWithoutSector = !sectorTagIds.has(tag.id);

              return (
                <div key={tag.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-3.5 overflow-hidden transition-all hover:border-border/80 hover:shadow-2xs group min-w-0">
                  {tag.isEditing ? (
                    <div className="flex flex-col gap-2.5 w-full">
                      <div className="space-y-1 w-full min-w-0">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nome da Tag</Label>
                        <div className="relative flex items-center">
                          <Tag className="absolute left-3 h-4 w-4 text-muted-foreground/60" />
                          <Input value={tag.draftLabel} onChange={(event) => updateDraft(tag.id, { draftLabel: event.target.value })} disabled={isSaving} className="h-9 pl-9" placeholder="Nome do marcador..." />
                        </div>
                      </div>

                      <div className="space-y-1 w-full">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cor Hexadecimal</Label>
                        <div className="flex items-center gap-2 bg-background border border-input rounded-md px-2.5 h-9 focus-within:ring-1 focus-within:ring-ring transition-all">
                          <Input
                            type="color"
                            value={isHexColor(tag.draftColor) ? tag.draftColor : DEFAULT_COLOR}
                            onChange={(event) => updateDraft(tag.id, { draftColor: event.target.value })}
                            className="h-5 w-6 shrink-0 p-0 border-0 cursor-pointer bg-transparent rounded-sm"
                            disabled={isSaving}
                          />
                          <Input
                            value={tag.draftColor}
                            onChange={(event) => updateDraft(tag.id, { draftColor: event.target.value })}
                            className="font-mono text-xs uppercase border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 w-full"
                            disabled={isSaving}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-1.5 pt-1.5 border-t border-dashed border-border/60">
                        <Button type="button" size="icon-sm" onClick={() => void saveTag(tag)} disabled={isSaving || !tag.draftLabel.trim()} aria-label="Salvar tag">
                          {isSaving ? <Loader2 className="animate-spin w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </Button>
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => cancelEdit(tag)} disabled={isSaving} aria-label="Cancelar edição">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-between h-full w-full gap-3 min-w-0">
                      <div className="flex items-start justify-between gap-2 w-full min-w-0">
                        <div className="flex min-w-0 flex-row items-center gap-1.5">
                          <div
                            className="relative flex h-7 max-w-full shrink-0 items-center justify-center pl-6 pr-4 rounded-l-md rounded-r-[13px] border border-black/10 shadow-3xs [corner-shape:round_bevel_bevel_round]"
                            style={{
                              backgroundColor: previewColor,
                              color: getReadableTextColor(previewColor),
                            }}
                          >
                            <div className="absolute left-2 h-2 w-2 rounded-full bg-background/90 shadow-inner" />

                            <span className="text-xs font-bold tracking-wide truncate uppercase select-none">{tag.label || "Sem Nome"}</span>
                          </div>
                          {!isWithoutSector ? (
                            <Badge className="text-background flex flex-row items-center gap-1">
                              <Info className="w-3.25 h-3.25" />
                              Tag sem setor
                            </Badge>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0 transition-opacity">
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => updateDraft(tag.id, { isEditing: true })} disabled={isSaving} className="h-7 w-7 rounded-md" aria-label="Editar tag">
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => void deleteTag(tag)} disabled={isSaving} className="h-7 w-7 text-destructive hover:bg-destructive/10" aria-label="Apagar tag">
                            {isSaving ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/40 w-full text-[11px] font-mono font-medium text-muted-foreground/80">
                        <span className="bg-muted px-1.5 py-0.5 rounded tracking-tight">ID: {tag.id}</span>
                        <span className="uppercase tracking-wider">{previewColor}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground bg-card/50">Nenhuma tag cadastrada no sistema.</div>
        )}
      </div>
    </div>
  );
}
