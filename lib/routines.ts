import { Cake, Calendar, Circle, Hand, LucideIcon, Tag } from "lucide-react";

export type RoutineTrigger = "manual" | "specific_date" | "tag" | "status" | "birthday";

export type RoutineActionType = "create_notice" | "create_task" | "send_message" | "add_tag" | "wait" | "webhook";

export interface RoutineAction {
  id: string;
  type: RoutineActionType;
  label: string;
  delayMinutes: number;
  responsibleUserId?: string;
  subject?: string;
  message?: string;
  notes?: string;
  webhookUrl?: string;
  templateId?: string;
  templateLabel?: string;
  tagId?: string;
  tagLabel?: string;
  intervalLabel?: string;
  order?: number;
}

export interface RoutineMessageTemplate {
  id: string;
  label: string;
  content: string;
  description?: string;
  type?: string;
  color?: string;
  active: boolean;
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  trigger: RoutineTrigger;
  targetId: string;
  targetLabel: string;
  targetColor?: string;
  specificDate?: string;
  birthdayEnabled: boolean;
  active: boolean;
  actions: RoutineAction[];
  processIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TriggerOption {
  value: RoutineTrigger;
  label: string;
  icon: LucideIcon;
}

export const triggerOptions: TriggerOption[] = [
  {
    value: "manual",
    label: "Manual",
    icon: Hand,
  },
  {
    value: "specific_date",
    label: "Data específica",
    icon: Calendar,
  },
  {
    value: "tag",
    label: "Tag",
    icon: Tag,
  },
  {
    value: "status",
    label: "Status",
    icon: Circle,
  },
  {
    value: "birthday",
    label: "Aniversário",
    icon: Cake,
  },
];

export const actionLabels: Record<RoutineActionType, string> = {
  create_notice: "Criar aviso",
  create_task: "Criar tarefa",
  send_message: "Enviar mensagem",
  add_tag: "Vincular tag",
  wait: "Aguardar",
  webhook: "Chamar webhook",
};

export const triggerColors: Record<RoutineTrigger, string> = {
  manual: "#4b5563",
  specific_date: "#374151",
  tag: "#b40a88",
  status: "#078b18",
  birthday: "#d97706",
};

export function createEmptyAction(index: number): RoutineAction {
  return {
    id: crypto.randomUUID(),
    type: index === 0 ? "create_notice" : "create_task",
    label: index === 0 ? "Criar aviso" : "Criar tarefa",
    delayMinutes: index === 0 ? 10 : 0,
    subject: "",
    notes: "",
  };
}
