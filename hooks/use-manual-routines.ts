"use client";

import { useCallback, useMemo, useState } from "react";
import type { Routine } from "@/lib/routines";
import type { ChatRecord } from "@/lib/supabase-rest";

type TriggerManualRoutineResult = {
  matched?: number;
  actionRuns?: number;
  actionRunIds?: string[];
  message?: string;
};

type ProcessManualRoutineResult = {
  processed?: number;
  results?: Array<{ status?: string; message?: string }>;
  message?: string;
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

  const manualRoutines = useMemo(() => routines.filter((routine) => routine.active && routine.trigger === "manual"), [routines]);

  const loadManualRoutines = useCallback(async () => {
    if (isLoading || isLoaded) return;

    setIsLoading(true);
    setLoadingError(null);

    try {
      const response = await fetch("/api/airtable/routines", { cache: "no-store" });
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

  const triggerManualRoutine = useCallback(
    async (routine: Routine) => {
      if (!chat || runningRoutineId) return null;

      setRunningRoutineId(routine.id);
      setRunError(null);
      setRunSuccess(null);

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
        const executedText = actionCount === 1 ? "1 acao executada agora" : `${actionCount} acoes executadas agora`;
        const scheduledText = scheduledCount === 1 ? "1 acao agendada" : `${scheduledCount} acoes agendadas`;
        const successMessage = scheduledCount > 0 ? `Automacao iniciada: ${executedText} e ${scheduledText}.` : `Automacao executada: ${executedText}.`;
        setRunSuccess(successMessage);
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

  return {
    manualRoutines,
    isLoading,
    loadingError,
    runningRoutineId,
    runError,
    runSuccess,
    loadManualRoutines,
    triggerManualRoutine,
    clearRunStatus: () => {
      setRunError(null);
      setRunSuccess(null);
    },
  };
}
