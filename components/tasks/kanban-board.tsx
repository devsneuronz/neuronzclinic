"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseDateOnly } from "@/lib/date";
import type { IaRequest } from "@/lib/ia-request";
import { fetchChats, type ChatRecord } from "@/lib/supabase-rest";
import { fallbackTaskOptions, getTaskNoteAttachmentType, statusConfig, type Task, type TaskOptions, type TaskResolutionNote, type TaskStatus } from "@/lib/task";
import { getDraTatianaResponsibleFilter, isDraTatianaUser } from "@/lib/user-access";
import { cn } from "@/lib/utils";
import { motion, type Variants } from "framer-motion";
import { AlertCircle, CalendarPlus, Circle, IdCardLanyard, ListPlus, Loader2, Plus, RefreshCw, Search, Shapes, Sparkles, User } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { SkeletonShimmer } from "../ui/skeleton-shimmer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ConfirmActionDialog, type ConfirmActionDialogState } from "./confirm-action-dialog";
import { FilterMenu } from "./filter-menu";
import { IaRequestDialog } from "./ia-request-dialog";
import { canConfirmIaRequest, getIaRequestActionKind, getIaRequestStatusLabel, getIaRequestTypeFilterLabel, isIaRequestCompleted } from "./ia-request-utils";
import { IaRequestsColumn } from "./ia-requests-column";
import { KanbanColumn } from "./kanban-column";
import { TaskChatDialog } from "./task-chat-dialog";
import { TaskDetailsDialog } from "./task-details-dialog";
import { TaskStatusGrid } from "./task-grid";
type TaskView = "todas" | TaskStatus | "avisos-ia";
type CreatedAtFilter = " " | "today" | "last7" | "last30" | "oldestFirst" | "overdue";

const statusOrder: TaskStatus[] = ["aguardando", "resolvendo", "finalizado"];
const IA_REQUESTS_ADMIN_ONLY = true;
const noResponsibleUserId = "__no_responsible__";
const taskViewOptions: Array<{ value: TaskView; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "aguardando", label: "Aguardando" },
  { value: "resolvendo", label: "Resolvendo" },
  { value: "finalizado", label: "Finalizadas" },
  { value: "avisos-ia", label: "Avisos da IA" },
];
const closedConfirmActionDialog: ConfirmActionDialogState = {
  open: false,
  title: "",
  description: "",
  confirmLabel: "",
  onConfirm: () => undefined,
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
const createdAtFilterOptions: Array<{ value: CreatedAtFilter; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "last30", label: "Últimos 30 dias" },
  { value: "oldestFirst", label: "Mais antigas primeiro" },
  { value: "overdue", label: "Vencidas" },
];
const iaRequestTypeOptions = ["Aviso - IA", "Agendamento", "Intenção"];

function getTaskCreatedTime(task: Task) {
  const date = new Date(task.createdAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isTaskOverdue(task: Task) {
  if (task.status === "finalizado" || !task.dueDate) return false;

  const dueDate = parseDateOnly(task.dueDate);
  if (!dueDate || Number.isNaN(dueDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate.getTime() < today.getTime();
}

function matchesCreatedAtFilter(task: Task, filter: CreatedAtFilter) {
  if (filter === filterAll) return true;
  if (filter === "overdue") return isTaskOverdue(task);
  if (filter === "oldestFirst") return true;

  const createdAt = new Date(task.createdAt || 0);
  if (Number.isNaN(createdAt.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

  if (filter === "today") return createdAt >= today && createdAt < tomorrow;
  if (filter === "last7") return createdAt >= sevenDaysAgo && createdAt < tomorrow;
  if (filter === "last30") return createdAt >= thirtyDaysAgo && createdAt < tomorrow;

  return true;
}

function sortTasksByCreatedAt(tasks: Task[], direction: "asc" | "desc" = "desc") {
  return [...tasks].sort((a, b) => {
    const diff = getTaskCreatedTime(a) - getTaskCreatedTime(b);
    return direction === "asc" ? diff : -diff;
  });
}

function getTaskStatusColor(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("avisos-ia") || normalized.includes("ia")) {
    return {
      base: "#0e4ce9",
      bg: "#0e4ce91a",
      text: "#0e4ce9",
    };
  }

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
  const response = await fetch(`/api/tasks${query ? `?${query}` : ""}`, { cache: "no-store", signal });
  const data = (await response.json()) as { tasks?: Task[]; message?: string };

  if (!response.ok) {
    throw new Error(data.message || "Não foi possível carregar os encaminhamentos.");
  }

  return data.tasks ?? [];
}

function getIaRequestAccessParams(user: { id?: string; email?: string; role?: string } | null | undefined) {
  const params = new URLSearchParams();
  if (user?.id) params.set("userId", user.id);
  if (user?.email) params.set("email", user.email);
  if (user?.role) params.set("role", user.role);
  return params;
}

async function fetchIaRequests({ signal, user }: { signal?: AbortSignal; user?: { id?: string; email?: string; role?: string } | null } = {}) {
  const params = getIaRequestAccessParams(user);
  const query = params.toString();
  const response = await fetch(`/api/ia-requests${query ? `?${query}` : ""}`, { cache: "no-store", signal });
  const data = (await response.json()) as { requests?: IaRequest[]; message?: string };

  if (!response.ok) {
    throw new Error(data.message || "Nao foi possivel carregar avisos da IA.");
  }

  return data.requests ?? [];
}

async function fetchTaskOptions() {
  const response = await fetch("/api/task-options", { cache: "no-store" });
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

const taskSkeletonContainerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045,
    },
  },
};

const taskSkeletonItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    },
  },
};

