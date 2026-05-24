"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AlertCircle, CalendarDays, CheckCircle2, Circle, CircleDashed, Clock3, Loader2, Plus, RefreshCw, Search, Timer, Trash2, UserRound } from "lucide-react";
import type { ComponentType, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type TaskStatus = "aguardando" | "resolvendo" | "finalizado";
type TaskView = "todas" | TaskStatus;

interface Task {
  id: string;
  subject: string;
  description: string;
  creator: string;
  creatorInitials: string;
  responsible: string;
  responsibleInitials: string;
  patient: string;
  type: string;
  status: TaskStatus;
  statusLabel: string;
  createdAt: string;
  dueDate: string;
}

interface TaskOptions {
  types: string[];
  statuses: string[];
  users: Array<{ id: string; label: string }>;
}

const statusOrder: TaskStatus[] = ["aguardando", "resolvendo", "finalizado"];
const taskViewOptions: Array<{ value: TaskView; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "aguardando", label: "Aguardando" },
  { value: "resolvendo", label: "Resolvendo" },
  { value: "finalizado", label: "Finalizadas" },
];

const statusConfig: Record<
  TaskStatus,
  {
    label: string;
    helper: string;
    icon: ComponentType<{ className?: string }>;
    columnClassName: string;
    headerClassName: string;
    helperClassName: string;
    markerClassName: string;
    countClassName: string;
  }
> = {
  aguardando: {
    label: "Aguardando",
    helper: "Pendentes de triagem ou início",
    icon: CircleDashed,
    columnClassName: "border-amber-500/20 bg-amber-500/5",
    headerClassName: "text-amber-500",
    helperClassName: "text-muted-foreground",
    markerClassName: "bg-amber-500",
    countClassName: "border-amber-500/20 bg-amber-500/10 text-amber-500",
  },
  resolvendo: {
    label: "Resolvendo",
    helper: "Em acompanhamento pela equipe",
    icon: Timer,
    columnClassName: "border-cyan-500/20 bg-cyan-500/5",
    headerClassName: "text-cyan-500",
    helperClassName: "text-muted-foreground",
    markerClassName: "bg-cyan-500",
    countClassName: "border-cyan-500/20 bg-cyan-500/10 text-cyan-500",
  },
  finalizado: {
    label: "Finalizadas",
    helper: "Concluídas no fluxo",
    icon: CheckCircle2,
    columnClassName: "border-teal-500/20 bg-teal-500/5",
    headerClassName: "text-teal-500",
    helperClassName: "text-muted-foreground",
    markerClassName: "bg-teal-600",
    countClassName: "border-teal-500/20 bg-teal-500/10 text-teal-500",
  },
};

const filterAll = "Todos";
const fallbackTaskOptions: TaskOptions = {
  types: ["Tarefa"],
  statuses: ["Aguardando", "Resolvendo", "Finalizado"],
  users: [],
};

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string, options: Intl.DateTimeFormatOptions) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", options).format(date);
}

function isOverdue(task: Task) {
  if (!task.dueDate || task.status === "finalizado") return false;

  const dueDate = new Date(task.dueDate);
  if (Number.isNaN(dueDate.getTime())) return false;

  dueDate.setHours(23, 59, 59, 999);
  return dueDate.getTime() < Date.now();
}

function getTaskTypeBadgeClassName(type: string) {
  const normalizedType = type
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalizedType.includes("aviso")) {
    return "border-sky-400/20 bg-sky-400/10 text-sky-400";
  }

  if (normalizedType.includes("pendencia")) {
    return "border-rose-400/25 bg-rose-400/10 text-rose-400";
  }

  if (normalizedType.includes("tarefa")) {
    return "border-violet-400/20 bg-violet-400/10 text-violet-400";
  }

  return "border-primary/20 bg-primary/5 text-primary";
}

