"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getReadableTextColor } from "@/lib/chat-tags";
import type { ClinicAssistantInfo, ClinicInfoPayload, ClinicProcedure } from "@/lib/clinic-info";
import { Check, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type EditableProcedure = ClinicProcedure & {
  draftName: string;
  draftInterest: string;
  draftDescription: string;
  draftActive: boolean;
  isEditing: boolean;
};

const emptyAssistant: ClinicAssistantInfo = {
  id: null,
  name: "Lia",
  generalInfo: "",
  initialMessage: "",
};

const emptyProcedureForm = {
  name: "",
  interest: "",
  description: "",
  active: true,
};

function toEditableProcedure(procedure: ClinicProcedure): EditableProcedure {
  return {
    ...procedure,
    draftName: procedure.name,
    draftInterest: procedure.interest,
    draftDescription: procedure.description,
    draftActive: procedure.active,
    isEditing: false,
  };
}

async function readApiMessage(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  return data?.message || data?.error || fallback;
}

export function ClinicInfoManager() {
  const [assistant, setAssistant] = useState<ClinicAssistantInfo>(emptyAssistant);
  const [assistantDraft, setAssistantDraft] = useState<ClinicAssistantInfo>(emptyAssistant);
  const [procedures, setProcedures] = useState<EditableProcedure[]>([]);
  const [newProcedure, setNewProcedure] = useState(emptyProcedureForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAssistant, setIsSavingAssistant] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditableProcedure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedProcedures = useMemo(() => procedures.slice().sort((a, b) => (a.interest || a.name).localeCompare(b.interest || b.name, "pt-BR", { sensitivity: "base" })), [procedures]);

  const assistantChanged = assistantDraft.name !== assistant.name || assistantDraft.generalInfo !== assistant.generalInfo || assistantDraft.initialMessage !== assistant.initialMessage;

  async function loadInfo() {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/airtable/clinic-info", { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível carregar as informações."));

      const data = (await response.json()) as ClinicInfoPayload;
      setAssistant(data.assistant ?? emptyAssistant);
      setAssistantDraft(data.assistant ?? emptyAssistant);
      setProcedures((data.procedures ?? []).map(toEditableProcedure));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as informações.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadInfo();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  async function saveAssistant() {
    setIsSavingAssistant(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/airtable/clinic-info", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "assistant", assistant: assistantDraft }),
      });

      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível salvar as informações da clínica."));

      const data = (await response.json()) as { assistant?: ClinicAssistantInfo };
      const nextAssistant = data.assistant ?? assistantDraft;
      setAssistant(nextAssistant);
      setAssistantDraft(nextAssistant);
      setSuccess("Informações da clínica salvas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar as informações da clínica.");
    } finally {
      setIsSavingAssistant(false);
    }
  }

  async function createProcedure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/airtable/clinic-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProcedure),
      });

      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível adicionar o procedimento."));

      const data = (await response.json()) as { procedure?: ClinicProcedure | null };
      if (data.procedure) setProcedures((current) => [...current, toEditableProcedure(data.procedure!)]);
      setNewProcedure(emptyProcedureForm);
      setSuccess("Procedimento adicionado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar o procedimento.");
    } finally {
      setIsCreating(false);
    }
  }

  function updateDraft(id: string, values: Partial<Pick<EditableProcedure, "draftName" | "draftInterest" | "draftDescription" | "draftActive" | "isEditing">>) {
    setProcedures((current) => current.map((procedure) => (procedure.id === id ? { ...procedure, ...values } : procedure)));
  }

  function cancelEdit(procedure: EditableProcedure) {
    updateDraft(procedure.id, {
      draftName: procedure.name,
      draftInterest: procedure.interest,
      draftDescription: procedure.description,
      draftActive: procedure.active,
      isEditing: false,
    });
  }

  async function saveProcedure(procedure: EditableProcedure) {
    setSavingId(procedure.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/airtable/clinic-info", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "procedure",
          procedure: {
            id: procedure.id,
            name: procedure.draftName,
            interestId: procedure.draftInterest.trim() === procedure.interest ? procedure.interestId : undefined,
            interest: procedure.draftInterest,
            description: procedure.draftDescription,
            active: procedure.draftActive,
          },
        }),
      });

      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível salvar o procedimento."));

      const data = (await response.json()) as { procedure?: ClinicProcedure | null };
      const nextProcedure = data.procedure ?? {
        id: procedure.id,
        name: procedure.draftName.trim(),
        interest: procedure.draftInterest.trim(),
        description: procedure.draftDescription.trim(),
        active: procedure.draftActive,
      };
      setProcedures((current) => current.map((item) => (item.id === procedure.id ? toEditableProcedure(nextProcedure) : item)));
      setSuccess("Procedimento salvo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o procedimento.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteProcedure() {
    if (!deleteTarget) return;

    setSavingId(deleteTarget.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/airtable/clinic-info?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível excluir o procedimento."));

      setProcedures((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSuccess("Procedimento excluído.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o procedimento.");
    } finally {
      setSavingId(null);
    }
  }

  if (isLoading) {
    return (
      <section className="flex h-64 items-center justify-center rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" />
        Carregando informações
      </section>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <section className="rounded-xl border border-border bg-muted/20 p-4 sm:p-5 shadow-sm transition-all">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">{assistantDraft.name || "Lia"}</h2>
            <p className="text-sm text-muted-foreground">Informações e diretrizes usadas pela IA para responder pacientes.</p>
          </div>

          <div className="flex items-center gap-2 sm:justify-end">
            {success ? <span className="text-sm font-medium text-emerald-600 animate-fade-in">{success}</span> : null}
            {error ? <span className="text-sm font-medium text-destructive animate-fade-in">{error}</span> : null}

            <Button type="button" variant="outline" size="sm" onClick={() => void loadInfo()} disabled={isLoading || isSavingAssistant} className="h-9">
              <RefreshCw className="mr-2 w-3.5 h-3.5" />
              Atualizar
            </Button>
            <Button type="button" size="sm" onClick={() => void saveAssistant()} disabled={isSavingAssistant || !assistantChanged} className="h-9">
              {isSavingAssistant ? <Loader2 className="animate-spin mr-2 w-3.5 h-3.5" /> : <Save className="mr-2 w-3.5 h-3.5" />}
              Salvar Alterações
            </Button>
          </div>
        </div>

        <div className="grid gap-5">
          <div className="space-y-2">
            <Label htmlFor="assistant-general-info" className="text-sm font-semibold text-foreground">
              Informações Gerais da Clínica
            </Label>
            <Textarea
              id="assistant-general-info"
              value={assistantDraft.generalInfo}
              onChange={(event) => setAssistantDraft((current) => ({ ...current, generalInfo: event.target.value }))}
              className="overflow-auto custom-scrollbar transition-all min-h-55 max-h-100 resize-y bg-background leading-relaxed rounded-lg border-0!"
              placeholder="Dados estruturados da clínica (endereço, horários, regras de convênio) vindos do Airtable..."
              disabled={isSavingAssistant}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assistant-initial-message" className="text-sm font-semibold text-foreground">
              Mensagem Inicial de Saudação
            </Label>
            <Textarea
              id="assistant-initial-message"
              value={assistantDraft.initialMessage}
              onChange={(event) => setAssistantDraft((current) => ({ ...current, initialMessage: event.target.value }))}
              className="min-h-27.5 max-h-55 resize-y bg-background leading-relaxed rounded-lg border-0! custom-scrollbar"
              placeholder="Primeira mensagem enviada pela assistente ao iniciar um novo contato..."
              disabled={isSavingAssistant}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Informações de Procedimentos</h2>
            <p className="text-sm text-muted-foreground">Explicações que a IA usará para detalhar tratamentos e interesses.</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full shrink-0">{sortedProcedures.length} cadastrados</span>
        </div>

        <form onSubmit={createProcedure} className="mb-6 grid gap-3 rounded-xl border border-border bg-muted/40 p-4 lg:grid-cols-[1fr_1fr_2fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="new-procedure-name" className="text-xs font-medium">
              Nome
            </Label>
            <Input
              id="new-procedure-name"
              value={newProcedure.name}
              onChange={(event) => setNewProcedure((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Clareamento"
              disabled={isCreating}
              className="h-9 bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-procedure-interest" className="text-xs font-medium">
              Interesse (Mapeamento)
            </Label>
            <Input
              id="new-procedure-interest"
              value={newProcedure.interest}
              onChange={(event) => setNewProcedure((current) => ({ ...current, interest: event.target.value }))}
              placeholder="Ex.: ODONTO_CLAR"
              disabled={isCreating}
              className="h-9 bg-background font-mono text-xs uppercase"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-procedure-description" className="text-xs font-medium">
              Descrição para a IA
            </Label>
            <Input
              id="new-procedure-description"
              value={newProcedure.description}
              onChange={(event) => setNewProcedure((current) => ({ ...current, description: event.target.value }))}
              placeholder="Instruções sobre como explicar este procedimento..."
              disabled={isCreating}
              className="h-9 bg-background"
            />
          </div>

          <Button type="submit" disabled={isCreating || (!newProcedure.name.trim() && !newProcedure.interest.trim()) || !newProcedure.description.trim()} className="h-9 w-full lg:w-auto">
            {isCreating ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Adicionar
          </Button>
        </form>

        <div className="hidden border-b border-border pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[12rem_12rem_minmax(0,1fr)_6rem] px-4 mb-2">
          <span>Procedimento</span>
          <span>Código de Interesse</span>
          <span>Descrição contextualizada</span>
          <span className="text-right">Ações</span>
        </div>

        {sortedProcedures.length > 0 ? (
          <div className="space-y-2.5">
            {sortedProcedures.map((procedure) => {
              const isSaving = savingId === procedure.id;
              const interestStyle = procedure.interestColor ? { backgroundColor: procedure.interestColor, color: getReadableTextColor(procedure.interestColor) } : undefined;

              return (
                <article key={procedure.id} className="rounded-lg border border-border bg-background shadow-sm overflow-hidden transition-colors hover:border-border/80">
                  {procedure.isEditing ? (
                    <div className="grid gap-3 p-4 lg:grid-cols-[12rem_12rem_minmax(0,1fr)_auto] lg:items-start">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground md:hidden">Nome</Label>
                        <Input value={procedure.draftName} onChange={(event) => updateDraft(procedure.id, { draftName: event.target.value })} disabled={isSaving} className="h-9" />
                        <div className="flex items-center gap-2 pt-1">
                          <Switch checked={procedure.draftActive} onCheckedChange={(checked) => updateDraft(procedure.id, { draftActive: checked })} disabled={isSaving} />
                          <span className="text-xs text-muted-foreground font-medium">{procedure.draftActive ? "Visível / Ativo" : "Inativo"}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground md:hidden">Interesse</Label>
                        <Input value={procedure.draftInterest} onChange={(event) => updateDraft(procedure.id, { draftInterest: event.target.value })} disabled={isSaving} className="h-9 font-mono text-xs uppercase" />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground md:hidden">Descrição</Label>
                        <Textarea
                          value={procedure.draftDescription}
                          onChange={(event) => updateDraft(procedure.id, { draftDescription: event.target.value })}
                          className="min-h-[80px] lg:min-h-[36px] resize-y leading-relaxed text-sm"
                          disabled={isSaving}
                        />
                      </div>

                      <div className="flex justify-end gap-1.5 pt-2 lg:pt-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          onClick={() => void saveProcedure(procedure)}
                          disabled={isSaving || (!procedure.draftName.trim() && !procedure.draftInterest.trim()) || !procedure.draftDescription.trim()}
                          aria-label="Salvar"
                        >
                          {isSaving ? <Loader2 className="animate-spin w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </Button>
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => cancelEdit(procedure)} disabled={isSaving} aria-label="Cancelar">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col p-4 gap-3 md:grid md:grid-cols-[12rem_12rem_minmax(0,1fr)_6rem] md:items-center md:min-h-12 md:p-0">
                      <div className="flex items-center justify-between md:contents">
                        <div className="flex items-center text-sm font-semibold text-foreground md:px-4 md:py-2 md:border-r md:border-border/40">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2.5 shrink-0 ${procedure.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                          <span className="truncate max-w-[200px] md:max-w-full">{procedure.name || "Sem Nome"}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 md:order-last md:px-3 md:justify-end">
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => updateDraft(procedure.id, { isEditing: true })} disabled={isSaving} className="h-8 w-8 hover:bg-muted" aria-label="Editar">
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteTarget(procedure)}
                            disabled={isSaving}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center md:px-4 md:border-r md:border-border/40">
                        <span
                          className="inline-flex items-center rounded px-2.5 py-0.5 text-xs font-mono font-medium uppercase border border-border/30 max-w-fit shadow-xs"
                          style={interestStyle || { backgroundColor: "var(--secondary)", color: "var(--secondary-foreground)" }}
                        >
                          {procedure.interest || "Nenhum"}
                        </span>
                      </div>

                      <div className="text-sm leading-relaxed text-muted-foreground md:text-foreground md:px-4 md:py-3 whitespace-pre-wrap">{procedure.description}</div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground bg-muted/20">Nenhum procedimento cadastrado no momento.</div>
        )}
      </section>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Excluir procedimento?</DialogTitle>
            <DialogDescription>Esta ação removerá permanentemente as diretrizes do procedimento do Airtable. A IA deixará de usar este contexto.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-sm">
            <span className="font-semibold text-foreground block mb-1">{deleteTarget?.name || deleteTarget?.interest || "Procedimento"}</span>
            {deleteTarget?.description ? <p className="text-muted-foreground line-clamp-2 leading-relaxed text-xs">{deleteTarget.description}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={Boolean(deleteTarget && savingId === deleteTarget.id)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteProcedure()} disabled={Boolean(deleteTarget && savingId === deleteTarget.id)}>
              {deleteTarget && savingId === deleteTarget.id ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
