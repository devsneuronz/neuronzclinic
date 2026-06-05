"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { Check, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { ClinicAssistantInfo, ClinicInfoPayload, ClinicProcedure } from "@/lib/clinic-info"

type EditableProcedure = ClinicProcedure & {
  draftName: string
  draftInterest: string
  draftDescription: string
  draftActive: boolean
  isEditing: boolean
}

const emptyAssistant: ClinicAssistantInfo = {
  id: null,
  name: "Lia",
  generalInfo: "",
  initialMessage: "",
}

const emptyProcedureForm = {
  name: "",
  interest: "",
  description: "",
  active: true,
}

function toEditableProcedure(procedure: ClinicProcedure): EditableProcedure {
  return {
    ...procedure,
    draftName: procedure.name,
    draftInterest: procedure.interest,
    draftDescription: procedure.description,
    draftActive: procedure.active,
    isEditing: false,
  }
}

async function readApiMessage(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null
  return data?.message || data?.error || fallback
}

export function ClinicInfoManager() {
  const [assistant, setAssistant] = useState<ClinicAssistantInfo>(emptyAssistant)
  const [assistantDraft, setAssistantDraft] = useState<ClinicAssistantInfo>(emptyAssistant)
  const [procedures, setProcedures] = useState<EditableProcedure[]>([])
  const [newProcedure, setNewProcedure] = useState(emptyProcedureForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingAssistant, setIsSavingAssistant] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EditableProcedure | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const sortedProcedures = useMemo(
    () => procedures.slice().sort((a, b) => (a.interest || a.name).localeCompare(b.interest || b.name, "pt-BR", { sensitivity: "base" })),
    [procedures],
  )

  const assistantChanged =
    assistantDraft.name !== assistant.name ||
    assistantDraft.generalInfo !== assistant.generalInfo ||
    assistantDraft.initialMessage !== assistant.initialMessage

  async function loadInfo() {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/airtable/clinic-info", { cache: "no-store" })
      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível carregar as informações."))

      const data = (await response.json()) as ClinicInfoPayload
      setAssistant(data.assistant ?? emptyAssistant)
      setAssistantDraft(data.assistant ?? emptyAssistant)
      setProcedures((data.procedures ?? []).map(toEditableProcedure))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as informações.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadInfo()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  async function saveAssistant() {
    setIsSavingAssistant(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/airtable/clinic-info", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "assistant", assistant: assistantDraft }),
      })

      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível salvar as informações da clínica."))

      const data = (await response.json()) as { assistant?: ClinicAssistantInfo }
      const nextAssistant = data.assistant ?? assistantDraft
      setAssistant(nextAssistant)
      setAssistantDraft(nextAssistant)
      setSuccess("Informações da clínica salvas.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar as informações da clínica.")
    } finally {
      setIsSavingAssistant(false)
    }
  }

  async function createProcedure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setIsCreating(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/airtable/clinic-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProcedure),
      })

      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível adicionar o procedimento."))

      const data = (await response.json()) as { procedure?: ClinicProcedure | null }
      if (data.procedure) setProcedures((current) => [...current, toEditableProcedure(data.procedure!)])
      setNewProcedure(emptyProcedureForm)
      setSuccess("Procedimento adicionado.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar o procedimento.")
    } finally {
      setIsCreating(false)
    }
  }

  function updateDraft(id: string, values: Partial<Pick<EditableProcedure, "draftName" | "draftInterest" | "draftDescription" | "draftActive" | "isEditing">>) {
    setProcedures((current) => current.map((procedure) => (procedure.id === id ? { ...procedure, ...values } : procedure)))
  }

  function cancelEdit(procedure: EditableProcedure) {
    updateDraft(procedure.id, {
      draftName: procedure.name,
      draftInterest: procedure.interest,
      draftDescription: procedure.description,
      draftActive: procedure.active,
      isEditing: false,
    })
  }

  async function saveProcedure(procedure: EditableProcedure) {
    setSavingId(procedure.id)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/airtable/clinic-info", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "procedure",
          procedure: {
            id: procedure.id,
            name: procedure.draftName,
            interest: procedure.draftInterest,
            description: procedure.draftDescription,
            active: procedure.draftActive,
          },
        }),
      })

      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível salvar o procedimento."))

      const data = (await response.json()) as { procedure?: ClinicProcedure | null }
      const nextProcedure = data.procedure ?? {
        id: procedure.id,
        name: procedure.draftName.trim(),
        interest: procedure.draftInterest.trim(),
        description: procedure.draftDescription.trim(),
        active: procedure.draftActive,
      }
      setProcedures((current) => current.map((item) => (item.id === procedure.id ? toEditableProcedure(nextProcedure) : item)))
      setSuccess("Procedimento salvo.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o procedimento.")
    } finally {
      setSavingId(null)
    }
  }

  async function deleteProcedure() {
    if (!deleteTarget) return

    setSavingId(deleteTarget.id)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/airtable/clinic-info?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" })
      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível excluir o procedimento."))

      setProcedures((current) => current.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      setSuccess("Procedimento excluído.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o procedimento.")
    } finally {
      setSavingId(null)
    }
  }

  if (isLoading) {
    return (
      <section className="flex h-64 items-center justify-center rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" />
        Carregando informações
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-border bg-muted/40 p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{assistantDraft.name || "Lia"}</h2>
            <p className="text-sm text-muted-foreground">Informações usadas pela IA para responder pacientes.</p>
          </div>

          <div className="flex items-center gap-2">
            {success ? <span className="text-sm text-emerald-600">{success}</span> : null}
            {error ? <span className="text-sm text-destructive">{error}</span> : null}
            <Button type="button" variant="outline" size="sm" onClick={() => void loadInfo()} disabled={isLoading || isSavingAssistant}>
              <RefreshCw />
              Atualizar
            </Button>
            <Button type="button" size="sm" onClick={() => void saveAssistant()} disabled={isSavingAssistant || !assistantChanged}>
              {isSavingAssistant ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="assistant-general-info" className="text-base">
              Informações Gerais da Clínica
            </Label>
            <Textarea
              id="assistant-general-info"
              value={assistantDraft.generalInfo}
              onChange={(event) => setAssistantDraft((current) => ({ ...current, generalInfo: event.target.value }))}
              className="min-h-64 resize-y bg-background leading-relaxed"
              placeholder="Dados da clínica vindos do Airtable"
              disabled={isSavingAssistant}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assistant-initial-message" className="text-base">
              Mensagem Inicial
            </Label>
            <Textarea
              id="assistant-initial-message"
              value={assistantDraft.initialMessage}
              onChange={(event) => setAssistantDraft((current) => ({ ...current, initialMessage: event.target.value }))}
              className="min-h-36 resize-y bg-background leading-relaxed"
              placeholder="Mensagem inicial usada pela assistente"
              disabled={isSavingAssistant}
            />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Informações de Procedimentos</h2>
            <p className="text-sm text-muted-foreground">Edite as descrições que a IA usa para explicar tratamentos e interesses.</p>
          </div>
          <span className="text-sm font-medium text-muted-foreground">{sortedProcedures.length} procedimentos</span>
        </div>

        <form onSubmit={createProcedure} className="mb-4 grid gap-3 rounded-md border border-border bg-background/50 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="new-procedure-name">Nome</Label>
            <Input
              id="new-procedure-name"
              value={newProcedure.name}
              onChange={(event) => setNewProcedure((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Ativo"
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-procedure-interest">Interesse</Label>
            <Input
              id="new-procedure-interest"
              value={newProcedure.interest}
              onChange={(event) => setNewProcedure((current) => ({ ...current, interest: event.target.value }))}
              placeholder="Ex.: TXHM"
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-procedure-description">Descrição</Label>
            <Input
              id="new-procedure-description"
              value={newProcedure.description}
              onChange={(event) => setNewProcedure((current) => ({ ...current, description: event.target.value }))}
              placeholder="Descrição do procedimento"
              disabled={isCreating}
            />
          </div>

          <Button type="submit" disabled={isCreating || (!newProcedure.name.trim() && !newProcedure.interest.trim()) || !newProcedure.description.trim()}>
            {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
            Adicionar
          </Button>
        </form>

        <div className="hidden border-b border-border pb-2 text-sm font-semibold text-foreground md:grid md:grid-cols-[10rem_12rem_minmax(0,1fr)_6rem]">
          <span>Nome</span>
          <span>Interesse</span>
          <span>Descrição</span>
          <span className="text-right">Ações</span>
        </div>

        {sortedProcedures.length > 0 ? (
          <div className="mt-3 space-y-3">
            {sortedProcedures.map((procedure) => {
              const isSaving = savingId === procedure.id

              return (
                <article key={procedure.id} className="rounded-md border border-border bg-background shadow-sm">
                  {procedure.isEditing ? (
                    <div className="grid gap-3 p-3 lg:grid-cols-[10rem_12rem_minmax(0,1fr)_auto] lg:items-start">
                      <div className="space-y-2">
                        <Label htmlFor={`procedure-name-${procedure.id}`}>Nome</Label>
                        <Input
                          id={`procedure-name-${procedure.id}`}
                          value={procedure.draftName}
                          onChange={(event) => updateDraft(procedure.id, { draftName: event.target.value })}
                          disabled={isSaving}
                        />
                        <div className="flex items-center gap-2 pt-1">
                          <Switch checked={procedure.draftActive} onCheckedChange={(checked) => updateDraft(procedure.id, { draftActive: checked })} disabled={isSaving} />
                          <span className="text-xs text-muted-foreground">{procedure.draftActive ? "Ativo" : "Inativo"}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`procedure-interest-${procedure.id}`}>Interesse</Label>
                        <Input
                          id={`procedure-interest-${procedure.id}`}
                          value={procedure.draftInterest}
                          onChange={(event) => updateDraft(procedure.id, { draftInterest: event.target.value })}
                          disabled={isSaving}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`procedure-description-${procedure.id}`}>Descrição</Label>
                        <Textarea
                          id={`procedure-description-${procedure.id}`}
                          value={procedure.draftDescription}
                          onChange={(event) => updateDraft(procedure.id, { draftDescription: event.target.value })}
                          className="min-h-32 resize-y leading-relaxed"
                          disabled={isSaving}
                        />
                      </div>

                      <div className="flex justify-end gap-2 lg:pt-7">
                        <Button type="button" size="icon-sm" onClick={() => void saveProcedure(procedure)} disabled={isSaving || (!procedure.draftName.trim() && !procedure.draftInterest.trim()) || !procedure.draftDescription.trim()} aria-label="Salvar procedimento">
                          {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
                        </Button>
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => cancelEdit(procedure)} disabled={isSaving} aria-label="Cancelar edição">
                          <X />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-0 md:grid-cols-[10rem_12rem_minmax(0,1fr)_6rem]">
                      <div className="flex min-h-12 items-center bg-emerald-600 px-4 text-sm font-medium text-white md:rounded-l-md">
                        {procedure.active ? procedure.name || "Ativo" : "Inativo"}
                      </div>
                      <div className="flex min-h-12 items-center bg-primary px-4 text-sm font-medium text-primary-foreground">
                        {procedure.interest || "-"}
                      </div>
                      <div className="min-h-12 whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-foreground">{procedure.description}</div>
                      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2 md:border-l md:border-t-0">
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => updateDraft(procedure.id, { isEditing: true })} disabled={isSaving} aria-label="Editar procedimento">
                          <Pencil />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(procedure)} disabled={isSaving} aria-label="Excluir procedimento">
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
            Nenhum procedimento cadastrado
          </div>
        )}
      </section>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir procedimento?</DialogTitle>
            <DialogDescription>
              Esta ação remove o procedimento do Airtable e não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
            <span className="font-medium text-foreground">{deleteTarget?.interest || deleteTarget?.name || "Procedimento"}</span>
            {deleteTarget?.description ? <p className="mt-1 line-clamp-3 text-muted-foreground">{deleteTarget.description}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={Boolean(deleteTarget && savingId === deleteTarget.id)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteProcedure()} disabled={Boolean(deleteTarget && savingId === deleteTarget.id)}>
              {deleteTarget && savingId === deleteTarget.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
