"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFreshSavedSession } from "@/lib/auth-session";
import { AlertTriangle, CheckCircle2, Copy, FileWarning, Info, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "../ui/sonner";

type InteractionDecision = {
  id: string;
  training_batch_id: string | null;
  received: string | null;
  ia_response: string | null;
  corrected_response: string | null;
  quality: string | null;
  training_status: string;
  training_decision: string | null;
  similarity_score: number | string | null;
  training_analysis: string | null;
  training_error: string | null;
  training_issues: unknown;
  has_critical_change: boolean | null;
  human_quality_consistent: boolean | null;
  training_attempts: number;
  training_processed_at: string | null;
  occurred_at: string | null;
  created_at: string;
  updated_at: string;
};

type AiTrainingData = {
  decisions: InteractionDecision[];
  message?: string;
};

type BatchDecisionGroup = {
  id: string;
  label: string;
  decisions: InteractionDecision[];
  approvedDecisions: InteractionDecision[];
  rejectedDecisions: InteractionDecision[];
  latestDate: string | null;
};

const INITIAL_VISIBLE_BATCHES = 3;

function formatDate(value: string | null) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatScore(value: number | string | null) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return String(value);
  return `${Math.round(numberValue * 100)}%`;
}

function getText(value: string | null | undefined, fallback = "Sem conteúdo") {
  return value?.trim() || fallback;
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) && value.length === 0) return "";
  if (typeof value === "string") return value.trim();
  try {
    const stringified = JSON.stringify(value, null, 2);
    return stringified === "[]" ? "" : stringified;
  } catch {
    return "";
  }
}

function getDecisionLabel(value: string | null) {
  const labels: Record<string, string> = {
    ignored_similar_to_original: "Similar ao original",
    ignored_duplicate_example: "Duplicado",
    ignored_invalid: "Inválido",
    ignored_insufficient_context: "Contexto insuficiente",
    conflicting_example: "Conflitante",
    approved_positive: "Exemplo positivo",
    approved_correction: "Correção aprovada",
  };

  if (!value) return "Sem categoria";
  return labels[value] ?? value.replace(/_/g, " ");
}

function getDecisionConfig(decision: string | null, status: string) {
  if (status === "processed" || decision?.startsWith("approved_")) {
    return {
      label: decision === "approved_positive" ? "Exemplo positivo" : "Correção aprovada",
      icon: CheckCircle2,
      className: "border-emerald-500/35",
      badgeClassName: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      textColor: "text-emerald-600 dark:text-emerald-400",
    };
  }

  if (status === "failed") {
    return {
      label: "Falha no processamento",
      icon: XCircle,
      className: "border-red-500/35",
      badgeClassName: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
      textColor: "text-red-600 dark:text-red-400",
    };
  }

  switch (decision) {
    case "ignored_insufficient_context":
      return {
        label: "Contexto insuficiente",
        icon: Info,
        className: "border-amber-500/35",
        badgeClassName: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        textColor: "text-amber-600 dark:text-amber-400",
      };
    case "ignored_similar_to_original":
      return {
        label: "Similar ao original",
        icon: Copy,
        className: "border-slate-500/35",
        badgeClassName: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
        textColor: "text-slate-600 dark:text-slate-400",
      };
    case "ignored_duplicate_example":
      return {
        label: "Duplicado",
        icon: Copy,
        className: "border-blue-500/35",
        badgeClassName: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
        textColor: "text-blue-600 dark:text-blue-400",
      };
    case "ignored_invalid":
    case "conflicting_example":
      return {
        label: getDecisionLabel(decision),
        icon: FileWarning,
        className: "border-rose-500/35",
        badgeClassName: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        textColor: "text-rose-600 dark:text-rose-400",
      };
    default:
      return {
        label: getDecisionLabel(decision),
        icon: AlertTriangle,
        className: "border-orange-500/35",
        badgeClassName: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
        textColor: "text-orange-600 dark:text-orange-400",
      };
  }
}

function isApprovedDecision(item: InteractionDecision) {
  return item.training_decision?.startsWith("approved_") || item.training_status === "processed";
}

function groupDecisionsByLabel(decisions: InteractionDecision[]) {
  const grouped: Record<string, InteractionDecision[]> = {};
  decisions.forEach((d) => {
    const label = getDecisionLabel(d.training_decision);
    if (!grouped[label]) {
      grouped[label] = [];
    }
    grouped[label].push(d);
  });
  return grouped;
}

