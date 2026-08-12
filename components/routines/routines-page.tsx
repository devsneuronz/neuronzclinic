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
import { messageDirectives } from "@/lib/message-directives";
import { getTriggerOptionConflict, validateRoutineTriggerLogic, type RoutineTriggerIssue } from "@/lib/routine-trigger-rules";
import {
  actionLabels,
  createEmptyAction,
  createEmptyCondition,
  createEmptyConditionGroup,
  getDefaultComparisonOperator,
  triggerColors,
  triggerOptions,
  type Routine,
  type RoutineAction,
  type RoutineActionType,
  type RoutineCondition,
  type RoutineConditionGroup,
  type RoutineMessageTemplate,
  type RoutineTrigger,
} from "@/lib/routines";
import type { ChatRecord } from "@/lib/supabase-rest";
import { uploadSavedAttachmentFile, type SavedAttachmentKind } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock3,
  CopyPlus,
  CornerDownRight,
  FileText,
  GitFork,
  GripVertical,
  Loader2,
  Paperclip,
  PenSquare,
  Play,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  Target,
  Trash2,
  Upload,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Label } from "../ui/label";
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
  executionTime: "09:00",
  executionMode: "immediate",
  maxExecutionsPerContact: 1,
  birthdayEnabled: true,
  conditionOperator: "all",
  conditionGroups: [createEmptyConditionGroup()],
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
    targetColor: "#db351f",
    executionTime: "09:00",
    executionMode: "scheduled",
    maxExecutionsPerContact: 1,
    birthdayEnabled: false,
    conditionOperator: "all",
    conditionGroups: [],
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
    executionTime: "09:00",
    executionMode: "scheduled",
    maxExecutionsPerContact: 1,
    birthdayEnabled: true,
    conditionOperator: "all",
    conditionGroups: [],
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
const intervalOptions = [
  { label: "Nenhum", minutes: 0 },
  { label: "Segundos", minutes: 1 / 60 },
  { label: "Minutos", minutes: 1 },
  { label: "Horas", minutes: 60 },
  { label: "Dias", minutes: 1440 },
  { label: "Semanas", minutes: 10080 },
  { label: "Meses", minutes: 43200 },
];
const templateTypeOptions = ["Relacionamento", "Marketing", "Vendas", "Aviso", "Informação"];

function getIntervalOption(label?: string) {
  return intervalOptions.find((option) => option.label === label) ?? intervalOptions[2];
}

function getIntervalAmount(action: RoutineAction) {
  if (action.intervalLabel === "Nenhum") return 0;
  if (typeof action.intervalAmount === "number" && Number.isFinite(action.intervalAmount)) return action.intervalAmount;

  const option = getIntervalOption(action.intervalLabel);
  if (!option.minutes) return 0;

  return Number.isFinite(action.delayMinutes) ? action.delayMinutes / option.minutes : 0;
}

function formatInterval(action: RoutineAction) {
  const label = action.intervalLabel || (action.delayMinutes ? "Minutos" : "Nenhum");
  const amount = getIntervalAmount({ ...action, intervalLabel: label });

  if (label === "Nenhum" || !amount) return "Nenhum intervalo";
  return `${amount} ${label.toLowerCase()}`;
}

function cloneRoutine(routine: Routine): RoutineForm {
  const conditionGroups = routine.conditionGroups?.length
    ? routine.conditionGroups.map((group) => ({ ...group, conditions: group.conditions.map((condition) => ({ ...condition })) }))
    : [
        {
          id: crypto.randomUUID(),
          operator: "all" as const,
          conditions: [{ ...createEmptyCondition(routine.trigger), value: routine.specificDate || routine.targetLabel, targetId: routine.targetId, targetLabel: routine.targetLabel, targetColor: routine.targetColor }],
        },
      ];
  return {
    id: routine.id,
    name: routine.name,
    description: routine.description,
    trigger: routine.trigger,
    targetId: routine.targetId,
    targetLabel: routine.targetLabel,
    targetColor: routine.targetColor,
    specificDate: routine.specificDate,
    executionTime: routine.executionTime || "09:00",
    executionMode: routine.executionMode || (routine.trigger === "manual" ? "immediate" : "scheduled"),
    maxExecutionsPerContact: routine.maxExecutionsPerContact || 1,
    birthdayEnabled: routine.birthdayEnabled,
    conditionOperator: routine.conditionOperator || "all",
    conditionGroups,
    active: routine.active,
    actions: routine.actions.length > 0 ? routine.actions.map((action) => ({ ...action })) : [createEmptyAction(0)],
  };
}

