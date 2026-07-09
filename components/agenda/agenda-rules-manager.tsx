"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import {
  createDefaultRules,
  generateProcedureSlots,
  minutesToTime,
  ProfessionalAgenda,
  ProfessionalAgendaProcedure,
  ProfessionalSchedulePeriod,
  ProfessionalScheduleRule,
  timeToMinutes,
  WEEKDAY_LABELS,
  WeekdayName,
} from "@/lib/schedule/professional-agenda";
import { cn } from "@/lib/utils";
import { CalendarClock, Loader2, Plus, Save, Stethoscope, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SkeletonShimmer } from "../ui/skeleton-shimmer";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type ProfessionalOption = {
  id: string;
  name: string;
  email: string;
  hasUser: boolean;
};

type AgendaPayload = {
  professionals: ProfessionalOption[];
  selectedProfessionalId?: string;
  procedures: ProfessionalAgendaProcedure[];
  agenda: ProfessionalAgenda | null;
  canCreateAgenda: boolean;
  canEditAgenda: boolean;
  message?: string;
};

const defaultStartTime = "09:00";
const defaultDuration = 30;
const maxBlocksPerDay = 3;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nao foi possivel concluir a acao.";
}

function addMinutesToTime(time: string, minutes: number) {
  return minutesToTime(Math.min(24 * 60, timeToMinutes(time) + minutes));
}

function createPeriod(procedure?: ProfessionalAgendaProcedure, startTime = defaultStartTime, duration = defaultDuration): ProfessionalSchedulePeriod {
  return {
    id: `new-${crypto.randomUUID()}`,
    procedureId: procedure?.id ?? "",
    procedureName: procedure?.name ?? "",
    enabled: true,
    startTime,
    endTime: addMinutesToTime(startTime, duration),
    slotDurationMinutes: duration,
  };
}

function getTimeInputStep(durationMinutes: number) {
  const duration = Number(durationMinutes);
  return Number.isFinite(duration) && duration > 0 ? duration * 60 : defaultDuration * 60;
}

function getPeriodBounds(rule: ProfessionalScheduleRule, periodIndex: number) {
  const period = rule.periods[periodIndex];
  const previous = rule.periods[periodIndex - 1];
  const next = rule.periods[periodIndex + 1];

  return {
    minStartTime: previous?.endTime ?? "00:00",
    maxStartTime: next?.startTime ?? "23:59",
    minEndTime: period?.startTime ? addMinutesToTime(period.startTime, 1) : "00:01",
    maxEndTime: next?.startTime ?? "23:59",
  };
}