function getDecisionTime(item: InteractionDecision) {
  const time = new Date(item.training_processed_at || item.updated_at || item.created_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getBatchLabel(batchId: string | null) {
  if (!batchId) return "Sem lote";
  return `Lote ${batchId.slice(0, 8)}`;
}

function groupDecisionsByBatch(decisions: InteractionDecision[]): BatchDecisionGroup[] {
  const grouped = new Map<string, InteractionDecision[]>();

  for (const decision of decisions) {
    const key = decision.training_batch_id || "__sem_lote__";
    grouped.set(key, [...(grouped.get(key) ?? []), decision]);
  }

  return Array.from(grouped.entries())
    .map(([key, items]) => {
      const sortedItems = [...items].sort((first, second) => getDecisionTime(second) - getDecisionTime(first));
      const latest = sortedItems[0] ?? null;

      return {
        id: key,
        label: getBatchLabel(latest?.training_batch_id ?? null),
        decisions: sortedItems,
        approvedDecisions: sortedItems.filter(isApprovedDecision),
        rejectedDecisions: sortedItems.filter((item) => !isApprovedDecision(item)),
        latestDate: latest ? latest.training_processed_at || latest.updated_at || latest.created_at : null,
      };
    })
    .sort((first, second) => {
      const firstTime = first.latestDate ? new Date(first.latestDate).getTime() : 0;
      const secondTime = second.latestDate ? new Date(second.latestDate).getTime() : 0;
      return secondTime - firstTime;
    });
}

function TrainingTextBlock({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "positive" | "muted" }) {
  const toneClassName = tone === "positive" ? "border-emerald-500/20 bg-emerald-500/10" : tone === "muted" ? "border-border/60 bg-muted/30" : "border-border/70 bg-background";

  return (
    <div className={`min-w-0 rounded-md border p-3 ${toneClassName}`}>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{value}</p>
    </div>
  );
}

export function AiTrainingPage() {
  const [data, setData] = useState<AiTrainingData>({ decisions: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [visibleBatchCount, setVisibleBatchCount] = useState(INITIAL_VISIBLE_BATCHES);

  const batchGroups = useMemo(() => groupDecisionsByBatch(data.decisions), [data.decisions]);
  const visibleBatchGroups = batchGroups.slice(0, visibleBatchCount);
  const hasMoreBatches = visibleBatchCount < batchGroups.length;

  async function loadTrainingData() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const session = await getFreshSavedSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("Sessão ausente.");
      }

      const response = await fetch("/api/ai-training", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const nextData = (await response.json()) as AiTrainingData;

      if (!response.ok) {
        throw new Error(nextData.message || "Não foi possível carregar os dados de treinamento.");
      }

      setData({ decisions: nextData.decisions ?? [] });
      setVisibleBatchCount(INITIAL_VISIBLE_BATCHES);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar os dados de treinamento.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadTrainingData());
  }, []);

  return (
    <div className="h-full overflow-auto bg-background scrollbar-gutter-stable">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-normal">Treinamento da IA Lia</h1>
            <p className="mt-1 text-sm text-muted-foreground">Revisão interna dos registros de histórico de interações, separados entre aprovados e não selecionados para treinamento.</p>
          </div>
          <Button type="button" variant="outline" className="h-9 gap-2 self-start sm:self-auto" onClick={() => void loadTrainingData()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
        </div>

        {errorMessage ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</div> : null}

        {isLoading ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Carregando dados de treinamento...</div>
        ) : (
          <div className="space-y-8">
            {visibleBatchGroups.length === 0 ? <EmptyState message="Nenhum lote de treinamento encontrado." /> : null}

            {visibleBatchGroups.map((group) => (
              <BatchGroupSection key={group.id} group={group} />
            ))}

            {hasMoreBatches ? (
              <div className="flex justify-center">
                <Button type="button" variant="outline" onClick={() => setVisibleBatchCount((current) => current + INITIAL_VISIBLE_BATCHES)}>
                  Carregar mais
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function BatchGroupSection({ group }: { group: BatchDecisionGroup }) {
  return (
    <section className="min-w-0 space-y-4 rounded-xl border bg-card/40 p-4">
      <div className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{group.label}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {group.decisions.length} registro{group.decisions.length === 1 ? "" : "s"} finalizado{group.decisions.length === 1 ? "" : "s"} • mais recente em {formatDate(group.latestDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" variant="outline">
            {group.approvedDecisions.length} aprovados
          </Badge>
          <Badge variant="outline">{group.rejectedDecisions.length} não selecionados</Badge>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GroupedDecisionSection title="Aprovados para treinamento" description="Correções válidas e exemplos positivos deste lote." decisions={group.approvedDecisions} />
        <GroupedDecisionSection title="Não selecionados" description="Registros deste lote que não viraram exemplo." decisions={group.rejectedDecisions} />
      </div>
    </section>
  );
}

function GroupedDecisionSection({ title, description, decisions }: { title: string; description: string; decisions: InteractionDecision[] }) {
  const groupedDecisions = groupDecisionsByLabel(decisions);
  const entries = Object.entries(groupedDecisions);

  return (
    <section className="min-w-0 space-y-4">
      <SectionHeader title={title} count={decisions.length} description={description} />

      {decisions.length === 0 ? (
        <EmptyState message="Nenhum registro encontrado nesta categoria." />
      ) : (
        <div className="space-y-6">
          {entries.map(([label, items]) => {
            const config = getDecisionConfig(items[0].training_decision, items[0].training_status);
            const Icon = config.icon;

            return (
              <div key={label} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Icon className={`h-4 w-4 ${config.textColor}`} />
                  <h3 className="text-sm font-semibold tracking-tight text-foreground/90">{label}</h3>
                  <Badge variant="secondary" className="h-5 bg-muted/60 px-1.5 text-[10px] text-muted-foreground">
                    {items.length}
                  </Badge>
                </div>

                <Accordion type="single" collapsible className="w-full min-w-0 space-y-3">
                  {items.map((decision) => {
                    const globalIndex = decisions.indexOf(decision) + 1;
                    return <DecisionItem key={decision.id} item={decision} number={globalIndex} />;
                  })}
                </Accordion>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ title, count, description }: { title: string; count: number; description: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 mb-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Badge variant="outline" className="shadow-sm">
        {count}
      </Badge>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{message}</div>;
}

function DecisionItem({ item }: { item: InteractionDecision }) {
  const config = getDecisionConfig(item.training_decision, item.training_status);
  const Icon = config.icon;
  const score = formatScore(item.similarity_score);
  const issues = stringifyValue(item.training_issues);

  return (
    <AccordionItem value={item.id} className={`relative min-w-0 overflow-hidden rounded-xl border shadow-sm bg-card ${config.className}`}>
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/20 transition-colors items-center overflow-hidden">
        <div className="flex min-w-0 items-center justify-between w-full gap-3 pr-2 flex-nowrap">
          <div className="flex min-w-0 items-center gap-2.5 flex-1">
            <span className="truncate text-xs sm:text-sm text-foreground/85 font-medium max-w-[140px] sm:max-w-[260px] md:max-w-[360px]">{getText(item.received)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge className={config.badgeClassName} variant="outline">
              <Icon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-4 pb-4 pt-3 border-t border-dashed border-current/20">
        <div className="min-w-0 space-y-4">
          <div>
            <div className="grid grid-cols-2 gap-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground w-full">
              <span>Data e Hora</span>
              <span className="text-right">Qualidade da Resposta</span>
            </div>
            <div className="flex justify-between items-center gap-2 mt-1">
              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{formatDate(item.training_processed_at || item.updated_at)}</span>
              <div className="px-2 py-1 rounded-md bg-muted/60 text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap">{item.quality || "Sem avaliação"}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mensagem Recebida</h4>
            <div className="bg-[#5fa77f]/20 text-(--chat-reply-me-border) px-3 py-2 rounded-lg rounded-tl-none inline-block text-xs sm:text-sm font-medium relative max-w-[90%] break-words before:absolute before:top-0 before:left-[-6px] before:w-0 before:h-0 before:border-t-[8px] before:border-t-[#5fa77f]/20 before:border-l-[6px] before:border-l-transparent">
              {getText(item.received)}
            </div>
          </div>

          <div className="flex justify-end">
            <div className="min-w-0 max-w-[90%] bg-blue-500/20 p-3 sm:p-4 rounded-xl rounded-tr-none text-xs sm:text-sm relative before:absolute before:top-0 before:right-[-6px] before:w-0 before:h-0 before:border-t-[8px] before:border-t-blue-500/20 before:border-r-[6px] before:border-r-transparent">
              <h4 className="text-[10px] font-bold text-blue-400 mb-1 text-right uppercase tracking-wider">Resposta IA</h4>
              <p className="text-foreground leading-relaxed break-words">{getText(item.ia_response)}</p>
            </div>
          </div>

          {item.corrected_response ? (
            <div className="space-y-1.5 mt-2">
              <h4 className="text-xs font-bold opacity-80">Resposta Ideal Informada</h4>
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">{item.corrected_response}</div>
            </div>
          ) : null}

          <div className="flex flex-row gap-2  mt-4 pt-4 border-t border-dashed border-current/10">
            <Badge variant="outline" className="justify-start px-2 py-1.5 font-normal">
              <span className="font-semibold mr-1 opacity-70">Status:</span> {item.training_status}
            </Badge>
            {score ? (
              <Badge variant="outline" className="justify-start px-2 py-1.5 font-normal">
                <span className="font-semibold mr-1 opacity-70">Similaridade:</span> {score}
              </Badge>
            ) : null}
          </div>

          {item.training_analysis ? <TrainingTextBlock label="Análise" value={item.training_analysis} tone="muted" /> : null}
          {item.training_error ? <TrainingTextBlock label="Erro" value={item.training_error} tone="muted" /> : null}
          {issues ? <TrainingTextBlock label="Questões detectadas" value={issues} tone="muted" /> : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

