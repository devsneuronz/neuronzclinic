"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ManualRoutineRunStatus } from "@/hooks/use-manual-routines";
import type { Routine } from "@/lib/routines";
import { actionLabels, type RoutineAction } from "@/lib/routines";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, Play, PlayCircle, X } from "lucide-react";
import { SkeletonShimmer } from "../ui/skeleton-shimmer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type ManualRoutinesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routines: Routine[];
  isLoading: boolean;
  loadingError: string | null;
  runningRoutineId: string | null;
  runError: string | null;
  runSuccess: string | null;
  runStatus: ManualRoutineRunStatus | null;
  onRunRoutine: (routine: Routine) => void;
  onCancelStartedRoutine: () => void;
};

function getActionSummary(routine: Routine) {
  if (routine.actions.length === 0) return "Sem ações configuradas";

  return routine.actions
    .slice(0, 3)
    .map((action) => actionLabels[action.type] ?? action.label)
    .join(", ");
}

function getIntervalText(action: RoutineAction) {
  if (action.intervalLabel === "Nenhum") return "";

  const minutes = action.delayMinutes;
  if (!minutes) return "";
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes % 43200 === 0) return `${minutes / 43200} meses`;
  if (minutes % 10080 === 0) return `${minutes / 10080} semanas`;
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

const skeletonContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const skeletonItemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 14 },
  },
};

export function ManualRoutinesDialog({ open, onOpenChange, routines, isLoading, loadingError, runningRoutineId, runError, runSuccess, runStatus, onRunRoutine, onCancelStartedRoutine }: ManualRoutinesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Executar rotina manual</DialogTitle>
          <DialogDescription>Escolha uma rotina para iniciar neste atendimento.</DialogDescription>
        </DialogHeader>

        <TooltipProvider>
          <div className="max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
            {isLoading ? (
              <motion.div variants={skeletonContainerVariants} initial="hidden" animate="visible" className="space-y-2">
                {[1, 2, 3].map((index) => (
                  <motion.div key={index} variants={skeletonItemVariants} className="flex items-center gap-4 rounded-md border border-border bg-card p-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <SkeletonShimmer className="h-4 w-1/3 rounded" />
                      <SkeletonShimmer className="h-3 w-3/4 rounded" />

                      <div className="mt-2 flex items-center gap-1.5">
                        <SkeletonShimmer className="h-5 w-16 rounded" />
                        <SkeletonShimmer className="h-5 w-20 rounded" />
                        <SkeletonShimmer className="h-5 w-14 rounded" />
                      </div>
                    </div>

                    <SkeletonShimmer className="h-8 w-8 rounded-md shrink-0" />
                  </motion.div>
                ))}
              </motion.div>
            ) : loadingError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadingError}</div>
            ) : routines.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma rotina manual ativa foi encontrada.</div>
            ) : (
              <div className="space-y-2">
                {routines.map((routine) => {
                  const isRunning = runningRoutineId === routine.id;
                  const totalActions = routine.actions.length;
                  const hasMoreActions = totalActions > 3;
                  const remainingCount = totalActions - 3;

                  return (
                    <div key={routine.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{routine.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{routine.description || getActionSummary(routine)}</p>

                        {routine.actions.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-1.5 overflow-hidden">
                              {routine.actions.slice(0, 3).map((action, idx) => (
                                <div key={idx} className="inline-flex items-center bg-secondary/50 px-1.5 py-0.5 rounded text-foreground border border-border gap-1">
                                  <span>{actionLabels[action.type] ?? action.label}</span>
                                  {getIntervalText(action) && <span className="text-[9px] text-amber-600 dark:text-amber-400 font-mono">{getIntervalText(action)}</span>}
                                </div>
                              ))}
                            </div>

                            {hasMoreActions && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground border border-border hover:bg-accent transition-colors shrink-0 ml-1 cursor-help">
                                    +{remainingCount} {remainingCount === 1 ? "ação" : "ações"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="p-3 border shadow-md max-w-xs">
                                  <ol className="list-decimal space-y-1.5 pl-4 text-xs" start={4}>
                                    {routine.actions.slice(3).map((action, index) => (
                                      <li key={index} className="font-medium">
                                        <div className="flex items-center gap-2 w-full">
                                          <span>{actionLabels[action.type] ?? action.label}</span>
                                          {action.intervalLabel && (
                                            <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono shrink-0 ml-auto">
                                              {getIntervalText(action) || "Sem intervalo"}
                                            </span>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ol>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </div>

                      <Button type="button" variant="primary" size="icon" disabled={!!runningRoutineId || routine.actions.length === 0} onClick={() => onRunRoutine(routine)}>
                        {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TooltipProvider>

        <AnimatePresence mode="wait">
          {(runError || runSuccess || runStatus) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={cn(
                "flex items-start gap-3 border-t px-5 py-3.5 text-sm",
                runError ? "border-destructive/15 bg-destructive/5 text-destructive dark:bg-destructive/10" : "border-emerald-500/15 bg-emerald-500/5 text-emerald-800 dark:text-emerald-400 dark:bg-emerald-500/10",
              )}
            >
              <div className="mt-0.5 shrink-0">
                {runError && <AlertCircle className="h-4 w-4" />}
                {runSuccess && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                {runStatus && <PlayCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              </div>

              <div className="flex-1 min-w-0">
                {runError && <p className="font-medium">{runError}</p>}
                {runSuccess && <p className="font-medium">{runSuccess}</p>}

                {runStatus && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-semibold tracking-tight">{runStatus.routineName}</p>
                      <p className="text-xs text-muted-foreground text-emerald-700/80 dark:text-emerald-400/80">
                        {runStatus.executedCount} {runStatus.executedCount === 1 ? "ação executada" : "ações executadas"}
                        {runStatus.scheduledCount > 0 ? ` e ${runStatus.scheduledCount} ${runStatus.scheduledCount === 1 ? "ação pendente" : "ações pendentes"}` : " e nenhuma ação pendente"}.
                      </p>
                      {runStatus.cancelMessage && <p className="mt-1 text-xs opacity-90 italic">{runStatus.cancelMessage}</p>}
                    </div>

                    {runStatus.scheduledCount > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onCancelStartedRoutine}
                        disabled={runStatus.isCanceling}
                        className="shrink-0 gap-1.5 border-emerald-600/20 bg-background text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
                      >
                        {runStatus.isCanceling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        Cancelar pendentes
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
