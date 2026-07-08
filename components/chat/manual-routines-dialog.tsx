"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Routine } from "@/lib/routines";
import { actionLabels } from "@/lib/routines";
import { Loader2, Play } from "lucide-react";
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
  onRunRoutine: (routine: Routine) => void;
};

function getActionSummary(routine: Routine) {
  if (routine.actions.length === 0) return "Sem ações configuradas";

  return routine.actions
    .slice(0, 3)
    .map((action) => actionLabels[action.type] ?? action.label)
    .join(", ");
}

export function ManualRoutinesDialog({ open, onOpenChange, routines, isLoading, loadingError, runningRoutineId, runError, runSuccess, onRunRoutine }: ManualRoutinesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Executar automacao manual</DialogTitle>
          <DialogDescription>Escolha uma automacao para iniciar neste atendimento.</DialogDescription>
        </DialogHeader>

        <TooltipProvider>
          <div className="max-h-[60vh] overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando automacoes...
              </div>
            ) : loadingError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadingError}</div>
            ) : routines.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma automacao manual ativa foi encontrada.</div>
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
                                  {action.intervalLabel !== "Nenhum" && <span className="text-[9px] text-amber-600 dark:text-amber-400 font-mono">{action.delayMinutes > 0 && `${action.delayMinutes}m`}</span>}
                                </div>
                              ))}
                            </div>

                            {hasMoreActions && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground border border-border hover:bg-accent transition-colors shrink-0 ml-1">
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
                                              {action.intervalLabel !== "Nenhum" && <span className="pr-1">{action.delayMinutes}</span>}
                                              {action.intervalLabel}
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

        {(runError || runSuccess) && (
          <div className={`border-t px-5 py-3 text-sm ${runError ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"}`}>{runError || runSuccess}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

