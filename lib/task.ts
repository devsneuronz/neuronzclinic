import { ComponentType } from "react";

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

  const dueDate = new Date(task.dueDate);
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

