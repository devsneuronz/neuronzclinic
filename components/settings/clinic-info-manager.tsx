"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getReadableTextColor } from "@/lib/chat-tags";
import type { ClinicAssistantInfo, ClinicInfoPayload, ClinicProcedure, newClinicAssistantInfo } from "@/lib/clinic-info";
import { Check, Loader2, Pencil, Plus, RefreshCw, Save, Stethoscope, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Separator } from "../ui/separator";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

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

const newEmptyAssistant: newClinicAssistantInfo = {
  id: null,
  name: "Lia",
  generalInfo: "",
  initialMessage: "",
  gender: "ia",
  style: "formal",
  useEmojis: false,
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

  const [newAssistantDraft, setNewAssistantDraft] = useState<newClinicAssistantInfo>(newEmptyAssistant);

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
        <Loader2 className="mr-2 animate-spin text-theme-primary" />
        Carregando informações
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 transition-all">
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
            <Button type="button" size="sm" variant="primary" onClick={() => void saveAssistant()} disabled={isSavingAssistant || !assistantChanged} className="h-9">
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

          {/* Divisor para separar a seção de dados da seção de comportamento */}
          <Separator className="my-2 bg-border/60" />

          {/* SEÇÃO: PERSONALIDADE E TOM DA IA */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">Personalidade e Tom da IA</h3>
              <p className="text-xs text-muted-foreground">Defina a identidade visual, gênero e comportamento linguístico da inteligência artificial.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Coluna 1: Identidade (Nome e Gênero) */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="assistant-name" className="text-xs font-semibold text-foreground">
                    Nome da IA
                  </Label>
                  <Input
                    id="assistant-name"
                    type="text"
                    value={newAssistantDraft.name || ""}
                    onChange={(event) => setNewAssistantDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ex: Lia, Dr. Robô, Amanda..."
                    disabled={isSavingAssistant}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-foreground">Gênero de Tratamento</Label>
                  <Tabs value={newAssistantDraft.gender || "ia"} onValueChange={(value) => setNewAssistantDraft((current) => ({ ...current, gender: value }))} className="w-full">
                    <TabsList className="w-full gap-1.5 rounded-full h-9! bg-secondary/50 border border-border/40">
                      <TabsTrigger value="female" disabled={isSavingAssistant} className="rounded-full gap-1.5 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-card">
                        Mulher
                      </TabsTrigger>
                      <TabsTrigger value="male" disabled={isSavingAssistant} className="rounded-full gap-1.5 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-card">
                        Homem
                      </TabsTrigger>
                      <TabsTrigger value="ia" disabled={isSavingAssistant} className="rounded-full gap-1.5 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-card">
                        Neutro / IA
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="assistant-style" className="text-xs font-semibold text-foreground">
                    Estilo de Conversa
                  </Label>
                  <Select value={newAssistantDraft.style || "informal"} onValueChange={(value) => setNewAssistantDraft((current) => ({ ...current, style: value }))} disabled={isSavingAssistant}>
                    <SelectTrigger id="assistant-style" className="w-full">
                      <SelectValue placeholder="Selecione o tom da conversa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">Formal (Uso de 'senhor/senhora', tom corporativo/médico clássico)</SelectItem>
                      <SelectItem value="informal">Informal (Tom acolhedor, ágil, uso de 'você')</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 p-3.5 shadow-2xs min-h-15"
                  onClick={() => setNewAssistantDraft((current) => ({ ...current, useEmojis: !current.useEmojis }))}
                >
                  <div className="space-y-0.5">
                    <Label htmlFor="assistant-emojis" className="text-xs font-semibold text-foreground">
                      Permitir o uso de emojis
                    </Label>
                    <p className="text-[11px] text-muted-foreground leading-none">{newAssistantDraft.useEmojis ? "A IA usará reações visuais moderadas nas respostas." : "Respostas estritamente textuais e limpas."}</p>
                  </div>
                  <Switch
                    id="assistant-emojis"
                    checked={!!newAssistantDraft.useEmojis}
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                    onCheckedChange={(checked) => {
                      setNewAssistantDraft((current) => ({ ...current, useEmojis: checked }));
                    }}
                    disabled={isSavingAssistant}
                    className="cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-5 flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Informações de Procedimentos</h2>
            <p className="text-sm text-muted-foreground">Explicações que a IA usará para detalhar tratamentos e interesses.</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full shrink-0">
            {sortedProcedures.length} <span className="hidden md:inline">cadastrados</span>
          </span>
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
              placeholder="Ex.: Ativo"
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
              placeholder="Ex.: TXHM"
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
              placeholder="Instruções sobre este procedimento..."
              disabled={isCreating}
              className="h-9 bg-background"
            />
          </div>

          <Button type="submit" variant="primary" disabled={isCreating || (!newProcedure.name.trim() && !newProcedure.interest.trim()) || !newProcedure.description.trim()} className="h-9 w-full lg:w-auto">
            {isCreating ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4" />}
            Adicionar
          </Button>
        </form>

        <div className="flex flex-col bg-card rounded-xl border border-border shadow-sm overflow-hidden min-h-0">
          <div className="grid grid-cols-[14rem_12rem_minmax(0,1fr)_6.5rem] border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden shrink-0 gap-3">
            <span>Nome</span>
            <span>Código de Interesse</span>
            <span>Descrição contextualizada</span>
            <span className="text-right">Ações</span>
          </div>

          {isLoading ? (
            <div className="flex h-44 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-theme-primary" />
              <span>Carregando procedimentos...</span>
            </div>
          ) : sortedProcedures.length === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground p-6">
              <Stethoscope className="h-8 w-8 text-muted-foreground/60 stroke-[1.5]" />
              <p className="font-medium">Nenhum procedimento cadastrado no momento.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 w-full custom-scrollbar">
              <div className="flex flex-col w-full divide-y divide-border">
                {sortedProcedures.map((procedure) => {
                  const isSaving = savingId === procedure.id;
                  const interestStyle = procedure.interestColor ? { backgroundColor: procedure.interestColor, color: getReadableTextColor(procedure.interestColor) } : undefined;

                  return (
                    <article key={procedure.id} className="w-full transition-colors bg-background/50">
                      {procedure.isEditing ? (
                        <div className="grid gap-4 items-start md:items-center p-4 md:grid-cols-[14rem_12rem_minmax(0,1fr)_6.5rem] md:gap-3">
                          <div className="space-y-2 w-full min-w-0 mt-7.75">
                            <Label className="text-xs text-muted-foreground md:hidden">Nome</Label>
                            <Input value={procedure.draftName} onChange={(event) => updateDraft(procedure.id, { draftName: event.target.value })} disabled={isSaving} className="h-9" placeholder="Ex.: Ativo" />
                            <div className="flex items-center gap-2 pt-1">
                              <Switch checked={procedure.draftActive} onCheckedChange={(checked) => updateDraft(procedure.id, { draftActive: checked })} disabled={isSaving} />
                              <span className="text-xs text-muted-foreground font-medium">{procedure.draftActive ? "Visível / Ativo" : "Inativo"}</span>
                            </div>
                          </div>

                          <div className="space-y-2 w-full min-w-0">
                            <Label className="text-xs text-muted-foreground md:hidden">Interesse</Label>
                            <Input
                              value={procedure.draftInterest}
                              onChange={(event) => updateDraft(procedure.id, { draftInterest: event.target.value })}
                              disabled={isSaving}
                              className="h-9 font-mono text-xs uppercase"
                              placeholder="Ex.: TXHM"
                            />
                          </div>

                          <div className="space-y-2 w-full min-w-0">
                            <Label className="text-xs text-muted-foreground md:hidden">Descrição</Label>
                            <Textarea
                              value={procedure.draftDescription}
                              onChange={(event) => updateDraft(procedure.id, { draftDescription: event.target.value })}
                              className="min-h-[58px] max-h-150 resize-y leading-relaxed text-sm custom-scrollbar"
                              disabled={isSaving}
                              placeholder="Instruções sobre este procedimento..."
                            />
                          </div>

                          <div className="flex justify-end gap-1.5 pt-2 md:pt-0 shrink-0">
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
                        <div className="flex flex-col p-4 gap-2 md:grid md:grid-cols-[14rem_12rem_minmax(0,1fr)_6.5rem] md:items-center md:py-3.5 md:px-4 md:gap-3">
                          <div className="flex items-center justify-between md:justify-start gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center p-0.5 shrink-0">
                                      <span className="relative flex h-2 w-2 rounded-full">
                                        {procedure.active ? (
                                          <>
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                                          </>
                                        ) : (
                                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500/40"></span>
                                        )}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs font-medium px-2 py-1">
                                    {procedure.active ? "Procedimento ativo" : "Procedimento inativo"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <span className="text-sm font-semibold text-foreground truncate">{procedure.name || "Sem Nome"}</span>
                            </div>

                            <div className="flex items-center gap-1 md:hidden shrink-0">
                              <Button type="button" variant="ghost" size="icon-sm" onClick={() => updateDraft(procedure.id, { isEditing: true })} disabled={isSaving} className="h-8 w-8" aria-label="Editar">
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(procedure)} disabled={isSaving} className="h-8 w-8 text-destructive" aria-label="Excluir">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center md:block shrink-0">
                            <span className="text-xs font-medium text-muted-foreground md:hidden mr-2">Interesse:</span>
                            <span
                              className="inline-flex items-center rounded px-2.5 py-0.5 text-xs font-mono font-bold uppercase border border-border/30 max-w-fit shadow-2xs"
                              style={interestStyle || { backgroundColor: "var(--secondary)", color: "var(--secondary-foreground)" }}
                            >
                              {procedure.interest || "Nenhum"}
                            </span>
                          </div>

                          <div className="w-full min-w-0">
                            <span className="text-xs font-medium text-muted-foreground md:hidden block mb-0.5">Descrição:</span>
                            <div className="text-sm leading-relaxed text-muted-foreground md:text-foreground whitespace-pre-wrap truncate md:max-w-prose lg:max-w-none">{procedure.description}</div>
                          </div>

                          <div className="hidden md:flex items-center justify-end gap-1 shrink-0">
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
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
