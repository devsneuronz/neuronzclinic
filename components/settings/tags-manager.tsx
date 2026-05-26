"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { Check, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getReadableTextColor, type ChatTag } from "@/lib/chat-tags"

type EditableTag = ChatTag & {
  draftLabel: string
  draftColor: string
  isEditing: boolean
}

const DEFAULT_COLOR = "#0d9488"

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value)
}

function toEditableTag(tag: ChatTag): EditableTag {
  return {
    ...tag,
    draftLabel: tag.label,
    draftColor: tag.color || DEFAULT_COLOR,
    isEditing: false,
  }
}

async function readApiError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return data?.error || fallback
}

export function TagsManager() {
  const [tags, setTags] = useState<EditableTag[]>([])
  const [newLabel, setNewLabel] = useState("")
  const [newColor, setNewColor] = useState(DEFAULT_COLOR)
  const [isLoading, setIsLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sortedTags = useMemo(
    () => tags.slice().sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })),
    [tags],
  )

  async function loadTags() {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/airtable/tags", { cache: "no-store" })
      if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel carregar as tags."))

      const data = (await response.json()) as { tags?: ChatTag[] }
      setTags((data.tags ?? []).map(toEditableTag))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar as tags.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    fetch("/api/airtable/tags", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel carregar as tags."))

        return (await response.json()) as { tags?: ChatTag[] }
      })
      .then((data) => {
        if (isMounted) setTags((data.tags ?? []).map(toEditableTag))
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Nao foi possivel carregar as tags.")
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const label = newLabel.trim()
    if (!label) return

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch("/api/airtable/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color: newColor }),
      })

      if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel criar a tag."))

      const data = (await response.json()) as { tag?: ChatTag | null }
      if (data.tag) setTags((current) => [...current, toEditableTag(data.tag!)])
      setNewLabel("")
      setNewColor(DEFAULT_COLOR)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel criar a tag.")
    } finally {
      setIsCreating(false)
    }
  }

  function updateDraft(id: string, values: Partial<Pick<EditableTag, "draftLabel" | "draftColor" | "isEditing">>) {
    setTags((current) => current.map((tag) => (tag.id === id ? { ...tag, ...values } : tag)))
  }

  function cancelEdit(tag: EditableTag) {
    updateDraft(tag.id, {
      draftLabel: tag.label,
      draftColor: tag.color || DEFAULT_COLOR,
      isEditing: false,
    })
  }

  async function saveTag(tag: EditableTag) {
    const label = tag.draftLabel.trim()
    if (!label) return

    setSavingId(tag.id)
    setError(null)

    try {
      const response = await fetch(`/api/airtable/tags?id=${encodeURIComponent(tag.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color: tag.draftColor }),
      })

      if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel atualizar a tag."))

      const data = (await response.json()) as { tag?: ChatTag | null }
      const nextTag = data.tag ?? { id: tag.id, label, color: tag.draftColor }
      setTags((current) => current.map((item) => (item.id === tag.id ? toEditableTag(nextTag) : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar a tag.")
    } finally {
      setSavingId(null)
    }
  }

  async function deleteTag(tag: EditableTag) {
    if (!window.confirm(`Apagar a tag "${tag.label}"?`)) return

    setSavingId(tag.id)
    setError(null)

    try {
      const response = await fetch(`/api/airtable/tags?id=${encodeURIComponent(tag.id)}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel apagar a tag."))
      setTags((current) => current.filter((item) => item.id !== tag.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel apagar a tag.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleCreate} className="grid gap-3 rounded-md border border-border bg-background/40 p-4 md:grid-cols-[1fr_10rem_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="new-tag-label">Nome</Label>
          <Input id="new-tag-label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Nova tag" disabled={isCreating} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-tag-color">Cor</Label>
          <div className="flex items-center gap-2">
            <Input id="new-tag-color" type="color" value={isHexColor(newColor) ? newColor : DEFAULT_COLOR} onChange={(event) => setNewColor(event.target.value)} className="h-9 w-12 shrink-0 p-1" disabled={isCreating} />
            <Input value={newColor} onChange={(event) => setNewColor(event.target.value)} className="font-mono text-xs uppercase" disabled={isCreating} />
          </div>
        </div>

        <Button type="submit" disabled={isCreating || !newLabel.trim()}>
          {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
          Criar
        </Button>
      </form>

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium text-foreground">{sortedTags.length} tags</span>
          {error ? <span className="truncate text-sm text-destructive">{error}</span> : null}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={() => void loadTags()} disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
          <Loader2 className="mr-2 animate-spin" />
          Carregando tags
        </div>
      ) : sortedTags.length > 0 ? (
        <div className="grid gap-3">
          {sortedTags.map((tag) => {
            const isSaving = savingId === tag.id
            const previewColor = tag.isEditing ? tag.draftColor : tag.color || DEFAULT_COLOR

            return (
              <div key={tag.id} className="grid gap-3 rounded-md border border-border bg-background/40 p-4 md:grid-cols-[minmax(0,1fr)_10rem_auto] md:items-center">
                {tag.isEditing ? (
                  <>
                    <Input value={tag.draftLabel} onChange={(event) => updateDraft(tag.id, { draftLabel: event.target.value })} disabled={isSaving} />

                    <div className="flex items-center gap-2">
                      <Input type="color" value={isHexColor(tag.draftColor) ? tag.draftColor : DEFAULT_COLOR} onChange={(event) => updateDraft(tag.id, { draftColor: event.target.value })} className="h-9 w-12 shrink-0 p-1" disabled={isSaving} />
                      <Input value={tag.draftColor} onChange={(event) => updateDraft(tag.id, { draftColor: event.target.value })} className="font-mono text-xs uppercase" disabled={isSaving} />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" size="icon-sm" onClick={() => void saveTag(tag)} disabled={isSaving || !tag.draftLabel.trim()} aria-label="Salvar tag">
                        {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
                      </Button>
                      <Button type="button" variant="outline" size="icon-sm" onClick={() => cancelEdit(tag)} disabled={isSaving} aria-label="Cancelar edicao">
                        <X />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-3">
                      <Badge className="max-w-full border-0 px-2.5 py-1" style={{ backgroundColor: previewColor, color: getReadableTextColor(previewColor) }}>
                        <span className="truncate">{tag.label}</span>
                      </Badge>
                      <span className="truncate text-xs text-muted-foreground">{tag.id}</span>
                    </div>

                    <span className="font-mono text-xs uppercase text-muted-foreground">{previewColor}</span>

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="icon-sm" onClick={() => updateDraft(tag.id, { isEditing: true })} disabled={isSaving} aria-label="Editar tag">
                        <Pencil />
                      </Button>
                      <Button type="button" variant="destructive" size="icon-sm" onClick={() => void deleteTag(tag)} disabled={isSaving} aria-label="Apagar tag">
                        {isSaving ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">Nenhuma tag cadastrada</div>
      )}
    </div>
  )
}
