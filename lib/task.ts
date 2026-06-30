import { ComponentType } from "react";
import { parseDateOnly } from "./date";
import { CheckCircle2, CircleDashed, Timer } from "lucide-react";

export type TaskStatus = "aguardando" | "resolvendo" | "finalizado";

export interface Task {
  id: string;
  subject: string;
  description: string;
  creator: string;
  creatorInitials: string;
  responsible: string;
  responsibleUserId: string;
  responsibleInitials: string;
  patient: string;
  patientChatId: string;
  patientPhone: string;
  patientPhotoUrl?: string;
  type: string;
  status: TaskStatus;
  statusLabel: string;
  createdAt: string;
  dueDate: string;
}

export interface TaskOptions {
  types: string[];
  statuses: string[];
  users: Array<{ id: string; label: string }>;
}

export interface TaskResolutionNote {
  id: string;
  task_id: string;
  content: string;
  status_snapshot: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParsedTaskResolutionNote {
  type: "text" | "image" | "audio";
  content: string;
  mediaUrl: string;
  fileName: string;
  mimeType: string;
}

export interface StatusConfigItem {
  label: string;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  columnClassName: string;
  headerClassName: string;
  helperClassName: string;
  markerClassName: string;
  countClassName: string;
  ringClassName: string;
}

export type StatusConfigMap = Record<TaskStatus, StatusConfigItem>;

export function isOverdue(task: Task) {
  if (!task.dueDate || task.status === "finalizado") return false;

  const dueDate = parseDateOnly(task.dueDate) ?? new Date(task.dueDate);
  if (Number.isNaN(dueDate.getTime())) return false;

  dueDate.setHours(23, 59, 59, 999);
  return dueDate.getTime() < Date.now();
}

export const fallbackTaskOptions: TaskOptions = {
  types: ["Tarefa"],
  statuses: ["Aguardando", "Resolvendo", "Finalizado"],
  users: [],
};

export function getTaskNoteAttachmentType(file: File | null) {
  if (!file) return null;
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "unsupported";
}

export function getTaskTypeBadgeClassName(type: string) {
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

export const statusConfig: StatusConfigMap = {
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
