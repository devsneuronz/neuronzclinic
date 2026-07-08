"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ChatTag } from "@/lib/chat-tags";
import { getReadableTextColor } from "@/lib/chat-tags";
import { cn, normalizeText } from "@/lib/utils";
import { ArrowUpRight, CalendarDays, CalendarPlus, CalendarSearch, FileText, HelpCircle, Loader2, MessageSquareOff, Pencil, Plus, RefreshCw, Save, Search, Smile, Sparkles, Stethoscope, TagsIcon, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NumericFormat } from "react-number-format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Separator } from "../ui/separator";
import { SkeletonShimmer } from "../ui/skeleton-shimmer";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type SupabaseAssistantInfo = {
  id: string | null;
  name: string;
  gender: string;
  emoji: boolean;
  dados_empresa: string;
  msg_inicial: string;
  estilo_conversa: string;
  avisar_agendamento: boolean;
  avisar_encaminhamento: boolean;
};

export type SupabaseProcedure = {
  id: string;
  status: string;
  nome: string;
  modo_resposta_ia: string;
  info_resposta_ia: string;
  modo_agendamento_ia: string;
  modalidade: string;
  informar_valor_avaliacao: string;
  informar_valor_consulta: string;
  informar_valor_procedimento: string;
  valor_avaliacao: string;
  valor_consulta: string;
  valor_procedimento: string;
  agendas_contexto_ia: string;
  interesse: string;
  created_at: string;
};

type ProcedureDraft = {
  status: string;
  nome: string;
  modo_resposta_ia: string;
  info_resposta_ia: string;
  modo_agendamento_ia: string;
  modalidade: string;
  informar_valor_avaliacao: boolean;
  informar_valor_consulta: boolean;
  informar_valor_procedimento: boolean;
  valor_avaliacao: string;
  valor_consulta: string;
  valor_procedimento: string;
  interesse: string;
};

const emptyAssistant: SupabaseAssistantInfo = {
  id: null,
  name: "Lia",
  gender: "ia",
  emoji: true,
  dados_empresa: "",
  msg_inicial: "",
  estilo_conversa: "formal",
  avisar_agendamento: false,
  avisar_encaminhamento: false,
};

const emptyProcedureDraft: ProcedureDraft = {
  status: "inativo",
  nome: "",
  modo_resposta_ia: "usar_como_base",
  info_resposta_ia: "",
  modo_agendamento_ia: "nao_conduzir_criar_aviso",
  modalidade: "presencial",
  informar_valor_avaliacao: false,
  informar_valor_consulta: false,
  informar_valor_procedimento: false,
  valor_avaliacao: "",
  valor_consulta: "",
  valor_procedimento: "",
  interesse: "",
};

function procedureToDraft(p: SupabaseProcedure): ProcedureDraft {
  return {
    status: p.status || "ativo",
    nome: p.nome || "",
    modo_resposta_ia: p.modo_resposta_ia || "usar_como_base",
    info_resposta_ia: p.info_resposta_ia || "",
    modo_agendamento_ia: p.modo_agendamento_ia || "nao_conduzir_criar_aviso",
    modalidade: p.modalidade || "presencial",
    informar_valor_avaliacao: p.informar_valor_avaliacao === "sim",
    informar_valor_consulta: p.informar_valor_consulta === "sim",
    informar_valor_procedimento: p.informar_valor_procedimento === "sim",
    valor_avaliacao: p.valor_avaliacao || "",
    valor_consulta: p.valor_consulta || "",
    valor_procedimento: p.valor_procedimento || "",
    interesse: p.interesse || "",
  };
}

function draftToPayload(draft: ProcedureDraft) {
  return {
    status: draft.status,
    nome: draft.nome,
    modo_resposta_ia: draft.modo_resposta_ia,
    info_resposta_ia: draft.info_resposta_ia || null,
    modo_agendamento_ia: draft.modo_agendamento_ia || null,
    modalidade: draft.modalidade,
    informar_valor_avaliacao: draft.informar_valor_avaliacao ? "sim" : "nao",
    informar_valor_consulta: draft.informar_valor_consulta ? "sim" : "nao",
    informar_valor_procedimento: draft.informar_valor_procedimento ? "sim" : "nao",
    valor_avaliacao: draft.informar_valor_avaliacao ? draft.valor_avaliacao || null : null,
    valor_consulta: draft.informar_valor_consulta ? draft.valor_consulta || null : null,
    valor_procedimento: draft.informar_valor_procedimento ? draft.valor_procedimento || null : null,
    interesse: draft.interesse || null,
  };
}

async function readApiMessage(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  return data?.message || data?.error || fallback;
}

interface ProcedureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget?: SupabaseProcedure | null;
  tagOptions: ChatTag[];
  isSaving: boolean;
  onSubmit: (draft: ProcedureDraft) => Promise<void>;
}

