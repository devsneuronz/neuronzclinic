"use client";

import type { RoutineMessageTemplate } from "@/lib/routines";
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
  return [...interactions].sort((first, second) => getInteractionTime(first) - getInteractionTime(second)).map((interaction, index) => ({ ...interaction, number: index + 1 }));
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function IATrainingView({ chat, contactPhone }: IATrainingViewProps) {
  const [trainingData, setTrainingData] = useState<TrainingInteraction[]>([]);
  const [qualityOptions, setQualityOptions] = useState<string[]>([]);
  const [savingQualityIds, setSavingQualityIds] = useState<string[]>([]);
  const [copiedResponseIds, setCopiedResponseIds] = useState<string[]>([]);
  const [copiedTemplateIds, setCopiedTemplateIds] = useState<string[]>([]);
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, string>>({});
  const [sendingCorrectionIds, setSendingCorrectionIds] = useState<string[]>([]);
  const [confirmedCorrectionIds, setConfirmedCorrectionIds] = useState<string[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<RoutineMessageTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [assistantName, setAssistantName] = useState("IA");
  const chatId = chat?.chat_id || "";
  const chatRowId = chat?.id || "";
  const usableMessageTemplates = messageTemplates.filter((template) => template.content.trim());
  const contactName = getString(chat?.nome_contato) || getString(chat?.pushname);
  const firstContactName = contactName.split(/\s+/).filter(Boolean)[0] || contactName;
  const contactPhoneValue = getString(contactPhone) || getString(chat?.phone_contact) || getString(chat?.chat_id);
  const today = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();

    if (chatId) params.set("chatId", chatId);
    if (chatRowId) params.set("chatRowId", chatRowId);
    if (contactPhone) params.set("contactPhone", contactPhone);

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setIsLoading(true);
      setErrorMessage("");
    });

    fetch(`/api/interaction-history${params.size > 0 ? `?${params.toString()}` : ""}`, {
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
  }, [chatId, chatRowId, contactPhone]);

  async function handleQualityChange(interactionId: string, quality: string) {
    if (quality === EMPTY_QUALITY_VALUE) return;

    const previousData = trainingData;
    const nextQuality = quality === NONE_QUALITY_VALUE ? "" : quality;

    setSavingQualityIds((current) => [...current, interactionId]);
    setErrorMessage("");
    setTrainingData((current) => current.map((item) => (item.id === interactionId ? { ...item, quality: nextQuality } : item)));

    try {
      const response = await fetch("/api/interaction-history", {
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

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/message-templates", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { templates?: RoutineMessageTemplate[]; message?: string };

        if (!response.ok) {
          throw new Error(data.message || "Nao foi possivel carregar templates de mensagem.");
        }

        setMessageTemplates(data.templates ?? []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessageTemplates([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingTemplates(false);
      });

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setIsLoadingTemplates(true);
    });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/ia-assistant?fields=name", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;

        const { assistants } = await response.json();
        setAssistantName(assistants?.[0]?.name ?? "IA");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAssistantName("IA");
      });

    return () => controller.abort();
  }, []);

  function renderTemplateContent(content: string) {
    const values: Record<string, string> = {
      nome: contactName,
      primeiro_nome: firstContactName,
      telefone: contactPhoneValue,
      celular: contactPhoneValue,
      hoje: today,
    };
    const chatRecord = (chat ?? {}) as Record<string, unknown>;

    function resolveDirective(match: string, key: string) {
      const normalizedKey = key.toLowerCase();
      const mappedValue = getString(values[normalizedKey]);
      if (mappedValue) return mappedValue;

      const directChatValue = getString(chatRecord[key]) || getString(chatRecord[normalizedKey]);
      return directChatValue || match;
    }

    return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, resolveDirective).replace(/%([\w.-]+)%/g, resolveDirective);
  }

  function applyTemplateToCorrection(interactionId: string, template: RoutineMessageTemplate) {
    if (!template.content.trim()) return;
    const renderedTemplate = renderTemplateContent(template.content);
    setCorrectionDrafts((current) => {
      const currentValue = current[interactionId]?.trim();
      return { ...current, [interactionId]: currentValue ? `${currentValue}\n\n${renderedTemplate}` : renderedTemplate };
    });
  }

  async function handleCopyTemplate(template: RoutineMessageTemplate) {
    if (!template.content.trim()) return;

    try {
      await navigator.clipboard.writeText(renderTemplateContent(template.content));
      setCopiedTemplateIds((current) => [...current.filter((id) => id !== template.id), template.id]);
      window.setTimeout(() => {
        setCopiedTemplateIds((current) => current.filter((id) => id !== template.id));
      }, 1500);
    } catch {
      setErrorMessage("Nao foi possivel copiar o template.");
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
      const messageWithSignature = `*${assistantName}*\n${correctedResponse}`;

      formData.set("chat_id", chatId);
      formData.set("text", messageWithSignature);

      const sendResponse = await fetch("/api/send-message", {
        method: "POST",
        body: formData,
      });
      const sendData = (await sendResponse.json()) as { message?: string };

      if (!sendResponse.ok) {
        throw new Error(sendData.message || "Não foi possível enviar a mensagem corrigida ao chat.");
      }

      const interactionHistoryResponse = await fetch("/api/interaction-history", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ id: item.id, correctedResponse }),
      });
      const interactionHistoryData = (await interactionHistoryResponse.json()) as { interaction?: TrainingInteraction; message?: string };

      if (!interactionHistoryResponse.ok) {
        throw new Error(interactionHistoryData.message || "Mensagem enviada, mas nao foi possivel salvar a correcao no historico de interacoes.");
      }

      setTrainingData((current) =>
        current.map((interaction) =>
          interaction.id === item.id
            ? {
                ...interaction,
                correctedResponse: interactionHistoryData.interaction?.correctedResponse || correctedResponse,
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
    <div className="min-w-0 p-4 space-y-4 animate-in fade-in slide-in-from-right-4 bg-red-0">
      {isLoading ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Carregando histórico de interações...</div> : null}

      {!isLoading && errorMessage ? <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{errorMessage}</div> : null}

      {!isLoading && !errorMessage && trainingData.length === 0 ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhuma interação encontrada para este contato.</div> : null}

      <Accordion type="single" collapsible className="w-full min-w-0 space-y-3">
        {trainingData.map((item) => {
          const isSendingCorrection = sendingCorrectionIds.includes(item.id);
          const correctionValue = correctionDrafts[item.id] ?? item.correctedResponse ?? "";
          const hasCorrectionConfirmation = Boolean(item.correctedResponse) || confirmedCorrectionIds.includes(item.id);

          return (
            <AccordionItem key={item.id} value={`item-${item.id}`} className="min-w-0 overflow-hidden border rounded-xl shadow-sm">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 transition-all items-center">
                <div className="flex min-w-0 items-center justify-between w-full gap-2 pr-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-sm font-bold text-theme-primary"># {item.number}</span>
                    <span className="min-w-0 max-w-[150px] truncate text-sm text-muted-foreground">{item.received}</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="px-2 py-1.5 rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground min-w-0 text-center">{item.quality || "Avaliar"}</div>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-4 pt-2 border-t border-dashed h-auto data-[state=open]:h-auto overflow-visible">
                <div className="min-w-0 space-y-4 mt-2">
                  <div className="grid grid-cols-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    <span>Data e Hora</span>
                    <span className="text-right">Qualidade da Resposta</span>
                  </div>

                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium">{formatInteractionDate(item.createdAt)}</span>
                    <Select value={item.quality || EMPTY_QUALITY_VALUE} onValueChange={(quality) => void handleQualityChange(item.id, quality)} disabled={savingQualityIds.includes(item.id)}>
                      <SelectTrigger className="w-28 h-8 text-xs bg-muted/50">
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
                        {qualityOptions.length === 0 ? (
                          <SelectItem value="__sem_opcoes__" disabled>
                            Sem opções encontradas
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold mb-2">Mensagem Recebida</h4>
                    <div className="bg-[#5fa77f]/20 text-(--chat-reply-me-border) px-3 py-1.5 rounded-md rounded-tl-none inline-block text-sm font-medium  relative before:absolute before:top-0 before:left-[-6px] before:w-0 before:h-0 before:border-t-[8px] before:border-t-[#5fa77f]/20 before:border-l-[6px] before:border-l-transparent">
                      {item.received}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div className="flex min-w-0 max-w-[85%] items-start gap-2">
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

                      <div className="min-w-0 bg-blue-500/20 p-4 rounded-xl rounded-tr-none text-sm relative before:absolute before:top-0 before:right-[-6px] before:w-0 before:h-0 before:border-t-[8px] before:border-t-blue-500/20 before:border-r-[6px] before:border-r-transparent">
                        <h4 className="text-[10px] font-bold text-blue-400 mb-2 text-right uppercase tracking-tighter">Resposta IA</h4>
                        <p className="text-foreground leading-relaxed">
                          <b>{assistantName}</b>
                          <br />
                          {item.iaResponse}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-4">
                    <div className="min-w-0 space-y-2">
                      <h4 className="text-xs font-bold">Mensagem Corrigida</h4>
                      <Accordion type="single" collapsible className="w-full min-w-0 rounded-lg border border-border/70 bg-muted/10">
                        <AccordionItem value="templates" className="border-b-0">
                          <AccordionTrigger className="min-w-0 px-3 py-2 text-left hover:no-underline">
                            <div className="flex min-w-0 items-center justify-between gap-2 pr-2">
                              <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Templates de mensagem</span>
                              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{isLoadingTemplates ? "Carregando..." : `${usableMessageTemplates.length}`}</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-2 pb-2 h-auto data-[state=open]:h-auto">
                            {!isLoadingTemplates && usableMessageTemplates.length === 0 ? <p className="px-1 pb-1 text-xs text-muted-foreground">Nenhum template com texto encontrado.</p> : null}

                            {usableMessageTemplates.length > 0 ? (
                              <div className="grid max-h-44 min-w-0 gap-2 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
                                {usableMessageTemplates.map((template) => {
                                  const renderedTemplate = renderTemplateContent(template.content);

                                  return (
                                    <div key={`${item.id}-${template.id}`} className="min-w-0 overflow-hidden rounded-md border bg-background/70 p-2">
                                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                          <p className="truncate text-xs font-semibold">{template.label}</p>
                                          <p className="mt-1 line-clamp-2 min-w-0 whitespace-pre-wrap break-words text-[11px] leading-snug text-muted-foreground">{renderedTemplate}</p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                                          <Button type="button" variant="outline" className="h-7 px-2 text-[11px]" disabled={isSendingCorrection} onClick={() => applyTemplateToCorrection(item.id, template)}>
                                            Usar
                                          </Button>
                                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Copiar template" onClick={() => void handleCopyTemplate(template)}>
                                            {copiedTemplateIds.includes(template.id) ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <Textarea
                        value={correctionValue}
                        placeholder="Digite a resposta ideal para treinar a IA..."
                        className="min-h-[120px] resize-none bg-muted/20 border-border"
                        disabled={isSendingCorrection}
                        onChange={(event) => setCorrectionDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                      />
                      {hasCorrectionConfirmation ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                          <Check className="h-3.5 w-3.5" />
                          Correção feita
                        </div>
                      ) : null}
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