const taskSkeletonCounts: Record<TaskStatus, number> = {
  aguardando: 4,
  resolvendo: 3,
  finalizado: 3,
};

function TaskCardSkeleton() {
  return (
    <div className="rounded-md border bg-card p-4 text-left shadow-xs">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <SkeletonShimmer className="h-5 w-24 rounded-md" />
            <SkeletonShimmer className="h-5 w-16 rounded-md" />
          </div>
          <SkeletonShimmer className="h-4 w-11/12 rounded" />
          <SkeletonShimmer className="h-4 w-2/3 rounded" />
        </div>
        <SkeletonShimmer className="h-8 w-8 shrink-0 rounded-full" />
      </div>

      <div className="mb-4 space-y-2">
        <SkeletonShimmer className="h-3.5 w-full rounded" />
        <SkeletonShimmer className="h-3.5 w-10/12 rounded" />
        <SkeletonShimmer className="h-3.5 w-7/12 rounded" />
      </div>

      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center gap-2">
          <SkeletonShimmer className="h-7 w-7 shrink-0 rounded-full" />
          <SkeletonShimmer className="h-4 w-36 rounded" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <SkeletonShimmer className="h-3 w-20 rounded" />
            <SkeletonShimmer className="h-4 w-28 rounded" />
          </div>
          <div className="flex flex-col items-end space-y-1">
            <SkeletonShimmer className="h-3 w-10 rounded" />
            <SkeletonShimmer className="h-4 w-20 rounded" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <SkeletonShimmer className="h-3 w-32 rounded" />
          <SkeletonShimmer className="h-3 w-16 rounded" />
        </div>
      </div>
    </div>
  );
}

