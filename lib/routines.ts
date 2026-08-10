import { Cake, Calendar, Circle, Hand, LucideIcon, MessageSquareText, Sparkles, Tag } from "lucide-react";

export type RoutineTrigger = "manual" | "specific_date" | "tag" | "status" | "birthday" | "specific_message" | "ai_message";

export type RoutineConditionOperator = "all" | "any";

export type RoutineComparisonOperator = "exists" | "equals" | "contains" | "starts_with" | "regex" | "is_today" | "ai_matches";

export interface RoutineCondition {
  id: string;
  type: RoutineTrigger;
  comparisonOperator: RoutineComparisonOperator;
  value: string;
  targetId?: string;
  targetLabel?: string;
  targetColor?: string;
  active: boolean;
}

export interface RoutineConditionGroup {
  id: string;
  operator: RoutineConditionOperator;
  conditions: RoutineCondition[];
}

export type RoutineActionType = "create_notice" | "create_task" | "send_message" | "add_tag" | "wait" | "webhook";

export interface RoutineAction {
  id: string;
  type: RoutineActionType;
  label: string;
  delayMinutes: number;
  intervalAmount?: number;
  intervalLabel?: string;
  responsibleUserId?: string;
  subject?: string;
  message?: string;
  notes?: string;
  webhookUrl?: string;
  templateId?: string;
  templateLabel?: string;
  templateContent?: string;
  tagId?: string;
  tagLabel?: string;
  order?: number;
}

export interface RoutineMessageTemplate {
  id: string;
  label: string;
  content: string;
  description?: string;
  type?: string;
  color?: string;
  media?: RoutineMessageTemplateMedia | null;
  active: boolean;
}

export interface RoutineMessageTemplateMedia {
  url: string;
  fileName: string;
  mimeType: string;
  size?: number;
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
  conditionOperator: RoutineConditionOperator;
  conditionGroups: RoutineConditionGroup[];
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
  {
    value: "specific_message",
    label: "Mensagem específica",
    icon: MessageSquareText,
  },
  {
    value: "ai_message",
    label: "Mensagem específica com IA",
    icon: Sparkles,
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
  specific_message: "#2563eb",
  ai_message: "#7c3aed",
};

export function getDefaultComparisonOperator(type: RoutineTrigger): RoutineComparisonOperator {
  if (type === "manual") return "exists";
  if (type === "birthday") return "is_today";
  if (type === "ai_message") return "ai_matches";
  return "equals";
}

export function createEmptyCondition(type: RoutineTrigger = "manual"): RoutineCondition {
  return {
    id: crypto.randomUUID(),
    type,
    comparisonOperator: getDefaultComparisonOperator(type),
    value: "",
    targetId: "",
    targetLabel: "",
    targetColor: "",
    active: true,
  };
}

export function createEmptyConditionGroup(): RoutineConditionGroup {
  return {
    id: crypto.randomUUID(),
    operator: "all",
    conditions: [createEmptyCondition()],
  };
}

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
