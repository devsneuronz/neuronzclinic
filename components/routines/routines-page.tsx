"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ChatStatusOption } from "@/lib/chat-status";
import type { ChatTag } from "@/lib/chat-tags";
import { getReadableTextColor } from "@/lib/chat-tags";
import { actionLabels, createEmptyAction, triggerColors, triggerOptions, type Routine, type RoutineAction, type RoutineActionType, type RoutineMessageTemplate, type RoutineTrigger } from "@/lib/routines";
import { uploadSavedAttachmentFile, type SavedAttachmentKind } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
import { Bot, Clock3, CopyPlus, CornerDownRight, FileText, Loader2, Paperclip, PenSquare, Play, Plus, RefreshCw, Save, Search, Sparkles, Target, Trash2, Upload, Wand2, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type RoutineForm = Omit<Routine, "id" | "createdAt" | "updatedAt"> & { id?: string };

type UserOption = {
  id?: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "user";
};

type RoutineTab = "routines" | "templates";

type MessageTemplateForm = {
  label: string;
  type: string;
  content: string;
  media: RoutineMessageTemplate["media"];
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

const actionTypes: RoutineActionType[] = ["create_notice", "create_task", "send_message", "add_tag"];
const templateTypeColors: Record<string, string> = {
  relacionamento: "#7c3aed",
  marketing: "#db00a6",
  vendas: "#008a10",
  aviso: "#e5c933",
  informação: "#4f86d7",
  informacao: "#4f86d7",
};
const MAX_MESSAGE_TEMPLATES = 6;
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

function limitMessageTemplates(templates: RoutineMessageTemplate[] = []) {
  return templates.slice(0, MAX_MESSAGE_TEMPLATES);
}

function getTemplateMediaKind(file: File): Exclude<SavedAttachmentKind, "text"> {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function formatFileSize(size?: number) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
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
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<MessageTemplateForm>({ label: "", type: "Marketing", content: "", media: null });
  const [templateMediaFile, setTemplateMediaFile] = useState<File | null>(null);

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
        setMessageTemplates(limitMessageTemplates(templateData.templates));
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
      setMessageTemplates(limitMessageTemplates(data.templates));
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

      const triggerLabel = triggerOptions.find((opt) => opt.value === routine.trigger)?.label || "";

      return [routine.name, routine.description, routine.targetLabel, triggerLabel].some((value) => value && value.toLowerCase().includes(normalizedQuery));
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

  const hasInvalidMessageAction = form.actions.some((action) => {
    if (action.type !== "send_message") return false;
    if (action.message?.trim()) return false;
    return !action.templateId || !messageTemplates.some((template) => template.id === action.templateId && (template.content || template.media));
  });

  const targetOptions = form.trigger === "tag" ? tags.map((tag) => ({ id: tag.id, label: tag.label, color: tag.color })) : statuses.map((status) => ({ id: status.label, label: status.label, color: status.color }));

  function openNewRoutine() {
    setForm({ ...emptyRoutine, actions: [createEmptyAction(0)] });
    setAssistantPrompt("");
    setIsDialogOpen(true);
  }

  function openNewTemplate() {
    setEditingTemplateId(null);
    setTemplateForm({ label: "", type: "Marketing", content: "", media: null });
    setTemplateMediaFile(null);
    setTemplateError("");
    setIsTemplateDialogOpen(true);
  }

  function openTemplate(template: RoutineMessageTemplate) {
    setEditingTemplateId(template.id);
    setTemplateForm({
      label: template.label,
      type: template.type || "Marketing",
      content: template.content,
      media: template.media ?? null,
    });
    setTemplateMediaFile(null);
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
      if (form.actions.some((action) => action.type === "send_message" && !action.templateId && !action.message?.trim())) {
        throw new Error("Digite uma mensagem ou escolha um template para cada ação Enviar mensagem.");
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
      const isEditingTemplate = Boolean(editingTemplateId);
      const uploadedMedia = templateMediaFile ? await uploadSavedAttachmentFile(templateMediaFile, getTemplateMediaKind(templateMediaFile)) : null;
      const payload = {
        ...templateForm,
        media: uploadedMedia
          ? {
              url: uploadedMedia.mediaUrl,
              fileName: uploadedMedia.fileName,
              mimeType: uploadedMedia.mediaMimeType,
              size: templateMediaFile?.size,
            }
          : templateForm.media,
      };
      const response = await fetch("/api/airtable/message-templates", {
        method: isEditingTemplate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditingTemplate ? { ...payload, id: editingTemplateId } : payload),
      });

      if (!response.ok) throw new Error(await readApiMessage(response, isEditingTemplate ? "Não foi possível atualizar o template de mensagem." : "Não foi possível criar o template de mensagem."));

      const data = (await response.json()) as { template?: RoutineMessageTemplate };
      if (data.template) {
        setMessageTemplates((current) => {
          const exists = current.some((template) => template.id === data.template!.id);
          const nextTemplates = exists ? current.map((template) => (template.id === data.template!.id ? data.template! : template)) : [data.template!, ...current];
          return limitMessageTemplates(nextTemplates.sort((a, b) => a.label.localeCompare(b.label, "pt-BR")));
        });
      }
      setIsTemplateDialogOpen(false);
      setEditingTemplateId(null);
      setTemplateMediaFile(null);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : editingTemplateId ? "Não foi possível atualizar o template de mensagem." : "Não foi possível criar o template de mensagem.");
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
    <div className="flex h-full bg-background">
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex min-h-15.25 items-center justify-between border-b border-border bg-card px-6">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-xl font-semibold text-foreground">Automação</h1>
          </div>
          <Button onClick={activeTab === "templates" ? openNewTemplate : openNewRoutine} className="gap-2 bg-theme-primary text-theme-fgprimary-foreground hover:bg-theme-primary/90">
            <Plus className="h-4 w-4" />
            {activeTab === "templates" ? "Novo template" : "Nova rotina"}
          </Button>
        </header>
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="w-full flex flex-col flex-1 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RoutineTab)} className="flex flex-col flex-1 overflow-hidden gap-0">
              <div className="bg-card py-3 px-4 border-b border-border shrink-0 flex justify-center">
                <TabsList className="w-full md:w-106 gap-1.5 rounded-full h-11! bg-secondary/50 border border-border/40">
                  <TabsTrigger
                    value="routines"
                    className="data-[state=active]:border-theme-border group relative data-[state=active]:bg-theme-bg px-3.5 rounded-full text-xs font-medium transition-all gap-2 cursor-pointer data-[state=active]:shadow-xs data-[state=active]:text-theme-fg!"
                  >
                    <Sparkles className="group-data-[state=active]:text-theme-primary h-2 w-2 transition-all duration-300" />
                    <span className="truncate">Rotinas de IA</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="templates"
                    className="data-[state=active]:border-theme-border group relative data-[state=active]:bg-theme-bg px-3.5 rounded-full text-xs font-medium transition-all gap-2 cursor-pointer data-[state=active]:shadow-xs data-[state=active]:text-theme-fg!"
                  >
                    <FileText className="group-data-[state=active]:text-theme-primary h-2 w-2 transition-all duration-300" />
                    <span className="truncate">Templates</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="routines" className="w-full flex-1 flex justify-center overflow-hidden p-6 data-[state=inactive]:hidden! [data-state=active]:flex">
                <div className="w-full max-w-7xl flex flex-col flex-1 overflow-hidden gap-6 outline-hidden">
                  <div className="flex flex-col rounded-xl border border-border bg-card shadow-xs overflow-hidden shrink-0">
                    <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-muted/10">
                      <div className="p-3 md:p-4 flex flex-col justify-center min-w-0">
                        <span className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">Ativas</span>
                        <span className="text-base md:text-2xl font-bold text-foreground mt-0.5 truncate">{stats.active}</span>
                      </div>
                      <div className="p-3 md:p-4 flex flex-col justify-center min-w-0">
                        <span className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">Automáticas</span>
                        <span className="text-base md:text-2xl font-bold text-foreground mt-0.5 truncate">{stats.triggerBased}</span>
                      </div>
                      <div className="p-3 md:p-4 flex flex-col justify-center min-w-0">
                        <span className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">Ações</span>
                        <span className="text-base md:text-2xl font-bold text-foreground mt-0.5 truncate">{stats.actions}</span>
                      </div>
                    </div>
                    <div className="p-3 flex flex-col gap-3 md:flex-row md:items-center justify-between bg-card">
                      <div className="relative flex-1 w-full">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rotina, gatilho ou alvo" className="pl-9 w-full bg-background/50 h-9" />
                      </div>
                      <Select value={triggerFilter} onValueChange={(value) => setTriggerFilter(value as RoutineTrigger | "all")}>
                        <SelectTrigger className="w-full md:w-56 bg-background/50 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os gatilhos</SelectItem>
                          {triggerOptions.map((option) => {
                            const Icon = option.icon;

                            return (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                                  <span>{option.label}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive dynamic-fade-in shrink-0">{error}</div>}

                  <div className="flex flex-col bg-card rounded-xl border border-border shadow-sm overflow-hidden min-h-0">
                    <div className="grid grid-cols-[140px_minmax(0,1fr)_160px_110px] border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden shrink-0 gap-3">
                      <span>Gatilho</span>
                      <span>Descrição</span>
                      <span>Alvo</span>
                      <span className="text-center">Ações</span>
                    </div>

                    {isLoading ? (
                      <div className="flex h-44 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-theme-primary" />
                        <span>Carregando rotinas...</span>
                      </div>
                    ) : filteredRoutines.length === 0 ? (
                      <div className="flex h-44 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground p-6">
                        <Workflow className="h-8 w-8 text-muted-foreground/60 stroke-[1.5]" />
                        <p className="font-medium">Nenhuma rotina encontrada.</p>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto min-h-0 w-full custom-scrollbar">
                        <div className="flex flex-col w-full divide-y divide-border">
                          {filteredRoutines.map((routine) => (
                            <RoutineRow key={routine.id} routine={routine} onOpen={() => openRoutine(routine)} onDelete={() => void deleteRoutine(routine)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <Button type="button" variant="outline" onClick={openNewRoutine} className="h-10 shrink-0 justify-center gap-2 text-xs font-medium bg-card hover:bg-muted/50 border-dashed border-border/80 rounded-xl transition-all">
                    <Plus className="h-4 w-4" />
                    Adicionar nova rotina
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="templates" className="w-full flex-1 flex justify-center overflow-hidden p-4 md:p-6 data-[state=inactive]:hidden! [data-state=active]:flex">
                <div className="w-full max-w-7xl flex flex-col flex-1 overflow-hidden">
                  <MessageTemplatesPanel templates={messageTemplates} isLoading={isLoading || isTemplatesLoading} error={templateError} onRefresh={() => void loadMessageTemplates()} onCreate={openNewTemplate} onEdit={openTemplate} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
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
                      {triggerOptions.map((option) => {
                        const Icon = option.icon;

                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
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
                  <Textarea
                    value={assistantPrompt}
                    onChange={(event) => setAssistantPrompt(event.target.value)}
                    placeholder="Ex: depois de 10 minutos criar aviso, depois de 10 minutos criar tarefa para ver o repasse"
                    className="min-h-16"
                  />
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
                    <ActionEditor key={action.id} action={action} index={index} users={users} tags={tags} messageTemplates={messageTemplates} onChange={(patch) => updateAction(action.id, patch)} onRemove={() => removeAction(action.id)} />
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
        <Dialog
          open={isTemplateDialogOpen}
          onOpenChange={(open) => {
            setIsTemplateDialogOpen(open);
            if (!open) {
              setEditingTemplateId(null);
              setTemplateMediaFile(null);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingTemplateId ? "Editar template de mensagem" : "Novo template de mensagem"}</DialogTitle>
              <DialogDescription>{editingTemplateId ? "Atualize o template usado nas ações de envio das rotinas." : "Crie um template para usar nas ações de envio das rotinas."}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {templateError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{templateError}</div> : null}
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
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Mídia opcional</span>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border bg-muted/20 px-4 py-4 transition hover:bg-muted/40">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background text-theme-primary">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{templateMediaFile?.name || templateForm.media?.fileName || "Selecionar imagem, áudio, vídeo ou documento"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {templateMediaFile ? formatFileSize(templateMediaFile.size) : templateForm.media ? [templateForm.media.mimeType, formatFileSize(templateForm.media.size)].filter(Boolean).join(" · ") : "O arquivo será salvo no campo Midia do template"}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp"
                    className="hidden"
                    onChange={(event) => setTemplateMediaFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {templateForm.media || templateMediaFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setTemplateMediaFile(null);
                      setTemplateForm((current) => ({ ...current, media: null }));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover mídia
                  </Button>
                ) : null}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)} className="gap-2">
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button onClick={() => void saveTemplate()} disabled={isSavingTemplate || !templateForm.label.trim() || (!templateForm.content.trim() && !templateForm.media && !templateMediaFile)} className="gap-2">
                {isSavingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function MessageTemplatesPanel({
  templates,
  isLoading,
  error,
  onRefresh,
  onCreate,
  onEdit,
}: {
  templates: RoutineMessageTemplate[];
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
  onCreate: () => void;
  onEdit: (template: RoutineMessageTemplate) => void;
}) {
  return (
    <section className="flex flex-col overflow-hidden gap-4 md:gap-5">
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="text-sm font-medium text-muted-foreground">{templates.length} templates disponíveis</div>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isLoading} className="gap-2 h-9 bg-card">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-theme-primary" /> : <RefreshCw className="h-4 w-4" />}
          Recarregar
        </Button>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive dynamic-fade-in shrink-0">{error}</div>}

      <div className="flex flex-col flex-1 bg-card rounded-xl border border-border shadow-sm overflow-hidden min-h-0">
        <div className="grid grid-cols-[150px_minmax(0,1fr)_72px] border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden shrink-0 gap-3">
          <span>Tipo</span>
          <span>Descrição</span>
          <span className="text-right">Ação</span>
        </div>

        {isLoading ? (
          <div className="flex h-44 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-theme-primary" />
            <span>Carregando templates...</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground p-6">
            <FileText className="h-8 w-8 text-muted-foreground/60 stroke-[1.5]" />
            <p className="font-medium">Nenhum template encontrado.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-border min-h-0 w-full custom-scrollbar">
            <div className="flex flex-col w-full divide-y divide-border">
              {templates.map((template) => (
                <TemplateRow key={template.id} template={template} onEdit={() => onEdit(template)} />
              ))}
            </div>
          </div>
        )}
      </div>

      <Button type="button" variant="outline" onClick={onCreate} className="h-10 shrink-0 justify-center gap-2 text-xs font-medium bg-card hover:bg-muted/50 border-dashed border-border/80 rounded-xl transition-all">
        <Plus className="h-4 w-4" />
        Adicionar novo Template de mensagem
      </Button>
    </section>
  );
}

function TemplateRow({ template, onEdit }: { template: RoutineMessageTemplate; onEdit: () => void }) {
  const type = template.type?.trim() || "Mensagem";
  const color = template.color || templateTypeColors[type.toLowerCase()] || "#4b5563";
  const description = template.description || template.content || "Sem descrição cadastrada.";

  return (
    <div className="relative grid gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[150px_minmax(0,1fr)_72px] md:items-center">
      <Badge className="w-fit max-w-full border-0 px-3 py-1 text-white" style={{ backgroundColor: color, color: getReadableTextColor(color) }}>
        <span className="truncate">{type}</span>
      </Badge>

      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
          <span className="truncate">{template.label}</span>
          {template.media ? <Paperclip className="h-3.5 w-3.5 shrink-0 text-theme-primary" aria-label="Template com mídia" /> : null}
        </p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="absolute top-1 right-2 md:static md:flex md:justify-end">
        <Button type="button" variant="ghost" size="icon" title="Editar template" onClick={onEdit}>
          <PenSquare className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function RoutineRow({ routine, onOpen, onDelete }: { routine: Routine; onOpen: () => void; onDelete: () => void }) {
  const color = getRoutineColor(routine);
  const currentTrigger = triggerOptions.find((opt) => opt.value === routine.trigger);
  const TriggerIcon = currentTrigger?.icon;

  return (
    <div className="relative grid gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[140px_minmax(0,1fr)_160px_110px] md:items-center">
      <Badge className="w-fit border-0 px-2.5 py-0.5 text-xs font-semibold rounded-sm shadow-xs flex items-center gap-1.5" style={{ backgroundColor: triggerColors[routine.trigger], color: "#fff" }}>
        {TriggerIcon && <TriggerIcon className="h-3.5 w-3.5 shrink-0" />}
        <span>{currentTrigger?.label}</span>
      </Badge>

      <div className="flex flex-col gap-4 min-[400px]:flex-row min-[400px]:justify-between md:contents ">
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onOpen} className="truncate text-left text-sm font-semibold text-foreground hover:text-theme-primary transition-colors focus:outline-hidden">
              {routine.name}
            </button>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center p-1">
                    <span className="relative flex h-2 w-2">
                      {routine.active ? (
                        <>
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                        </>
                      ) : (
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500/40 "></span>
                      )}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs font-medium px-2 py-1">
                  {routine.active ? "Rotina ativa" : "Rotina inativa"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="truncate text-xs text-muted-foreground">{routine.description || `${routine.actions.length} ${routine.actions.length === 1 ? "ação configurada" : "ações configuradas"}`}</p>
        </div>

        <div className="flex flex-col gap-1 min-w-0 w-fit md:w-full pt-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 md:hidden">Alvo do gatilho</span>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 max-md:hidden" />
            <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 md:hidden" />
            <Badge
              className="w-fit max-w-full border px-2.5 py-0.5 text-xs font-medium rounded-full"
              style={{
                backgroundColor: `${color}50`,
                borderColor: `${color}40`,
                color: getReadableTextColor(color),
              }}
            >
              <span className="truncate">{getTargetLabel(routine)}</span>
            </Badge>
          </div>
        </div>
      </div>

      <div className="absolute top-1 right-1 md:static gap-1 flex md:justify-end">
        {routine.trigger === "manual" ? (
          <Button type="button" variant="ghost" size="icon" title="Executar manualmente">
            <Play className="h-4 w-4" />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" onClick={onOpen} title="Editar">
          <PenSquare className="h-4 w-4" />
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
  const usableMessageTemplates = messageTemplates.filter((template) => template.content || template.media);
  const messageMode = action.templateId ? "template" : "custom";

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
          <div className="grid gap-3 md:col-span-2 md:grid-cols-[160px_minmax(0,1fr)]">
            <Select
              value={messageMode}
              onValueChange={(mode) =>
                onChange(
                  mode === "custom"
                    ? { templateId: "", templateLabel: "" }
                    : { message: "", templateId: usableMessageTemplates[0]?.id || "", templateLabel: usableMessageTemplates[0]?.label || "" },
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Digitar mensagem</SelectItem>
                <SelectItem value="template">Usar template</SelectItem>
              </SelectContent>
            </Select>

            {messageMode === "template" ? (
              <Select
                value={action.templateId || "none"}
                onValueChange={(templateId) => {
                  const template = usableMessageTemplates.find((item) => item.id === templateId);
                  onChange({ message: "", templateId: templateId === "none" ? "" : templateId, templateLabel: template?.label ?? "" });
                }}
              >
                <SelectTrigger className="w-full">
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
              <Textarea
                value={action.message ?? ""}
                onChange={(event) => onChange({ message: event.target.value, templateId: "", templateLabel: "" })}
                placeholder="Digite a mensagem que será enviada"
                className="min-h-24 resize-y"
              />
            )}
          </div>
        ) : (
          <>
            <Input value={action.subject ?? ""} onChange={(event) => onChange({ subject: event.target.value })} placeholder="Título da ação" />

            <Select value={action.responsibleUserId || "none"} onValueChange={(responsibleUserId) => onChange({ responsibleUserId: responsibleUserId === "none" ? "" : responsibleUserId })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável</SelectItem>
                {users
                  .filter((user) => user.id)
                  .map((user) => (
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
            {messageMode === "custom" ? (
              action.message?.trim() ? (
                <>
                  <p className="mb-1 font-medium text-foreground">Mensagem personalizada</p>
                  <p className="whitespace-pre-wrap">{action.message}</p>
                </>
              ) : (
                "Digite a mensagem que será enviada."
              )
            ) : selectedTemplate ? (
              <>
                <p className="mb-1 font-medium text-foreground">{selectedTemplate.label}</p>
                {selectedTemplate.content ? <p className="line-clamp-3 whitespace-pre-wrap">{selectedTemplate.content}</p> : null}
                {selectedTemplate.media ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-theme-primary">
                    <Paperclip className="h-3.5 w-3.5" />
                    {selectedTemplate.media.fileName}
                  </p>
                ) : null}
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

        {action.type === "webhook" ? <Input value={action.webhookUrl ?? ""} onChange={(event) => onChange({ webhookUrl: event.target.value })} placeholder="URL do webhook" className="md:col-span-5" /> : null}
      </div>
    </div>
  );
}