function TaskSkeletonColumn({ status, count = taskSkeletonCounts[status] }: { status: TaskStatus; count?: number }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const skeletonItems = Array.from({ length: count }, (_, index) => index);

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
        <SkeletonShimmer className={cn("h-6 w-8 rounded-md border shadow-xs", config.countClassName)} />
      </div>

      <motion.div variants={taskSkeletonContainerVariants} initial="hidden" animate="show" className="flex flex-1 flex-col gap-3 overflow-y-auto p-1 custom-scrollbar">
        {skeletonItems.map((index) => (
          <motion.div key={index} variants={taskSkeletonItemVariants}>
            <TaskCardSkeleton />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

function IaRequestsSkeletonColumn() {
  const skeletonItems = Array.from({ length: 4 }, (_, index) => index);

  return (
    <section className="flex min-w-[300px] flex-1 flex-col rounded-md border border-blue-700/20 bg-blue-700/5 p-3">
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="flex items-start gap-2">
          <span className="mt-1.25 h-2.5 w-2.5 rounded-full bg-blue-900" />
          <div>
            <div className="flex items-center gap-2 font-semibold text-blue-900">
              <Sparkles className="h-3.5 w-3.5 " />
              Avisos da IA
            </div>
            <SkeletonShimmer className="w-50 h-3 mt-1 rounded-md" />
          </div>
        </div>
        <SkeletonShimmer className="h-6 w-8 rounded-md border border-blue-700/20 bg-blue-700/10 shadow-xs" />
      </div>

      <motion.div variants={taskSkeletonContainerVariants} initial="hidden" animate="show" className="flex flex-1 flex-col gap-3 overflow-y-auto p-1 custom-scrollbar">
        {skeletonItems.map((index) => (
          <motion.div key={index} variants={taskSkeletonItemVariants}>
            <TaskCardSkeleton />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

function TaskSkeletonGrid({ status }: { status: TaskStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const skeletonItems = Array.from({ length: 20 }, (_, index) => index);

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
        <SkeletonShimmer className={cn("h-6 w-8 rounded-md border shadow-xs", config.countClassName)} />
      </div>

      <motion.div variants={taskSkeletonContainerVariants} initial="hidden" animate="show" className="grid flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 overflow-y-auto p-1 pr-1 custom-scrollbar">
        {skeletonItems.map((index) => (
          <motion.div key={index} variants={taskSkeletonItemVariants}>
            <TaskCardSkeleton />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

function IaRequestsSkeletonGrid() {
  const skeletonItems = Array.from({ length: 20 }, (_, index) => index);

  return (
    <section className="flex min-w-full flex-1 flex-col rounded-md border border-blue-700/20 bg-blue-700/5 p-3">
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="flex items-start gap-2">
          <span className="mt-1.25 h-2.5 w-2.5 rounded-full bg-blue-900" />
          <div>
            <div className="flex items-center gap-2 font-semibold text-blue-900">
              <Sparkles className="h-3.5 w-3.5 " />
              Avisos da IA
            </div>
          </div>
        </div>
        <SkeletonShimmer className="h-6 w-8 rounded-md border border-blue-700/20 bg-blue-700/10 shadow-xs" />
      </div>

      <motion.div variants={taskSkeletonContainerVariants} initial="hidden" animate="show" className="grid flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 overflow-y-auto p-1 pr-1 custom-scrollbar">
        {skeletonItems.map((index) => (
          <motion.div key={index} variants={taskSkeletonItemVariants}>
            <TaskCardSkeleton />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

function getIaRequestChatTask(request: IaRequest, chat?: ChatRecord): Task {
  const contactName = chat ? getChatDisplayName(chat) : request.chatId;

  return {
    id: request.id,
    subject: request.situation || "Aviso da IA",
    description: request.context,
    creator: "IA",
    creatorInitials: "IA",
    responsible: "Equipe",
    responsibleUserId: "",
    responsibleInitials: "EQ",
    patient: contactName,
    patientChatId: chat?.chat_id || request.chatId,
    patientPhone: chat?.phone_contact || "",
    patientPhotoUrl: chat?.url_foto_perfil || undefined,
    type: "Aviso da IA",
    status: "aguardando",
    statusLabel: getIaRequestStatusLabel(request.status),
    createdAt: request.createdAt,
    dueDate: request.chosenDate,
  };
}

export function KanbanBoard() {
  const { user, isLoading: isCurrentUserLoading } = useCurrentUser();
  const canViewIaRequests = !IA_REQUESTS_ADMIN_ONLY || user?.role === "admin";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [iaRequests, setIaRequests] = useState<IaRequest[]>([]);
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [activeView, setActiveView] = useState<TaskView>("todas");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(filterAll);
  const [creatorFilter, setCreatorFilter] = useState(filterAll);
  const [responsibleFilter, setResponsibleFilter] = useState(filterAll);
  const [createdAtFilter, setCreatedAtFilter] = useState<CreatedAtFilter>(filterAll);
  const [taskOptions, setTaskOptions] = useState<TaskOptions>(fallbackTaskOptions);
  const [isLoadingTaskOptions, setIsLoadingTaskOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedIaRequest, setSelectedIaRequest] = useState<IaRequest | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [deletingIaRequestId, setDeletingIaRequestId] = useState("");
  const [confirmingIaRequestId, setConfirmingIaRequestId] = useState("");
  const [completingIaRequestId, setCompletingIaRequestId] = useState("");
  const [savingTaskId, setSavingTaskId] = useState("");
  const [iaRequestActionError, setIaRequestActionError] = useState("");
  const [taskResolutionNotes, setTaskResolutionNotes] = useState<TaskResolutionNote[]>([]);
  const [taskResolutionNoteDraft, setTaskResolutionNoteDraft] = useState("");
  const [taskResolutionNoteAttachment, setTaskResolutionNoteAttachment] = useState<File | null>(null);
  const [isLoadingTaskResolutionNotes, setIsLoadingTaskResolutionNotes] = useState(false);
  const [isSavingTaskResolutionNote, setIsSavingTaskResolutionNote] = useState(false);
  const [deletingTaskResolutionNoteId, setDeletingTaskResolutionNoteId] = useState("");
  const [taskResolutionNoteError, setTaskResolutionNoteError] = useState("");
  const [taskActionError, setTaskActionError] = useState("");
  const [chatTask, setChatTask] = useState<Task | null>(null);
  const [createTaskError, setCreateTaskError] = useState("");
  const [taskType, setTaskType] = useState(fallbackTaskOptions.types[0]);
  const [taskStatus, setTaskStatus] = useState(fallbackTaskOptions.statuses[0]);
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPatientName, setTaskPatientName] = useState("");
  const [taskContactPhone, setTaskContactPhone] = useState("");
  const [taskContactChatId, setTaskContactChatId] = useState("");
  const [isContactSearchOpen, setIsContactSearchOpen] = useState(false);
  const [taskResponsibleUserId, setTaskResponsibleUserId] = useState(noResponsibleUserId);
  const [taskSubject, setTaskSubject] = useState("");
  const [taskObservations, setTaskObservations] = useState("");
  const [confirmActionDialog, setConfirmActionDialog] = useState<ConfirmActionDialogState>(closedConfirmActionDialog);

  useEffect(() => {
    if (isCurrentUserLoading) return;

    const controller = new AbortController();

    void (async () => {
      try {
        setErrorMessage("");
        const [loadedTasks, loadedIaRequests] = await Promise.all([fetchTaskRecords({ signal: controller.signal, user }), canViewIaRequests ? fetchIaRequests({ signal: controller.signal, user }) : Promise.resolve([])]);
        setTasks(loadedTasks);
        setIaRequests(loadedIaRequests);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os encaminhamentos.");
        setTasks([]);
        setIaRequests([]);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [canViewIaRequests, isCurrentUserLoading, user]);

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
      const [loadedTasks, loadedIaRequests] = await Promise.all([fetchTaskRecords({ refresh, user }), canViewIaRequests ? fetchIaRequests({ user }) : Promise.resolve([])]);
      setTasks(loadedTasks);
      setIaRequests(loadedIaRequests);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os encaminhamentos.");
      if (tasks.length === 0) {
        setTasks([]);
        setIaRequests([]);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const performDeleteTask = async (task: Task) => {
    setConfirmActionDialog((current) => ({ ...current, isLoading: true }));
    setDeletingTaskId(task.id);
    setTaskActionError("");

    try {
      const response = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel excluir a tarefa.");
      }

      setTasks((current) => current.filter((currentTask) => currentTask.id !== task.id));
      setSelectedTask(null);
      setConfirmActionDialog(closedConfirmActionDialog);
    } catch (error) {
      setTaskActionError(error instanceof Error ? error.message : "Nao foi possivel excluir a tarefa.");
      setConfirmActionDialog((current) => ({ ...current, isLoading: false }));
    } finally {
      setDeletingTaskId("");
    }
  };

  const handleDeleteTask = async (task: Task) => {
    setConfirmActionDialog({
      open: true,
      title: "Excluir tarefa",
      description: `Excluir a tarefa "${task.subject || task.type || "sem assunto"}"? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
      onConfirm: () => void performDeleteTask(task),
    });
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
    setChatTask(task);
  };

  const handleOpenIaRequestChat = (request: IaRequest, chat?: ChatRecord) => {
    if (!request.chatId && !chat?.chat_id) return;
    setChatTask(getIaRequestChatTask(request, chat));
  };

  const handleSelectIaRequest = (request: IaRequest) => {
    setIaRequestActionError("");
    setSelectedIaRequest(request);
  };

  const getIaRequestActionUrl = (requestId: string) => {
    const params = getIaRequestAccessParams(user);
    params.set("id", requestId);
    return `/api/ia-requests?${params.toString()}`;
  };

  const performDeleteIaRequest = async (request: IaRequest) => {
    setConfirmActionDialog((current) => ({ ...current, isLoading: true }));
    setDeletingIaRequestId(request.id);
    setIaRequestActionError("");

    try {
      const response = await fetch(getIaRequestActionUrl(request.id), {
        method: "DELETE",
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel excluir o aviso da IA.");
      }

      setIaRequests((current) => current.filter((currentRequest) => currentRequest.id !== request.id));
      setSelectedIaRequest(null);
      setConfirmActionDialog(closedConfirmActionDialog);
    } catch (error) {
      setIaRequestActionError(error instanceof Error ? error.message : "Nao foi possivel excluir o aviso da IA.");
      setConfirmActionDialog((current) => ({ ...current, isLoading: false }));
    } finally {
      setDeletingIaRequestId("");
    }
  };

  const handleDeleteIaRequest = async (request: IaRequest) => {
    setConfirmActionDialog({
      open: true,
      title: "Excluir aviso da IA",
      description: `Excluir o aviso da IA "${request.situation || request.action || "sem titulo"}"?`,
      confirmLabel: "Excluir",
      variant: "destructive",
      onConfirm: () => void performDeleteIaRequest(request),
    });
  };

  const handleConfirmIaRequest = async (request: IaRequest) => {
    if (!canConfirmIaRequest(request)) {
      setIaRequestActionError("A confirmação de agendamento está disponível apenas para avisos do tipo Agendamento com horário selecionado.");
      return;
    }

    setConfirmingIaRequestId(request.id);
    setIaRequestActionError("");

    try {
      const response = await fetch(getIaRequestActionUrl(request.id), {
        method: "POST",
      });
      const data = (await response.json()) as { request?: IaRequest | null; message?: string };

      if (!response.ok || !data.request) {
        throw new Error(data.message || "Nao foi possivel confirmar o agendamento.");
      }

      setIaRequests((current) => current.map((currentRequest) => (currentRequest.id === data.request?.id ? data.request : currentRequest)));
      setSelectedIaRequest(null);
    } catch (error) {
      setIaRequestActionError(error instanceof Error ? error.message : "Nao foi possivel confirmar o agendamento.");
    } finally {
      setConfirmingIaRequestId("");
    }
  };

  const performCompleteIaRequest = async (request: IaRequest) => {
    if (isIaRequestCompleted(request.status)) return;

    setConfirmActionDialog((current) => ({ ...current, isLoading: true }));
    setCompletingIaRequestId(request.id);
    setIaRequestActionError("");

    try {
      const response = await fetch(getIaRequestActionUrl(request.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      const data = (await response.json()) as { request?: IaRequest | null; message?: string };

      if (!response.ok || !data.request) {
        throw new Error(data.message || "Nao foi possivel concluir o aviso da IA.");
      }

      setIaRequests((current) => current.map((currentRequest) => (currentRequest.id === data.request?.id ? { ...currentRequest, ...data.request } : currentRequest)));
      setSelectedIaRequest(null);
      setConfirmActionDialog(closedConfirmActionDialog);
    } catch (error) {
      setIaRequestActionError(error instanceof Error ? error.message : "Nao foi possivel concluir o aviso da IA.");
      setConfirmActionDialog((current) => ({ ...current, isLoading: false }));
    } finally {
      setCompletingIaRequestId("");
    }
  };

  const handleCompleteIaRequest = async (request: IaRequest) => {
    if (isIaRequestCompleted(request.status)) return;

    const isScheduling = getIaRequestActionKind(request.action) === "agendamento";
    setConfirmActionDialog({
      open: true,
      title: isScheduling ? "Não confirmar agendamento" : "Concluir aviso",
      description: isScheduling ? "Este aviso será concluído sem criar o agendamento real. O bloqueio temporário criado pela IA será removido da agenda se ainda existir." : "Este aviso será marcado como concluído e ficará no fim da lista.",
      confirmLabel: isScheduling ? "Não confirmar" : "Concluir",
      variant: isScheduling ? "destructive" : "default",
      onConfirm: () => void performCompleteIaRequest(request),
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
      const response = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, {
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
    setTaskDueDate("");
    setTaskPatientName("");
    setTaskContactPhone("");
    setTaskContactChatId("");
    setIsContactSearchOpen(false);
    setTaskResponsibleUserId(noResponsibleUserId);
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

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: taskType,
          status: taskStatus,
          createdAt: new Date().toISOString(),
          dueDate: taskDueDate,
          responsibleUserId: taskResponsibleUserId === noResponsibleUserId ? "" : taskResponsibleUserId,
          patientName: taskPatientName,
          contactPhone: taskContactPhone,
          chatId: taskContactChatId,
          subject: taskSubject,
          observations: taskObservations,
          creatorName: user.name,
          creatorUserId: user.id || "",
          creatorEmail: user.email,
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

  const chatsById = useMemo(() => new Map(chats.map((chat) => [chat.id, chat])), [chats]);

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

  const visibleTaskViewOptions = useMemo(() => taskViewOptions.filter((view) => canViewIaRequests || view.value !== "avisos-ia"), [canViewIaRequests]);
  const typeOptions = useMemo(() => Array.from(new Set([...uniqueValues(enrichedTasks, "type"), ...(canViewIaRequests ? iaRequestTypeOptions : [])])), [canViewIaRequests, enrichedTasks]);
  const creatorOptions = useMemo(() => uniqueValues(enrichedTasks, "creator"), [enrichedTasks]);
  const responsibleOptions = useMemo(() => uniqueValues(enrichedTasks, "responsible"), [enrichedTasks]);
  const effectiveResponsibleFilter = isDraTatianaUser(user) ? getDraTatianaResponsibleFilter(responsibleOptions) || responsibleFilter : responsibleFilter;

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
      value: effectiveResponsibleFilter,
      options: responsibleOptions,
      filterAll: "Responsável",
      onChange: setResponsibleFilter,
    },
    {
      id: "criacao",
      icon: CalendarPlus,
      value: createdAtFilterOptions.find((item) => item.value === createdAtFilter)?.label ?? filterAll,
      options: createdAtFilterOptions.map((item) => item.label),
      filterAll: "Criação",
      onChange: (label: string) => {
        const option = createdAtFilterOptions.find((item) => item.label === label);
        setCreatedAtFilter(option?.value ?? filterAll);
      },
    },
  ];

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return enrichedTasks.filter((task) => {
      const matchesQuery = query ? [task.subject, task.description, task.patient, task.creator, task.responsible, task.type].join(" ").toLowerCase().includes(query) : true;
      const matchesType = typeFilter === filterAll || task.type === typeFilter;
      const matchesCreator = creatorFilter === filterAll || task.creator === creatorFilter;
      const matchesResponsible = effectiveResponsibleFilter === filterAll || task.responsible === effectiveResponsibleFilter;
      const matchesCreatedAt = matchesCreatedAtFilter(task, createdAtFilter);

      return matchesQuery && matchesType && matchesCreator && matchesResponsible && matchesCreatedAt;
    });
  }, [createdAtFilter, creatorFilter, effectiveResponsibleFilter, enrichedTasks, searchQuery, typeFilter]);

  const filteredIaRequests = useMemo(() => {
    if (!canViewIaRequests) return [];

    const query = normalizeText(searchQuery);

    return iaRequests.filter((request) => {
      const chat = request.chatId ? chatsById.get(request.chatId) : undefined;
      const searchable = normalizeText([request.situation, request.context, request.status, request.action, request.procedureName, request.procedureId, request.chatId, chat ? getChatDisplayName(chat) : ""].join(" "));
      const matchesType = typeFilter === filterAll || getIaRequestTypeFilterLabel(request.action) === typeFilter;

      return matchesType && (query ? searchable.includes(query) : true);
    });
  }, [canViewIaRequests, chatsById, iaRequests, searchQuery, typeFilter]);

  const tasksByStatus = useMemo(
    () =>
      statusOrder.reduce(
        (acc, status) => {
          const statusTasks = filteredTasks.filter((task) => task.status === status);
          acc[status] = createdAtFilter === "oldestFirst" ? sortTasksByCreatedAt(statusTasks, "asc") : sortTasksForStatus(status, sortTasksByCreatedAt(statusTasks));
          return acc;
        },
        {} as Record<TaskStatus, Task[]>,
      ),
    [createdAtFilter, filteredTasks],
  );

  const isFiltering = Boolean(searchQuery.trim()) || typeFilter !== filterAll || creatorFilter !== filterAll || effectiveResponsibleFilter !== filterAll || createdAtFilter !== filterAll;
  const totalOpen = tasksByStatus.aguardando.length + tasksByStatus.resolvendo.length;
  const pendingIaRequests = canViewIaRequests ? iaRequests.filter((request) => normalizeText(request.status) === "pending").length : 0;
  const effectiveActiveView = canViewIaRequests || activeView !== "avisos-ia" ? activeView : "todas";

  return (
    <div className="flex h-full w-full flex-1 flex-col bg-background">
      <header className="border-b bg-card px-4 py-2">
        <div className="flex flex-col gap-5">
          <div className="flex flex-row gap-4 sm:flex-row sm:items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Tarefas</h1>
            </div>

            <div className="flex flex-row items-center gap-3">
              {isLoading ? (
                <div className={cn("hidden overflow-hidden rounded-lg border bg-background shadow-xs sm:grid", canViewIaRequests ? "w-[400px] grid-cols-4" : "w-[300px] grid-cols-3")}>
                  <div className="flex flex-col items-center justify-center gap-1.5 h-[60.5px]">
                    <SkeletonShimmer className="h-6 w-8 rounded" />
                    <SkeletonShimmer className="h-3 w-12 rounded-xs" />
                  </div>

                  <div className="flex flex-col items-center justify-center border-x gap-1.5 h-[60.5px]">
                    <SkeletonShimmer className="h-6 w-8 rounded" />
                    <SkeletonShimmer className="h-3 w-12 rounded-xs" />
                  </div>

                  <div className="flex flex-col items-center justify-center gap-1.5 h-[60.5px]">
                    <SkeletonShimmer className="h-6 w-8 rounded" />
                    <SkeletonShimmer className="h-3 w-16 rounded-xs" />
                  </div>

                  {canViewIaRequests ? (
                    <div className="flex flex-col items-center justify-center border-l gap-1.5 h-[60.5px]">
                      <SkeletonShimmer className="h-6 w-8 rounded" />
                      <SkeletonShimmer className="h-3 w-14 rounded-xs" />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={cn("hidden overflow-hidden rounded-lg border bg-background shadow-xs sm:grid", canViewIaRequests ? "grid-cols-4" : "grid-cols-3")}>
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
                  {canViewIaRequests ? (
                    <div className="border-l px-4 py-2 text-center">
                      <p className="text-lg font-semibold text-foreground">{pendingIaRequests}</p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">IA pendente</p>
                    </div>
                  ) : null}
                </div>
              )}
              <Button type="button" className="gap-2 bg-theme-primary text-white hover:bg-theme-primary/90 h-10 min-[412px]:h-9" onClick={handleOpenCreateDialog}>
                <Plus className="h-4 w-4" />
                <span className="hidden min-[412px]:inline">Nova Tarefa</span>
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className={cn("relative flex-1", isLoading && "cursor-not-allowed")}>
              {isLoading ? <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 animate-spin" /> : <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
              <Input placeholder="Buscar por tarefa, paciente ou aviso da IA..." value={searchQuery} disabled={isLoading} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 bg-background pl-9" />
            </div>

            <div className="flex items-center gap-2 flex-2 min-w-0">
              <div className="flex flex-row items-center justify-end gap-2 w-full">
                {filtersConfig.map((filter) => (
                  <FilterMenu isLoading={isLoading} key={filter.id} icon={filter.icon} value={filter.value} options={filter.options} filterAll={filter.filterAll} onChange={filter.onChange} />
                ))}

                <Button type="button" variant="outline" className="sm:justify-start bg-background h-10 shrink-0 sm:w-auto justify-center" onClick={() => loadTasks({ refresh: true })} disabled={isLoading || isRefreshing}>
                  {isRefreshing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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

      <Tabs value={effectiveActiveView} onValueChange={(value) => setActiveView(value as TaskView)} className="flex min-h-0 flex-1 gap-0">
        <div className="px-4 py-3 overflow-x-auto border-b flex bg-card w-full items-center justify-center">
          <TabsList className="gap-1.5 rounded-full h-9 sm:h-11  bg-secondary/50 border border-border/40">
            {visibleTaskViewOptions.map((view) => {
              const colors = getTaskStatusColor(view.value);
              const isActive = effectiveActiveView === view.value;

              return (
                <TabsTrigger
                  key={view.value}
                  value={view.value}
                  className={cn(
                    "group relative data-[state=active]:bg-card px-3.5 h-6 sm:px-6 sm:h-9 rounded-full text-xs sm:text-[14px] font-medium transition-all gap-2 cursor-pointer data-[state=active]:shadow-xs",
                    view.value === "avisos-ia" && "data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-500",
                    view.value === "todas" ? "hidden sm:inline-flex" : "inline-flex",
                  )}
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

        {visibleTaskViewOptions.map((view) => (
          <TabsContent key={view.value} value={view.value} className="min-h-0 overflow-hidden">
            <main className="flex h-full flex-1 gap-4 overflow-x-auto p-5 custom-scrollbar">
              {isLoading || isRefreshing ? (
                view.value === "todas" ? (
                  <>
                    {statusOrder.map((status) => (
                      <TaskSkeletonColumn key={status} status={status} />
                    ))}
                    {canViewIaRequests ? <IaRequestsSkeletonColumn /> : null}
                  </>
                ) : view.value === "avisos-ia" ? (
                  <IaRequestsSkeletonGrid />
                ) : (
                  <TaskSkeletonGrid status={view.value} />
                )
              ) : view.value === "todas" ? (
                <>
                  {statusOrder.map((status) => (
                    <KanbanColumn key={status} status={status} tasks={tasksByStatus[status]} isFiltering={isFiltering} onSelectTask={handleSelectTask} onOpenPatientMessages={handleOpenPatientMessages} statusConfig={statusConfig} />
                  ))}
                  {canViewIaRequests ? (
                    <IaRequestsColumn
                      requests={filteredIaRequests}
                      chatsById={chatsById}
                      isFiltering={Boolean(searchQuery.trim())}
                      onSelectRequest={handleSelectIaRequest}
                      onOpenRequestChat={handleOpenIaRequestChat}
                      getChatDisplayName={getChatDisplayName}
                      isAdmin={user?.role === "admin"}
                    />
                  ) : null}
                </>
              ) : view.value === "avisos-ia" ? (
                <IaRequestsColumn
                  requests={filteredIaRequests}
                  chatsById={chatsById}
                  isFiltering={Boolean(searchQuery.trim())}
                  onSelectRequest={handleSelectIaRequest}
                  onOpenRequestChat={handleOpenIaRequestChat}
                  getChatDisplayName={getChatDisplayName}
                  isAdmin={user?.role === "admin"}
                  fullWidth
                />
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
        <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ListPlus className="h-4 w-4 text-theme-primary" />
              Nova tarefa
            </DialogTitle>
            <DialogDescription>Crie uma tarefa com ou sem contato vinculado.</DialogDescription>
          </DialogHeader>

          <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleCreateTask}>
            <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 min-h-0 custom-scrollbar">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Tipo</label>
                  <Select value={taskType} onValueChange={setTaskType} required>
                    <SelectTrigger className="w-full">
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

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Status</label>
                  <Select value={taskStatus} onValueChange={setTaskStatus} required>
                    <SelectTrigger className="w-full">
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

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Prazo</label>
                  <Input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Responsável</label>
                  <Select value={taskResponsibleUserId} onValueChange={setTaskResponsibleUserId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={noResponsibleUserId}>Nenhum</SelectItem>
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

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Contato / Paciente</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      value={taskPatientName}
                      placeholder="Digite o nome do contato"
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
                      <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md custom-scrollbar">
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

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Assunto</label>
                <Input value={taskSubject} onChange={(event) => setTaskSubject(event.target.value)} required />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Observações</label>
                <Textarea className="min-h-20 resize-none" value={taskObservations} onChange={(event) => setTaskObservations(event.target.value)} />
              </div>

              {createTaskError ? (
                <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive animate-fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {createTaskError}
                </div>
              ) : null}
            </div>

            <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/20 shrink-0">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isCreatingTask} className="gap-2 h-9 text-xs">
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreatingTask || isLoadingTaskOptions || isCurrentUserLoading || !user} className="gap-2 h-9 text-xs bg-theme-primary text-white hover:bg-theme-primary/90">
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
      <IaRequestDialog
        request={selectedIaRequest}
        open={Boolean(selectedIaRequest)}
        errorMessage={iaRequestActionError}
        deletingRequestId={deletingIaRequestId}
        confirmingRequestId={confirmingIaRequestId}
        completingRequestId={completingIaRequestId}
        isAdmin={user?.role === "admin"}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIaRequest(null);
            setIaRequestActionError("");
          }
        }}
        onConfirmAppointment={handleConfirmIaRequest}
        onComplete={handleCompleteIaRequest}
        onDelete={handleDeleteIaRequest}
      />
      <ConfirmActionDialog state={confirmActionDialog} onOpenChange={(open) => !confirmActionDialog.isLoading && setConfirmActionDialog(open ? confirmActionDialog : closedConfirmActionDialog)} />
      <TaskChatDialog task={chatTask} open={Boolean(chatTask)} onOpenChange={(open) => !open && setChatTask(null)} forwardTargets={chats} />
    </div>
  );
}