function getTaskStatusColor(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("aguard")) {
    return {
      base: "#f59e0b",
      bg: "#f59e0b1a",
      text: "#f59e0b",
    };
  }

  if (normalized.includes("resolv")) {
    return {
      base: "#0ea5e9",
      bg: "#0ea5e91a",
      text: "#0ea5e9",
    };
  }

  if (normalized.includes("finaliz") || normalized.includes("conclu")) {
    return {
      base: "#10b981",
      bg: "#10b9811a",
      text: "#10b981",
    };
  }

  return {
    base: "#94a3b8",
    bg: "#94a3b81a",
    text: "#64748b",
  };
}

function uniqueValues(tasks: Task[], key: keyof Task) {
  return Array.from(new Set(tasks.map((task) => String(task[key] || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

async function fetchTaskRecords({ signal, refresh = false }: { signal?: AbortSignal; refresh?: boolean } = {}) {
  const response = await fetch(`/api/airtable/tasks${refresh ? "?refresh=1" : ""}`, { cache: "no-store", signal });
  const data = (await response.json()) as { tasks?: Task[]; message?: string };

  if (!response.ok) {
    throw new Error(data.message || "Não foi possível carregar os encaminhamentos.");
  }

  return data.tasks ?? [];
}

async function fetchTaskOptions() {
  const response = await fetch("/api/airtable/task-options", { cache: "no-store" });
  const data = (await response.json()) as Partial<TaskOptions>;

  if (!response.ok) {
    throw new Error("Não foi possível carregar as opções de tarefas.");
  }

  return {
    types: data.types?.length ? data.types : fallbackTaskOptions.types,
    statuses: data.statuses?.length ? data.statuses : fallbackTaskOptions.statuses,
    users: data.users ?? [],
  };
}

function TaskCard({ task, onSelect }: { task: Task; onSelect: (task: Task) => void }) {
  const overdue = isOverdue(task);
  const dueDate = formatDateTime(task.dueDate, { day: "2-digit", month: "short", year: "numeric" });
  const createdAt = formatDateTime(task.createdAt, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(task);
        }
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("max-w-full truncate text-[11px]", getTaskTypeBadgeClassName(task.type))}>
              {task.type || "Encaminhamento"}
            </Badge>
            {overdue ? (
              <Badge className="border-destructive/25 bg-destructive/5 text-[11px] text-destructive" variant="outline">
                <AlertCircle className="h-3 w-3" />
                Atrasada
              </Badge>
            ) : null}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{task.subject || "Encaminhamento sem assunto"}</h3>
        </div>
        <Avatar className="h-8 w-8 shrink-0 border border-primary/15">
          <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">{task.responsibleInitials}</AvatarFallback>
        </Avatar>
      </div>

      {task.description ? <p className="mb-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{task.description}</p> : <p className="mb-4 text-sm italic leading-6 text-muted-foreground">Sem observações registradas.</p>}

      <div className="space-y-3 border-t pt-3">
        {task.patient ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            <span className="truncate">{task.patient}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Responsável</p>
            <p className="truncate text-xs font-medium text-foreground">{task.responsible}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prazo</p>
            <p className={cn("text-xs font-medium", overdue ? "text-destructive" : "text-foreground")}>{dueDate || "Sem prazo"}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="truncate">Criado por {task.creator}</span>
          {createdAt ? (
            <span className="flex shrink-0 items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {createdAt}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function EmptyColumn({ isFiltering }: { isFiltering: boolean }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed bg-background/70 p-6 text-center">
      <CheckCircle2 className="mb-2 h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{isFiltering ? "Nada encontrado" : "Sem encaminhamentos"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{isFiltering ? "Ajuste busca ou filtros para ampliar a lista." : "Quando houver registros, eles aparecem aqui."}</p>
    </div>
  );
}

function KanbanColumn({ status, tasks, isFiltering, onSelectTask }: { status: TaskStatus; tasks: Task[]; isFiltering: boolean; onSelectTask: (task: Task) => void }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  const colorName = config?.markerClassName?.replace("bg-", "") || "theme-primary/50";

  return (
    <section className={cn("flex min-w-[300px] flex-1 flex-col rounded-md border p-3", config.columnClassName)}>
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="flex items-start gap-2">
          <span className={cn("mt-1.25 h-2.5 w-2.5 rounded-full", config.markerClassName)} />
          <div>
            <div className={cn("flex items-center gap-2 font-semibold", config.headerClassName)}>
              <Icon className="h-4 w-4" />
              {config.label}
            </div>
            <p className={cn("mt-0.5 text-xs", config.helperClassName)}>{config.helper}</p>
          </div>
        </div>
        <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-md border px-2 text-xs font-semibold shadow-xs", config.countClassName)}>{tasks.length}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-1">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "group cursor-pointer rounded-md border bg-card p-4 text-left shadow-xs transition hover:ring-2 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2",
                `hover:ring-${colorName} focus-visible:ring-${colorName}`,
              )}
            >
              <TaskCard task={task} onSelect={onSelectTask} />
            </div>
          ))
        ) : (
          <EmptyColumn isFiltering={isFiltering} />
        )}
      </div>
    </section>
  );
}

function TaskStatusGrid({ status, tasks, isFiltering, onSelectTask }: { status: TaskStatus; tasks: Task[]; isFiltering: boolean; onSelectTask: (task: Task) => void }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  const colorName = config?.markerClassName?.replace("bg-", "") || "theme-primary/50";

  return (
    <section className={cn("flex min-w-full flex-1 flex-col rounded-md border p-3", config.columnClassName)}>
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="flex items-start gap-2">
          <span className={cn("mt-1.25 h-2.5 w-2.5 rounded-full", config.markerClassName)} />
          <div>
            <div className={cn("flex items-center gap-2 font-semibold", config.headerClassName)}>
              <Icon className="h-4 w-4" />
              {config.label}
            </div>
            <p className={cn("mt-0.5 text-xs", config.helperClassName)}>{config.helper}</p>
          </div>
        </div>
        <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-md border px-2 text-xs font-semibold shadow-xs", config.countClassName)}>{tasks.length}</span>
      </div>

      {tasks.length > 0 ? (
        <div className="p-1 grid flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 overflow-y-auto pr-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "group cursor-pointer rounded-md border bg-card p-4 text-left shadow-xs transition hover:ring-2 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2",
                `hover:ring-${colorName} focus-visible:ring-${colorName}`,
              )}
            >
              <TaskCard task={task} onSelect={onSelectTask} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyColumn isFiltering={isFiltering} />
      )}
    </section>
  );
}

