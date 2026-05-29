"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { getTodayDate } from "@/lib/date";
import { fallbackTaskOptions, getTaskNoteAttachmentType, StatusConfigMap, Task, TaskOptions, TaskResolutionNote, TaskStatus } from "@/lib/task";
import { AlertCircle, CheckCircle2, Circle, CircleDashed, IdCardLanyard, Loader2, Plus, RefreshCw, Search, Tag, Timer, UserPlus } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FilterMenu } from "./filter-menu";
import { KanbanColumn } from "./kanban-column";
import { TaskDetailsDialog } from "./task-details-dialog";
import { TaskStatusGrid } from "./task-grid";

type TaskView = "todas" | TaskStatus;

const statusOrder: TaskStatus[] = ["aguardando", "resolvendo", "finalizado"];
const taskViewOptions: Array<{ value: TaskView; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "aguardando", label: "Aguardando" },
  { value: "resolvendo", label: "Resolvendo" },
  { value: "finalizado", label: "Finalizadas" },
];

const statusConfig: StatusConfigMap = {
  aguardando: {
    label: "Aguardando",
    helper: "Pendentes de triagem ou início",
    icon: CircleDashed,
    columnClassName: "border-amber-500/20 bg-amber-500/5",
    headerClassName: "text-amber-500",
    helperClassName: "text-muted-foreground",
    markerClassName: "bg-amber-500",
    countClassName: "border-amber-500/20 bg-amber-500/10 text-amber-500",
    ringClassName: "hover:ring-amber-500 focus-visible:ring-amber-500",
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
    ringClassName: "hover:ring-cyan-500 focus-visible:ring-cyan-500",
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
    ringClassName: "hover:ring-teal-500 focus-visible:ring-teal-500",
  },
};

const filterAll = " ";

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

async function fetchTaskResolutionNotes(taskId: string) {
  const response = await fetch(`/api/task-resolution-notes?task_id=${encodeURIComponent(taskId)}`, { cache: "no-store" });
  const data = (await response.json()) as { notes?: TaskResolutionNote[]; message?: string };

  if (!response.ok) {
    throw new Error(data.message || "Nao foi possivel carregar o historico da tarefa.");
  }

  return data.notes ?? [];
}

async function createTaskResolutionNote({ taskId, content, statusSnapshot, attachment }: { taskId: string; content: string; statusSnapshot: string; attachment?: File | null }) {
  const body = attachment
    ? (() => {
        const formData = new FormData();
        formData.append("task_id", taskId);
        formData.append("content", content);
        formData.append("status_snapshot", statusSnapshot);
        formData.append("file", attachment);
        return formData;
      })()
    : JSON.stringify({
        task_id: taskId,
        content,
        status_snapshot: statusSnapshot,
      });

  const response = await fetch("/api/task-resolution-notes", {
    method: "POST",
    headers: attachment ? undefined : { "Content-Type": "application/json" },
    body,
  });
  const data = (await response.json()) as { note?: TaskResolutionNote; message?: string };

  if (!response.ok || !data.note) {
    throw new Error(data.message || "Nao foi possivel salvar a evolucao da tarefa.");
  }

  return data.note;
}

