"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ChatTag } from "@/lib/chat-tags";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Separator } from "../ui/separator";

export type Sector = {
  id: string;
  name: string;
  description: string;
  color: string;
  tagIds: string[];
  tagLabels: string[];
  userIds: string[];
};

type SectorDraft = Pick<Sector, "name" | "description" | "color" | "tagIds">;

const EMPTY_DRAFT: SectorDraft = { name: "", description: "", color: "#64748b", tagIds: [] };

async function apiError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error || fallback;
}

export function SectorsManager({ onSectorsChanged }: { onSectorsChanged?: (sectors: Sector[]) => void }) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [tags, setTags] = useState<ChatTag[]>([]);
  const [draft, setDraft] = useState<SectorDraft>(EMPTY_DRAFT);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Sector | null>(null);
  const [deleting, setDeleting] = useState<Sector | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sectorResponse, tagResponse] = await Promise.all([fetch("/api/airtable/sectors", { cache: "no-store" }), fetch("/api/airtable/tags", { cache: "no-store" })]);
      if (!sectorResponse.ok) throw new Error(await apiError(sectorResponse, "Não foi possível carregar os setores."));
      if (!tagResponse.ok) throw new Error(await apiError(tagResponse, "Não foi possível carregar as tags."));
      const sectorData = (await sectorResponse.json()) as { sectorRecords?: Sector[] };
      const tagData = (await tagResponse.json()) as { tags?: ChatTag[] };
      setSectors(sectorData.sectorRecords ?? []);
      setTags(tagData.tags ?? []);
      onSectorsChanged?.(sectorData.sectorRecords ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os setores.");
    } finally {
      setIsLoading(false);
    }
  }, [onSectorsChanged]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetch("/api/airtable/sectors", { cache: "no-store" }), fetch("/api/airtable/tags", { cache: "no-store" })])
      .then(async ([sectorResponse, tagResponse]) => {
        if (!sectorResponse.ok) throw new Error(await apiError(sectorResponse, "Não foi possível carregar os setores."));
        if (!tagResponse.ok) throw new Error(await apiError(tagResponse, "Não foi possível carregar as tags."));
        const sectorData = (await sectorResponse.json()) as { sectorRecords?: Sector[] };
        const tagData = (await tagResponse.json()) as { tags?: ChatTag[] };
        if (isMounted) {
          setSectors(sectorData.sectorRecords ?? []);
          setTags(tagData.tags ?? []);
        }
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Não foi possível carregar os setores.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const sortedSectors = useMemo(() => sectors.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [sectors]);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setIsFormOpen(true);
  }

  function openEdit(sector: Sector) {
    setEditing(sector);
    setDraft({ name: sector.name, description: sector.description, color: sector.color, tagIds: sector.tagIds });
    setIsFormOpen(true);
  }

  function toggleTag(id: string) {
    setDraft((current) => ({
      ...current,
      tagIds: current.tagIds.includes(id) ? current.tagIds.filter((tagId) => tagId !== id) : [...current.tagIds, id],
    }));
  }

  async function saveSector(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(editing ? `/api/airtable/sectors?id=${encodeURIComponent(editing.id)}` : "/api/airtable/sectors", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(await apiError(response, "Não foi possível salvar o setor."));
      const data = (await response.json()) as { sector?: Sector | null };
      if (data.sector) {
        const next = editing ? sectors.map((sector) => (sector.id === editing.id ? data.sector! : sector)) : [...sectors, data.sector];
        setSectors(next);
        onSectorsChanged?.(next);
      }
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      setIsFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o setor.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSector() {
    if (!deleting) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/airtable/sectors?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await apiError(response, "Não foi possível excluir o setor."));
      const next = sectors.filter((sector) => sector.id !== deleting.id);
      setSectors(next);
      onSectorsChanged?.(next);
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o setor.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 pt-2">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center">
          {isLoading ? (
            <Loader2 className="animate-spin w-4 h-4" />
          ) : (
            <span className="font-semibold bg-muted px-2.5 py-0.5 rounded-full text-xs text-muted-foreground">{sortedSectors.length < 1 ? "Nenhuma" : `${sortedSectors.length} ${sortedSectors.length === 1 ? "Setor" : "Setores"}`}</span>
          )}

          {error ? <span className="truncate text-sm text-destructive font-medium">{error}</span> : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus /> Novo setor
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
          <Loader2 className="mr-2 animate-spin" /> Carregando setores...
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 custom-scrollbar">
          {sortedSectors.map((sector) => (
            <div key={sector.id} className="flex flex-row gap-2 rounded-xl border bg-background p-2 shadow-xs ">
              <div className="h-full min-w-[4px] rounded-full" style={{ backgroundColor: sector.color }}></div>
              <div className="flex flex-col p-2 w-full gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold border" style={{ borderColor: sector.color, backgroundColor: `${sector.color}50` }}>
                      {sector.name}
                    </span>
                    <p className="mt-2 text-xs text-muted-foreground">{sector.description || "Nenhuma descrição cadastrada"}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 transition-opacity">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(sector)} aria-label={`Editar ${sector.name}`}>
                      <Pencil className="w-3.5 h-3. text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-destructive! hover:bg-destructive/10" onClick={() => setDeleting(sector)} aria-label={`Excluir ${sector.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="w-full flex justify-between gap-2">
                  <span>Tags do setor</span>
                  <span className="text-xs text-muted-foreground">{sector.tagIds.length < 1 ? "Sem tag" : `${sector.tagIds.length} ${sector.tagIds.length === 1 ? "Tag" : "Tags"}`}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sector.tagIds.length ? (
                    sector.tagIds.map((id) => {
                      const tag = tags.find((item) => item.id === id);
                      return (
                        <span key={id} className="rounded-md bg-muted px-2 py-1 text-xs">
                          {tag?.label || id}
                        </span>
                      );
                    })
                  ) : (
                    <span className="rounded-md bg-muted px-2 py-1 text-xs">Contatos sem tags</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditing(null);
            setDraft(EMPTY_DRAFT);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <form onSubmit={saveSector}>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar setor" : "Criar setor"}</DialogTitle>
              <DialogDescription>Defina o setor e as tags de contatos que seus responsáveis poderão visualizar.</DialogDescription>
            </DialogHeader>
            <div className="my-5 grid gap-4 sm:grid-cols-[1fr_9rem]">
              <div className="space-y-2">
                <Label htmlFor="sector-name">Nome</Label>
                <Input id="sector-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sector-color">Cor</Label>
                <Input id="sector-color" type="color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} className="p-1" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sector-description">Descrição</Label>
                <Input id="sector-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Tags vinculadas</Label>
                <div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                  {tags.map((tag) => (
                    <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-muted">
                      <input type="checkbox" checked={draft.tagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} className="size-4 accent-primary" />
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: tag.color || "#64748b" }} />
                      <span>{tag.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Se nenhuma tag for selecionada, o setor exibirá exclusivamente os contatos sem tags.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditing(null);
                  setDraft(EMPTY_DRAFT);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving || !draft.name.trim()}>
                {isSaving && <Loader2 className="animate-spin" />} Salvar setor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir setor</DialogTitle>
            <DialogDescription>O setor “{deleting?.name}” deixará de aparecer e seus usuários perderão esse vínculo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void deleteSector()} disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin" />} Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
