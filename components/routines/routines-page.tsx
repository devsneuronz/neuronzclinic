"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ChatTag } from "@/lib/chat-tags";
import { getReadableTextColor } from "@/lib/chat-tags";
import type { ChatStatusOption } from "@/lib/chat-status";
import { actionLabels, createEmptyAction, triggerColors, triggerLabels, type Routine, type RoutineAction, type RoutineActionType, type RoutineMessageTemplate, type RoutineTrigger } from "@/lib/routines";
import { cn } from "@/lib/utils";
import { Bot, Clock3, CopyPlus, Edit3, Loader2, MessageSquareText, Play, Plus, RefreshCw, Save, Search, Trash2, Wand2, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type RoutineForm = Omit<Routine, "id" | "createdAt" | "updatedAt"> & { id?: string };

type UserOption = {
  id?: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "user";
};

type RoutineTab = "routines" | "templates" | "attachments" | "info";

type MessageTemplateForm = {
  label: string;
  type: string;
  content: string;
};

const emptyRoutine: RoutineForm = {
  name: "",
  description: "",
  trigger: "manual",
  targetId: "",
  targetLabel: "",
  targetColor: "",
  specificDate: "",
  birthdayEnabled: true,
  active: true,
  actions: [createEmptyAction(0)],
};

const fallbackRoutines: Routine[] = [
  {
    id: "sample-tag-routine",
    name: "Repasse de indicação",
    description: "Cria aviso e tarefa quando um contato recebe a tag de indicação.",
    trigger: "tag",
    targetId: "sample-indicacao",
    targetLabel: "Indicação",
    targetColor: "#78b73f",
    birthdayEnabled: false,
    active: true,
    actions: [
      { id: "sample-action-1", type: "create_notice", label: "Criar aviso", delayMinutes: 10, subject: "Repasse recebido" },
      { id: "sample-action-2", type: "create_task", label: "Criar tarefa", delayMinutes: 10, subject: "Ver o repasse referente a este contato" },
    ],
  },
  {
    id: "sample-birthday-routine",
    name: "Mensagem de aniversário",
    description: "Modelo de rotina anual, ligada ou desligada pela chave de aniversário.",
    trigger: "birthday",
    targetId: "",
    targetLabel: "Aniversário",
    targetColor: "#d97706",
    birthdayEnabled: true,
    active: false,
    actions: [{ id: "sample-action-3", type: "send_message", label: "Enviar mensagem", delayMinutes: 0, message: "Feliz aniversário!" }],
  },
];

const triggerOrder: RoutineTrigger[] = ["manual", "specific_date", "tag", "status", "birthday"];
const actionTypes: RoutineActionType[] = ["create_notice", "create_task", "send_message", "add_tag"];
const templateTypeColors: Record<string, string> = {
  relacionamento: "#7c3aed",
  marketing: "#db00a6",
  vendas: "#008a10",
  aviso: "#e5c933",
  informação: "#4f86d7",
  informacao: "#4f86d7",
};
const templateTypeOptions = ["Relacionamento", "Marketing", "Vendas", "Aviso", "Informação"];

function cloneRoutine(routine: Routine): RoutineForm {
  return {
    id: routine.id,
    name: routine.name,
    description: routine.description,
    trigger: routine.trigger,
    targetId: routine.targetId,
    targetLabel: routine.targetLabel,
    targetColor: routine.targetColor,
    specificDate: routine.specificDate,
    birthdayEnabled: routine.birthdayEnabled,
    active: routine.active,
    actions: routine.actions.length > 0 ? routine.actions.map((action) => ({ ...action })) : [createEmptyAction(0)],
  };
}

function getTargetLabel(routine: Routine | RoutineForm) {
  if (routine.trigger === "manual") return "Manual";
  if (routine.trigger === "birthday") return routine.birthdayEnabled ? "Ligado" : "Desligado";
  if (routine.trigger === "specific_date") return routine.specificDate || "Definir data";
  return routine.targetLabel || "Escolher alvo";
}

function getRoutineColor(routine: Routine | RoutineForm) {
  return routine.targetColor || triggerColors[routine.trigger];
}

function readApiMessage(response: Response, fallback: string) {
  return response
    .json()
    .then((data: { message?: string; error?: string }) => data.message || data.error || fallback)
    .catch(() => fallback);
}

function parsePromptToActions(prompt: string): RoutineAction[] {
  const parts = prompt
    .split(/\b(?:depois|em seguida|entao|então|,|;)\b/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const actions = parts.map((part, index) => {
    const minuteMatch = part.match(/(\d+)\s*(?:min|mins|minutos?)/i);
    const delayMinutes = minuteMatch ? Number(minuteMatch[1]) : index === 0 ? 0 : 10;
    const lower = part.toLowerCase();
    const type: RoutineActionType = lower.includes("tag") ? "add_tag" : lower.includes("aviso") ? "create_notice" : "create_task";
    const label = actionLabels[type];

    return {
      id: crypto.randomUUID(),
      type,
      label,
      delayMinutes,
      subject: part.replace(/(\d+)\s*(?:min|mins|minutos?)/i, "").trim(),
      message: "",
      notes: "",
      responsibleUserId: "",
    } satisfies RoutineAction;
  });

  return actions.length > 0 ? actions : [createEmptyAction(0)];
}

export function RoutinesPage() {
  const [activeTab, setActiveTab] = useState<RoutineTab>("routines");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [tags, setTags] = useState<ChatTag[]>([]);
  const [statuses, setStatuses] = useState<ChatStatusOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<RoutineMessageTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<RoutineTrigger | "all">("all");
  const [form, setForm] = useState<RoutineForm>(emptyRoutine);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [error, setError] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [templateForm, setTemplateForm] = useState<MessageTemplateForm>({ label: "", type: "Marketing", content: "" });

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetch("/api/airtable/routines", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível carregar rotinas."));
        return response.json() as Promise<{ routines?: Routine[] }>;
      }),
      fetch("/api/chat-options", { cache: "no-store" }).then((response) => response.json() as Promise<{ tags?: ChatTag[]; statuses?: ChatStatusOption[] }>),
      fetch("/api/airtable/users", { cache: "no-store" }).then((response) => response.json() as Promise<{ users?: UserOption[] }>),
      fetch("/api/airtable/message-templates", { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<{ templates?: RoutineMessageTemplate[] }>) : { templates: [] }))
        .catch(() => ({ templates: [] })),
    ])
      .then(([routineData, optionData, userData, templateData]) => {
        if (!isMounted) return;
        setRoutines(routineData.routines?.length ? routineData.routines : fallbackRoutines);
        setTags(optionData.tags ?? []);
        setStatuses(optionData.statuses ?? []);
        setUsers((userData.users ?? []).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
        setMessageTemplates(templateData.templates ?? []);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Não foi possível carregar rotinas.");
        setRoutines(fallbackRoutines);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function loadMessageTemplates() {
    setIsTemplatesLoading(true);
    setTemplateError("");

    try {
      const response = await fetch("/api/airtable/message-templates", { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível carregar templates de mensagem."));
      const data = (await response.json()) as { templates?: RoutineMessageTemplate[] };
      setMessageTemplates(data.templates ?? []);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Não foi possível carregar templates de mensagem.");
    } finally {
      setIsTemplatesLoading(false);
    }
  }

  const filteredRoutines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return routines.filter((routine) => {
      if (triggerFilter !== "all" && routine.trigger !== triggerFilter) return false;
      if (!normalizedQuery) return true;

      return [routine.name, routine.description, routine.targetLabel, triggerLabels[routine.trigger]].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [query, routines, triggerFilter]);

  const stats = useMemo(
    () => ({
      active: routines.filter((routine) => routine.active).length,
      triggerBased: routines.filter((routine) => ["tag", "status", "birthday"].includes(routine.trigger)).length,
      actions: routines.reduce((total, routine) => total + routine.actions.length, 0),
    }),
    [routines],
  );

  const hasInvalidMessageAction = form.actions.some((action) => action.type === "send_message" && (!action.templateId || !messageTemplates.some((template) => template.id === action.templateId && template.content)));

  const targetOptions = form.trigger === "tag" ? tags.map((tag) => ({ id: tag.id, label: tag.label, color: tag.color })) : statuses.map((status) => ({ id: status.label, label: status.label, color: status.color }));

  function openNewRoutine() {
    setForm({ ...emptyRoutine, actions: [createEmptyAction(0)] });
    setAssistantPrompt("");
    setIsDialogOpen(true);
  }

  function openNewTemplate() {
    setTemplateForm({ label: "", type: "Marketing", content: "" });
    setTemplateError("");
    setIsTemplateDialogOpen(true);
  }

  function openRoutine(routine: Routine) {
    setForm(cloneRoutine(routine));
    setAssistantPrompt("");
    setIsDialogOpen(true);
  }

  function updateForm(patch: Partial<RoutineForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateAction(actionId: string, patch: Partial<RoutineAction>) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => (action.id === actionId ? { ...action, ...patch, label: patch.type ? actionLabels[patch.type] : action.label } : action)),
    }));
  }

  function removeAction(actionId: string) {
    setForm((current) => ({
      ...current,
      actions: current.actions.length === 1 ? current.actions : current.actions.filter((action) => action.id !== actionId),
    }));
  }

  async function saveRoutine() {
    setIsSaving(true);
    setError("");

    try {
      if (form.actions.some((action) => action.type === "send_message" && !action.templateId)) {
        throw new Error("Escolha um template para cada ação Enviar mensagem.");
      }

      const url = form.id?.startsWith("rec") ? `/api/airtable/routines?id=${encodeURIComponent(form.id)}` : "/api/airtable/routines";
      const response = await fetch(url, {
        method: form.id?.startsWith("rec") ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível salvar a rotina."));

      const data = (await response.json()) as { routine?: Routine };
      if (data.routine) {
        const savedRoutine = data.routine;
        setRoutines((current) => {
          const exists = current.some((routine) => routine.id === savedRoutine.id);
          return exists ? current.map((routine) => (routine.id === savedRoutine.id ? savedRoutine : routine)) : [savedRoutine, ...current];
        });
      }

      setIsDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a rotina.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRoutine(routine: Routine) {
    if (!routine.id.startsWith("rec")) {
      setRoutines((current) => current.filter((item) => item.id !== routine.id));
      return;
    }

    setError("");
    const response = await fetch(`/api/airtable/routines?id=${encodeURIComponent(routine.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await readApiMessage(response, "Não foi possível remover a rotina."));
      return;
    }

    setRoutines((current) => current.filter((item) => item.id !== routine.id));
  }

  async function saveTemplate() {
    setIsSavingTemplate(true);
    setTemplateError("");

    try {
      const response = await fetch("/api/airtable/message-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateForm),
      });

      if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível criar o template de mensagem."));

      const data = (await response.json()) as { template?: RoutineMessageTemplate };
      if (data.template) {
        setMessageTemplates((current) => [data.template!, ...current].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")));
      }
      setIsTemplateDialogOpen(false);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Não foi possível criar o template de mensagem.");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  function applyTarget(value: string) {
    const target = targetOptions.find((option) => option.id === value || option.label === value);
    updateForm({ targetId: target?.id ?? value, targetLabel: target?.label ?? value, targetColor: target?.color ?? "" });
  }

  function applyAssistantPrompt() {
    setForm((current) => ({ ...current, actions: parsePromptToActions(assistantPrompt) }));
  }

  return (
    <div className="flex min-h-full w-full flex-col bg-background">
      <header className="flex min-h-15.25 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Workflow className="h-5 w-5 text-theme-primary" />
          <h1 className="truncate text-xl font-semibold text-foreground">Rotinas</h1>
        </div>
        {activeTab === "templates" ? (
          <Button onClick={openNewTemplate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo template
          </Button>
        ) : (
          <Button onClick={openNewRoutine} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova rotina
          </Button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RoutineTab)} className="gap-5">
          <TabsList variant="line" className="h-10 gap-6">
            <TabsTrigger value="routines" className="px-0">Rotinas</TabsTrigger>
            <TabsTrigger value="templates" className="px-0">Template de mensagens</TabsTrigger>
            <TabsTrigger value="attachments" className="px-0">Anexos</TabsTrigger>
            <TabsTrigger value="info" className="px-0">Informações</TabsTrigger>
          </TabsList>

          <TabsContent value="routines" className="flex flex-col gap-5">
            <section className="grid gap-3 md:grid-cols-3">
              <Metric label="Rotinas ativas" value={stats.active} />
              <Metric label="Gatilhos automáticos" value={stats.triggerBased} />
              <Metric label="Ações configuradas" value={stats.actions} />
            </section>

            <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-sm md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rotina, gatilho ou alvo" className="pl-9" />
              </div>
              <Select value={triggerFilter} onValueChange={(value) => setTriggerFilter(value as RoutineTrigger | "all")}>
                <SelectTrigger className="w-full md:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os gatilhos</SelectItem>
                  {triggerOrder.map((trigger) => (
                    <SelectItem key={trigger} value={trigger}>
                      {triggerLabels[trigger]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
              <div className="grid grid-cols-[140px_minmax(0,1fr)_160px_110px] border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden">
                <span>Gatilho</span>
                <span>Descrição</span>
                <span>Alvo</span>
                <span className="text-right">Ações</span>
              </div>

              {isLoading ? (
                <div className="flex h-44 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando rotinas
                </div>
              ) : filteredRoutines.length === 0 ? (
                <div className="flex h-44 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                  <Workflow className="h-8 w-8" />
                  Nenhuma rotina encontrada.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredRoutines.map((routine) => (
                    <RoutineRow key={routine.id} routine={routine} onOpen={() => openRoutine(routine)} onDelete={() => void deleteRoutine(routine)} />
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="templates">
            <MessageTemplatesPanel
              templates={messageTemplates}
              isLoading={isLoading || isTemplatesLoading}
              error={templateError}
              onRefresh={() => void loadMessageTemplates()}
              onCreate={openNewTemplate}
            />
          </TabsContent>

          <TabsContent value="attachments">
            <EmptyRoutineSection icon={CopyPlus} title="Nenhum anexo configurado." />
          </TabsContent>

          <TabsContent value="info">
            <EmptyRoutineSection icon={Bot} title="Nenhuma informação cadastrada." />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>{form.id ? "Editar rotina" : "Nova rotina"}</DialogTitle>
            <DialogDescription>Configure o gatilho e a sequência de ações que será executada para cada contato elegível.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 px-5 py-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
              <Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="Nome da rotina" />
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>Ativa</span>
                <Switch checked={form.active} onCheckedChange={(active) => updateForm({ active })} />
              </label>
            </div>

            <Textarea value={form.description} onChange={(event) => updateForm({ description: event.target.value })} placeholder="Descrição curta da rotina" className="min-h-20" />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Gatilho</label>
                <Select
                  value={form.trigger}
                  onValueChange={(value) =>
                    updateForm({
                      trigger: value as RoutineTrigger,
                      targetId: "",
                      targetLabel: "",
                      targetColor: "",
                      specificDate: value === "specific_date" ? form.specificDate : "",
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {triggerOrder.map((trigger) => (
                      <SelectItem key={trigger} value={trigger}>
                        {triggerLabels[trigger]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <TargetField form={form} targetOptions={targetOptions} onApplyTarget={applyTarget} onUpdate={updateForm} />
            </div>

            <section className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4 text-theme-primary" />
                Assistente de ações
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <Textarea value={assistantPrompt} onChange={(event) => setAssistantPrompt(event.target.value)} placeholder="Ex: depois de 10 minutos criar aviso, depois de 10 minutos criar tarefa para ver o repasse" className="min-h-16" />
                <Button type="button" variant="outline" onClick={applyAssistantPrompt} disabled={!assistantPrompt.trim()} className="gap-2">
                  <Wand2 className="h-4 w-4" />
                  Interpretar
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Ações da rotina</h2>
                <Button type="button" variant="outline" size="sm" onClick={() => updateForm({ actions: [...form.actions, createEmptyAction(form.actions.length)] })} className="gap-2">
                  <CopyPlus className="h-4 w-4" />
                  Adicionar ação
                </Button>
              </div>

              <div className="space-y-3">
                {form.actions.map((action, index) => (
                  <ActionEditor
                    key={action.id}
                    action={action}
                    index={index}
                    users={users}
                    tags={tags}
                    messageTemplates={messageTemplates}
                    onChange={(patch) => updateAction(action.id, patch)}
                    onRemove={() => removeAction(action.id)}
                  />
                ))}
              </div>
            </section>
          </div>

          <DialogFooter className="border-t border-border px-5 py-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="gap-2">
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={() => void saveRoutine()} disabled={isSaving || !form.name.trim() || hasInvalidMessageAction} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo template de mensagem</DialogTitle>
            <DialogDescription>Crie um template no Airtable para usar nas ações de envio das rotinas.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {templateError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {templateError}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <Input value={templateForm.label} onChange={(event) => setTemplateForm((current) => ({ ...current, label: event.target.value }))} placeholder="Nome do template" />
              <Select value={templateForm.type} onValueChange={(type) => setTemplateForm((current) => ({ ...current, type }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  {templateTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Textarea value={templateForm.content} onChange={(event) => setTemplateForm((current) => ({ ...current, content: event.target.value }))} placeholder="Mensagem do template" className="min-h-40" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)} className="gap-2">
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={() => void saveTemplate()} disabled={isSavingTemplate || !templateForm.label.trim() || !templateForm.content.trim()} className="gap-2">
              {isSavingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function MessageTemplatesPanel({
  templates,
  isLoading,
  error,
  onRefresh,
  onCreate,
}: {
  templates: RoutineMessageTemplate[];
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
  onCreate: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{templates.length} templates disponíveis no Airtable</div>
        <Button type="button" variant="outline" onClick={onRefresh} disabled={isLoading} className="gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Recarregar
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
        <div className="grid grid-cols-[150px_minmax(0,1fr)_72px] border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden">
          <span>Tipo</span>
          <span>Descrição</span>
          <span className="text-right">Ação</span>
        </div>

        {isLoading ? (
          <div className="flex h-44 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando templates
          </div>
        ) : templates.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <MessageSquareText className="h-8 w-8" />
            Nenhum template encontrado.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {templates.map((template) => (
              <TemplateRow key={template.id} template={template} />
            ))}
          </div>
        )}
      </div>

      <Button type="button" variant="outline" onClick={onCreate} className="h-11 justify-center gap-2 text-base">
        <Plus className="h-4 w-4" />
        Adicionar novo Template de mensagem
      </Button>
    </section>
  );
}

function TemplateRow({ template }: { template: RoutineMessageTemplate }) {
  const type = template.type?.trim() || "Mensagem";
  const color = template.color || templateTypeColors[type.toLowerCase()] || "#4b5563";
  const description = template.description || template.content || "Sem descrição cadastrada.";

  return (
    <div className="grid gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[150px_minmax(0,1fr)_72px] md:items-center">
      <Badge className="w-fit max-w-full border-0 px-3 py-1 text-white" style={{ backgroundColor: color, color: getReadableTextColor(color) }}>
        <span className="truncate">{type}</span>
      </Badge>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{template.label}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="icon" title="Editar template" disabled>
          <Edit3 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptyRoutineSection({ icon: Icon, title }: { icon: typeof Bot; title: string }) {
  return (
    <section className="flex h-64 flex-col items-center justify-center gap-3 rounded-md border border-border bg-card text-sm text-muted-foreground shadow-sm">
      <Icon className="h-8 w-8" />
      {title}
    </section>
  );
}

function RoutineRow({ routine, onOpen, onDelete }: { routine: Routine; onOpen: () => void; onDelete: () => void }) {
  const color = getRoutineColor(routine);

  return (
    <div className="grid gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[140px_minmax(0,1fr)_160px_110px] md:items-center">
      <Badge className="w-fit border-0 px-3 py-1 text-white" style={{ backgroundColor: triggerColors[routine.trigger] }}>
        {triggerLabels[routine.trigger]}
      </Badge>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpen} className="truncate text-left text-sm font-semibold text-foreground hover:text-theme-primary">
            {routine.name}
          </button>
          {!routine.active ? <Badge variant="outline">Inativa</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">{routine.description || `${routine.actions.length} ações configuradas`}</p>
      </div>

      <Badge className="w-fit max-w-full border-0 px-3 py-1" style={{ backgroundColor: color, color: getReadableTextColor(color) }}>
        <span className="truncate">{getTargetLabel(routine)}</span>
      </Badge>

      <div className="flex justify-end gap-1">
        {routine.trigger === "manual" ? (
          <Button type="button" variant="ghost" size="icon" title="Executar manualmente">
            <Play className="h-4 w-4" />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" onClick={onOpen} title="Editar">
          <Edit3 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} title="Excluir">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TargetField({
  form,
  targetOptions,
  onApplyTarget,
  onUpdate,
}: {
  form: RoutineForm;
  targetOptions: Array<{ id: string; label: string; color?: string }>;
  onApplyTarget: (value: string) => void;
  onUpdate: (patch: Partial<RoutineForm>) => void;
}) {
  if (form.trigger === "manual") {
    return (
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">Alvo</label>
        <div className="flex h-9 items-center rounded-md border border-border px-3 text-sm text-muted-foreground">Executada pelo usuário</div>
      </div>
    );
  }

  if (form.trigger === "specific_date") {
    return (
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">Data específica</label>
        <Input type="date" value={form.specificDate ?? ""} onChange={(event) => onUpdate({ specificDate: event.target.value, targetLabel: event.target.value })} />
      </div>
    );
  }

  if (form.trigger === "birthday") {
    return (
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">Aniversário</label>
        <label className="flex h-9 items-center justify-between rounded-md border border-border px-3 text-sm">
          <span>{form.birthdayEnabled ? "Ligado" : "Desligado"}</span>
          <Switch checked={form.birthdayEnabled} onCheckedChange={(birthdayEnabled) => onUpdate({ birthdayEnabled })} />
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-muted-foreground">Alvo</label>
      <Select value={form.targetId || form.targetLabel} onValueChange={onApplyTarget}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={form.trigger === "tag" ? "Escolher tag" : "Escolher status"} />
        </SelectTrigger>
        <SelectContent>
          {targetOptions.map((option) => (
            <SelectItem key={`${option.id}-${option.label}`} value={option.id || option.label}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color || triggerColors[form.trigger] }} />
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ActionEditor({
  action,
  index,
  users,
  tags,
  messageTemplates,
  onChange,
  onRemove,
}: {
  action: RoutineAction;
  index: number;
  users: UserOption[];
  tags: ChatTag[];
  messageTemplates: RoutineMessageTemplate[];
  onChange: (patch: Partial<RoutineAction>) => void;
  onRemove: () => void;
}) {
  const selectedTemplate = messageTemplates.find((template) => template.id === action.templateId);
  const usableMessageTemplates = messageTemplates.filter((template) => template.content);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between bg-[#5b5a43] px-3 py-2 text-xs font-medium text-white">
        <span className="flex items-center gap-1">
          <Clock3 className="h-3.5 w-3.5" />
          {action.delayMinutes ? `${action.delayMinutes} minutos` : "Nenhum intervalo"}
        </span>
        <span>{index + 1}ª ação</span>
      </div>

      <div className="grid gap-3 p-3 md:grid-cols-[170px_120px_minmax(0,1fr)_160px_auto] md:items-center">
        <Select
          value={action.type}
          onValueChange={(type) => {
            const actionType = type as RoutineActionType;
            onChange({
              type: actionType,
              subject: actionType === "send_message" ? "" : action.subject,
              message: actionType === "send_message" ? "" : action.message,
              templateId: actionType === "send_message" ? action.templateId : "",
              templateLabel: actionType === "send_message" ? action.templateLabel : "",
            });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actionTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {actionLabels[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Input type="number" min={0} value={action.delayMinutes} onChange={(event) => onChange({ delayMinutes: Math.max(0, Number(event.target.value)) })} className="pr-10" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">min</span>
        </div>

        {action.type === "send_message" ? (
          <Select
            value={action.templateId || "none"}
            onValueChange={(templateId) => {
              const template = usableMessageTemplates.find((item) => item.id === templateId);
              onChange({ templateId: templateId === "none" ? "" : templateId, templateLabel: template?.label ?? "" });
            }}
          >
            <SelectTrigger className="w-full md:col-span-2">
              <SelectValue placeholder="Template da mensagem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Escolher template</SelectItem>
              {usableMessageTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <>
            <Input value={action.subject ?? ""} onChange={(event) => onChange({ subject: event.target.value })} placeholder="Título da ação" />

            <Select value={action.responsibleUserId || "none"} onValueChange={(responsibleUserId) => onChange({ responsibleUserId: responsibleUserId === "none" ? "" : responsibleUserId })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável</SelectItem>
                {users.filter((user) => user.id).map((user) => (
                  <SelectItem key={user.id} value={user.id!}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <Button type="button" variant="ghost" size="icon" onClick={onRemove} title="Remover ação" className={cn(index === 0 && "md:opacity-60")}>
          <Trash2 className="h-4 w-4" />
        </Button>

        {action.type === "send_message" ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground md:col-span-5">
            {selectedTemplate ? (
              <>
                <p className="mb-1 font-medium text-foreground">{selectedTemplate.label}</p>
                <p className="line-clamp-3 whitespace-pre-wrap">{selectedTemplate.content}</p>
              </>
            ) : (
              "Escolha o template que será usado no envio real."
            )}
          </div>
        ) : null}

        {action.type === "add_tag" ? (
          <Select
            value={action.tagId || "none"}
            onValueChange={(tagId) => {
              const tag = tags.find((item) => item.id === tagId);
              onChange({ tagId: tagId === "none" ? "" : tagId, tagLabel: tag?.label ?? "" });
            }}
          >
            <SelectTrigger className="w-full md:col-span-5">
              <SelectValue placeholder="Tag para vincular" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Escolher tag</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {action.type === "webhook" ? (
          <Input value={action.webhookUrl ?? ""} onChange={(event) => onChange({ webhookUrl: event.target.value })} placeholder="URL do webhook" className="md:col-span-5" />
        ) : null}
      </div>
    </div>
  );
}
