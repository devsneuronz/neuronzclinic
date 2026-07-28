"use client";

import type { Routine } from "@/lib/routines";
import type { ChatRecord } from "@/lib/supabase-rest";
import { useCallback, useEffect, useMemo, useState } from "react";

type TriggerManualRoutineResult = {
  matched?: number;
  actionRuns?: number;
  actionRunIds?: string[];
  runs?: Array<{ id?: string }>;
  message?: string;
};

type ProcessManualRoutineResult = {
  processed?: number;
  results?: Array<{ id?: string; status?: string; message?: string }>;
  message?: string;
};

type RunningRoutinesResult = {
  runs?: Array<Omit<ManualRoutineRunStatus, "isCanceling" | "cancelMessage">>;
  message?: string;
};

export type ManualRoutineRunStatus = {
  routineName: string;
  routineRunIds: string[];
  actionRunIds: string[];
  executedCount: number;
  scheduledCount: number;
  isCanceling: boolean;
  cancelMessage: string | null;
};

function getContactName(chat: ChatRecord) {
  return chat.nome_contato?.trim() || chat.pushname?.trim() || "";
}

function getContactPhone(chat: ChatRecord) {
  return chat.phone_contact?.trim() || chat.chat_id;
}

export function useManualRoutines(chat: ChatRecord | undefined) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<ManualRoutineRunStatus | null>(null);

  const manualRoutines = useMemo(() => routines.filter((routine) => routine.active && routine.trigger === "manual"), [routines]);

  const loadManualRoutines = useCallback(async () => {
    if (isLoading || isLoaded) return;

    setIsLoading(true);
    setLoadingError(null);

    try {
      const response = await fetch("/api/routines", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { routines?: Routine[]; message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel carregar as automacoes.");
      }

      setRoutines(data.routines ?? []);
      setIsLoaded(true);
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "Nao foi possivel carregar as automacoes.");
      setRoutines([]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isLoading]);

  const loadRunningRoutineStatus = useCallback(async () => {
    if (!chat?.chat_id) return;

    try {
      const response = await fetch(`/api/routines/running?chatId=${encodeURIComponent(chat.chat_id)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as RunningRoutinesResult;

      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel carregar automacoes em andamento.");
      }

      const run = data.runs?.[0];
      if (!run) {
        setRunStatus(null);
        return;
      }

      setRunStatus({
        ...run,
        isCanceling: false,
        cancelMessage: null,
      });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Nao foi possivel carregar automacoes em andamento.");
    }
  }, [chat]);

  const triggerManualRoutine = useCallback(
    async (routine: Routine) => {
      if (!chat || runningRoutineId) return null;

      setRunningRoutineId(routine.id);
      setRunError(null);
      setRunSuccess(null);
      setRunStatus(null);

      try {
        const response = await fetch("/api/routines/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger: "manual",
            routineId: routine.id,
            contactId: chat.id,
            chatId: chat.chat_id,
            contactName: getContactName(chat),
            contactPhone: getContactPhone(chat),
            occurredAt: new Date().toISOString(),
            source: "chat-manual-routine",
          }),
        });
        const data = (await response.json().catch(() => ({}))) as TriggerManualRoutineResult;

        if (!response.ok) {
          throw new Error(data.message || "Nao foi possivel disparar a automacao.");
        }

        if (!data.matched) {
          throw new Error("Nenhuma automacao ativa foi encontrada para executar.");
        }

        const processResponse = await fetch("/api/routines/due", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionRunIds: data.actionRunIds ?? [] }),
        });
        const processData = (await processResponse.json().catch(() => ({}))) as ProcessManualRoutineResult;

        if (!processResponse.ok) {
          throw new Error(processData.message || "Automacao criada, mas nao foi possivel executar as acoes.");
        }

        const failedCount = processData.results?.filter((result) => result.status === "failed").length ?? 0;
        if (failedCount > 0) {
          throw new Error(`${failedCount} acao(oes) falharam ao executar. Confira routine_action_runs no Supabase.`);
        }

        const actionCount = processData.processed ?? 0;
        const scheduledCount = Math.max((data.actionRuns ?? 0) - actionCount, 0);
        const executedText = actionCount === 1 ? "1 ação executada agora" : `${actionCount} ações executadas agora`;
        const scheduledText = scheduledCount === 1 ? "1 ação agendada" : `${scheduledCount} ações agendadas`;
        const successMessage = scheduledCount > 0 ? `Automação iniciada: ${executedText} e ${scheduledText}.` : `Automação executada: ${executedText}.`;
        setRunSuccess(successMessage);
        setRunStatus({
          routineName: routine.name,
          routineRunIds: data.runs?.map((run) => run.id).filter((id): id is string => Boolean(id)) ?? [],
          actionRunIds: data.actionRunIds ?? [],
          executedCount: actionCount,
          scheduledCount,
          isCanceling: false,
          cancelMessage: null,
        });
        return data;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Nao foi possivel disparar a automacao.";
        setRunError(message);
        return null;
      } finally {
        setRunningRoutineId(null);
      }
    },
    [chat, runningRoutineId],
  );

  const cancelStartedRoutine = useCallback(async () => {
    if (!runStatus || runStatus.isCanceling || runStatus.scheduledCount <= 0) return;

    setRunStatus({ ...runStatus, isCanceling: true, cancelMessage: null });
    setRunError(null);

    try {
      const response = await fetch("/api/routines/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routineRunIds: runStatus.routineRunIds,
          actionRunIds: runStatus.actionRunIds,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { canceledActionRuns?: number; message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel cancelar a automacao.");
      }

      const canceledCount = data.canceledActionRuns ?? 0;
      setRunStatus({
        ...runStatus,
        scheduledCount: Math.max(runStatus.scheduledCount - canceledCount, 0),
        isCanceling: false,
        cancelMessage: canceledCount === 1 ? "1 ação pendente cancelada." : `${canceledCount} ações pendentes canceladas.`,
      });
      setRunSuccess(null);
    } catch (error) {
      setRunStatus({ ...runStatus, isCanceling: false, cancelMessage: null });
      setRunError(error instanceof Error ? error.message : "Nao foi possivel cancelar a automacao.");
    }
  }, [runStatus]);

  useEffect(() => {
    if (!runSuccess) return;

    const timer = window.setTimeout(() => {
      setRunSuccess(null);
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [runSuccess]);

  return {
    manualRoutines,
    isLoading,
    loadingError,
    runningRoutineId,
    runError,
    runSuccess,
    runStatus,
    loadManualRoutines,
    loadRunningRoutineStatus,
    triggerManualRoutine,
    cancelStartedRoutine,
    clearRunStatus: () => {
      setRunError(null);
      setRunSuccess(null);
      setRunStatus(null);
    },
  };
}
