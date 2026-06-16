"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useIsMobile } from "@/hooks/use-mobile";
import { getTodayDate, parseDateOnly } from "@/lib/date";
import { fetchChats, fetchMessages, type ChatRecord, type MessageRecord } from "@/lib/supabase-rest";
import { fallbackTaskOptions, getTaskNoteAttachmentType, type StatusConfigMap, type Task, type TaskOptions, type TaskResolutionNote, type TaskStatus } from "@/lib/task";
import { getDraTatianaResponsibleFilter, isDraTatianaUser } from "@/lib/user-access";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Circle, CircleDashed, IdCardLanyard, Loader2, Plus, RefreshCw, Search, Shapes, Timer, User } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FilterMenu } from "./filter-menu";
import { KanbanColumn } from "./kanban-column";
import { TaskDetailsDialog } from "./task-details-dialog";
import { TaskStatusGrid } from "./task-grid";
import { TaskPatientMessagesDialog } from "./task-patient-messages-dialog";
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

function getTaskSortTime(task: Task) {
  const value = task.dueDate || task.createdAt || "";
  const date = parseDateOnly(value) ?? new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function getChatDisplayName(chat: ChatRecord) {
  return chat.nome_contato || chat.pushname || chat.phone_contact || chat.chat_id?.replace(/@.+$/, "") || "Contato sem nome";
}

function getChatLookupKeys(chat: ChatRecord) {
  const digits = getDigits(`${chat.chat_id || ""} ${chat.phone_contact || ""}`);
  const localDigits = digits.startsWith("55") ? digits.slice(2) : "";

  return [chat.chat_id, chat.phone_contact, digits, localDigits].map((value) => value?.trim()).filter(isNonEmptyString);
}

function getTaskPatientLookupKeys(task: Task) {
  const digits = getDigits(`${task.patientChatId || ""} ${task.patientPhone || ""}`);
  const localDigits = digits.startsWith("55") ? digits.slice(2) : "";

  return [task.patientChatId, task.patientPhone, digits, localDigits].map((value) => value?.trim()).filter(isNonEmptyString);
}

function sortTasksForStatus(status: TaskStatus, tasks: Task[]) {
  if (status !== "finalizado") return tasks;

  return [...tasks].sort((a, b) => getTaskSortTime(b) - getTaskSortTime(a));
}

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

function getTaskAccessParams(user: { id?: string; role?: string } | null | undefined) {
  const params = new URLSearchParams();
  if (user?.id) params.set("userId", user.id);
  if (user?.role) params.set("role", user.role);
  return params;
}

async function fetchTaskRecords({ signal, refresh = false, user }: { signal?: AbortSignal; refresh?: boolean; user?: { id?: string; role?: string } | null } = {}) {
  const params = getTaskAccessParams(user);
  if (refresh) params.set("refresh", "1");
  const query = params.toString();
  const response = await fetch(`/api/airtable/tasks${query ? `?${query}` : ""}`, { cache: "no-store", signal });
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
  const { user, isLoading: isCurrentUserLoading } = useCurrentUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [chats, setChats] = useState<ChatRecord[]>([]);
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
  const [patientMessagesTask, setPatientMessagesTask] = useState<Task | null>(null);
  const [patientMessages, setPatientMessages] = useState<MessageRecord[]>([]);
  const [isLoadingPatientMessages, setIsLoadingPatientMessages] = useState(false);
  const [patientMessagesError, setPatientMessagesError] = useState("");
  const [createTaskError, setCreateTaskError] = useState("");
  const [taskType, setTaskType] = useState(fallbackTaskOptions.types[0]);
  const [taskStatus, setTaskStatus] = useState(fallbackTaskOptions.statuses[0]);
  const [taskDueDate, setTaskDueDate] = useState(getTodayDate());
  const [taskPatientName, setTaskPatientName] = useState("");
  const [taskContactPhone, setTaskContactPhone] = useState("");
  const [taskContactChatId, setTaskContactChatId] = useState("");
  const [isContactSearchOpen, setIsContactSearchOpen] = useState(false);
  const [taskResponsibleUserId, setTaskResponsibleUserId] = useState("");
  const [taskSubject, setTaskSubject] = useState("");
  const [taskObservations, setTaskObservations] = useState("");
  const [hasAppliedInitialResponsibleFilter, setHasAppliedInitialResponsibleFilter] = useState(false);
  const patientMessagesRequestIdRef = useRef(0);

  useEffect(() => {
    if (isCurrentUserLoading) return;

    const controller = new AbortController();

    void (async () => {
      try {
        setErrorMessage("");
        const loadedTasks = await fetchTaskRecords({ signal: controller.signal, user });
        setTasks(loadedTasks);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os encaminhamentos.");
        setTasks([]);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [isCurrentUserLoading, user]);

  useEffect(() => {
    fetchChats({ limit: 1000 })
      .then((data) => setChats(data))
      .catch(() => setChats([]));
  }, []);

  const loadTasks = async ({ refresh = false }: { refresh?: boolean } = {}) => {
    const shouldShowFullLoader = tasks.length === 0;
    setIsLoading(shouldShowFullLoader);
    setIsRefreshing(!shouldShowFullLoader);
    setErrorMessage("");

    try {
      const loadedTasks = await fetchTaskRecords({ refresh, user });
      setTasks(loadedTasks);
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

  const handleOpenPatientMessages = (task: Task) => {
    if (!task.patientChatId) return;

    const requestId = patientMessagesRequestIdRef.current + 1;
    patientMessagesRequestIdRef.current = requestId;
    setPatientMessagesTask(task);
    setPatientMessages([]);
    setPatientMessagesError("");
    setIsLoadingPatientMessages(true);

    fetchMessages(task.patientChatId, { limit: 15 })
      .then((messages) => {
        if (patientMessagesRequestIdRef.current !== requestId) return;
        setPatientMessages(messages);
      })
      .catch((error) => {
        if (patientMessagesRequestIdRef.current !== requestId) return;
        setPatientMessagesError(error instanceof Error ? error.message : "Não foi possível carregar as mensagens do paciente.");
      })
      .finally(() => {
        if (patientMessagesRequestIdRef.current === requestId) setIsLoadingPatientMessages(false);
      });
  };

  const isSmallScreen = useIsMobile(640);

  useEffect(() => {
    if (!isSmallScreen || activeView !== "todas") return;

    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) setActiveView("aguardando");
    });

    return () => {
      isCurrent = false;
    };
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
    setTaskContactChatId("");
    setIsContactSearchOpen(false);
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
      if (!user) {
        throw new Error("Não foi possível identificar o usuário logado para criar a tarefa.");
      }

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
          chatId: taskContactChatId,
          subject: taskSubject,
          observations: taskObservations,
          creatorName: user.name,
          creatorUserId: user.id || "",
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

  const chatsByLookupKey = useMemo(() => {
    const lookup = new Map<string, ChatRecord>();

    for (const chat of chats) {
      for (const key of getChatLookupKeys(chat)) {
        if (!lookup.has(key)) lookup.set(key, chat);
      }
    }

    return lookup;
  }, [chats]);

  const contactSearchResults = useMemo(() => {
    const query = normalizeText(taskPatientName);
    if (!query) return [];

    const seen = new Set<string>();

    return chats
      .filter((chat) => {
        const id = chat.chat_id || chat.phone_contact || getChatDisplayName(chat);
        if (!id || seen.has(id)) return false;

        const searchable = normalizeText([getChatDisplayName(chat), chat.phone_contact, chat.chat_id].filter(Boolean).join(" "));
        const matches = searchable.includes(query);
        if (matches) seen.add(id);

        return matches;
      })
      .slice(0, 8);
  }, [chats, taskPatientName]);

  const enrichedTasks = useMemo(
    () =>
      tasks.map((task) => {
        const chat = getTaskPatientLookupKeys(task)
          .map((key) => chatsByLookupKey.get(key))
          .find(Boolean);

        if (!chat) return task;

        return {
          ...task,
          patient: getChatDisplayName(chat) || task.patient,
          patientChatId: chat.chat_id || task.patientChatId,
          patientPhone: chat.phone_contact || task.patientPhone,
          patientPhotoUrl: chat.url_foto_perfil || undefined,
        };
      }),
    [chatsByLookupKey, tasks],
  );

  const typeOptions = useMemo(() => uniqueValues(enrichedTasks, "type"), [enrichedTasks]);
  const creatorOptions = useMemo(() => uniqueValues(enrichedTasks, "creator"), [enrichedTasks]);
  const responsibleOptions = useMemo(() => uniqueValues(enrichedTasks, "responsible"), [enrichedTasks]);
  const initialTatianaResponsibleFilter = useMemo(() => getDraTatianaResponsibleFilter(responsibleOptions), [responsibleOptions]);

  useEffect(() => {
    if (hasAppliedInitialResponsibleFilter || isCurrentUserLoading || !isDraTatianaUser(user) || !initialTatianaResponsibleFilter) return;

    let isCurrent = true;
    queueMicrotask(() => {
      if (!isCurrent) return;
      setHasAppliedInitialResponsibleFilter(true);
      setResponsibleFilter(initialTatianaResponsibleFilter);
    });

    return () => {
      isCurrent = false;
    };
  }, [hasAppliedInitialResponsibleFilter, initialTatianaResponsibleFilter, isCurrentUserLoading, user]);

  const effectiveResponsibleFilter = responsibleFilter === filterAll && !hasAppliedInitialResponsibleFilter && isDraTatianaUser(user) && initialTatianaResponsibleFilter ? initialTatianaResponsibleFilter : responsibleFilter;

  const filtersConfig = [
    {
      id: "tipo",
      icon: Shapes,
      value: typeFilter,
      options: typeOptions,
      filterAll: "Tipo",
      onChange: setTypeFilter,
    },
    {
      id: "criador",
      icon: User,
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

    return enrichedTasks.filter((task) => {
      const matchesQuery = query ? [task.subject, task.description, task.patient, task.creator, task.responsible, task.type].join(" ").toLowerCase().includes(query) : true;
      const matchesType = typeFilter === filterAll || task.type === typeFilter;
      const matchesCreator = creatorFilter === filterAll || task.creator === creatorFilter;
      const matchesResponsible = effectiveResponsibleFilter === filterAll || task.responsible === effectiveResponsibleFilter;

      return matchesQuery && matchesType && matchesCreator && matchesResponsible;
    });
  }, [creatorFilter, effectiveResponsibleFilter, enrichedTasks, searchQuery, typeFilter]);

  const tasksByStatus = useMemo(
    () =>
      statusOrder.reduce(
        (acc, status) => {
          acc[status] = sortTasksForStatus(
            status,
            filteredTasks.filter((task) => task.status === status),
          );
          return acc;
        },
        {} as Record<TaskStatus, Task[]>,
      ),
    [filteredTasks],
  );

  const isFiltering = Boolean(searchQuery.trim()) || typeFilter !== filterAll || creatorFilter !== filterAll || effectiveResponsibleFilter !== filterAll;
  const totalOpen = tasksByStatus.aguardando.length + tasksByStatus.resolvendo.length;

  return (
    <div className="flex h-full w-full flex-1 flex-col bg-background">
      <header className="border-b bg-card px-4 py-2">
        <div className="flex flex-col gap-5">
          <div className="flex flex-row gap-4 sm:flex-row sm:items-center justify-between">
            <div>
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
              <div className="flex flex-row items-center justify-end gap-2 w-full">
                {filtersConfig.map((filter) => (
                  <FilterMenu key={filter.id} icon={filter.icon} value={filter.value} options={filter.options} filterAll={filter.filterAll} onChange={filter.onChange} />
                ))}

                <Button type="button" variant="outline" className="sm:justify-start bg-background h-10 shrink-0 sm:w-auto justify-center" onClick={() => loadTasks({ refresh: true })} disabled={isLoading || isRefreshing}>
                  {isLoading || isRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-theme-primary" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="hidden lg:inline ml-2">{isRefreshing ? "Atualizando" : "Atualizar"}</span>
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
            <main className="flex h-full flex-1 gap-4 overflow-x-auto p-5 custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-theme-primary" />
                    Carregando encaminhamentos
                  </div>
                </div>
              ) : view.value === "todas" ? (
                statusOrder.map((status) => (
                  <KanbanColumn key={status} status={status} tasks={tasksByStatus[status]} isFiltering={isFiltering} onSelectTask={handleSelectTask} onOpenPatientMessages={handleOpenPatientMessages} statusConfig={statusConfig} />
                ))
              ) : (
                <TaskStatusGrid status={view.value} tasks={tasksByStatus[view.value]} isFiltering={isFiltering} onSelectTask={handleSelectTask} onOpenPatientMessages={handleOpenPatientMessages} statusConfig={statusConfig} />
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

              <div className="space-y-1.5 sm:col-span-2">
                <FieldLabel>Contato / Paciente</FieldLabel>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-10 pl-9"
                    value={taskPatientName}
                    placeholder="Digite o nome do contato"
                    required
                    onBlur={() => {
                      window.setTimeout(() => setIsContactSearchOpen(false), 120);
                    }}
                    onChange={(event) => {
                      setTaskPatientName(event.target.value);
                      setTaskContactPhone("");
                      setTaskContactChatId("");
                      setIsContactSearchOpen(true);
                    }}
                    onFocus={() => {
                      if (taskPatientName.trim()) setIsContactSearchOpen(true);
                    }}
                  />
                  {isContactSearchOpen && taskPatientName.trim() ? (
                    <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                      {contactSearchResults.length > 0 ? (
                        contactSearchResults.map((chat) => (
                          <button
                            key={chat.chat_id || chat.phone_contact || getChatDisplayName(chat)}
                            type="button"
                            className={cn(
                              "flex w-full flex-col rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                              (taskContactChatId === chat.chat_id || taskContactPhone === chat.phone_contact) && "bg-accent text-accent-foreground",
                            )}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setTaskPatientName(getChatDisplayName(chat));
                              setTaskContactPhone(chat.phone_contact || "");
                              setTaskContactChatId(chat.chat_id || "");
                              setIsContactSearchOpen(false);
                            }}
                          >
                            <span className="truncate font-medium">{getChatDisplayName(chat)}</span>
                            {chat.phone_contact || chat.chat_id ? <span className="truncate text-xs text-muted-foreground">{chat.phone_contact || chat.chat_id}</span> : null}
                          </button>
                        ))
                      ) : (
                        <div className="px-2 py-2 text-sm text-muted-foreground">Nenhum contato encontrado</div>
                      )}
                    </div>
                  ) : null}
                </div>
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
              <Button type="submit" disabled={isCreatingTask || isLoadingTaskOptions || isCurrentUserLoading || !user || !taskResponsibleUserId || (!taskContactChatId && !taskContactPhone)}>
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
        onOpenPatientMessages={handleOpenPatientMessages}
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
      <TaskPatientMessagesDialog
        task={patientMessagesTask}
        open={Boolean(patientMessagesTask)}
        onOpenChange={(open) => {
          if (!open) {
            patientMessagesRequestIdRef.current += 1;
            setPatientMessagesTask(null);
            setPatientMessages([]);
            setPatientMessagesError("");
            setIsLoadingPatientMessages(false);
          }
        }}
        messages={patientMessages}
        isLoading={isLoadingPatientMessages}
        errorMessage={patientMessagesError}
      />
    </div>
  );
}