async function deleteTaskResolutionNote(noteId: string) {
  const response = await fetch(`/api/task-resolution-notes?id=${encodeURIComponent(noteId)}`, {
    method: "DELETE",
  });
  const data = (await response.json().catch(() => null)) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(data?.message || "Nao foi possivel apagar a evolucao da tarefa.");
  }
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
  const [savingTaskId, setSavingTaskId] = useState("");
  const [taskResolutionNotes, setTaskResolutionNotes] = useState<TaskResolutionNote[]>([]);
  const [taskResolutionNoteDraft, setTaskResolutionNoteDraft] = useState("");
  const [taskResolutionNoteAttachment, setTaskResolutionNoteAttachment] = useState<File | null>(null);
  const [isLoadingTaskResolutionNotes, setIsLoadingTaskResolutionNotes] = useState(false);
  const [isSavingTaskResolutionNote, setIsSavingTaskResolutionNote] = useState(false);
  const [deletingTaskResolutionNoteId, setDeletingTaskResolutionNoteId] = useState("");
  const [taskResolutionNoteError, setTaskResolutionNoteError] = useState("");
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

  const handleSelectTask = (task: Task) => {
    setTaskActionError("");
    setTaskResolutionNoteError("");
    setTaskResolutionNoteDraft("");
    setTaskResolutionNoteAttachment(null);
    setTaskResolutionNotes([]);
    setSelectedTask(task);
    setIsLoadingTaskOptions(true);
    setIsLoadingTaskResolutionNotes(true);

    fetchTaskOptions()
      .then((options) => setTaskOptions(options))
      .catch((error) => {
        setTaskActionError(error instanceof Error ? error.message : "Não foi possível carregar as opções de tarefas.");
      })
      .finally(() => setIsLoadingTaskOptions(false));

    fetchTaskResolutionNotes(task.id)
      .then((notes) => setTaskResolutionNotes(notes))
      .catch((error) => {
        setTaskResolutionNoteError(error instanceof Error ? error.message : "Não foi possível carregar o histórico da tarefa.");
      })
      .finally(() => setIsLoadingTaskResolutionNotes(false));
  };

  const isSmallScreen = useIsMobile(640);

  useEffect(() => {
    if (isSmallScreen && activeView === "todas") {
      setActiveView("aguardando");
    }
  }, [isSmallScreen, activeView, setActiveView]);

  const handleUpdateTask = async (task: Task, values: { type: string; status: string; dueDate: string; responsibleUserId: string; subject: string; observations: string }) => {
    setSavingTaskId(task.id);
    setTaskActionError("");

    try {
      const response = await fetch(`/api/airtable/tasks?id=${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json()) as { task?: Task; message?: string };

      if (!response.ok || !data.task) {
        throw new Error(data.message || "Não foi possível atualizar a tarefa.");
      }

      setTasks((current) => current.map((currentTask) => (currentTask.id === data.task?.id ? data.task : currentTask)));
      setSelectedTask(data.task);
    } catch (error) {
      setTaskActionError(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa.");
    } finally {
      setSavingTaskId("");
    }
  };

  const handleCreateTaskResolutionNote = async (task: Task) => {
    const content = taskResolutionNoteDraft.trim();
    if (!content && !taskResolutionNoteAttachment) return;

    const attachmentType = getTaskNoteAttachmentType(taskResolutionNoteAttachment);
    if (attachmentType === "unsupported") {
      setTaskResolutionNoteError("Envie apenas imagens ou audios na evolucao da tarefa.");
      return;
    }

    setIsSavingTaskResolutionNote(true);
    setTaskResolutionNoteError("");

    try {
      const note = await createTaskResolutionNote({
        taskId: task.id,
        content,
        statusSnapshot: task.statusLabel || statusConfig[task.status].label,
        attachment: taskResolutionNoteAttachment,
      });

      setTaskResolutionNotes((current) => [note, ...current.filter((currentNote) => currentNote.id !== note.id)]);
      setTaskResolutionNoteDraft("");
      setTaskResolutionNoteAttachment(null);
    } catch (error) {
      setTaskResolutionNoteError(error instanceof Error ? error.message : "Não foi possível salvar a evolução da tarefa.");
    } finally {
      setIsSavingTaskResolutionNote(false);
    }
  };

  const handleDeleteTaskResolutionNote = async (noteId: string) => {
    const previousNotes = taskResolutionNotes;

    setDeletingTaskResolutionNoteId(noteId);
    setTaskResolutionNoteError("");
    setTaskResolutionNotes((current) => current.filter((note) => note.id !== noteId));

    try {
      await deleteTaskResolutionNote(noteId);
    } catch (error) {
      setTaskResolutionNotes(previousNotes);
      setTaskResolutionNoteError(error instanceof Error ? error.message : "Não foi possível apagar a evolução da tarefa.");
    } finally {
      setDeletingTaskResolutionNoteId("");
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

  const filtersConfig = [
    {
      id: "tipo",
      icon: Tag,
      value: typeFilter,
      options: typeOptions,
      filterAll: "Tipo",
      onChange: setTypeFilter,
    },
    {
      id: "criador",
      icon: UserPlus,
      value: creatorFilter,
      options: creatorOptions,
      filterAll: "Criador",
      onChange: setCreatorFilter,
    },
    {
      id: "responsavel",
      icon: IdCardLanyard,
      value: responsibleFilter,
      options: responsibleOptions,
      filterAll: "Responsável",
      onChange: setResponsibleFilter,
    },
  ];

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
    <div className="flex h-full w-full flex-1 flex-col bg-background">
      <header className="border-b bg-card px-4 py-2">
        <div className="flex flex-col gap-5">
          <div className="flex flex-row gap-4 sm:flex-row sm:items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground whitespace-nowrap">
                <span className="h-2 w-2 rounded-full bg-cyan-600" />
                Airtable / Encaminhamentos
              </div>
              <h1 className="text-xl font-semibold text-foreground">Tarefas</h1>
            </div>

            <div className="flex flex-row items-center gap-3">
              <div className="hidden sm:grid grid-cols-3 overflow-hidden rounded-lg border bg-background shadow-xs">
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
              <Button type="button" className="gap-2 bg-theme-primary text-white hover:bg-theme-primary/90 h-10 min-[412px]:h-9" onClick={handleOpenCreateDialog}>
                <Plus className="h-4 w-4" />
                <span className="hidden min-[412px]:inline">Nova Tarefa</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por assunto, paciente, responsável..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 bg-background pl-9" />
            </div>

            <div className="flex items-center gap-2 flex-2 min-w-0">
              <div className="flex flex-row items-center gap-2 w-full">
                {filtersConfig.map((filter) => (
                  <FilterMenu key={filter.id} icon={filter.icon} value={filter.value} options={filter.options} filterAll={filter.filterAll} onChange={filter.onChange} />
                ))}

                <Button type="button" variant="outline" className="sm:justify-start bg-background h-10 shrink-0 sm:w-auto justify-center" onClick={() => loadTasks({ refresh: true })} disabled={isLoading || isRefreshing}>
                  {isLoading || isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="hidden sm:inline ml-2">{isRefreshing ? "Atualizando" : "Atualizar"}</span>
                </Button>
              </div>
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
        <div className="px-4 py-3 overflow-x-auto border-b flex bg-card w-full items-center justify-center">
          <TabsList className="gap-1.5 rounded-full h-9 sm:h-11  bg-secondary/50 border border-border/40">
            {taskViewOptions.map((view) => {
              const colors = getTaskStatusColor(view.value);
              const isActive = activeView === view.value;

              return (
                <TabsTrigger
                  key={view.value}
                  value={view.value}
                  className={`group relative data-[state=active]:bg-card px-3.5 h-6 sm:px-6 sm:h-9 rounded-full text-xs sm:text-[14px] font-medium transition-all gap-2 cursor-pointer data-[state=active]:shadow-xs ${
                    view.value === "todas" ? "hidden sm:inline-flex" : "inline-flex"
                  }`}
                >
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
                statusOrder.map((status) => <KanbanColumn key={status} status={status} tasks={tasksByStatus[status]} isFiltering={isFiltering} onSelectTask={handleSelectTask} statusConfig={statusConfig} />)
              ) : (
                <TaskStatusGrid status={view.value} tasks={tasksByStatus[view.value]} isFiltering={isFiltering} onSelectTask={handleSelectTask} statusConfig={statusConfig} />
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
        key={selectedTask?.id || "no-task"}
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) {
            setTaskActionError("");
            setTaskResolutionNoteError("");
            setTaskResolutionNoteDraft("");
            setTaskResolutionNoteAttachment(null);
            setTaskResolutionNotes([]);
            setSelectedTask(null);
          }
        }}
        onDelete={handleDeleteTask}
        onUpdate={handleUpdateTask}
        notes={taskResolutionNotes}
        noteDraft={taskResolutionNoteDraft}
        noteAttachment={taskResolutionNoteAttachment}
        onNoteDraftChange={setTaskResolutionNoteDraft}
        onNoteAttachmentChange={setTaskResolutionNoteAttachment}
        onCreateNote={handleCreateTaskResolutionNote}
        onDeleteNote={handleDeleteTaskResolutionNote}
        taskOptions={taskOptions}
        isLoadingTaskOptions={isLoadingTaskOptions}
        isLoadingNotes={isLoadingTaskResolutionNotes}
        isSavingNote={isSavingTaskResolutionNote}
        deletingNoteId={deletingTaskResolutionNoteId}
        isDeleting={Boolean(selectedTask && deletingTaskId === selectedTask.id)}
        isSaving={Boolean(selectedTask && savingTaskId === selectedTask.id)}
        errorMessage={taskActionError}
        noteErrorMessage={taskResolutionNoteError}
        statusConfig={statusConfig}
      />
    </div>
  );
}