function sortRules(rules: ProfessionalScheduleRule[]) {
  const order: WeekdayName[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return [...rules].sort((a, b) => order.indexOf(a.weekday) - order.indexOf(b.weekday));
}

function validateAgendaRules(rules: ProfessionalScheduleRule[]) {
  const messages: string[] = [];

  function addIssue(message: string) {
    if (!messages.includes(message)) messages.push(message);
  }

  for (const rule of rules) {
    for (const period of rule.periods) {
      const start = timeToMinutes(period.startTime);
      const end = timeToMinutes(period.endTime);

      if (!period.procedureId) {
        addIssue(`${WEEKDAY_LABELS[rule.weekday]}: selecione um procedimento para todos os blocos.`);
      }

      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        addIssue(`${WEEKDAY_LABELS[rule.weekday]}: o horario de inicio precisa ser menor que o horario de fim.`);
      }
    }

    if (!rule.isOpen) continue;

    const activePeriods = rule.periods
      .filter((period) => period.enabled)
      .map((period) => ({
        period,
        start: timeToMinutes(period.startTime),
        end: timeToMinutes(period.endTime),
      }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.start < item.end)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    for (let index = 1; index < activePeriods.length; index += 1) {
      const previous = activePeriods[index - 1];
      const current = activePeriods[index];

      if (current.start < previous.end) {
        const message = `${WEEKDAY_LABELS[rule.weekday]}: blocos ativos nao podem sobrepor horarios. Ajuste ${previous.period.startTime}-${previous.period.endTime} e ${current.period.startTime}-${current.period.endTime}.`;
        addIssue(message);
      }
    }
  }

  return { messages };
}

type AgendaRulesManagerProps = {
  professionalId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AgendaRulesManagerDialog({ professionalId, open, onOpenChange }: AgendaRulesManagerProps) {
  const { user, isLoading: isLoadingUser } = useCurrentUser();
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState("");
  const [procedures, setProcedures] = useState<ProfessionalAgendaProcedure[]>([]);
  const [agenda, setAgenda] = useState<ProfessionalAgenda | null>(null);
  const [rules, setRules] = useState<ProfessionalScheduleRule[]>(createDefaultRules);
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [canCreateAgenda, setCanCreateAgenda] = useState(false);
  const [canEditAgenda, setCanEditAgenda] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");

  const viewerEmail = user?.email ?? "";
  const viewerRole = user?.role ?? "user";
  const isAdmin = viewerRole === "admin";

  const viewerQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (viewerEmail) params.set("email", viewerEmail);
    if (viewerRole) params.set("role", viewerRole);
    return params.toString();
  }, [viewerEmail, viewerRole]);

  const selectedProfessional = useMemo(() => professionals.find((professional) => professional.id === selectedProfessionalId), [professionals, selectedProfessionalId]);
  const validation = useMemo(() => validateAgendaRules(rules), [rules]);
  const canSave = canEditAgenda && Boolean(selectedProfessionalId) && procedures.length > 0 && !isLoading && !isSaving;

  const loadAgenda = useCallback(
    async (requestedProfessionalId?: string) => {
      if (!viewerEmail || isLoadingUser) return;

      setIsLoading(true);
      setError("");
      setMessage("");

      try {
        const params = new URLSearchParams(viewerQuery);
        const targetProfessionalId = requestedProfessionalId || professionalId;
        if (targetProfessionalId) params.set("professionalId", targetProfessionalId);

        const response = await fetch(`/api/professional-agendas?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as AgendaPayload & { message?: string };

        if (!response.ok) {
          throw new Error(payload.message || "Nao foi possivel carregar a agenda.");
        }

        setProfessionals(payload.professionals ?? []);
        setSelectedProfessionalId(payload.selectedProfessionalId ?? "");
        setProcedures(payload.procedures ?? []);
        setAgenda(payload.agenda ?? null);
        setRules(sortRules(payload.agenda?.rules ?? createDefaultRules()));
        setStatus(payload.agenda?.status ?? "active");
        setCanCreateAgenda(payload.canCreateAgenda);
        setCanEditAgenda(payload.canEditAgenda);
        setMessage(payload.message ?? "");
        setSavedAt("");
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        setIsLoading(false);
      }
    },
    [isLoadingUser, professionalId, viewerEmail, viewerQuery],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAgenda();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAgenda]);

  function updateRule(weekday: WeekdayName, updater: (rule: ProfessionalScheduleRule) => ProfessionalScheduleRule) {
    setRules((current) => current.map((rule) => (rule.weekday === weekday ? updater(rule) : rule)));
    setError("");
    setSavedAt("");
  }

  function updatePeriod(weekday: WeekdayName, periodId: string, updater: (period: ProfessionalSchedulePeriod) => ProfessionalSchedulePeriod) {
    updateRule(weekday, (rule) => ({
      ...rule,
      periods: rule.periods.map((period) => (period.id === periodId ? updater(period) : period)),
    }));
  }

  function addPeriod(weekday: WeekdayName) {
    updateRule(weekday, (rule) => ({
      ...rule,
      isOpen: true,
      periods: [...rule.periods, createPeriod(procedures[0], rule.periods.at(-1)?.endTime ?? defaultStartTime)],
    }));
  }

  function removePeriod(weekday: WeekdayName, periodId: string) {
    updateRule(weekday, (rule) => ({
      ...rule,
      periods: rule.periods.filter((period) => period.id !== periodId),
    }));
  }

  async function handleSave() {
    if (!selectedProfessionalId) return;
    if (validation.messages.length > 0) {
      setError(validation.messages[0]);
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const params = new URLSearchParams(viewerQuery);
      const response = await fetch(`/api/professional-agendas?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId: selectedProfessionalId,
          status,
          rules,
        }),
      });
      const payload = (await response.json()) as { agenda?: ProfessionalAgenda; savedAt?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.message || "Nao foi possivel salvar a agenda.");
      }

      if (payload.agenda) {
        setAgenda(payload.agenda);
        setRules(sortRules(payload.agenda.rules));
        setStatus(payload.agenda.status);
      }

      setSavedAt(
        new Intl.DateTimeFormat("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(payload.savedAt ? new Date(payload.savedAt) : new Date()),
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-6xl flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 shrink-0 border-b border-border/60">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-theme-primary" />
                Configuração da Agenda
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">Gerencie os blocos de horários, procedimentos e disponibilidade para leitura da Inteligência Artificial.</DialogDescription>
            </div>

            <label className="flex h-9 items-center gap-3 rounded-lg border border-border/80 bg-card/50 px-3 text-xs font-semibold text-foreground select-none cursor-pointer hover:bg-muted/30 transition-colors shrink-0">
              <Switch checked={status === "active"} onCheckedChange={(checked) => setStatus(checked ? "active" : "inactive")} disabled={!canEditAgenda || isSaving || isLoadingUser || isLoading} />
              Agenda ativa para IA
            </label>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-4 min-h-0 custom-scrollbar">
          {isLoadingUser || isLoading ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] items-start pt-4 select-none pointer-events-none">
              <div className="space-y-6">
                <div className="space-y-2">
                  <SkeletonShimmer className="h-3 w-16 rounded " />
                  <SkeletonShimmer className="h-9 w-full rounded-lg border border-border/40" />
                </div>

                <div className="space-y-3">
                  <SkeletonShimmer className="h-24 w-full rounded-xl border border-border/40" />
                  <SkeletonShimmer className="h-24 w-full rounded-xl border border-border/40" />
                  <SkeletonShimmer className="h-24 w-full rounded-xl border border-border/40" />
                </div>
              </div>

              <aside className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-border/40">
                  <SkeletonShimmer className="h-4 w-4 rounded-full bg-muted/60 " />
                  <div className="space-y-1.5 flex-1">
                    <SkeletonShimmer className="h-3 w-28 bg-muted/60 rounded " />
                    <SkeletonShimmer className="h-2 w-20 bg-muted/40 rounded " />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  <SkeletonShimmer className="h-[68px] w-full rounded-lg border border-border/40 " />
                  <SkeletonShimmer className="h-[68px] w-full rounded-lg border border-border/40 " />
                  <SkeletonShimmer className="h-[68px] w-full rounded-lg border border-border/40 " />
                </div>
              </aside>
            </div>
          ) : !user ? (
            <div className="p-6 text-sm text-muted-foreground">Entre no sistema para configurar agendas.</div>
          ) : professionals.length === 0 ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-6 text-center">
              <Stethoscope className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Nenhuma agenda disponível para este usuário.</p>
              <p className="max-w-md text-sm text-muted-foreground">Administradores podem criar agendas para profissionais. Profissionais usuários precisam estar vinculados ao cadastro profissional pelo e-mail.</p>
            </div>
          ) : (
            <>
              {(error || message || (!error && procedures.length === 0)) && (
                <div className="space-y-2 animate-fade-in pt-4">
                  {error && <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive">{error}</p>}
                  {!error && message && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs font-medium text-muted-foreground">{message}</p>}
                  {!error && procedures.length === 0 && (
                    <p className="rounded-lg border border-amber-200/60 bg-amber-500/10 px-3 py-2.5 text-xs font-medium text-amber-600 dark:text-amber-500">
                      Vincule pelo menos um procedimento a este profissional para criar blocos de agenda.
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] items-start pt-4">
                <div className="space-y-4">
                  {isAdmin && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Profissional</label>
                      <Select value={selectedProfessionalId} onValueChange={(value) => void loadAgenda(value)} disabled={isSaving || professionals.length <= 1}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Selecione o profissional" />
                        </SelectTrigger>
                        <SelectContent>
                          {professionals.map((professional) => (
                            <SelectItem key={professional.id} value={professional.id} className="text-xs">
                              {professional.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-4">
                    {rules.map((rule) => (
                      <section key={rule.weekday} className={cn("rounded-xl border border-border bg-card p-4 transition-all", !rule.isOpen && "opacity-75 bg-muted/10")}>
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
                          <div className="flex items-center gap-2.5">
                            <CalendarClock className="h-4 w-4 text-theme-primary" />
                            <h2 className="text-sm font-semibold text-foreground">{WEEKDAY_LABELS[rule.weekday]}</h2>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-4">
                            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer select-none">
                              <Switch checked={rule.isOpen} onCheckedChange={(checked) => updateRule(rule.weekday, (current) => ({ ...current, isOpen: checked }))} disabled={!canEditAgenda || isSaving} />
                              Atende neste dia
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg gap-1 text-xs"
                              onClick={() => addPeriod(rule.weekday)}
                              disabled={!canEditAgenda || procedures.length === 0 || rule.periods.length >= maxBlocksPerDay || isSaving || !rule.isOpen}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Adicionar Bloco
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {rule.periods.length === 0 && <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground italic">Nenhum bloco configurado para este dia.</p>}
                          {rule.periods.map((period, periodIndex) => {
                            const generatedSlots = generateProcedureSlots(period);
                            const isBlockDisabled = !period.enabled;
                            const isDisabled = !canEditAgenda || !rule.isOpen || isSaving;
                            const bounds = getPeriodBounds(rule, periodIndex);
                            const timeStep = getTimeInputStep(period.slotDurationMinutes);
                            return (
                              <div
                                key={period.id}
                                className={cn(
                                  "grid gap-3 rounded-xl border border-border/80 bg-background p-3.5 transition-all",
                                  "grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_1.1fr_1.1fr_1fr_1.2fr_auto] lg:items-end",
                                  isBlockDisabled && "bg-muted/30 border-dashed opacity-75",
                                )}
                              >
                                <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                                  <label className="text-[11px] font-medium text-muted-foreground">Procedimento</label>
                                  <Select
                                    value={period.procedureId}
                                    onValueChange={(procedureId) => {
                                      const procedure = procedures.find((item) => item.id === procedureId);
                                      updatePeriod(rule.weekday, period.id, (current) => ({
                                        ...current,
                                        procedureId,
                                        procedureName: procedure?.name ?? current.procedureName,
                                      }));
                                    }}
                                    disabled={isDisabled}
                                  >
                                    <SelectTrigger className="h-9 text-xs">
                                      <SelectValue placeholder="Selecione o procedimento" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {procedures.map((procedure) => (
                                        <SelectItem key={procedure.id} value={procedure.id} className="text-xs">
                                          {procedure.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-medium text-muted-foreground">Início</label>
                                  <Input
                                    type="time"
                                    className="h-9 text-xs"
                                    value={period.startTime}
                                    min={bounds.minStartTime}
                                    max={bounds.maxStartTime}
                                    step={timeStep}
                                    disabled={isDisabled || isBlockDisabled}
                                    onChange={(event) =>
                                      updatePeriod(rule.weekday, period.id, (current) => {
                                        const startTime = event.target.value;
                                        const endTime = timeToMinutes(current.endTime) <= timeToMinutes(startTime) ? addMinutesToTime(startTime, current.slotDurationMinutes) : current.endTime;
                                        return { ...current, startTime, endTime };
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-medium text-muted-foreground">Fim</label>
                                  <Input
                                    type="time"
                                    className="h-9 text-xs"
                                    value={period.endTime}
                                    min={bounds.minEndTime}
                                    max={bounds.maxEndTime}
                                    step={timeStep}
                                    disabled={isDisabled || isBlockDisabled}
                                    onChange={(event) => updatePeriod(rule.weekday, period.id, (current) => ({ ...current, endTime: event.target.value }))}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-medium text-muted-foreground">Duração (min)</label>
                                  <Input
                                    type="number"
                                    className="h-9 text-xs"
                                    min={5}
                                    max={240}
                                    step={5}
                                    value={period.slotDurationMinutes}
                                    disabled={isDisabled || isBlockDisabled}
                                    onChange={(event) => updatePeriod(rule.weekday, period.id, (current) => ({ ...current, slotDurationMinutes: Number(event.target.value) }))}
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-2 md:pt-0 lg:h-9">
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-4">
                                          <Switch className="scale-75" checked={period.enabled} onCheckedChange={(checked) => updatePeriod(rule.weekday, period.id, (current) => ({ ...current, enabled: checked }))} disabled={isDisabled} />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="start">
                                        <p>{period.enabled ? "Desativar este bloco de horários" : "Ativar este bloco de horários"}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-lg hover:bg-destructive/10 shrink-0"
                                    onClick={() => removePeriod(rule.weekday, period.id)}
                                    disabled={isDisabled}
                                    aria-label="Remover bloco"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                                <div className="lg:col-span-6 flex items-center gap-2 border-t border-border/40 pt-2 mt-1 text-[11px] font-medium text-muted-foreground">
                                  <span className={cn("h-1.5 w-1.5 rounded-full", rule.isOpen && period.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50")} />
                                  {rule.isOpen && period.enabled ? `Status da IA: ${generatedSlots.length} horários gerados disponíveis para agendamento automático.` : "Status da IA: Bloco temporariamente suspenso."}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>

                <aside className="h-fit rounded-xl border border-border/80 bg-card/50 p-4 space-y-4 xl:sticky xl:top-0">
                  <div className="flex items-center gap-2.5 pb-2 border-b border-border/40">
                    <Stethoscope className="h-4 w-4 text-theme-primary shrink-0" />
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-bold text-foreground">{selectedProfessional?.name ?? "Profissional"}</h3>
                      <p className="text-[10px] font-medium text-muted-foreground">{status === "active" ? "Disponível para leitura da IA" : "Oculta para leitura da IA"}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3 transition-colors hover:bg-background">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Procedimentos</p>
                      <p className="mt-1 text-base font-bold text-foreground tracking-tight">{procedures.length}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3 transition-colors hover:bg-background">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Blocos Ativos</p>
                      <p className="mt-1 text-base font-bold text-foreground tracking-tight">{rules.flatMap((rule) => (rule.isOpen ? rule.periods.filter((period) => period.enabled) : [])).length}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/50 p-3 transition-colors hover:bg-background">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Horários Semanais</p>
                      <p className="mt-1 text-base font-bold text-foreground tracking-tight">
                        {rules.reduce((total, rule) => {
                          if (!rule.isOpen) return total;
                          return total + rule.periods.reduce((periodTotal, period) => periodTotal + generateProcedureSlots(period).length, 0);
                        }, 0)}
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/20 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          {!(isLoadingUser || isLoading) && (
            <div className="text-[11px] font-medium text-muted-foreground flex flex-col gap-0.5 text-left w-full sm:w-auto">
              {savedAt && <span>Salvo às {savedAt}</span>}
              {!agenda?.id && canCreateAgenda && <span className="text-theme-primary">A agenda será criada ao confirmar.</span>}
              {!canCreateAgenda && !agenda?.id && <span className="text-amber-600 font-semibold">Requer aprovação de um administrador.</span>}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 w-full sm:w-auto ml-auto">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isSaving} className="h-9 text-xs font-medium px-4">
              Cancelar
            </Button>
            <Button variant="primary" type="button" onClick={handleSave} disabled={!canSave || isSaving || isLoadingUser || isLoading} className="gap-2 h-9 text-xs font-medium min-w-[120px]">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Agenda
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