function getTargetLabel(routine: Routine | RoutineForm) {
  if (routine.trigger === "manual") return "Manual";
  if (routine.trigger === "birthday") return routine.birthdayEnabled ? "Ligado" : "Desligado";
  if (routine.trigger === "specific_date") return routine.specificDate || "Definir data";
  if (routine.trigger === "specific_message" || routine.trigger === "ai_message") return routine.targetLabel || "Definir mensagem";
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
  return templates;
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

function MessageDirectiveTextarea({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
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
    <div className="space-y-1.5">
      <div className="relative">
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
          placeholder={placeholder}
          className={className}
        />
        {directiveSuggestions.length > 0 && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-80 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm shadow-xl backdrop-blur-md">
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
      <p className="text-[11px] text-muted-foreground">Para ver as diretivas disponiveis, digite %. Ex: %nome%.</p>
    </div>
  );
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
  const [templatePendingDelete, setTemplatePendingDelete] = useState<RoutineMessageTemplate | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);
  const [routinePendingDelete, setRoutinePendingDelete] = useState<Routine | null>(null);
  const [isDeletingRoutine, setIsDeletingRoutine] = useState(false);
  const [togglingRoutineId, setTogglingRoutineId] = useState<string | null>(null);
  const [routinePendingRun, setRoutinePendingRun] = useState<Routine | null>(null);
  const [runContacts, setRunContacts] = useState<ChatRecord[]>([]);
  const [runContactSearch, setRunContactSearch] = useState("");
  const [isLoadingRunContacts, setIsLoadingRunContacts] = useState(false);
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);
  const [runRoutineMessage, setRunRoutineMessage] = useState("");
  const [draggedActionId, setDraggedActionId] = useState<string | null>(null);
  const [dragOverActionId, setDragOverActionId] = useState<string | null>(null);
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
      fetch("/api/routines", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error(await readApiMessage(response, "Não foi possível carregar rotinas."));
        return response.json() as Promise<{ routines?: Routine[] }>;
      }),
      fetch("/api/chat-options", { cache: "no-store" }).then((response) => response.json() as Promise<{ tags?: ChatTag[]; statuses?: ChatStatusOption[] }>),
      fetch("/api/users", { cache: "no-store" }).then((response) => response.json() as Promise<{ users?: UserOption[] }>),
      fetch("/api/message-templates", { cache: "no-store" })
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
      const response = await fetch("/api/message-templates", { cache: "no-store" });
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
      const routineTriggers = routine.conditionGroups?.flatMap((group) => group.conditions.map((condition) => condition.type)) ?? [routine.trigger];
      if (triggerFilter !== "all" && !routineTriggers.includes(triggerFilter)) return false;
      if (!normalizedQuery) return true;

      const triggerLabel = routineTriggers.map((trigger) => triggerOptions.find((opt) => opt.value === trigger)?.label || "").join(" ");

      return [routine.name, routine.description, routine.targetLabel, triggerLabel].some((value) => value && value.toLowerCase().includes(normalizedQuery));
    });
  }, [query, routines, triggerFilter]);

  const stats = useMemo(
    () => ({
      active: routines.filter((routine) => routine.active).length,
      triggerBased: routines.filter((routine) => ["tag", "status", "birthday", "specific_message", "ai_message"].includes(routine.trigger)).length,
      actions: routines.reduce((total, routine) => total + routine.actions.length, 0),
    }),
    [routines],
  );

  const hasInvalidMessageAction = form.actions.some((action) => {
    if (action.type !== "send_message") return false;
    if (action.message?.trim()) return false;
    return !action.templateId || !messageTemplates.some((template) => template.id === action.templateId && (template.content || template.media));
  });
  const triggerIssues = useMemo(() => validateRoutineTriggerLogic(form.conditionGroups, form.conditionOperator), [form.conditionGroups, form.conditionOperator]);
  const hasManualTrigger = form.conditionGroups.some((group) => group.conditions.some((condition) => condition.active !== false && condition.type === "manual"));
  const hasSpecificMessageTrigger = form.conditionGroups.some((group) => group.conditions.some((condition) => condition.active !== false && condition.type === "specific_message"));
  const hasExecutionControlError =
    form.maxExecutionsPerContact < 1 || !Number.isInteger(form.maxExecutionsPerContact) || (form.executionMode === "scheduled" && !hasSpecificMessageTrigger && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.executionTime || ""));
  const allGroupsConflict = form.conditionGroups.length > 1 ? validateRoutineTriggerLogic(form.conditionGroups, "all")[0]?.message || "" : "";
  const filteredRunContacts = useMemo(() => {
    const search = runContactSearch.trim().toLowerCase();
    if (!search) return runContacts;
    return runContacts.filter((chat) => [chat.nome_contato, chat.pushname, chat.phone_contact, chat.chat_id].some((value) => value?.toLowerCase().includes(search)));
  }, [runContactSearch, runContacts]);

  function openNewRoutine() {
    setForm({ ...emptyRoutine, conditionGroups: [createEmptyConditionGroup()], actions: [createEmptyAction(0)] });
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

  function reorderActions(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setForm((current) => {
      const sourceIndex = current.actions.findIndex((action) => action.id === sourceId);
      const targetIndex = current.actions.findIndex((action) => action.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const actions = [...current.actions];
      const [moved] = actions.splice(sourceIndex, 1);
      actions.splice(targetIndex, 0, moved);
      return { ...current, actions: actions.map((action, order) => ({ ...action, order })) };
    });
  }

  function moveAction(actionId: string, direction: -1 | 1) {
    setForm((current) => {
      const sourceIndex = current.actions.findIndex((action) => action.id === actionId);
      const targetIndex = sourceIndex + direction;
      if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= current.actions.length) return current;
      const actions = [...current.actions];
      [actions[sourceIndex], actions[targetIndex]] = [actions[targetIndex], actions[sourceIndex]];
      return { ...current, actions: actions.map((action, order) => ({ ...action, order })) };
    });
  }

  function updateConditionGroup(groupId: string, patch: Partial<RoutineConditionGroup>) {
    setForm((current) => ({ ...current, conditionGroups: current.conditionGroups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)) }));
  }

  function updateCondition(groupId: string, conditionId: string, patch: Partial<RoutineCondition>) {
    setForm((current) => ({
      ...current,
      conditionGroups: current.conditionGroups.map((group) => (group.id === groupId ? { ...group, conditions: group.conditions.map((condition) => (condition.id === conditionId ? { ...condition, ...patch } : condition)) } : group)),
    }));
  }

  function removeCondition(groupId: string, conditionId: string) {
    setForm((current) => ({
      ...current,
      conditionGroups: current.conditionGroups.map((group) => (group.id === groupId && group.conditions.length > 1 ? { ...group, conditions: group.conditions.filter((condition) => condition.id !== conditionId) } : group)),
    }));
  }

  function removeConditionGroup(groupId: string) {
    setForm((current) => ({ ...current, conditionGroups: current.conditionGroups.length > 1 ? current.conditionGroups.filter((group) => group.id !== groupId) : current.conditionGroups }));
  }

  async function saveRoutine() {
    setIsSaving(true);
    setError("");

    try {
      if (triggerIssues.length > 0) throw new Error(triggerIssues[0].message);
      if (hasExecutionControlError) throw new Error("Informe um horário válido e um máximo de execuções por contato.");
      if (form.actions.some((action) => action.type === "send_message" && !action.templateId && !action.message?.trim())) {
        throw new Error("Digite uma mensagem ou escolha um template para cada ação Enviar mensagem.");
      }

      const routineId = form.id?.trim();
      const url = routineId ? `/api/routines?id=${encodeURIComponent(routineId)}` : "/api/routines";
      const response = await fetch(url, {
        method: routineId ? "PATCH" : "POST",
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

  function openDeleteRoutineDialog(routine: Routine) {
    setError("");
    setRoutinePendingDelete(routine);
  }

  async function confirmDeleteRoutine() {
    if (!routinePendingDelete) return;

    setIsDeletingRoutine(true);

    try {
      setError("");
      const response = await fetch(`/api/routines?id=${encodeURIComponent(routinePendingDelete.id)}`, { method: "DELETE" });
      if (!response.ok) {
        setError(await readApiMessage(response, "Não foi possível remover a rotina."));
        return;
      }

      setRoutines((current) => current.filter((item) => item.id !== routinePendingDelete.id));
      setRoutinePendingDelete(null);
    } finally {
      setIsDeletingRoutine(false);
    }
  }

  async function toggleRoutineActive(routine: Routine) {
    const nextActive = !routine.active;

    setTogglingRoutineId(routine.id);
    setError("");

    try {
      const response = await fetch(`/api/routines?id=${encodeURIComponent(routine.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...routine, active: nextActive }),
      });

      if (!response.ok) {
        setError(await readApiMessage(response, "Nao foi possivel alterar o status da rotina."));
        return;
      }

      const data = (await response.json()) as { routine?: Routine };
      if (data.routine) {
        setRoutines((current) => current.map((item) => (item.id === routine.id ? data.routine! : item)));
      } else {
        setRoutines((current) => current.map((item) => (item.id === routine.id ? { ...item, active: nextActive } : item)));
      }
    } finally {
      setTogglingRoutineId(null);
    }
  }

  async function openRunRoutineDialog(routine: Routine) {
    setRoutinePendingRun(routine);
    setRunContactSearch("");
    setRunRoutineMessage("");
    setIsLoadingRunContacts(true);
    try {
      const response = await fetch("/api/chat-data?resource=chats&limit=50", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { chats?: ChatRecord[]; message?: string };
      if (!response.ok) throw new Error(data.message || "Não foi possível carregar os contatos.");
      setRunContacts(data.chats ?? []);
    } catch (error) {
      setRunContacts([]);
      setRunRoutineMessage(error instanceof Error ? error.message : "Não foi possível carregar os contatos.");
    } finally {
      setIsLoadingRunContacts(false);
    }
  }

  async function runRoutineForContact(chat: ChatRecord) {
    if (!routinePendingRun || runningRoutineId) return;
    setRunningRoutineId(routinePendingRun.id);
    setRunRoutineMessage("");
    try {
      const triggerResponse = await fetch("/api/routines/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger: "manual",
          executionMode: "manual_override",
          routineId: routinePendingRun.id,
          contactId: chat.id,
          contactAirtableId: chat.ida_contato || "",
          chatId: chat.chat_id,
          contactName: chat.nome_contato || chat.pushname || "",
          contactPhone: chat.phone_contact || chat.chat_id,
          occurredAt: new Date().toISOString(),
          source: "routines-list-manual-override",
        }),
      });
      const triggerData = (await triggerResponse.json().catch(() => ({}))) as { message?: string; matched?: number; actionRuns?: number; actionRunIds?: string[] };
      if (!triggerResponse.ok) throw new Error(triggerData.message || "Não foi possível iniciar a rotina.");
      if (!triggerData.matched) throw new Error("A rotina precisa estar ativa para ser executada.");

      const dueResponse = await fetch("/api/routines/due", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionRunIds: triggerData.actionRunIds ?? [] }),
      });
      const dueData = (await dueResponse.json().catch(() => ({}))) as { message?: string; processed?: number };
      if (!dueResponse.ok) throw new Error(dueData.message || "A rotina foi criada, mas as ações imediatas não puderam ser processadas.");
      const scheduled = Math.max((triggerData.actionRuns ?? 0) - (dueData.processed ?? 0), 0);
      setRunRoutineMessage(scheduled > 0 ? `Rotina iniciada. ${scheduled} ação(ões) ficou(aram) agendada(s).` : "Rotina executada com sucesso.");
    } catch (error) {
      setRunRoutineMessage(error instanceof Error ? error.message : "Não foi possível executar a rotina.");
    } finally {
      setRunningRoutineId(null);
    }
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
      const response = await fetch("/api/message-templates", {
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

  function openDeleteTemplateDialog(template: RoutineMessageTemplate) {
    setTemplateError("");
    setTemplatePendingDelete(template);
  }

  async function confirmDeleteTemplate() {
    if (!templatePendingDelete) return;

    setIsDeletingTemplate(true);
    setTemplateError("");

    try {
      const response = await fetch(`/api/message-templates?id=${encodeURIComponent(templatePendingDelete.id)}`, { method: "DELETE" });
      if (!response.ok) {
        setTemplateError(await readApiMessage(response, "Nao foi possivel remover o template de mensagem."));
        return;
      }

      setMessageTemplates((current) => current.filter((item) => item.id !== templatePendingDelete.id));
      setTemplatePendingDelete(null);
    } finally {
      setIsDeletingTemplate(false);
    }
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
          <Button onClick={activeTab === "templates" ? openNewTemplate : openNewRoutine} className="gap-2 bg-theme-primary text-white primary-foreground hover:bg-theme-primary/90">
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
                    <GitFork className="group-data-[state=active]:text-theme-primary h-2 w-2 transition-all duration-300" />
                    <span className="truncate">Rotinas</span>
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
                          <SelectItem value="all">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0 mx-1" />
                              <span>Todos os gatilhos</span>
                            </div>
                          </SelectItem>

                          {triggerOptions.map((option) => {
                            const Icon = option.icon;

                            const triggerKey = option.value as RoutineTrigger;
                            const iconColor = triggerColors[triggerKey] || "#6b7280";

                            return (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 shrink-0 transition-colors" style={{ color: iconColor }} />
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
                    <div className="grid grid-cols-[140px_minmax(0,1fr)_160px_140px] border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden shrink-0 gap-3">
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
                            <RoutineRow
                              key={routine.id}
                              routine={routine}
                              isTogglingActive={togglingRoutineId === routine.id}
                              onOpen={() => openRoutine(routine)}
                              onRun={() => void openRunRoutineDialog(routine)}
                              onToggleActive={() => void toggleRoutineActive(routine)}
                              onDelete={() => openDeleteRoutineDialog(routine)}
                            />
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
                  <MessageTemplatesPanel
                    templates={messageTemplates}
                    isLoading={isLoading || isTemplatesLoading}
                    error={templateError}
                    onRefresh={() => void loadMessageTemplates()}
                    onCreate={openNewTemplate}
                    onEdit={openTemplate}
                    onDelete={openDeleteTemplateDialog}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-h-[92dvh] max-w-4xl p-0 overflow-hidden gap-0 flex flex-col">
            <DialogHeader className="border-b border-border px-6 py-4 bg-background shrink-0">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <GitFork className="text-theme-primary" />
                {form.id ? "Editar rotina" : "Nova rotina"}
              </DialogTitle>
              <DialogDescription>Configure o gatilho e a sequência de ações que será executada para cada contato elegível.</DialogDescription>
            </DialogHeader>

            <div className="space-y-6 px-6 py-5 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-muted/30 p-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Nome da Rotina</Label>
                    <Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="Ex: Pós-Consulta" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
                    <Tabs value={String(form.active)} onValueChange={(value) => updateForm({ active: value === "true" })}>
                      <TabsList className="h-9! w-full gap-1 bg-secondary/50 border border-border/40 rounded-full">
                        <TabsTrigger value="false" className="text-xs font-medium px-3 data-[state=active]:bg-red-500/20 data-[state=active]:text-red-200!">
                          Inativo
                        </TabsTrigger>
                        <TabsTrigger value="true" className="text-xs font-medium px-3 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-200">
                          Ativo
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
                    <Textarea
                      value={form.description}
                      onChange={(event) => updateForm({ description: event.target.value })}
                      placeholder="Descreva brevemente o objetivo desta automação..."
                      className="h-[52px] resize-none text-xs custom-scrollbar"
                    />
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/30 p-4 flex flex-col gap-4">
                  <div>
                    <h3 className="font-bold tracking-tight text-foreground">Configurações</h3>
                    <p className="text-xs text-muted-foreground">Quando e quantas vezes executar</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 items-start">
                    {hasSpecificMessageTrigger ? (
                      <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-xs text-muted-foreground">Dispara imediatamente ao receber mensagem específica.</div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">Início da execução</Label>
                        <div className="flex flex-col min-[890px]:flex-row gap-2">
                          <Select value={form.executionMode} onValueChange={(value) => updateForm({ executionMode: value as "scheduled" | "immediate" })}>
                            <SelectTrigger className="h-9 bg-background w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="immediate">Imediatamente</SelectItem>
                              <SelectItem value="scheduled">Horário</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className={cn("transition-all", form.executionMode === "immediate" && "hidden")}>
                            <Input
                              type="time"
                              required
                              value={form.executionTime || ""}
                              onChange={(event) => updateForm({ executionTime: event.target.value })}
                              className={cn("h-9 text-xs w-full", !form.executionTime && "border-destructive")}
                            />
                          </div>
                        </div>

                        <p className="text-[11px] text-muted-foreground leading-tight">
                          {form.executionMode !== "scheduled" ? "Inicia assim que as condições da rotina forem atendidas." : "Inicia no próximo dia se o evento ocorrer após este horário."}
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Execuções por contato</Label>
                      <Input
                        type="number"
                        required
                        min={1}
                        max={1000}
                        step={1}
                        value={form.maxExecutionsPerContact}
                        onChange={(event) =>
                          updateForm({
                            maxExecutionsPerContact: event.target.valueAsNumber || 0,
                          })
                        }
                        className={cn("h-9", form.maxExecutionsPerContact < 1 && "border-destructive")}
                      />
                    </div>
                  </div>

                  {hasExecutionControlError && <p className="text-xs font-medium text-destructive">Preencha os controles de execução obrigatórios.</p>}
                </div>
              </div>

              <div className={cn("rounded-xl border bg-muted/30 p-4 space-y-4 border-border transition-all", triggerIssues.length > 0 && " ring-2 ring-destructive/50 bg-destructive/5")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center text-sm font-medium text-foreground gap-2 h-5">
                    <Zap className="h-4 w-4 text-amber-500 fill-amber-500/20" />
                    {form.conditionGroups.length > 1 ? (
                      <>
                        <span>Executar se</span>

                        <Select value={form.conditionOperator} onValueChange={(value) => updateForm({ conditionOperator: value as "all" | "any" })}>
                          <SelectTrigger className="h-8 w-44 bg-background -my-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" disabled={form.conditionOperator !== "all" && Boolean(allGroupsConflict)}>
                              TODOS os grupos
                            </SelectItem>
                            <SelectItem value="any">QUALQUER grupo</SelectItem>
                          </SelectContent>
                        </Select>
                        <span>atender às condições:</span>
                      </>
                    ) : (
                      <span>Executar se o grupo abaixo atender às condições:</span>
                    )}
                  </div>
                </div>
                {triggerIssues.length > 0 ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <p className="mb-1 flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Combinação de gatilhos inválida
                    </p>
                    {[...new Set(triggerIssues.map((issue) => issue.message))].map((message) => (
                      <p key={message}>• {message}</p>
                    ))}
                  </div>
                ) : allGroupsConflict && form.conditionGroups.length > 1 ? (
                  <p className="text-xs text-muted-foreground">A opção TODOS os grupos está indisponível: {allGroupsConflict}</p>
                ) : null}
                <div className="space-y-2 flex flex-col">
                  {form.conditionGroups.map((group, groupIndex) => (
                    <div key={group.id}>
                      {groupIndex > 0 && <span className="w-full text-center italic text-sm font-semibold">{form.conditionOperator === "all" ? "E" : "OU"}</span>}
                      <ConditionGroupEditor
                        group={group}
                        groupIndex={groupIndex}
                        tags={tags}
                        statuses={statuses}
                        allGroups={form.conditionGroups}
                        routineOperator={form.conditionOperator}
                        issues={triggerIssues}
                        canRemoveGroup={form.conditionGroups.length > 1}
                        onChange={(patch) => updateConditionGroup(group.id, patch)}
                        onConditionChange={(conditionId, patch) => updateCondition(group.id, conditionId, patch)}
                        onAddCondition={() => updateConditionGroup(group.id, { conditions: [...group.conditions, createEmptyCondition("tag")] })}
                        onRemoveCondition={(conditionId) => removeCondition(group.id, conditionId)}
                        onRemoveGroup={() => removeConditionGroup(group.id)}
                      />
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={hasManualTrigger}
                  title={hasManualTrigger ? "O gatilho Manual deve ser usado sozinho." : "Adicionar outro grupo lógico"}
                  className="w-full sm:w-auto gap-2 border-dashed text-xs"
                  onClick={() => updateForm({ conditionGroups: [...form.conditionGroups, { ...createEmptyConditionGroup(), conditions: [createEmptyCondition("tag")] }] })}
                >
                  <GitFork className="h-3.5 w-3.5" />
                  Adicionar grupo de condições
                </Button>
              </div>

              {/* <section className="rounded-xl border border-dashed border-theme-primary/30 bg-theme-primary/2 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-theme-primary">
                  <Bot className="h-4 w-4" />
                  Assistente de ações
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Digite abaixo o fluxo desejado em linguagem natural e nossa IA montará os passos automaticamente.</p>
                <div className="flex flex-col md:flex-row gap-2 items-stretch">
                  <Textarea
                    value={assistantPrompt}
                    onChange={(event) => setAssistantPrompt(event.target.value)}
                    placeholder="Ex: depois de 10 minutos criar aviso, depois de 1 dia disparar template de boas-vindas..."
                    className="min-h-12 flex-1 bg-input resize-y text-xs"
                  />
                  <Button type="button" variant="outline" onClick={applyAssistantPrompt} disabled={!assistantPrompt.trim()} className="gap-2 shrink-0 h-auto self-end md:self-auto text-xs">
                    <Wand2 className="h-3.5 w-3.5 text-blue-500" />
                    Interpretar
                  </Button>
                </div>
              </section> */}

              <hr className="border-border/60" />

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="hidden sm:inline">Então execute estas ações em sequência</span>
                      <span className="inline sm:hidden">Ações</span>
                      <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {form.actions.length} <span className="hidden md:inline">{form.actions.length === 1 ? "ação" : "ações"}</span>
                      </span>
                    </h2>
                    {form.actions.length > 1 ? <p className="text-[11px] text-muted-foreground">Arraste pelo ícone de pontos para alterar a ordem de execução.</p> : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateForm({ actions: [...form.actions, createEmptyAction(form.actions.length)] })}
                    className="gap-2 text-xs border-theme-primary/40 text-theme-primary! hover:bg-theme-primary/20"
                  >
                    <CopyPlus className="h-3.5 w-3.5" />
                    Adicionar ação
                  </Button>
                </div>

                {form.actions.length === 0 ? (
                  <div className="text-center py-8 rounded-xl border border-dashed border-border text-sm text-muted-foreground">Nenhuma ação adicionada a este fluxo ainda.</div>
                ) : (
                  <div className="space-y-0">
                    {form.actions.map((action, index) => {
                      const isFirst = index === 0;
                      const isLast = index === form.actions.length - 1;

                      return (
                        <div
                          key={action.id}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (draggedActionId && draggedActionId !== action.id) setDragOverActionId(action.id);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (draggedActionId) reorderActions(draggedActionId, action.id);
                            setDraggedActionId(null);
                            setDragOverActionId(null);
                          }}
                          className={cn("grid grid-cols-[40px_1fr] rounded-md transition-colors group", dragOverActionId === action.id && "bg-theme-primary/10 ring-1 ring-theme-primary/40")}
                        >
                          <div className="flex flex-col items-center">
                            <div className={cn("w-[3px] bg-theme-primary/30", isFirst ? "h-6 invisible" : "h-6")} />

                            <div className="relative flex items-center justify-center h-10 w-10">
                              {isFirst ? (
                                <svg viewBox="0 -7 11 33" className="absolute inset-0 h-full w-full text-theme-primary/30  not-visited:group-hover:text-theme-primary transition-colors" stroke="currentColor" strokeWidth="2.5" fill="none">
                                  <g id="Camada_1-2" data-name="Camada 1">
                                    <circle cx="6" cy="6" r="6" />
                                    <line x1="6" y1="12" x2="6" y2="26" />
                                  </g>
                                </svg>
                              ) : isLast ? (
                                <>
                                  <svg viewBox="-7 0 14.5 33" className="absolute inset-0 h-full w-full text-theme-primary/30 group-hover:text-theme-primary transition-colors" stroke="currentColor" strokeWidth="2.5" fill="none">
                                    <g id="Camada_1-2" data-name="Camada 1">
                                      <path d="M.5,0v12c0,4.42,3.58,8,8,8h6" />
                                    </g>
                                  </svg>
                                </>
                              ) : (
                                <svg viewBox="-7 0 14.5 33" className="absolute inset-0 h-full w-full text-theme-primary/30 group-hover:text-theme-primary transition-colors" stroke="currentColor" strokeWidth="2.5" fill="none">
                                  <g id="Camada_1-2" data-name="Camada 1">
                                    <path d="M.5,40v-12c0-4.42,3.58-8,8-8h6-6c-4.42,0-8-3.58-8-8V0" />
                                  </g>
                                </svg>
                              )}
                            </div>

                            <div className={cn("w-[3px] flex-1 bg-theme-primary/30", isLast ? "invisible" : "")} />
                          </div>

                          <div className="pb-6 min-w-0 ">
                            <ActionEditor
                              action={action}
                              index={index}
                              users={users}
                              tags={tags}
                              messageTemplates={messageTemplates}
                              canMoveUp={!isFirst}
                              canMoveDown={!isLast}
                              onMoveUp={() => moveAction(action.id, -1)}
                              onMoveDown={() => moveAction(action.id, 1)}
                              onDragStart={(event) => {
                                setDraggedActionId(action.id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", action.id);
                              }}
                              onDragEnd={() => {
                                setDraggedActionId(null);
                                setDragOverActionId(null);
                              }}
                              onChange={(patch) => updateAction(action.id, patch)}
                              onRemove={() => removeAction(action.id)}
                              canRemove={form.actions.length > 1}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <DialogFooter className="border-t border-border px-6 py-4 bg-background shrink-0 z-10">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="gap-2 h-9 text-xs">
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => void saveRoutine()}
                disabled={isSaving || !form.name.trim() || hasInvalidMessageAction || triggerIssues.length > 0 || hasExecutionControlError}
                title={triggerIssues[0]?.message}
                className="gap-2 h-9 text-xs font-bold bg-theme-primary text-white hover:bg-theme-primary/90"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Automação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(routinePendingRun)}
          onOpenChange={(open) => {
            if (!open && !runningRoutineId) setRoutinePendingRun(null);
          }}
        >
          <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle className="text-base">Executar rotina agora</DialogTitle>
              <DialogDescription>Escolha o contato que receberá a execução semimanual de “{routinePendingRun?.name}”. Os gatilhos automáticos não serão avaliados.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={runContactSearch} onChange={(event) => setRunContactSearch(event.target.value)} placeholder="Buscar contato ou telefone" className="pl-9" />
              </div>
              {runRoutineMessage ? <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">{runRoutineMessage}</div> : null}
              <div className="max-h-[50vh] space-y-1 overflow-y-auto custom-scrollbar">
                {isLoadingRunContacts ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando contatos...
                  </div>
                ) : filteredRunContacts.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</div>
                ) : (
                  filteredRunContacts.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      disabled={Boolean(runningRoutineId)}
                      onClick={() => void runRoutineForContact(chat)}
                      className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left hover:border-border hover:bg-muted/40 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{chat.nome_contato || chat.pushname || "Contato sem nome"}</span>
                        <span className="block truncate text-xs text-muted-foreground">{chat.phone_contact || chat.chat_id}</span>
                      </span>
                      {runningRoutineId ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Play className="h-4 w-4 shrink-0 text-theme-primary" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(routinePendingDelete)}
          onOpenChange={(open) => {
            if (!open && !isDeletingRoutine) setRoutinePendingDelete(null);
          }}
        >
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <DialogHeader className="border-b border-border px-6 py-4 bg-background">
              <DialogTitle className="text-lg font-bold">Remover rotina</DialogTitle>
              <DialogDescription>Está ação irá remover a rotina permanentemente.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{routinePendingDelete?.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{routinePendingDelete?.description || "Rotina sem descricao."}</p>
                {routinePendingDelete ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {routinePendingDelete.actions.length} {routinePendingDelete.actions.length === 1 ? "acao configurada" : "acoes configuradas"}
                  </p>
                ) : null}
              </div>
            </div>

            <DialogFooter className="border-t border-border px-6 py-4 bg-background">
              <Button type="button" variant="outline" onClick={() => setRoutinePendingDelete(null)} disabled={isDeletingRoutine} className="gap-2 h-9 text-xs">
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button type="button" variant="destructive" onClick={() => void confirmDeleteRoutine()} disabled={isDeletingRoutine} className="gap-2 h-9 text-xs">
                {isDeletingRoutine ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover rotina
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
          <DialogContent className="max-w-2xl p-0 flex flex-col max-h-[85dvh]">
            <DialogHeader className="border-b border-border px-6 py-4 bg-background shrink-0">
              <DialogTitle className="text-lg font-bold">{editingTemplateId ? "Editar template de mensagem" : "Novo template de mensagem"}</DialogTitle>
              <DialogDescription>{editingTemplateId ? "Atualize o template usado nas ações de envio das rotinas." : "Crie um template para usar nas ações de envio das rotinas."}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-6 py-5 overflow-y-auto flex-1 min-h-0 overflow-visible!">
              {templateError && <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive transition-all">{templateError}</div>}

              <div className="grid gap-4 grid-cols-1 md:grid-cols-[1fr_200px]">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Nome do Template</Label>
                  <Input value={templateForm.label} onChange={(event) => setTemplateForm((current) => ({ ...current, label: event.target.value }))} placeholder="Ex: Boas-vindas primeiro contato" className="h-9 bg-background" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Tipo de Mensagem</Label>
                  <Select value={templateForm.type} onValueChange={(type) => setTemplateForm((current) => ({ ...current, type }))}>
                    <SelectTrigger className="w-full h-9 bg-background">
                      <SelectValue placeholder="Selecione um tipo..." />
                    </SelectTrigger>

                    <SelectContent>
                      {templateTypeOptions.map((type) => {
                        const typeKey = type.toLowerCase();
                        const badgeColor = templateTypeColors[typeKey] || "#64748b";

                        return (
                          <SelectItem key={type} value={type}>
                            <div className="flex items-center gap-2.5">
                              <span className="h-2 w-2 rounded-full shrink-0 shadow-2xs block" style={{ backgroundColor: badgeColor }} aria-hidden="true" />
                              <span className="capitalize text-sm">{type}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Mensagem do Template</Label>
                <MessageDirectiveTextarea
                  value={templateForm.content}
                  onChange={(content) => setTemplateForm((current) => ({ ...current, content }))}
                  placeholder="Escreva o conteúdo da mensagem. Dica: evite blocos muito densos de texto para melhorar a leitura."
                  className="min-h-36 max-h-80 resize-y bg-background text-sm leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Mídia Opcional</Label>

                <div className="relative group">
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3.5 rounded-lg border-1 border-dashed border-border bg-muted/10 px-4 py-4 transition-all hover:bg-muted/30 hover:border-muted-foreground/30",
                      (templateMediaFile || templateForm.media) && "border-solid border-theme-primary/30 bg-theme-primary/2",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background border border-border text-muted-foreground shadow-2xs group-hover:text-theme-primary transition-colors",
                        (templateMediaFile || templateForm.media) && "text-theme-primary border-theme-primary/20",
                      )}
                    >
                      <Upload className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1 pr-8">
                      <span className="block truncate text-xs font-medium text-foreground">{templateMediaFile?.name || templateForm.media?.fileName || "Selecionar arquivo de mídia..."}</span>
                      <span className="block text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                        {templateMediaFile
                          ? formatFileSize(templateMediaFile.size)
                          : templateForm.media
                            ? [templateForm.media.mimeType, formatFileSize(templateForm.media.size)].filter(Boolean).join(" · ")
                            : "O arquivo será salvo no campo Midia do template"}
                      </span>
                    </div>

                    <input type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp" className="hidden" onChange={(event) => setTemplateMediaFile(event.target.files?.[0] ?? null)} />
                  </label>

                  {(templateForm.media || templateMediaFile) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remover mídia anexada"
                      onClick={() => {
                        setTemplateMediaFile(null);
                        setTemplateForm((current) => ({ ...current, media: null }));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-border px-6 py-4 bg-background shrink-0 ">
              <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)} className="gap-2 h-9 text-xs">
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => void saveTemplate()}
                disabled={isSavingTemplate || !templateForm.label.trim() || (!templateForm.content.trim() && !templateForm.media && !templateMediaFile)}
                className="gap-2 h-9 text-xs font-bold bg-theme-primary text-white hover:bg-theme-primary/90"
              >
                {isSavingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(templatePendingDelete)}
          onOpenChange={(open) => {
            if (!open && !isDeletingTemplate) setTemplatePendingDelete(null);
          }}
        >
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <DialogHeader className="border-b border-border px-6 py-4 bg-background">
              <DialogTitle className="text-lg font-bold">Remover template</DialogTitle>
              <DialogDescription>Está ação irá remover o template permanentemente.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{templatePendingDelete?.label}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{templatePendingDelete?.description || templatePendingDelete?.content || "Template sem descricao."}</p>
              </div>

              {templatePendingDelete && routines.some((routine) => routine.actions.some((action) => action.templateId === templatePendingDelete.id)) ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  Este template está em uso em {routines.filter((routine) => routine.actions.some((action) => action.templateId === templatePendingDelete.id)).length} rotina(s). As ações vinculadas precisarão de outro template.
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Você tem certeza que deseja remover este template?</p>
              )}
            </div>

            <DialogFooter className="border-t border-border px-6 py-4 bg-background">
              <Button type="button" variant="outline" onClick={() => setTemplatePendingDelete(null)} disabled={isDeletingTemplate} className="gap-2 h-9 text-xs">
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button type="button" variant="destructive" onClick={() => void confirmDeleteTemplate()} disabled={isDeletingTemplate} className="gap-2 h-9 text-xs">
                {isDeletingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover template
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
  onDelete,
}: {
  templates: RoutineMessageTemplate[];
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
  onCreate: () => void;
  onEdit: (template: RoutineMessageTemplate) => void;
  onDelete: (template: RoutineMessageTemplate) => void;
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
        <div className="grid grid-cols-[150px_minmax(0,1fr)_96px] border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden shrink-0 gap-3">
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
                <TemplateRow key={template.id} template={template} onEdit={() => onEdit(template)} onDelete={() => onDelete(template)} />
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

function TemplateRow({ template, onEdit, onDelete }: { template: RoutineMessageTemplate; onEdit: () => void; onDelete: () => void }) {
  const type = template.type?.trim() || "Mensagem";
  const color = template.color || templateTypeColors[type.toLowerCase()] || "#4b5563";
  const description = template.description || template.content || "Sem descrição cadastrada.";

  return (
    <div className="relative grid gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[150px_minmax(0,1fr)_96px] md:items-center">
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

      <div className="absolute top-1 right-2 flex gap-1 md:static md:justify-end">
        <Button type="button" variant="ghost" size="icon" title="Editar template" onClick={onEdit}>
          <PenSquare className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" title="Remover template" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function RoutineRow({ routine, isTogglingActive, onOpen, onRun, onToggleActive, onDelete }: { routine: Routine; isTogglingActive: boolean; onOpen: () => void; onRun: () => void; onToggleActive: () => void; onDelete: () => void }) {
  const color = getRoutineColor(routine);
  const currentTrigger = triggerOptions.find((opt) => opt.value === routine.trigger);
  const TriggerIcon = currentTrigger?.icon;
  const conditionCount = routine.conditionGroups?.reduce((total, group) => total + group.conditions.length, 0) || 1;
  const triggerIssues = validateRoutineTriggerLogic(routine.conditionGroups || [], routine.conditionOperator || "all");
  const invalidTrigger = triggerIssues[0];

  return (
    <div
      className={cn(
        "relative grid gap-3 border-l-2 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[140px_minmax(0,1fr)_160px_140px] md:items-center",
        invalidTrigger ? "border-l-destructive bg-destructive/5" : "border-l-transparent",
      )}
    >
      <Badge className="w-fit max-w-full border-0 px-2.5 py-0.5 text-xs font-semibold rounded-sm shadow-xs flex items-center justify-start gap-1.5 overflow-hidden" style={{ backgroundColor: triggerColors[routine.trigger], color: "#fff" }}>
        {TriggerIcon && <TriggerIcon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{currentTrigger?.label}</span>
        {conditionCount > 1 ? <span className=" rounded-full bg-white/20 px-1.5 text-[10px]">+{conditionCount - 1}</span> : null}
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
          {invalidTrigger ? (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{invalidTrigger.message}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1 min-w-0 w-fit md:w-full pt-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 md:hidden">Alvo do gatilho</span>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 max-md:hidden" />
            <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 md:hidden" />
            <Badge
              className="w-fit max-w-32 border px-2.5 py-0.5 text-xs font-medium rounded-full"
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRun}
          disabled={!routine.active || Boolean(invalidTrigger) || routine.actions.length === 0}
          title={invalidTrigger?.message || (!routine.active ? "Ative a rotina antes de executar" : "Executar agora para um contato")}
          className="text-theme-primary hover:bg-theme-primary/10"
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleActive}
          disabled={isTogglingActive}
          title={routine.active ? "Pausar disparos automáticos" : "Ativar disparos automáticos"}
          className={routine.active ? "text-amber-600 hover:bg-amber-500/10 hover:text-amber-600" : "text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600"}
        >
          {isTogglingActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
        </Button>
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

function ConditionGroupEditor({
  group,
  groupIndex,
  tags,
  statuses,
  allGroups,
  routineOperator,
  issues,
  canRemoveGroup,
  onChange,
  onConditionChange,
  onAddCondition,
  onRemoveCondition,
  onRemoveGroup,
}: {
  group: RoutineConditionGroup;
  groupIndex: number;
  tags: ChatTag[];
  statuses: ChatStatusOption[];
  allGroups: RoutineConditionGroup[];
  routineOperator: "all" | "any";
  issues: RoutineTriggerIssue[];
  canRemoveGroup: boolean;
  onChange: (patch: Partial<RoutineConditionGroup>) => void;
  onConditionChange: (conditionId: string, patch: Partial<RoutineCondition>) => void;
  onAddCondition: () => void;
  onRemoveCondition: (conditionId: string) => void;
  onRemoveGroup: () => void;
}) {
  const groupIssues = issues.filter((issue) => issue.groupIds.includes(group.id));
  const allConflict =
    group.conditions.length > 1
      ? validateRoutineTriggerLogic(
          allGroups.map((candidate) => (candidate.id === group.id ? { ...candidate, operator: "all" } : candidate)),
          routineOperator,
        ).find((issue) => issue.groupIds.includes(group.id))?.message || ""
      : "";
  const hasManual = allGroups.some((candidate) => candidate.conditions.some((condition) => condition.active !== false && condition.type === "manual"));

  return (
    <div className={cn("rounded-lg border bg-background p-3.5 space-y-3 shadow-sm", groupIssues.length > 0 ? "border-destructive" : "border-border")}>
      <div className="flex items-center justify-between gap-2 h-6!">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Grupo {groupIndex + 1}</span>
          {group.conditions.length > 1 && (
            <div className=" flex items-center gap-1.5 text-muted-foreground">
              <span>• Coincidir com</span>
              <Select value={group.operator} onValueChange={(value) => onChange({ operator: value as "all" | "any" })}>
                <SelectTrigger className=" text-xs bg-muted/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" disabled={group.operator !== "all" && Boolean(allConflict)}>
                    Todas
                  </SelectItem>
                  <SelectItem value="any">Qualquer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {canRemoveGroup && (
          <Button type="button" variant="destructive" size="icon" onClick={onRemoveGroup}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:gap-x-6 sm:gap-y-3 overflow-clip">
        {group.conditions.map((condition, index) => {
          const usesWideCard = condition.type === "specific_message" || condition.type === "ai_message";

          return (
            <div key={condition.id} className={cn("relative min-w-0 ", usesWideCard ? "sm:col-span-2" : "sm:col-span-1")}>
              {index > 0 ? (
                <span className="mb-1 block text-center text-[9px] font-medium italic text-muted-foreground sm:absolute sm:-left-3 sm:top-1/2 sm:z-10 sm:mb-0 sm:-translate-x-1/2 sm:-translate-y-1/2">
                  {group.operator === "all" ? "E" : "OU"}
                </span>
              ) : null}
              <ConditionEditor
                condition={condition}
                index={index}
                tags={tags}
                statuses={statuses}
                allGroups={allGroups}
                routineOperator={routineOperator}
                group={group}
                issues={issues}
                canRemove={group.conditions.length > 1}
                onChange={(patch) => onConditionChange(condition.id, patch)}
                onRemove={() => onRemoveCondition(condition.id)}
              />
            </div>
          );
        })}
      </div>

      <div className="pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={hasManual}
          title={hasManual ? "O gatilho Manual deve ser usado sozinho." : "Adicionar condição"}
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onAddCondition}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar condição
        </Button>
        {allConflict && group.operator !== "all" ? <p className="mt-1 text-[11px] text-muted-foreground">A opção Todas está indisponível: {allConflict}</p> : null}
      </div>
    </div>
  );
}

function ConditionEditor({
  condition,
  index,
  tags,
  statuses,
  allGroups,
  routineOperator,
  group,
  issues,
  canRemove,
  onChange,
  onRemove,
}: {
  condition: RoutineCondition;
  index: number;
  tags: ChatTag[];
  statuses: ChatStatusOption[];
  allGroups: RoutineConditionGroup[];
  routineOperator: "all" | "any";
  group: RoutineConditionGroup;
  issues: RoutineTriggerIssue[];
  canRemove: boolean;
  onChange: (patch: Partial<RoutineCondition>) => void;
  onRemove: () => void;
}) {
  const conditionIssues = issues.filter((issue) => issue.conditionIds.includes(condition.id));
  const conflictingStatus = group.operator === "all" ? group.conditions.find((candidate) => candidate.id !== condition.id && candidate.active !== false && candidate.type === "status" && candidate.value)?.value || "" : "";

  function changeType(type: RoutineTrigger) {
    onChange({
      type,
      comparisonOperator: getDefaultComparisonOperator(type),
      value: "",
      targetId: "",
      targetLabel: "",
      targetColor: "",
    });
  }

  function applyOption(value: string) {
    if (condition.type === "tag") {
      const tag = tags.find((item) => item.id === value || item.label === value);
      onChange({
        targetId: tag?.id || value,
        targetLabel: tag?.label || value,
        targetColor: tag?.color || "",
        value: tag?.label || value,
      });
      return;
    }
    const status = statuses.find((item) => item.label === value);
    onChange({
      targetId: value,
      targetLabel: status?.label || value,
      targetColor: status?.color || "",
      value: status?.label || value,
    });
  }

  return (
    <div className={cn("group relative flex h-full w-full min-w-0 flex-col gap-2 rounded-lg border bg-muted/20 p-3", conditionIssues.length > 0 ? "border-destructive bg-destructive/5" : "border-border/60")}>
      <div className="w-full min-w-0 space-y-1.5">
        <Label className="text-[11px] font-medium text-muted-foreground">Gatilho {index + 1}</Label>
        <Select value={condition.type} onValueChange={(value) => changeType(value as RoutineTrigger)}>
          <SelectTrigger className="w-full h-9 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {triggerOptions.map((option) => {
              const Icon = option.icon;
              const conflict = option.value === condition.type ? "" : getTriggerOptionConflict(allGroups, routineOperator, condition.id, option.value);
              return (
                <SelectItem key={option.value} value={option.value} disabled={Boolean(conflict)} title={conflict}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" style={{ color: triggerColors[option.value] }} />
                    <span className="truncate">{option.label}</span>
                    {conflict ? <span className="text-[10px] text-muted-foreground">incompatível</span> : null}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-w-0">
        <ConditionValueField condition={condition} tags={tags} statuses={statuses} conflictingStatus={conflictingStatus} onChange={onChange} onApplyOption={applyOption} />
        {conditionIssues.length > 0 ? <p className="mt-1 text-xs text-destructive">{conditionIssues[0].message}</p> : null}
      </div>

      <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 text-muted-foreground hover:text-destructive" disabled={!canRemove} onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ConditionValueField({
  condition,
  tags,
  statuses,
  conflictingStatus,
  onChange,
  onApplyOption,
}: {
  condition: RoutineCondition;
  tags: ChatTag[];
  statuses: ChatStatusOption[];
  conflictingStatus?: string;
  onChange: (patch: Partial<RoutineCondition>) => void;
  onApplyOption: (value: string) => void;
}) {
  if (condition.type === "manual" || condition.type === "birthday") {
    return (
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium text-muted-foreground">Regra</Label>
        <div className="flex h-9 items-center rounded-md border border-border/60 bg-background px-2 text-xs text-muted-foreground">{condition.type === "manual" ? "Executada manualmente" : "Aniversário do contato é no dia atual"}</div>
      </div>
    );
  }

  if (condition.type === "specific_date") {
    return (
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium text-muted-foreground">Data específica</Label>
        <Input type="date" className="w-full h-9 bg-background" value={condition.value} onChange={(event) => onChange({ value: event.target.value, targetLabel: event.target.value })} />
      </div>
    );
  }

  if (condition.type === "tag" || condition.type === "status") {
    const options =
      condition.type === "tag"
        ? tags.map((tag) => ({ id: tag.id, label: tag.label, color: tag.color }))
        : statuses.map((status) => ({
            id: status.label,
            label: status.label,
            color: status.color,
          }));

    return (
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium text-muted-foreground">{condition.type === "tag" ? "Selecione a Tag" : "Selecione o Status"}</Label>
        <Select value={condition.targetId || condition.targetLabel || condition.value} onValueChange={onApplyOption}>
          <SelectTrigger className="w-full h-9 bg-background">
            <SelectValue placeholder={condition.type === "tag" ? "Escolher tag" : "Escolher status"} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.map((option) => (
              <SelectItem
                key={`${option.id}-${option.label}`}
                value={option.id || option.label}
                disabled={condition.type === "status" && Boolean(conflictingStatus) && option.label !== conflictingStatus}
                title={condition.type === "status" && conflictingStatus && option.label !== conflictingStatus ? `Com E, o status deve permanecer ${conflictingStatus}. Use OU para aceitar outro status.` : undefined}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("shrink-0 rounded-full", condition.type == "tag" ? "h-2 w-2 [corner-shape:squircle]" : "h-2.5 w-2.5")} style={{ backgroundColor: option.color || triggerColors[condition.type] }} />
                  <span>{option.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const usesAi = condition.type === "ai_message";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center  gap-2 h-6">
        <Label className="text-[11px] font-medium text-muted-foreground">{usesAi ? "Intenção da mensagem" : "Mensagem"}</Label>
        {!usesAi && (
          <Select
            value={condition.comparisonOperator}
            onValueChange={(value) =>
              onChange({
                comparisonOperator: value as RoutineCondition["comparisonOperator"],
              })
            }
          >
            <SelectTrigger className="h-6! bg-background text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equals">Igual a</SelectItem>
              <SelectItem value="contains">Contém</SelectItem>
              <SelectItem value="starts_with">Começa com</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <Textarea
        value={condition.value}
        onChange={(event) => onChange({ value: event.target.value, targetLabel: event.target.value })}
        placeholder={usesAi ? "Ex: paciente demonstra interesse em agendar uma avaliação" : "Texto que deve disparar a automação..."}
        className="h-18 custom-scrollbar bg-background text-xs resize-none "
      />
    </div>
  );
}

function ActionEditor({
  action,
  index,
  users,
  tags,
  messageTemplates,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onChange,
  onRemove,
  canRemove,
}: {
  action: RoutineAction;
  index: number;
  users: UserOption[];
  tags: ChatTag[];
  messageTemplates: RoutineMessageTemplate[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onChange: (patch: Partial<RoutineAction>) => void;
  onRemove: () => void;
  canRemove?: boolean;
}) {
  const selectedTemplate = messageTemplates.find((template) => template.id === action.templateId);
  const usableMessageTemplates = messageTemplates.filter((template) => template.content || template.media);
  const messageMode = action.templateId ? "template" : "custom";
  const intervalLabel = action.intervalLabel || (action.delayMinutes ? "Minutos" : "Nenhum");
  const intervalAmount = getIntervalAmount({ ...action, intervalLabel });

  function updateInterval(label: string, amount = intervalAmount) {
    const option = getIntervalOption(label);
    const normalizedAmount = label === "Nenhum" ? 0 : Math.max(0, Number(amount) || 0);

    onChange({
      delayMinutes: normalizedAmount * option.minutes,
      intervalAmount: normalizedAmount,
      intervalLabel: label,
    });
  }

  return (
    <div className="rounded-md border border-border bg-card overflow-clip">
      <div className="flex items-center justify-between gap-2 bg-theme-primary px-2 py-1.5 text-xs font-medium text-white">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded hover:bg-white/15 active:cursor-grabbing"
            title="Arrastar para reordenar"
            aria-label={`Arrastar a ação ${index + 1}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="flex min-w-0 items-center gap-1 truncate">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formatInterval(action)}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon" disabled={!canMoveUp} onClick={onMoveUp} title="Mover ação para cima" className="h-7 w-7 text-white hover:bg-white/15 hover:text-white disabled:text-white/40">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={!canMoveDown} onClick={onMoveDown} title="Mover ação para baixo" className="h-7 w-7 text-white hover:bg-white/15 hover:text-white disabled:text-white/40">
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <span className="ml-1 whitespace-nowrap">{index + 1}ª ação</span>
        </div>
      </div>

      <div className={cn("grid gap-2 p-2 md:grid-cols-[170px_180px_minmax(0,1fr)_160px_auto] md:items-center")}>
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
              blocksAiReply: actionType === "send_message" ? action.blocksAiReply !== false : action.blocksAiReply,
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

        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
          <Input
            type="number"
            min={5}
            step="1"
            value={intervalAmount}
            onChange={(event) => updateInterval(intervalLabel, event.target.valueAsNumber)}
            disabled={intervalLabel === "Nenhum"}
            className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <Select value={intervalLabel} onValueChange={(label) => updateInterval(label)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map((option) => (
                <SelectItem key={option.label} value={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {action.type === "send_message" ? (
          <div className="grid gap-3 items-center md:col-span-2 md:grid-cols-[160px_minmax(0,1fr)]">
            <Select
              value={messageMode}
              onValueChange={(mode) => onChange(mode === "custom" ? { templateId: "", templateLabel: "" } : { message: "", templateId: usableMessageTemplates[0]?.id || "", templateLabel: usableMessageTemplates[0]?.label || "" })}
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
              <MessageDirectiveTextarea
                value={action.message ?? ""}
                onChange={(message) => onChange({ message, templateId: "", templateLabel: "" })}
                placeholder="Digite a mensagem que será enviada"
                className=" min-h-24 resize-y max-h-60"
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

        {canRemove && (
          <Button type="button" variant="destructive" size="icon" onClick={onRemove} title="Remover ação">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}

        {action.type === "send_message" ? (
          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/30 px-3 py-2 md:col-span-5">
            <div>
              <p className="text-sm font-medium text-foreground">Impedir resposta automática da IA</p>
              <p className="text-xs text-muted-foreground">Quando esta rotina disparar, somente esta ação responderá ao contato.</p>
            </div>
            <Switch checked={action.blocksAiReply !== false} onCheckedChange={(blocksAiReply) => onChange({ blocksAiReply })} />
          </div>
        ) : null}

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
