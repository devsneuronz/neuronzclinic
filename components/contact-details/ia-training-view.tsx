"use client";

import type { ChatRecord } from "@/lib/supabase-rest";
import { Check, Copy, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

type TrainingInteraction = {
  id: string;
  number: number;
  createdAt: string;
  received: string;
  iaResponse: string;
  correctedResponse: string;
  quality: string;
};

const EMPTY_QUALITY_VALUE = "__avaliar__";
const NONE_QUALITY_VALUE = "__nenhuma__";

interface IATrainingViewProps {
  chat?: ChatRecord;
  contactPhone?: string;
}

function formatInteractionDate(value: string) {
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

function getInteractionTime(item: TrainingInteraction) {
  const time = new Date(item.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortInteractionsOldestFirst(interactions: TrainingInteraction[]) {
  return [...interactions]
    .sort((first, second) => getInteractionTime(first) - getInteractionTime(second))
    .map((interaction, index) => ({ ...interaction, number: index + 1 }));
}

export function IATrainingView({ chat, contactPhone }: IATrainingViewProps) {
  const [trainingData, setTrainingData] = useState<TrainingInteraction[]>([]);
  const [qualityOptions, setQualityOptions] = useState<string[]>([]);
  const [savingQualityIds, setSavingQualityIds] = useState<string[]>([]);
  const [copiedResponseIds, setCopiedResponseIds] = useState<string[]>([]);
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, string>>({});
  const [sendingCorrectionIds, setSendingCorrectionIds] = useState<string[]>([]);
  const [confirmedCorrectionIds, setConfirmedCorrectionIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const chatId = chat?.chat_id || "";

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();

    if (chatId) params.set("chatId", chatId);
    if (contactPhone) params.set("contactPhone", contactPhone);

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setIsLoading(true);
      setErrorMessage("");
    });

    fetch(`/api/airtable/interaction-history${params.size > 0 ? `?${params.toString()}` : ""}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as { interactions?: TrainingInteraction[]; qualityOptions?: string[]; message?: string };

        if (!response.ok) {
          throw new Error(data.message || "Não foi possível carregar o histórico de interações.");
        }

        const sortedInteractions = sortInteractionsOldestFirst(data.interactions ?? []);

        setTrainingData(sortedInteractions);
        setQualityOptions(data.qualityOptions ?? []);
        setCorrectionDrafts(
          sortedInteractions.reduce<Record<string, string>>((drafts, item) => {
            drafts[item.id] = item.correctedResponse || "";
            return drafts;
          }, {}),
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTrainingData([]);
        setQualityOptions([]);
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar o histórico de interações.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [chatId, contactPhone]);

  async function handleQualityChange(interactionId: string, quality: string) {
    if (quality === EMPTY_QUALITY_VALUE) return;

    const previousData = trainingData;
    const nextQuality = quality === NONE_QUALITY_VALUE ? "" : quality;

    setSavingQualityIds((current) => [...current, interactionId]);
    setErrorMessage("");
    setTrainingData((current) => current.map((item) => (item.id === interactionId ? { ...item, quality: nextQuality } : item)));

    try {
      const response = await fetch("/api/airtable/interaction-history", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ id: interactionId, quality: nextQuality }),
      });
      const data = (await response.json()) as { interaction?: TrainingInteraction; message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível salvar a qualidade de resposta.");
      }

      if (data.interaction) {
        setTrainingData((current) => current.map((item) => (item.id === interactionId ? { ...item, quality: data.interaction?.quality || nextQuality } : item)));
      }
    } catch (error) {
      setTrainingData(previousData);
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar a qualidade de resposta.");
    } finally {
      setSavingQualityIds((current) => current.filter((id) => id !== interactionId));
    }
  }

  async function handleCopyResponse(interactionId: string, response: string) {
    if (!response) return;

    try {
      await navigator.clipboard.writeText(response);
      setCopiedResponseIds((current) => [...current.filter((id) => id !== interactionId), interactionId]);
      window.setTimeout(() => {
        setCopiedResponseIds((current) => current.filter((id) => id !== interactionId));
      }, 1500);
    } catch {
      setErrorMessage("Não foi possível copiar a resposta da IA.");
    }
  }

  async function handleSendCorrection(item: TrainingInteraction) {
    const correctedResponse = (correctionDrafts[item.id] || "").trim();

    if (!chatId) {
      setErrorMessage("Contato sem chat_id para envio da mensagem.");
      return;
    }

    if (!correctedResponse) {
      setErrorMessage("Digite a mensagem corrigida antes de responder.");
      return;
    }

    setSendingCorrectionIds((current) => [...current, item.id]);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.set("chat_id", chatId);
      formData.set("text", correctedResponse);

      const sendResponse = await fetch("/api/send-message", {
        method: "POST",
        body: formData,
      });
      const sendData = (await sendResponse.json()) as { message?: string };

      if (!sendResponse.ok) {
        throw new Error(sendData.message || "Não foi possível enviar a mensagem corrigida ao chat.");
      }

      const airtableResponse = await fetch("/api/airtable/interaction-history", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ id: item.id, correctedResponse }),
      });
      const airtableData = (await airtableResponse.json()) as { interaction?: TrainingInteraction; message?: string };

      if (!airtableResponse.ok) {
        throw new Error(airtableData.message || "Mensagem enviada, mas não foi possível salvar a correção no Airtable.");
      }

      setTrainingData((current) =>
        current.map((interaction) =>
          interaction.id === item.id
            ? {
                ...interaction,
                correctedResponse: airtableData.interaction?.correctedResponse || correctedResponse,
              }
            : interaction,
        ),
      );
      setConfirmedCorrectionIds((current) => [...current.filter((id) => id !== item.id), item.id]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível enviar a correção.");
    } finally {
      setSendingCorrectionIds((current) => current.filter((id) => id !== item.id));
    }
  }

  return (
    <div className="p-4 space-y-4 animate-in fade-in slide-in-from-right-4 bg-red-0">
      {isLoading ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Carregando histórico de interações...</div> : null}

      {!isLoading && errorMessage ? <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{errorMessage}</div> : null}

      {!isLoading && !errorMessage && trainingData.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhuma interação encontrada para este contato.</div>
      ) : null}

      <Accordion type="single" collapsible className="w-full space-y-3">
        {trainingData.map((item) => {
          const isSendingCorrection = sendingCorrectionIds.includes(item.id);
          const correctionValue = correctionDrafts[item.id] ?? item.correctedResponse ?? "";
          const hasCorrectionConfirmation = Boolean(item.correctedResponse) || confirmedCorrectionIds.includes(item.id);

          return (
          <AccordionItem key={item.id} value={`item-${item.id}`} className="border rounded-xl shadow-sm overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 transition-all items-center">
              <div className="flex items-center justify-between w-full pr-4">
                <div className="flex items-center gap-6">
                  <span className="text-sm font-bold text-theme-primary"># {item.number}</span>
                  <span className="text-sm text-muted-foreground truncate max-w-[150px]">{item.received}</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground min-w-[80px] text-center">{item.quality || "Avaliar"}</div>
                </div>
              </div>
            </AccordionTrigger>

            <AccordionContent className="px-4 pb-4 pt-2 border-t border-dashed">
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  <span>Data e Hora</span>
                  <span className="text-right">Qualidade da Resposta</span>
                </div>

                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">{formatInteractionDate(item.createdAt)}</span>
                  <Select
                    value={item.quality || EMPTY_QUALITY_VALUE}
                    onValueChange={(quality) => void handleQualityChange(item.id, quality)}
                    disabled={savingQualityIds.includes(item.id)}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs bg-muted/50">
                      <SelectValue placeholder="Avaliar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_QUALITY_VALUE}>Avaliar</SelectItem>
                      <SelectItem value={NONE_QUALITY_VALUE}>Nenhuma</SelectItem>
                      {qualityOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                      {qualityOptions.length === 0 ? <SelectItem value="__sem_opcoes__" disabled>Sem opções encontradas</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <h4 className="text-xs font-bold mb-2">Mensagem Recebida</h4>
                  <div className="bg-[#5fa77f]/20 text-(--chat-reply-me-border) px-3 py-1.5 rounded-md rounded-tl-none inline-block text-sm font-medium border border-(--chat-reply-me-border)/40">{item.received}</div>
                </div>

                <div className="flex justify-end">
                  <div className="flex max-w-[85%] items-start gap-2">
                    <div className="bg-blue-500/20 p-4 rounded-xl text-sm border border-blue-500/30 relative">
                      <h4 className="text-[10px] font-bold text-blue-400 mb-2 text-right uppercase tracking-tighter">Resposta IA</h4>
                      <p className="text-foreground text-right leading-relaxed">{item.iaResponse}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-blue-400 hover:text-blue-300"
                      title="Copiar resposta da IA"
                      onClick={() => void handleCopyResponse(item.id, item.iaResponse)}
                      disabled={!item.iaResponse}
                    >
                      {copiedResponseIds.includes(item.id) ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold">Mensagem Corrigida</h4>
                    <Textarea
                      value={correctionValue}
                      placeholder="Digite a resposta ideal para treinar a IA..."
                      className="min-h-[120px] resize-none bg-muted/20 border-border"
                      disabled={isSendingCorrection}
                      onChange={(event) => setCorrectionDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                    />
                    {hasCorrectionConfirmation ? <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500"><Check className="h-3.5 w-3.5" />Correção feita</div> : null}
                  </div>
                  <Button
                    className="h-8 px-4 w-full bg-theme-primary hover:bg-theme-primary/80 text-xs text-white font-bold rounded-md"
                    disabled={isSendingCorrection || !correctionValue.trim()}
                    onClick={() => void handleSendCorrection(item)}
                  >
                    {isSendingCorrection ? "Enviando..." : "Responder"}
                    <Send />
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