function ProcedureDialog({ open, onOpenChange, editTarget, tagOptions, isSaving, onSubmit }: ProcedureDialogProps) {
  const isEdit = Boolean(editTarget);
  const [draft, setDraft] = useState<ProcedureDraft>(emptyProcedureDraft);
  const [interestSearch, setInterestSearch] = useState("");
  const [isInterestOpen, setIsInterestOpen] = useState(false);
  const interestRef = useRef<HTMLDivElement>(null);

  const MODO_RESPOSTA_INFOS = {
    usar_como_base: {
      title: "IA adapta a resposta",
      description: "A IA usa o conteúdo como base de conhecimento e personaliza o texto de forma natural para o cliente.",
      icon: Sparkles,
      colorClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    },
    texto_integral: {
      title: "IA envia como está",
      description: "A IA envia o texto exatamente como foi escrito, funcionando como uma resposta padrão estática.",
      icon: FileText,
      colorClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    },
  };

  const MODO_AGENDAMENTO_INFOS = {
    nao_conduzir_criar_aviso: {
      title: "Apenas criar aviso",
      description: "A IA apenas anota o interesse do contato e avisa a equipe, sem coletar ou perguntar por horários.",
      icon: MessageSquareOff,
      colorClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    },
    coletar_preferencia_equipe_confirma: {
      title: "Coletar preferências",
      description: "A IA pergunta os dias e períodos preferidos do cliente e encaminha para validação da equipe.",
      icon: CalendarDays,
      colorClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    },
    sugerir_horarios_equipe_confirma: {
      title: "Sugerir horários",
      description: "A IA busca na agenda e oferece até 2 horários livres para o cliente escolher antes de avisar a equipe.",
      icon: HelpCircle,
      colorClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
  };

  useEffect(() => {
    if (open) {
      setDraft(editTarget ? procedureToDraft(editTarget) : emptyProcedureDraft);
      setInterestSearch("");
      setIsInterestOpen(false);
    }
  }, [open, editTarget]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (interestRef.current && !interestRef.current.contains(e.target as Node)) {
        setIsInterestOpen(false);
      }
    }
    if (isInterestOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isInterestOpen]);

  const filteredTags = useMemo(() => {
    const q = normalizeText(interestSearch);
    return tagOptions.filter((t) => normalizeText(t.label).includes(q));
  }, [interestSearch, tagOptions]);

  const selectedTag = tagOptions.find((t) => t.label === draft.interesse);

  const set = <K extends keyof ProcedureDraft>(key: K, value: ProcedureDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(draft);
  };

  const isValid = draft.nome.trim().length > 0 && draft.info_resposta_ia.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4 text-theme-primary" />
            {isEdit ? "Editar procedimento" : "Novo procedimento"}
          </DialogTitle>
          <DialogDescription>{isEdit ? `Editando: ${editTarget?.nome}` : "Preencha as informações do procedimento para a IA."}</DialogDescription>
        </DialogHeader>

        <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="flex-1 overflow-y-auto px-6 pb-2 pt-1 space-y-5 min-h-0 custom-scrollbar">
            <div className="grid gap-4 sm:grid-cols-12">
              <div className="space-y-2 col-span-6">
                <label className="text-xs font-semibold text-foreground block">Nome do procedimento</label>
                <Input value={draft.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: TXHM, Transplante Capilar..." disabled={isSaving} required />
              </div>

              <div className="space-y-2 col-span-3">
                <label className="text-xs font-semibold text-foreground block">Modalidade</label>
                <Select value={draft.modalidade} onValueChange={(v) => set("modalidade", v)} disabled={isSaving}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presencial">Presencial</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-3">
                <label className="text-xs font-semibold text-foreground block">Status</label>
                <Tabs value={draft.status} onValueChange={(v) => set("status", v)}>
                  <TabsList className="h-9! w-full gap-1 bg-secondary/50 border border-border/40 rounded-full">
                    <TabsTrigger value="inativo" className="text-xs font-medium px-3 data-[state=active]:bg-red-500/20 data-[state=active]:text-red-200!">
                      Inativo
                    </TabsTrigger>
                    <TabsTrigger value="ativo" className="text-xs font-medium px-3 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-200">
                      Ativo
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground block">Modo de resposta da IA</label>
                  <Select value={draft.modo_resposta_ia} onValueChange={(v) => set("modo_resposta_ia", v)} disabled={isSaving}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usar_como_base">Usar como base</SelectItem>
                      <SelectItem value="texto_integral">Texto integral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {draft.modo_resposta_ia &&
                  MODO_RESPOSTA_INFOS[draft.modo_resposta_ia as keyof typeof MODO_RESPOSTA_INFOS] &&
                  (() => {
                    const info = MODO_RESPOSTA_INFOS[draft.modo_resposta_ia as keyof typeof MODO_RESPOSTA_INFOS];
                    const Icon = info.icon;
                    return (
                      <div className={`p-3 rounded-lg border flex items-start gap-3 transition-all min-h-[76px] ${info.colorClass}`}>
                        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <h5 className="text-xs font-bold leading-none tracking-tight">{info.title}</h5>
                          <p className="text-xs text-muted-foreground leading-relaxed">{info.description}</p>
                        </div>
                      </div>
                    );
                  })()}
              </div>

              <div className="space-y-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground block">Modo de agendamento da IA</label>
                  <Select value={draft.modo_agendamento_ia} onValueChange={(v) => set("modo_agendamento_ia", v)} disabled={isSaving}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao_conduzir_criar_aviso">Não conduzir o usuário, apenas criar aviso</SelectItem>
                      <SelectItem value="coletar_preferencia_equipe_confirma">Coletar preferência de horários</SelectItem>
                      <SelectItem value="sugerir_horarios_equipe_confirma">Sugerir horários ao usuário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {draft.modo_agendamento_ia &&
                  MODO_AGENDAMENTO_INFOS[draft.modo_agendamento_ia as keyof typeof MODO_AGENDAMENTO_INFOS] &&
                  (() => {
                    const info = MODO_AGENDAMENTO_INFOS[draft.modo_agendamento_ia as keyof typeof MODO_AGENDAMENTO_INFOS];
                    const Icon = info.icon;
                    return (
                      <div className={`p-3 rounded-lg border flex items-start gap-3 transition-all min-h-[76px] ${info.colorClass}`}>
                        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <h5 className="text-xs font-bold leading-none tracking-tight">{info.title}</h5>
                          <p className="text-xs text-muted-foreground leading-relaxed">{info.description}</p>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground block">Interesse (Mapeamento)</label>
              <div className="relative" ref={interestRef}>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsInterestOpen((o) => !o)}
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs",
                    "hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  {selectedTag ? (
                    <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: selectedTag.color || "var(--secondary)", color: getReadableTextColor(selectedTag.color) }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "currentColor", opacity: 0.7 }} />
                      {selectedTag.label}
                    </span>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-2">
                      <TagsIcon className="h-3.5 w-3.5" />
                      Selecionar tag de interesse...
                    </span>
                  )}
                  {draft.interesse && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        set("interesse", "");
                      }}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>

                {isInterestOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <input autoFocus value={interestSearch} onChange={(e) => setInterestSearch(e.target.value)} placeholder="Buscar tag..." className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1 custom-scrollbar">
                      {filteredTags.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhuma tag encontrada.</p>
                      ) : (
                        filteredTags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => {
                              set("interesse", tag.label);
                              setIsInterestOpen(false);
                              setInterestSearch("");
                            }}
                            className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left", draft.interesse === tag.label && "bg-accent")}
                          >
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color || "#888" }} />
                            <span className="font-medium">{tag.label}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">Contatos vinculados a esse interesse serão afetados por este procedimento.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground block">Conteúdo de resposta da IA</label>
              <Textarea
                value={draft.info_resposta_ia}
                onChange={(e) => set("info_resposta_ia", e.target.value)}
                placeholder="Descreva o procedimento aqui. Esse texto será usado pela IA para responder perguntas dos pacientes..."
                className="min-h-[120px] max-h-64 resize-y leading-relaxed text-sm custom-scrollbar"
                disabled={isSaving}
                required
              />
            </div>

            <Separator className="bg-border/60" />

            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/80">Informações de Valor</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Ative os switches para permitir que a IA informe os valores.</p>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3 space-y-3">
                <div className="flex items-center justify-between select-none">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Informar valor da avaliação</Label>
                    <p className="text-[11px] text-muted-foreground">A IA poderá citar o valor da consulta de avaliação.</p>
                  </div>
                  <Switch checked={draft.informar_valor_avaliacao} onClick={(e) => e.stopPropagation()} onCheckedChange={(v) => set("informar_valor_avaliacao", v)} disabled={isSaving} />
                </div>

                {draft.informar_valor_avaliacao && (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground pointer-events-none">R$</span>
                    <NumericFormat
                      customInput={Input}
                      value={draft.valor_avaliacao}
                      onValueChange={({ formattedValue }) => set("valor_avaliacao", formattedValue)}
                      thousandSeparator="."
                      decimalSeparator=","
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      placeholder="250,00"
                      disabled={isSaving}
                      className="h-9 pl-9 bg-background/50"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3 space-y-3">
                <div className="flex items-center justify-between select-none">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Informar valor da consulta</Label>
                    <p className="text-[11px] text-muted-foreground">A IA poderá citar o valor da consulta regular.</p>
                  </div>
                  <Switch checked={draft.informar_valor_consulta} onClick={(e) => e.stopPropagation()} onCheckedChange={(v) => set("informar_valor_consulta", v)} disabled={isSaving} />
                </div>

                {draft.informar_valor_consulta && (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground pointer-events-none">R$</span>
                    <NumericFormat
                      customInput={Input}
                      value={draft.valor_consulta}
                      onValueChange={({ formattedValue }) => set("valor_consulta", formattedValue)}
                      thousandSeparator="."
                      decimalSeparator=","
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      placeholder="250,00"
                      disabled={isSaving}
                      className="h-9 pl-9 bg-background/50"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3 space-y-3">
                <div className="flex items-center justify-between select-none">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Informar valor do procedimento</Label>
                    <p className="text-[11px] text-muted-foreground">A IA poderá citar o valor do procedimento em si.</p>
                  </div>
                  <Switch checked={draft.informar_valor_procedimento} onClick={(e) => e.stopPropagation()} onCheckedChange={(v) => set("informar_valor_procedimento", v)} disabled={isSaving} />
                </div>

                {draft.informar_valor_procedimento && (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground pointer-events-none">R$</span>
                    <NumericFormat
                      customInput={Input}
                      value={draft.valor_procedimento}
                      onValueChange={({ formattedValue }) => set("valor_procedimento", formattedValue)}
                      thousandSeparator="."
                      decimalSeparator=","
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      placeholder="1250,00"
                      disabled={isSaving}
                      className="h-9 pl-9 bg-background/50"
                    />
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-border/60" />

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/80">Agendas Vinculadas</h4>
              <p className="text-[11px] text-muted-foreground">Configure as agendas de profissionais disponíveis para este procedimento.</p>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-2 w-full" disabled>
                <CalendarSearch className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Gerenciar agendas vinculadas</span>
              </Button>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving || !isValid} className="gap-2">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {isEdit ? "Salvar alterações" : "Criar procedimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClinicInfoManager() {
  const [assistant, setAssistant] = useState<SupabaseAssistantInfo>(emptyAssistant);
  const [assistantDraft, setAssistantDraft] = useState<SupabaseAssistantInfo>(emptyAssistant);
  const [procedures, setProcedures] = useState<SupabaseProcedure[]>([]);
  const [tagOptions, setTagOptions] = useState<ChatTag[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAssistant, setIsSavingAssistant] = useState(false);
  const [isSavingProcedure, setIsSavingProcedure] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupabaseProcedure | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupabaseProcedure | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const assistantChanged =
    assistantDraft.name !== assistant.name ||
    assistantDraft.gender !== assistant.gender ||
    assistantDraft.emoji !== assistant.emoji ||
    assistantDraft.dados_empresa !== assistant.dados_empresa ||
    assistantDraft.msg_inicial !== assistant.msg_inicial ||
    assistantDraft.estilo_conversa !== assistant.estilo_conversa ||
    assistantDraft.avisar_agendamento !== assistant.avisar_agendamento ||
    assistantDraft.avisar_encaminhamento !== assistant.avisar_encaminhamento;

  async function loadInfo() {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const [assistantRes, proceduresRes, optionsRes] = await Promise.all([fetch("/api/ia-assistant", { cache: "no-store" }), fetch("/api/procedures", { cache: "no-store" }), fetch("/api/chat-options", { cache: "no-store" })]);

      if (assistantRes.ok) {
        const data = await assistantRes.json();
        const list = data.assistants || [];
        if (list.length > 0) {
          const a = list[0];
          const loaded: SupabaseAssistantInfo = {
            id: a.id || null,
            name: a.name || "Lia",
            gender: a.gender || "ia",
            emoji: a.emoji !== false,
            dados_empresa: a.dados_empresa || "",
            msg_inicial: a.msg_inicial || "",
            estilo_conversa: a.estilo_conversa || "formal",
            avisar_agendamento: !!a.avisar_agendamento,
            avisar_encaminhamento: !!a.avisar_encaminhamento,
          };
          setAssistant(loaded);
          setAssistantDraft(loaded);
        }
      }

      if (proceduresRes.ok) {
        const data = await proceduresRes.json();
        setProcedures(data.procedures || []);
      }

      if (optionsRes.ok) {
        const data = await optionsRes.json();
        setTagOptions(data.tags || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as informações.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => void loadInfo(), 0);
    return () => window.clearTimeout(id);
  }, []);

  async function saveAssistant() {
    setIsSavingAssistant(true);
    setError(null);
    setSuccess(null);
    try {
      const isNew = !assistant.id;
      const res = await fetch("/api/ia-assistant", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assistantDraft),
      });
      if (!res.ok) throw new Error(await readApiMessage(res, "Não foi possível salvar as informações da assistente."));
      const data = await res.json();
      const next = data.assistant ?? assistantDraft;
      setAssistant(next);
      setAssistantDraft(next);
      setSuccess("Configurações da assistente salvas com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar as informações da assistente.");
    } finally {
      setIsSavingAssistant(false);
    }
  }

  async function handleCreateProcedure(draft: ProcedureDraft) {
    setIsSavingProcedure(true);
    setError(null);
    try {
      const res = await fetch("/api/procedures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      if (!res.ok) throw new Error(await readApiMessage(res, "Não foi possível criar o procedimento."));
      const data = await res.json();
      if (data.procedure) setProcedures((curr) => [data.procedure, ...curr]);
      setIsCreateDialogOpen(false);
      setSuccess("Procedimento criado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o procedimento.");
      throw err;
    } finally {
      setIsSavingProcedure(false);
    }
  }

  async function handleUpdateProcedure(draft: ProcedureDraft) {
    if (!editTarget) return;
    setIsSavingProcedure(true);
    setError(null);
    try {
      const res = await fetch("/api/procedures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editTarget.id, ...draftToPayload(draft) }),
      });
      if (!res.ok) throw new Error(await readApiMessage(res, "Não foi possível salvar o procedimento."));
      const data = await res.json();
      if (data.procedure) {
        setProcedures((curr) => curr.map((p) => (p.id === editTarget.id ? data.procedure : p)));
      }
      setEditTarget(null);
      setSuccess("Procedimento atualizado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o procedimento.");
      throw err;
    } finally {
      setIsSavingProcedure(false);
    }
  }

  async function handleDeleteProcedure() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setError(null);
    try {
      const res = await fetch(`/api/procedures?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiMessage(res, "Não foi possível excluir o procedimento."));
      setProcedures((curr) => curr.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSuccess("Procedimento excluído.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o procedimento.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 transition-all">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {isLoading ? (
            <div className="space-y-2">
              <SkeletonShimmer className="h-6 w-32 rounded-md bg-muted/40" />
              <SkeletonShimmer className="h-4 w-64 sm:w-80 rounded bg-muted/30" />
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">{assistantDraft.name || "Lia"}</h2>
              <p className="text-sm text-muted-foreground">Informações e diretrizes usadas pela IA para responder pacientes.</p>
            </div>
          )}
          <div className="flex items-center gap-2 sm:justify-end flex-wrap">
            {success ? <span className="text-sm font-medium text-emerald-600 animate-fade-in">{success}</span> : null}
            {error ? <span className="text-sm font-medium text-destructive animate-fade-in">{error}</span> : null}
            <Button type="button" variant="outline" size="sm" onClick={() => void loadInfo()} disabled={isLoading || isSavingAssistant} className="h-9">
              <RefreshCw className={cn("mr-2 w-3.5 h-3.5", isLoading && "animate-spin")} />
              Atualizar
            </Button>
            <Button type="button" size="sm" variant="primary" onClick={() => void saveAssistant()} disabled={isSavingAssistant || !assistantChanged || isLoading} className="h-9">
              {isSavingAssistant ? <Loader2 className="animate-spin mr-2 w-3.5 h-3.5" /> : <Save className="mr-2 w-3.5 h-3.5" />}
              Salvar Alterações
            </Button>
          </div>
        </div>
        {isLoading ? (
          <>
            <div className="grid gap-5">
              <div className="space-y-2">
                <SkeletonShimmer className="h-4 w-44 rounded bg-muted/40" />
                <SkeletonShimmer className="h-55 w-full rounded-lg bg-muted/20 border border-border/30" />
              </div>
              <div className="space-y-2">
                <SkeletonShimmer className="h-4 w-48 rounded bg-muted/40" />
                <SkeletonShimmer className="h-28 w-full rounded-lg bg-muted/20 border border-border/30" />
              </div>
              <Separator className="my-2 bg-border/60" />
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <SkeletonShimmer className="h-4 w-48 rounded bg-muted/40 font-bold" />
                  <SkeletonShimmer className="h-3.5 w-80 rounded bg-muted/20" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <SkeletonShimmer className="h-3.5 w-20 rounded bg-muted/40" />
                      <SkeletonShimmer className="h-9 w-full rounded-md bg-muted/20 border border-border/40" />
                    </div>
                    <div className="space-y-2">
                      <SkeletonShimmer className="h-3.5 w-32 rounded bg-muted/40" />
                      <SkeletonShimmer className="h-9 w-full rounded-full bg-muted/20 border border-border/30" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <SkeletonShimmer className="h-3.5 w-28 rounded bg-muted/40" />
                      <SkeletonShimmer className="h-9 w-full rounded-md bg-muted/20 border border-border/40" />
                    </div>
                  </div>
                </div>
              </div>
              <Separator className="my-2 bg-border/60" />
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <SkeletonShimmer className="h-4 w-56 rounded bg-muted/40 font-bold" />
                  <SkeletonShimmer className="h-3.5 w-96 rounded bg-muted/20" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg border border-border/70 bg-background/20 p-3.5 min-h-15 gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <SkeletonShimmer className="h-8 w-8 rounded-md bg-muted/30 shrink-0" />
                        <div className="space-y-2 flex-1 min-w-0">
                          <SkeletonShimmer className="h-3.5 w-10/12 rounded bg-muted/40" />
                          <SkeletonShimmer className="h-3 w-full rounded bg-muted/20" />
                          <SkeletonShimmer className="h-3 w-8/12 rounded bg-muted/20" />
                        </div>
                      </div>
                      <SkeletonShimmer className="h-6 w-10 rounded-full bg-muted/30 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-5">
              <div className="space-y-2">
                <Label htmlFor="assistant-general-info" className="text-sm font-semibold text-foreground">
                  Informações Gerais da Clínica
                </Label>
                <Textarea
                  id="assistant-general-info"
                  value={assistantDraft.dados_empresa}
                  onChange={(e) => setAssistantDraft((c) => ({ ...c, dados_empresa: e.target.value }))}
                  className="overflow-auto custom-scrollbar transition-all min-h-55 max-h-100 resize-y bg-background leading-relaxed rounded-lg border-0!"
                  placeholder="Dados estruturados da clínica (endereço, horários, regras de convênio)..."
                  disabled={isSavingAssistant}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assistant-initial-message" className="text-sm font-semibold text-foreground">
                  Mensagem Inicial de Saudação
                </Label>
                <Textarea
                  id="assistant-initial-message"
                  value={assistantDraft.msg_inicial}
                  onChange={(e) => setAssistantDraft((c) => ({ ...c, msg_inicial: e.target.value }))}
                  className="min-h-27.5 max-h-55 resize-y bg-background leading-relaxed rounded-lg border-0! custom-scrollbar"
                  placeholder="Primeira mensagem enviada pela assistente ao iniciar um novo contato..."
                  disabled={isSavingAssistant}
                />
              </div>
              <Separator className="my-2 bg-border/60" />
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">Personalidade e Identidade</h3>
                  <p className="text-xs text-muted-foreground">Defina a identidade visual, gênero e as informações cadastrais da clínica.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="assistant-name" className="text-xs font-semibold text-foreground">
                        Nome da IA
                      </Label>
                      <Input
                        id="assistant-name"
                        type="text"
                        value={assistantDraft.name || ""}
                        onChange={(e) => setAssistantDraft((c) => ({ ...c, name: e.target.value }))}
                        placeholder="Ex: Lia, Dr. Robô, Amanda..."
                        disabled={isSavingAssistant}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-foreground">Gênero de Tratamento</Label>
                      <Tabs value={assistantDraft.gender || "ia"} onValueChange={(v) => setAssistantDraft((c) => ({ ...c, gender: v }))} className="w-full">
                        <TabsList className="w-full gap-1.5 rounded-full h-9! bg-secondary/50 border border-border/40">
                          <TabsTrigger value="mulher" disabled={isSavingAssistant} className="rounded-full gap-1.5 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-card">
                            Mulher
                          </TabsTrigger>
                          <TabsTrigger value="homem" disabled={isSavingAssistant} className="rounded-full gap-1.5 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-card">
                            Homem
                          </TabsTrigger>
                          <TabsTrigger value="ia" disabled={isSavingAssistant} className="rounded-full gap-1.5 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-card">
                            Neutro / IA
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="assistant-style" className="text-xs font-semibold text-foreground">
                        Estilo de Conversa
                      </Label>
                      <Select value={assistantDraft.estilo_conversa || "formal"} onValueChange={(v) => setAssistantDraft((c) => ({ ...c, estilo_conversa: v }))} disabled={isSavingAssistant}>
                        <SelectTrigger id="assistant-style" className="w-full">
                          <SelectValue placeholder="Selecione o tom da conversa" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="formal">Formal • Profissional, educado e objetivo</SelectItem>
                          <SelectItem value="informal">Informal • Acolhedor, próximo e natural</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
              <Separator className="my-2 bg-border/60" />
              <div className="space-y-4 pt-2">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/80">Comportamento e Notificações</h3>
                  <p className="text-xs text-muted-foreground">Ajuste como a assistente interage e quando ela deve enviar notificações.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 p-3.5 shadow-2xs min-h-15 cursor-pointer select-none gap-3 hover:bg-background/60 transition-colors"
                    onClick={() => setAssistantDraft((c) => ({ ...c, emoji: !c.emoji }))}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/60 text-muted-foreground">
                        <Smile className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <Label htmlFor="assistant-emojis" className="text-xs font-semibold text-foreground cursor-pointer block truncate">
                          Permitir o uso de emojis
                        </Label>
                        <p className="text-[11px] text-muted-foreground leading-tight">{assistantDraft.emoji ? "A IA usará reações visuais moderadas nas respostas." : "Respostas estritamente textuais e limpas."}</p>
                      </div>
                    </div>
                    <Switch id="assistant-emojis" checked={!!assistantDraft.emoji} onClick={(e) => e.stopPropagation()} onCheckedChange={(v) => setAssistantDraft((c) => ({ ...c, emoji: v }))} disabled={isSavingAssistant} />
                  </div>
                  <div
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 p-3.5 shadow-2xs min-h-15 cursor-pointer select-none gap-3 hover:bg-background/60 transition-colors"
                    onClick={() => setAssistantDraft((c) => ({ ...c, avisar_agendamento: !c.avisar_agendamento }))}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/60 text-muted-foreground">
                        <CalendarPlus className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <Label htmlFor="assistant-notify-booking" className="text-xs font-semibold text-foreground cursor-pointer block truncate">
                          Avisar sobre agendamentos
                        </Label>
                        <p className="text-[11px] text-muted-foreground leading-tight">Notificar quando um novo agendamento for solicitado ou realizado.</p>
                      </div>
                    </div>
                    <Switch
                      id="assistant-notify-booking"
                      checked={!!assistantDraft.avisar_agendamento}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(v) => setAssistantDraft((c) => ({ ...c, avisar_agendamento: v }))}
                      disabled={isSavingAssistant}
                    />
                  </div>
                  <div
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 p-3.5 shadow-2xs min-h-15 cursor-pointer select-none gap-3 hover:bg-background/60 transition-colors"
                    onClick={() => setAssistantDraft((c) => ({ ...c, avisar_encaminhamento: !c.avisar_encaminhamento }))}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/60 text-muted-foreground">
                        <ArrowUpRight className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <Label htmlFor="assistant-notify-forward" className="text-xs font-semibold text-foreground cursor-pointer block truncate">
                          Avisar sobre encaminhamentos
                        </Label>
                        <p className="text-[11px] text-muted-foreground leading-tight">Notificar quando a conversa for encaminhada para atendimento humano.</p>
                      </div>
                    </div>
                    <Switch
                      id="assistant-notify-forward"
                      checked={!!assistantDraft.avisar_encaminhamento}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(v) => setAssistantDraft((c) => ({ ...c, avisar_encaminhamento: v }))}
                      disabled={isSavingAssistant}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <>
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 min-w-0 flex-1">
                <SkeletonShimmer className="h-6 w-36 rounded-md bg-muted/40" />
                <SkeletonShimmer className="h-4 w-full max-w-md rounded bg-muted/20" />
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 w-full sm:w-auto">
                <SkeletonShimmer className="h-6 w-16 rounded-full bg-muted/30" />
                <SkeletonShimmer className="h-9 w-36 rounded-md bg-muted/40" />
              </div>
            </div>

            <div className="flex flex-col bg-card rounded-b-xl shadow-sm overflow-hidden">
              <div className="hidden md:grid grid-cols-[10px_2fr_1fr_1fr_100px] border-b border-border bg-muted/10 px-4 py-3 gap-4 items-center">
                <span className="w-2" />
                <SkeletonShimmer className="h-3 w-12 rounded bg-muted/30" />
                <SkeletonShimmer className="h-3 w-16 rounded bg-muted/30" />
                <SkeletonShimmer className="h-3 w-20 rounded bg-muted/30" />
                <span className="text-right flex justify-end">
                  <SkeletonShimmer className="h-3 w-10 rounded bg-muted/30" />
                </span>
              </div>

              <div className="flex flex-col w-full divide-y divide-border">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex flex-col gap-3 p-4 md:grid md:grid-cols-[10px_2fr_1fr_1fr_100px] md:items-center md:gap-4 md:py-3.5 md:px-4">
                    <div className="flex items-center justify-between md:justify-center shrink-0">
                      <span className="text-xs text-muted-foreground/40 md:hidden">Status</span>
                      <SkeletonShimmer className="h-2 w-2 rounded-full bg-muted/40" />
                    </div>

                    <div className="min-w-0 flex-1 md:flex-none space-y-2">
                      <SkeletonShimmer className="h-4 w-7/12 rounded bg-muted/40" />
                      <SkeletonShimmer className="h-3 w-11/12 rounded bg-muted/20" />

                      <div className="flex items-center gap-2 mt-2 md:hidden">
                        <SkeletonShimmer className="h-5 w-16 rounded bg-muted/20" />
                        <SkeletonShimmer className="h-4 w-12 rounded bg-muted/20" />
                        <SkeletonShimmer className="h-5 w-10 rounded bg-muted/20" />
                      </div>
                    </div>

                    <div className="hidden md:flex items-center">
                      <SkeletonShimmer className="h-5 w-24 rounded bg-muted/30" />
                    </div>

                    <div className="hidden md:flex items-center">
                      <SkeletonShimmer className="h-4 w-16 rounded bg-muted/20" />
                    </div>

                    <div className="flex items-center justify-end gap-1 shrink-0 pt-2 border-t border-border/40 md:pt-0 md:border-0">
                      <SkeletonShimmer className="h-8 w-8 rounded-md bg-muted/20" />
                      <SkeletonShimmer className="h-8 w-8 rounded-md bg-muted/20" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5 min-w-0">
                <h2 className="text-lg font-semibold text-foreground tracking-tight">Procedimentos</h2>
                <p className="text-sm text-muted-foreground max-w-(--size-xl) sm:max-w-none md:line-clamp-none line-clamp-2">Procedimentos e tratamentos que a IA conhece e pode explicar aos pacientes.</p>
              </div>
              <div className="flex items-center justify-end sm:justify-end gap-2 shrink-0 w-full sm:w-auto">
                <span className="text-xs font-semibold text-muted-foreground bg-muted/80 border border-border/20 px-2 md:px-2.5 py-1 rounded-full">
                  {procedures.length} <span className="hidden lg:inline">cadastrado{procedures.length !== 1 ? "s" : ""}</span>
                </span>
                <Button type="button" size="sm" variant="primary" className="h-9 gap-1.5 shadow-xs font-medium cursor-pointer" onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Novo procedimento</span>
                </Button>
              </div>
            </div>
            <div className="flex flex-col bg-card rounded-b-xl shadow-sm overflow-hidden">
              <div className="hidden md:grid grid-cols-[10px_2fr_1fr_1fr_100px] border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground gap-4 items-center">
                <span></span>
                <span>Nome</span>
                <span>Interesse</span>
                <span>Modalidade</span>
                <span className="text-right">Ações</span>
              </div>
              {procedures.length === 0 ? (
                <div className="flex h-52 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground p-6">
                  <Stethoscope className="h-9 w-9 text-muted-foreground/50 stroke-[1.5]" />
                  <div>
                    <p className="font-medium">Nenhum procedimento cadastrado.</p>
                    <p className="text-xs mt-0.5">Clique em "Novo procedimento" para começar.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col w-full divide-y divide-border">
                  {procedures.map((procedure) => {
                    const isActive = procedure.status === "ativo";
                    const isDeleting = deletingId === procedure.id;
                    const tag = tagOptions.find((t) => t.label === procedure.interesse);
                    const modalidadeLabel = procedure.modalidade === "presencial" ? "Presencial" : procedure.modalidade === "online" ? "Online" : procedure.modalidade;
                    const modoLabel = procedure.modo_resposta_ia === "texto_integral" ? "Integral" : procedure.modo_resposta_ia === "usar_como_base" ? "Base" : procedure.modo_resposta_ia;
                    return (
                      <article key={procedure.id} className="w-full hover:bg-muted/20 transition-colors" onClick={() => setEditTarget(procedure)}>
                        <div className="flex flex-col gap-3 p-4 md:grid md:grid-cols-[10px_2fr_1fr_1fr_100px] md:items-center md:gap-4 md:py-3.5 md:px-4">
                          <div className="flex items-center justify-between md:justify-center shrink-0 min-w-0">
                            <span className="text-xs text-muted-foreground/60 font-medium md:hidden">Status</span>
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center p-0.5 shrink-0">
                                    <span className="relative flex h-2 w-2 rounded-full">
                                      {isActive ? (
                                        <>
                                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                        </>
                                      ) : (
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400/60" />
                                      )}
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs font-medium px-2 py-1">
                                  {isActive ? "Procedimento ativo" : "Procedimento inativo"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="min-w-0 flex-1 md:flex-none">
                            <p className="text-sm font-semibold text-foreground truncate w-full" title={procedure.nome}>
                              {procedure.nome || "Sem nome"}
                            </p>
                            {procedure.info_resposta_ia && <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed mt-0.5">{procedure.info_resposta_ia}</p>}
                            <div className="flex items-center gap-2 mt-2 md:hidden flex-wrap">
                              {tag ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border border-border/30"
                                  style={{ backgroundColor: tag.color || "var(--secondary)", color: getReadableTextColor(tag.color) }}
                                >
                                  {tag.label}
                                </span>
                              ) : procedure.interesse ? (
                                <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-secondary text-secondary-foreground border border-border/30">{procedure.interesse}</span>
                              ) : null}
                              {modalidadeLabel ? <span className="text-[11px] text-muted-foreground">{modalidadeLabel}</span> : null}
                              {modoLabel ? <span className="text-[11px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground font-mono">{modoLabel}</span> : null}
                            </div>
                          </div>
                          <div className="hidden md:flex items-center min-w-0 truncate">
                            {tag ? (
                              <span
                                className="inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-medium border border-border/20 shadow-2xs truncate max-w-full"
                                style={{ backgroundColor: tag.color || "var(--secondary)", color: getReadableTextColor(tag.color) }}
                              >
                                {tag.label}
                              </span>
                            ) : procedure.interesse ? (
                              <span className="inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground border border-border/30 truncate max-w-full">{procedure.interesse}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50 italic">—</span>
                            )}
                          </div>
                          <div className="hidden md:flex items-center shrink-0">
                            <span className="text-xs text-muted-foreground truncate">{modalidadeLabel || "—"}</span>
                          </div>
                          <div className="flex items-center justify-end gap-1 shrink-0 pt-2 border-t border-border/40 md:pt-0 md:border-0">
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditTarget(procedure)} disabled={isDeleting} className="h-8 w-8 hover:bg-muted" aria-label="Editar">
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(procedure);
                              }}
                              disabled={isDeleting}
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Excluir"
                            >
                              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <ProcedureDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} tagOptions={tagOptions} isSaving={isSavingProcedure} onSubmit={handleCreateProcedure} />

      <ProcedureDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        editTarget={editTarget}
        tagOptions={tagOptions}
        isSaving={isSavingProcedure}
        onSubmit={handleUpdateProcedure}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Excluir procedimento?</DialogTitle>
            <DialogDescription>Esta ação removerá permanentemente o procedimento do banco de dados. A IA deixará de usar este contexto.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-sm">
            <span className="font-semibold text-foreground block mb-1">{deleteTarget?.nome || "Procedimento"}</span>
            {deleteTarget?.info_resposta_ia && <p className="text-muted-foreground line-clamp-2 leading-relaxed text-xs">{deleteTarget.info_resposta_ia}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={Boolean(deletingId)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteProcedure()} disabled={Boolean(deletingId)}>
              {deletingId ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