function FilterMenu({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-36 justify-between bg-background">
          <span className="truncate">{value === filterAll ? label : value}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 min-w-48 overflow-y-auto">
        {[filterAll, ...options].map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onChange(option)}>
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DetailRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm text-foreground">{value || "Nao informado"}</p>
    </div>
  );
}

function TaskDetailsDialog({
  task,
  open,
  onOpenChange,
  onDelete,
  isDeleting,
  errorMessage,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (task: Task) => void;
  isDeleting: boolean;
  errorMessage: string;
}) {
  const overdue = task ? isOverdue(task) : false;
  const createdAt = task
    ? formatDateTime(task.createdAt, {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const dueDate = task ? formatDateTime(task.dueDate, { day: "2-digit", month: "long", year: "numeric" }) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {task ? (
          <>
            <DialogHeader className="pr-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                  {task.type || "Tarefa"}
                </Badge>
                <Badge variant="outline" className={cn(overdue ? "border-destructive/25 bg-destructive/5 text-destructive" : "")}>
                  {overdue ? "Atrasada" : task.statusLabel || statusConfig[task.status].label}
                </Badge>
              </div>
              <DialogTitle className="pt-2 text-xl leading-7">{task.subject || "Tarefa sem assunto"}</DialogTitle>
              <DialogDescription>Detalhes do encaminhamento registrado no Airtable.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 border-y py-4 sm:grid-cols-2">
              <DetailRow label="Paciente" value={task.patient} />
              <DetailRow label="Responsavel" value={task.responsible} />
              <DetailRow label="Criado por" value={task.creator} />
              <DetailRow label="Status" value={task.statusLabel || statusConfig[task.status].label} />
              <DetailRow label="Criada em" value={createdAt} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prazo</p>
                <p className={cn("mt-1 flex items-center gap-2 text-sm font-medium", overdue ? "text-destructive" : "text-foreground")}>
                  <CalendarDays className="h-4 w-4" />
                  {dueDate || "Sem prazo"}
                </p>
              </div>
              <DetailRow className="sm:col-span-2" label="Observacoes" value={task.description || "Sem observacoes registradas."} />
            </div>

            {errorMessage ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {errorMessage}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
                Fechar
              </Button>
              <Button type="button" variant="destructive" onClick={() => onDelete(task)} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeleting ? "Excluindo..." : "Excluir tarefa"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-xs font-semibold text-foreground">{children}</label>;
}

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeView, setActiveView] = useState<TaskView>("todas");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(filterAll);
  const [creatorFilter, setCreatorFilter] = useState(filterAll);
  const [responsibleFilter, setResponsibleFilter] = useState(filterAll);
  const [taskOptions, setTaskOptions] = useState<TaskOptions>(fallbackTaskOptions);
  const [isLoadingTaskOptions, setIsLoadingTaskOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [taskActionError, setTaskActionError] = useState("");
  const [createTaskError, setCreateTaskError] = useState("");
  const [taskType, setTaskType] = useState(fallbackTaskOptions.types[0]);
  const [taskStatus, setTaskStatus] = useState(fallbackTaskOptions.statuses[0]);
  const [taskDueDate, setTaskDueDate] = useState(getTodayDate());
  const [taskPatientName, setTaskPatientName] = useState("");
  const [taskContactPhone, setTaskContactPhone] = useState("");
  const [taskResponsibleUserId, setTaskResponsibleUserId] = useState("");
  const [taskSubject, setTaskSubject] = useState("");
  const [taskObservations, setTaskObservations] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        setErrorMessage("");
        setTasks(await fetchTaskRecords({ signal: controller.signal }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os encaminhamentos.");
        setTasks([]);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const loadTasks = async ({ refresh = false }: { refresh?: boolean } = {}) => {
    const shouldShowFullLoader = tasks.length === 0;
    setIsLoading(shouldShowFullLoader);
    setIsRefreshing(!shouldShowFullLoader);
    setErrorMessage("");

    try {
      setTasks(await fetchTaskRecords({ refresh }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os encaminhamentos.");
      if (tasks.length === 0) setTasks([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    const shouldDelete = window.confirm(`Excluir a tarefa "${task.subject || task.type || "sem assunto"}"?`);
    if (!shouldDelete) return;

    setDeletingTaskId(task.id);
    setTaskActionError("");

    try {
      const response = await fetch(`/api/airtable/tasks?id=${encodeURIComponent(task.id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel excluir a tarefa.");
      }

      setTasks((current) => current.filter((currentTask) => currentTask.id !== task.id));
      setSelectedTask(null);
    } catch (error) {
      setTaskActionError(error instanceof Error ? error.message : "Nao foi possivel excluir a tarefa.");
    } finally {
      setDeletingTaskId("");
    }
  };

  const resetCreateForm = () => {
    setTaskType(taskOptions.types[0] || fallbackTaskOptions.types[0]);
    setTaskStatus(taskOptions.statuses.find((status) => status.toLowerCase() === "aguardando") || taskOptions.statuses[0] || fallbackTaskOptions.statuses[0]);
    setTaskDueDate(getTodayDate());
    setTaskPatientName("");
    setTaskContactPhone("");
    setTaskResponsibleUserId(taskOptions.users[0]?.id || "");
    setTaskSubject("");
    setTaskObservations("");
    setCreateTaskError("");
  };

  const handleOpenCreateDialog = () => {
    setIsCreateDialogOpen(true);
    setIsLoadingTaskOptions(true);
    setCreateTaskError("");

    fetchTaskOptions()
      .then((options) => {
        setTaskOptions(options);
        setTaskType((current) => current || options.types[0] || fallbackTaskOptions.types[0]);
        setTaskStatus((current) => current || options.statuses.find((status) => status.toLowerCase() === "aguardando") || options.statuses[0] || fallbackTaskOptions.statuses[0]);
        setTaskResponsibleUserId((current) => current || options.users[0]?.id || "");
      })
      .catch((error) => {
        setCreateTaskError(error instanceof Error ? error.message : "Não foi possível carregar as opções de tarefas.");
      })
      .finally(() => setIsLoadingTaskOptions(false));
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingTask(true);
    setCreateTaskError("");

    try {
      const response = await fetch("/api/airtable/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: taskType,
          status: taskStatus,
          createdAt: new Date().toISOString(),
          dueDate: taskDueDate,
          responsibleUserId: taskResponsibleUserId,
          patientName: taskPatientName,
          contactPhone: taskContactPhone,
          subject: taskSubject,
          observations: taskObservations,
        }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível criar a tarefa.");
      }

      resetCreateForm();
      setIsCreateDialogOpen(false);
      await loadTasks({ refresh: true });
    } catch (error) {
      setCreateTaskError(error instanceof Error ? error.message : "Não foi possível criar a tarefa.");
    } finally {
      setIsCreatingTask(false);
    }
  };

  const typeOptions = useMemo(() => uniqueValues(tasks, "type"), [tasks]);
  const creatorOptions = useMemo(() => uniqueValues(tasks, "creator"), [tasks]);
  const responsibleOptions = useMemo(() => uniqueValues(tasks, "responsible"), [tasks]);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesQuery = query ? [task.subject, task.description, task.patient, task.creator, task.responsible, task.type].join(" ").toLowerCase().includes(query) : true;
      const matchesType = typeFilter === filterAll || task.type === typeFilter;
      const matchesCreator = creatorFilter === filterAll || task.creator === creatorFilter;
      const matchesResponsible = responsibleFilter === filterAll || task.responsible === responsibleFilter;

      return matchesQuery && matchesType && matchesCreator && matchesResponsible;
    });
  }, [creatorFilter, responsibleFilter, searchQuery, tasks, typeFilter]);

  const tasksByStatus = useMemo(
    () =>
      statusOrder.reduce(
        (acc, status) => {
          acc[status] = filteredTasks.filter((task) => task.status === status);
          return acc;
        },
        {} as Record<TaskStatus, Task[]>,
      ),
    [filteredTasks],
  );

  const isFiltering = Boolean(searchQuery.trim()) || typeFilter !== filterAll || creatorFilter !== filterAll || responsibleFilter !== filterAll;
  const totalOpen = tasksByStatus.aguardando.length + tasksByStatus.resolvendo.length;

  return (
    <div className="flex h-screen flex-1 flex-col bg-background">
      <header className="border-b bg-card px-6 py-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-cyan-600" />
                Airtable / Encaminhamentos
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-foreground">Tarefas</h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="grid grid-cols-3 overflow-hidden rounded-md border bg-background shadow-xs">
                <div className="px-4 py-2 text-center">
                  <p className="text-lg font-semibold text-foreground">{filteredTasks.length}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Visíveis</p>
                </div>
                <div className="border-x px-4 py-2 text-center">
                  <p className="text-lg font-semibold text-foreground">{totalOpen}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Abertas</p>
                </div>
                <div className="px-4 py-2 text-center">
                  <p className="text-lg font-semibold text-foreground">{tasksByStatus.finalizado.length}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Finalizadas</p>
                </div>
              </div>
              <Button type="button" className="gap-2 bg-theme-primary text-white hover:bg-theme-primary/90" onClick={handleOpenCreateDialog}>
                <Plus className="h-4 w-4" />
                Nova Tarefa
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por assunto, paciente, responsável..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 bg-background pl-9" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterMenu label="Tipo" value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
              <FilterMenu label="Criador" value={creatorFilter} options={creatorOptions} onChange={setCreatorFilter} />
              <FilterMenu label="Responsável" value={responsibleFilter} options={responsibleOptions} onChange={setResponsibleFilter} />
              <Button type="button" variant="outline" className="bg-background" onClick={() => loadTasks({ refresh: true })} disabled={isLoading || isRefreshing}>
                {isLoading || isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {isRefreshing ? "Atualizando" : "Atualizar"}
              </Button>
            </div>
          </div>

          {errorMessage ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errorMessage}
            </div>
          ) : null}
          {isRefreshing ? (
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Atualizando tarefas em segundo plano...
            </div>
          ) : null}
        </div>
      </header>

      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as TaskView)} className="flex min-h-0 flex-1 gap-0">
        <div className="border-b px-5 py-3">
          <TabsList className="gap-1.5 rounded-full px-1.5 h-10! bg-secondary/50 border border-border/40">
            {taskViewOptions.map((view) => {
              const colors = getTaskStatusColor(view.value);
              const isActive = activeView === view.value;

              return (
                <TabsTrigger key={view.value} value={view.value} className="group relative data-[state=active]:bg-card px-3.5 h-7 rounded-full text-xs font-medium transition-all gap-2 cursor-pointer data-[state=active]:shadow-xs">
                  <Circle
                    className="h-2 w-2 transition-all duration-300"
                    style={{
                      fill: isActive ? colors.base : "transparent",
                      stroke: colors.base,
                      strokeWidth: isActive ? 0 : 2,
                      opacity: isActive ? 1 : 0.6,
                    }}
                  />
                  <span className="transition-colors group-data-[state=active]:text-foreground text-muted-foreground">{view.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {taskViewOptions.map((view) => (
          <TabsContent key={view.value} value={view.value} className="min-h-0 overflow-hidden">
            <main className="flex h-full flex-1 gap-4 overflow-x-auto p-5">
              {isLoading ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando encaminhamentos
                  </div>
                </div>
              ) : view.value === "todas" ? (
                statusOrder.map((status) => (
                  <KanbanColumn
                    key={status}
                    status={status}
                    tasks={tasksByStatus[status]}
                    isFiltering={isFiltering}
                    onSelectTask={(task) => {
                      setTaskActionError("");
                      setSelectedTask(task);
                    }}
                  />
                ))
              ) : (
                <TaskStatusGrid
                  status={view.value}
                  tasks={tasksByStatus[view.value]}
                  isFiltering={isFiltering}
                  onSelectTask={(task) => {
                    setTaskActionError("");
                    setSelectedTask(task);
                  }}
                />
              )}
            </main>
          </TabsContent>
        ))}
      </Tabs>
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) setCreateTaskError("");
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>Crie uma tarefa vinculada a um contato do Airtable.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateTask}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Tipo</FieldLabel>
                <Select value={taskType} onValueChange={setTaskType} required>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {taskOptions.types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Status</FieldLabel>
                <Select value={taskStatus} onValueChange={setTaskStatus} required>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {taskOptions.statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Prazo</FieldLabel>
                <Input type="date" className="h-10" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Responsável</FieldLabel>
                <Select value={taskResponsibleUserId} onValueChange={setTaskResponsibleUserId} required>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {taskOptions.users.length > 0 ? (
                      taskOptions.users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.label}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-users" disabled>
                        Nenhum usuário encontrado
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Contato / Paciente</FieldLabel>
                <Input className="h-10" value={taskPatientName} onChange={(event) => setTaskPatientName(event.target.value)} />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Telefone do contato</FieldLabel>
                <Input className="h-10" value={taskContactPhone} onChange={(event) => setTaskContactPhone(event.target.value)} placeholder="DDD + número" required />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Assunto</FieldLabel>
              <Input className="h-10" value={taskSubject} onChange={(event) => setTaskSubject(event.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Observações</FieldLabel>
              <Textarea className="min-h-24 resize-y" value={taskObservations} onChange={(event) => setTaskObservations(event.target.value)} />
            </div>

            {createTaskError ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {createTaskError}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isCreatingTask}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreatingTask || isLoadingTaskOptions || !taskResponsibleUserId}>
                {isCreatingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isCreatingTask ? "Criando..." : "Criar tarefa"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <TaskDetailsDialog
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) {
            setTaskActionError("");
            setSelectedTask(null);
          }
        }}
        onDelete={handleDeleteTask}
        isDeleting={Boolean(selectedTask && deletingTaskId === selectedTask.id)}
        errorMessage={taskActionError}
      />
    </div>
  );
}
