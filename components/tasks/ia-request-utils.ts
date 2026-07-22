import { AlertCircle, CalendarCheck, ListPlus, type LucideIcon } from "lucide-react";

import type { IaRequest } from "@/lib/ia-request";

export type IaRequestActionKind = "aviso" | "intencao" | "agendamento";

export type IaRequestActionConfig = {
  kind: IaRequestActionKind;
  label: string;
  title: string;
  description: string;
  dateLabel?: string;
  scheduleLabel: string;
  scheduleText: string;
  emptyDateText?: string;
  cardClassName: string;
  iconClassName: string;
  badgeClassName: string;
  panelClassName: string;
  icon: LucideIcon;
};

export function formatIaRequestDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function getIaRequestStatusLabel(status: string) {
  const normalized = normalizeIaRequestText(status);
  if (normalized === "pending") return "Pendente";
  if (normalized === "confirmed" || normalized === "confirmado") return "Confirmado";
  if (normalized === "done" || normalized === "completed" || normalized === "resolved") return "Concluído";
  if (normalized === "canceled" || normalized === "cancelled") return "Cancelado";
  return status || "Sem status";
}

export function isIaRequestConfirmed(status: string) {
  const normalized = normalizeIaRequestText(status);
  return normalized === "confirmed" || normalized === "confirmado";
}

export function isIaRequestCompleted(status: string) {
  const normalized = normalizeIaRequestText(status);
  return normalized === "done" || normalized === "completed" || normalized === "resolved" || normalized === "concluido" || normalized === "concluído";
}

export function getIaRequestActionKind(action: string): IaRequestActionKind {
  const normalized = normalizeIaRequestText(action);
  if (normalized === "agendamento") return "agendamento";
  if (normalized === "intencao") return "intencao";
  return "aviso";
}

export function getIaRequestActionConfig(action: string): IaRequestActionConfig {
  const kind = getIaRequestActionKind(action);

  if (kind === "agendamento") {
    return {
      kind,
      label: "Agendamento",
      title: "Agendamento sugerido pela IA",
      description: "O contato escolheu um dos horários sugeridos. A equipe deve validar e confirmar o atendimento.",
      dateLabel: "Horário escolhido",
      scheduleLabel: "Agenda",
      scheduleText: "Horário selecionado pela IA aguardando confirmação",
      emptyDateText: "Sem horário escolhido",
      cardClassName: "backdrop-blur-sm shadow-sm hover:ring-2 hover:ring-emerald-500/40 transition-all focus-visible:ring-emerald-500/30",
      iconClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
      badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 font-medium",
      panelClassName: "border-emerald-500/10 bg-emerald-500/[0.02]",
      icon: CalendarCheck,
    };
  }

  if (kind === "intencao") {
    return {
      kind,
      label: "Intenção",
      title: "Intenção de agendamento",
      description: "O contato quer agendar, mas informou apenas preferência de dia, período ou turno.",
      dateLabel: "Preferência informada",
      scheduleLabel: "Agenda",
      scheduleText: "Sem horário exato; equipe deve verificar a disponibilidade no painel",
      emptyDateText: "Período pendente de análise",
      cardClassName: "backdrop-blur-sm shadow-sm hover:ring-2 hover:ring-amber-500/40 transition-all focus-visible:ring-amber-500/30",
      iconClassName: "border-amber-500/20 bg-amber-500/10 text-amber-600",
      badgeClassName: "border-amber-500/20 bg-amber-500/10 text-amber-600 font-medium",
      panelClassName: "border-amber-500/10 bg-amber-500/[0.02]",
      icon: ListPlus,
    };
  }

  return {
    kind,
    label: "Aviso",
    title: "Aviso para a equipe",
    description: "Este procedimento não é conduzido pela IA. A equipe deve assumir a continuidade do atendimento.",
    scheduleLabel: "Condução",
    scheduleText: "Fluxo interrompido na IA; triagem manual necessária",
    cardClassName: "backdrop-blur-sm shadow-sm hover:ring-2 hover:ring-sky-500/40 transition-all focus-visible:ring-sky-500/30",
    iconClassName: "border-sky-500/20 bg-sky-500/10 text-sky-600",
    badgeClassName: "border-sky-500/20 bg-sky-500/10 text-sky-600 font-medium",
    panelClassName: "border-sky-500/10 bg-sky-500/[0.02]",
    icon: AlertCircle,
  };
}

export function canConfirmIaRequest(request: IaRequest) {
  return getIaRequestActionKind(request.action) === "agendamento" && !isIaRequestConfirmed(request.status) && !isIaRequestCompleted(request.status) && Boolean(request.chosenDate && request.professionalScheduleId);
}

export function getIaRequestTypeFilterLabel(action: string) {
  const kind = getIaRequestActionKind(action);
  if (kind === "agendamento") return "Agendamento";
  if (kind === "intencao") return "Intenção";
  return "Aviso - IA";
}

function normalizeIaRequestText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
