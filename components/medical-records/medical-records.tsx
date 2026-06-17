"use client";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getChatStatusColor, getChatStatusLabel } from "@/lib/chat-status";
import { ChatRecord, fetchChats } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardX,
  ExternalLink,
  FilePlus,
  FileText,
  FolderClock,
  FolderHeart,
  FolderOpen,
  Info,
  Loader2,
  Mic,
  Phone,
  Search,
  Sparkles,
  Stethoscope,
  UserX,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Separator } from "../ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import Editor from "./tiptap-editor/editor";

function getDisplayName(chat?: ChatRecord) {
  return chat?.nome_contato || chat?.pushname || chat?.chat_id?.replace("@s.whatsapp.net", "") || "Contato sem nome";
}

function getContactPhone(chat?: ChatRecord) {
  const candidates = [chat?.phone_contact, chat?.chat_id, chat?.lid_id];
  const phone = candidates.map((value) => value?.replace(/@.+$/, "").replace(/\D/g, "")).find((value) => value && value.length >= 8);

  return phone || chat?.phone_contact?.trim() || chat?.chat_id?.replace(/@.+$/, "") || "Sem telefone";
}

interface AtendimentoPassado {
  id: string;
  data: string;
  medico: string;
  paciente: string;
  procedimento: string;
  tipo: string;
  anotacoes: string;
  resumoIA: string;
  prescricoes: string;
}

export interface Exame {
  id: string;
  exame: string;
  status: "Anexado" | "Aguardando";
  statusLabel: string;
  observacoes: string;
  data: string;
}

export default function MedicalRecords() {
  const [selectedPatient, setSelectedPatient] = React.useState<string>("");
  const [selectedAppointment, setSelectedAppointment] = React.useState<string>("");

  const [visibleCount, setVisibleCount] = useState(10);

  const [appointmentPatientSearch, setAppointmentPatientSearch] = useState("");
  const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false);

  const [patients, setPatients] = useState<ChatRecord[]>([]);
  const [selectedContact, setSelectedContact] = useState<ChatRecord | null>(null);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [hasMorePatients, setHasMorePatients] = useState(true);
  const LIMIT_PER_PAGE = 100;

  const debouncedSearch = useDebouncedValue(appointmentPatientSearch.trim(), 300);

  const loadPatients = useCallback(async (searchTerm: string = "", offsetToLoad: number = 0) => {
    setIsLoadingPatients(true);
    try {
      const data = await fetchChats({
        limit: LIMIT_PER_PAGE,
        offset: offsetToLoad,
        search: searchTerm || undefined,
      });

      const activePatients = data.filter((chat) => getChatStatusLabel(chat) !== "PACIENTE INATIVO");

      if (data.length < LIMIT_PER_PAGE) {
        setHasMorePatients(false);
      } else {
        setHasMorePatients(true);
      }

      setPatients((prevPatients) => {
        return offsetToLoad === 0 ? activePatients : [...prevPatients, ...activePatients];
      });
    } catch (err) {
      console.error("Error loading patients:", err);
    } finally {
      setIsLoadingPatients(false);
    }
  }, []);

  useEffect(() => {
    loadPatients(debouncedSearch);
  }, [debouncedSearch, loadPatients]);

  const handleLoadMore = () => {
    const nextOffset = currentOffset + LIMIT_PER_PAGE;
    setCurrentOffset(nextOffset);
    loadPatients(appointmentPatientSearch, nextOffset);
    setVisibleCount((prev) => prev + 20);
  };

  const patientSearchResults = useMemo(() => {
    return patients.slice(0, visibleCount);
  }, [patients, visibleCount]);

  const handleSelectPatient = (patient: ChatRecord) => {
    setSelectedPatient(patient.id);
    setSelectedContact(patient);
    setAppointmentPatientSearch("");
    setIsPatientSearchOpen(false);
  };

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: {
        class: "focus:outline-none text-sm leading-relaxed text-foreground min-h-[120px] prose prose-sm dark:prose-invert max-w-none",
      },
    },
  });

  const historicoConsultas: AtendimentoPassado[] = [
    {
      id: "1",
      data: "Quarta-Feira, 20 de Maio de 2026 às 11:45",
      medico: "Dra. Tatiana",
      paciente: "Víctor",
      procedimento: "Tratamento Capilar",
      tipo: "Presencial",
      anotacoes: "Apenas Teste. Paciente relata melhora significativa na densidade capilar após o início do ciclo de tratamento.",
      resumoIA: "Paciente em evolução favorável no tratamento capilar. Sem queixas de efeitos colaterais.",
      prescricoes: "Minoxidil 5% — Aplicar 1ml no couro cabeludo à noite.",
    },
    {
      id: "2",
      data: "Segunda-Feira, 06 de Abril de 2026 às 14:00",
      medico: "Dra. Tatiana",
      paciente: "Víctor",
      procedimento: "Consulta Inicial",
      tipo: "Presencial",
      anotacoes: "Avaliação de alopecia androgênica inicial identificada na região da coroa.",
      resumoIA: "Primeira consulta para mapeamento de perda capilar estável.",
      prescricoes: "Shampoo Cetoconazol 2% — Uso 3x por semana.",
    },
  ];

  const listaExames: Exame[] = [
    {
      id: "ex-01",
      exame: "Perfil Férrico Completo",
      status: "Anexado",
      statusLabel: "Anexado no Prontuário",
      observacoes: "Ferritina dentro dos limites normais, porém limítrofe para crescimento folicular ideal.",
      data: "12 de Maio de 2026",
    },
    {
      id: "ex-02",
      exame: "Dosagem de Cortisol Sérico",
      status: "Aguardando",
      statusLabel: "Aguardando Laboratório",
      observacoes: "Solicitado para triagem de eflúvio telógeno associado a estresse crônico.",
      data: "Pendente",
    },
    {
      id: "ex-03",
      exame: "Trichogramma Digital / Fototricograma",
      status: "Anexado",
      statusLabel: "Anexado no Prontuário",
      observacoes: "Aumento perceptível na proporção de fios anágenos na região da coroa após o início do tratamento minoxidil.",
      data: "05 de Maio de 2026",
    },
    {
      id: "ex-04",
      exame: "Hemograma Completo com Frações",
      status: "Anexado",
      statusLabel: "Anexado no Prontuário",
      observacoes: "Ausência de processos infecciosos ativos. Série branca e vermelha totalmente estabilizadas.",
      data: "28 de Abril de 2026",
    },
    {
      id: "ex-05",
      exame: "Dosagem de Vitamina D (25-hidroxivitamina D)",
      status: "Aguardando",
      statusLabel: "Aguardando Laboratório",
      observacoes: "Avaliação necessária para manutenção da barreira cutânea e síntese proteica do folículo.",
      data: "Pendente",
    },
    {
      id: "ex-5",
      exame: "Dosagem de Vitamina D (25-hidroxivitamina D)",
      status: "Aguardando",
      statusLabel: "Aguardando Laboratório",
      observacoes: "Avaliação necessária para manutenção da barreira cutânea e síntese proteica do folículo.",
      data: "Pendente",
    },
  ];

  const agendamentosPlaceholder = [
    {
      id: "p1",
      data: "--/--/----",
      medico: "Médico Clinico",
      procedimento: "Consulta de Rotina",
      tipo: "Presencial",
      anotacoes: "Nenhuma anotação disponível.",
      resumoIA: "Aguardando seleção de paciente para análise.",
      prescricoes: "Nenhuma prescrição.",
    },
    {
      id: "p2",
      data: "--/--/----",
      medico: "Médico Especialista",
      procedimento: "Retorno",
      tipo: "Teleconsulta",
      anotacoes: "Nenhuma anotação disponível.",
      resumoIA: "Aguardando seleção de paciente para análise.",
      prescricoes: "Nenhuma prescrição.",
    },
  ];

  const examesPlaceholder = [
    { id: "e1", exame: "Exame Clínico Laboratorial", status: "Pendente", statusLabel: "Aguardando", observacoes: "Nenhuma observação disponível.", data: "--/--/----" },
    { id: "e2", exame: "Exame de Imagem Diagnóstica", status: "Pendente", statusLabel: "Aguardando", observacoes: "Nenhuma observação disponível.", data: "--/--/----" },
  ];

  const dadosAgendamentos = selectedPatient ? historicoConsultas : agendamentosPlaceholder;
  const dadosExames = selectedPatient ? listaExames : examesPlaceholder;

  if (!editor) {
    return null;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background overflow-hidden">
      <header className="flex min-h-15.25 items-center justify-between border-b border-border bg-card px-6 shrink-0">
        <h1 className="text-xl font-semibold text-foreground">Prontuários</h1>
      </header>

      <main className="flex-1 overflow-hidden p-6">
        <div className="h-full mx-auto max-w-7xl flex flex-col gap-6">
          <div className="flex w-full flex-col bg-card rounded-xl border border-border shadow-sm gap-6 overflow-hidden h-full">
            <div className="flex flex-col gap-2 p-4 pb-0">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-theme-primary/10 text-theme-primary">
                  <FolderHeart className="h-4 w-4" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">Gestão de Prontuário</h1>
              </div>
              <p className="text-sm text-muted-foreground">Consulte o histórico cronológico de evoluções, gerencie novos prontuários e analise a linha do tempo de exames e laudos de cada paciente.</p>
            </div>
            {/* ^^^ Fixo ^^^ */}

            {/* vvv Scrollavel vvv */}
            <div className="overflow-y-auto custom-scrollbar p-4 pt-0 space-y-4">
              <div className="flex flex-row gap-4 pt-1">
                <Card className={cn("w-1/3 justify-between h-90.25 transition-all ring-0 ring-theme-primary/50", !selectedAppointment && "ring-3")}>
                  <CardHeader>
                    <CardTitle>Paciente e Agendamento</CardTitle>
                    <CardDescription>Escolha o paciente e o atendimento associado.</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {selectedContact ? (
                      <div className="rounded-xl border border-border bg-muted/20 p-4 animate-in fade-in duration-200">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground" title={getDisplayName(selectedContact)}>
                              {getDisplayName(selectedContact)}
                            </p>

                            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3.5 w-3.5 shrink-0" />
                              {getContactPhone(selectedContact)}
                            </div>
                          </div>

                          {getChatStatusLabel(selectedContact) && (
                            <Badge className="text-white uppercase border-0 text-[10px] px-2 py-0.5" style={{ backgroundColor: getChatStatusColor(selectedContact) }}>
                              {getChatStatusLabel(selectedContact)}
                            </Badge>
                          )}
                        </div>

                        <Separator className="my-3" />

                        <div className="w-full sm:flex-[2] space-y-1.5">
                          <Label className="text-sm font-semibold text-foreground">Agendamento</Label>
                          <Select value={selectedAppointment} onValueChange={setSelectedAppointment}>
                            <SelectTrigger className="w-full h-10 bg-background border-border text-sm">
                              <SelectValue placeholder="Selecione o horário do atendimento..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Quarta-Feira, 20 de Maio de 2026 às 11:45 - Tratamento Capilar">Quarta-Feira, 20 de Maio de 2026 às 11:45 - Tratamento Capilar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <div className="-translate-y-8 rounded-xl border border-dashed border-border bg-muted/5 p-4 flex flex-col justify-between min-h-[118px] transition-colors">
                        <div className="flex items-start justify-between opacity-60">
                          <div className="space-y-1.5 w-full">
                            <p className="text-sm font-medium text-muted-foreground/70 italic">Nenhum paciente selecionado</p>

                            <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                              <Phone className="h-3.5 w-3.5 opacity-70" />
                              <span>(00) 00000-0000</span>
                            </div>
                          </div>

                          <Badge className=" bg-muted border border-border px-2 py-0.5 text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider">Status</Badge>
                        </div>

                        <Separator className="my-3 opacity-50" />

                        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                          <CalendarDays className="h-3.5 w-3.5 opacity-70" />
                          <span className="italic">Selecione um paciente abaixo para vincular os dados</span>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-row gap-2">
                      <div className="w-full space-y-1.5">
                        <Label className="text-sm font-semibold text-foreground">Paciente</Label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

                          <Input
                            className="pl-9 h-10 bg-background border-border text-sm"
                            value={appointmentPatientSearch}
                            placeholder={selectedContact ? getDisplayName(selectedContact) : "Digite o nome do paciente"}
                            onBlur={() => {
                              window.setTimeout(() => setIsPatientSearchOpen(false), 120);
                            }}
                            onChange={(event) => {
                              const value = event.target.value;
                              setAppointmentPatientSearch(value);

                              setCurrentOffset(0);

                              loadPatients(value, 0);
                              setIsPatientSearchOpen(true);
                            }}
                            onFocus={() => {
                              setIsPatientSearchOpen(true);
                            }}
                          />

                          {isPatientSearchOpen && (
                            <div className="absolute z-50 mt-1 max-h-72 w-full flex flex-col rounded-md border border-border bg-popover shadow-md animate-in fade-in-50 slide-in-from-top-1 duration-150 overflow-hidden">
                              <div className="flex-1 overflow-y-auto p-1 max-h-56 custom-scrollbar">
                                {isLoadingPatients && currentOffset === 0 ? (
                                  <div className="px-3 py-2.5 text-xs text-muted-foreground italic">Carregando pacientes...</div>
                                ) : patientSearchResults.length > 0 ? (
                                  <>
                                    {patientSearchResults.map((patient) => {
                                      const name = getDisplayName(patient);
                                      return (
                                        <button
                                          key={patient.id}
                                          type="button"
                                          className={cn(
                                            "flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors gap-2",
                                            selectedPatient === patient.id && "bg-accent text-accent-foreground",
                                          )}
                                          onClick={() => handleSelectPatient(patient)}
                                        >
                                          <span className="truncate font-medium">{name}</span>
                                        </button>
                                      );
                                    })}

                                    {isLoadingPatients && currentOffset > 0 && (
                                      <div className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-muted-foreground italic bg-muted/10 rounded-sm animate-pulse mt-1">
                                        <Loader2 className="h-3 w-3 animate-spin text-theme-primary" />
                                        Buscando mais pacientes...
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="px-3 py-2.5 text-xs text-muted-foreground italic">Nenhum paciente encontrado</div>
                                )}
                              </div>

                              {hasMorePatients && (
                                <div className="border-t border-border bg-muted/30 p-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={isLoadingPatients}
                                    className={cn(
                                      "flex w-full items-center justify-center rounded-sm py-1.5 text-xs font-semibold text-theme-primary hover:bg-accent hover:text-theme-primary transition-colors",
                                      isLoadingPatients && "opacity-50 cursor-not-allowed",
                                    )}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={handleLoadMore}
                                  >
                                    {isLoadingPatients ? "Aguarde..." : "Carregar mais pacientes"}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden flex flex-col flex-1 relative">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-muted/30 border-b border-border px-5 py-3.5 gap-2 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-theme-primary/10 text-theme-primary">
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-semibold text-foreground/90 leading-none">{selectedAppointment ? selectedAppointment : "Prontuário Clínico"}</span>
                    </div>

                    {selectedAppointment && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 border border-emerald-500/20 w-fit animate-in fade-in duration-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Agendamento selecionado
                      </span>
                    )}
                  </div>

                  <div
                    className={cn(
                      "grid grid-cols-1 lg:grid-cols-[1fr_200px] divide-y lg:divide-y-0 lg:divide-x divide-border flex-1 min-h-0 transition-all duration-300",
                      !selectedAppointment && "pointer-events-none select-none opacity-40",
                    )}
                  >
                    <div className="flex flex-col bg-background/50 overflow-y-auto">
                      <Editor disabled={!selectedAppointment} />
                    </div>

                    <div className="p-4 bg-muted/5 flex flex-col justify-start gap-2.5 overflow-y-auto">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1 px-1 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-blue-500" />
                        Ações Clínicas e IA
                      </div>
                      <Button disabled={!selectedAppointment} variant="outline" className="w-full justify-start gap-2.5 h-10 text-xs font-medium text-foreground/80 border-border">
                        <Mic className="h-4 w-4 shrink-0" />
                        Gravação com IA
                      </Button>
                      <Button disabled={!selectedAppointment} variant="outline" className="w-full justify-start gap-2.5 h-10 text-xs font-medium text-foreground/80 border-border">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        Nova Prescrição
                      </Button>
                      <Button disabled={!selectedAppointment} variant="outline" className="w-full justify-start gap-2.5 h-10 text-xs font-medium text-foreground/80 border-border">
                        <FilePlus className="h-4 w-4 text-muted-foreground shrink-0" />+ Resultado/Exame
                      </Button>
                      <Button disabled={!selectedAppointment} className="w-full justify-start gap-2.5 text-xs rounded-full font-bold mt-auto bg-emerald-600 text-white">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        Finalizar Consulta
                      </Button>
                    </div>
                  </div>

                  {!selectedAppointment && (
                    <div className="rounded-xl absolute inset-0 bg-background/20 backdrop-blur-[1px] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300 z-10">
                      <div className="max-w-sm space-y-2">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted border border-border text-muted-foreground/70">
                          <ClipboardX className="h-5 w-5" />
                        </div>
                        <h3 className="text-sm font-semibold text-foreground/80">Prontuário Bloqueado</h3>
                        <p className="text-xs text-muted-foreground/70 leading-relaxed">Selecione um paciente ativo no painel à esquerda e um atendimento para iniciar o registro clínico e liberar as ferramentas de IA.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={`w-full flex flex-col overflow-hidden relative ${!selectedPatient ? "pointer-events-none select-none" : ""}`}>
                {!selectedPatient && (
                  <div className="border border-border rounded-xl absolute inset-0 bg-background/55 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300 z-10">
                    <div className="max-w-sm space-y-2">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted border border-border text-muted-foreground/70">
                        <UserX className="h-5 w-5" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground/80">Nenhum paciente selecionado</h3>
                      <p className="text-xs text-muted-foreground/70 leading-relaxed">Selecione um paciente na listagem para visualizar o histórico de agendamentos e exames.</p>
                    </div>
                  </div>
                )}

                <Tabs defaultValue="agendamentos" className="flex flex-col flex-1 overflow-hidden gap-0">
                  <div className="pt-4 pb-2 px-4 shrink-0 flex justify-center">
                    <TabsList className="gap-1.5 rounded-full h-11! bg-secondary/50 border border-border/40">
                      <TabsTrigger
                        value="agendamentos"
                        className="data-[state=active]:border-theme-border group relative data-[state=active]:bg-theme-bg px-3.5 rounded-full text-xs font-medium transition-all gap-2 cursor-pointer data-[state=active]:shadow-xs data-[state=active]:text-theme-fg!"
                      >
                        <CalendarClock className="group-data-[state=active]:text-theme-primary h-2 w-2 transition-all duration-300" />
                        Agendamentos
                      </TabsTrigger>
                      <TabsTrigger
                        value="exames"
                        className="data-[state=active]:border-theme-border group relative data-[state=active]:bg-theme-bg px-3.5 rounded-full text-xs font-medium transition-all gap-2 cursor-pointer data-[state=active]:shadow-xs data-[state=active]:text-theme-fg!"
                      >
                        <FolderClock className="group-data-[state=active]:text-theme-primary h-2 w-2 transition-all duration-300" />
                        Exames e Laudos
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="agendamentos">
                    <Card className="pb-4">
                      <CardHeader className="flex flex-row gap-1.5">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80">Histórico de agendamentos</h3>
                      </CardHeader>

                      <CardContent className="flex flex-col">
                        {dadosAgendamentos.map((item, index) => (
                          <div key={item.id} className="relative flex gap-5 group">
                            <div className="flex flex-col items-center translate-y-6.5">
                              <div className="h-3.5 w-3.5 rounded-full border-2 border-theme-primary/50 z-10 shadow-xs group-hover:border-theme-primary transition-colors duration-300" />
                              {index !== dadosAgendamentos.length - 1 && <div className="w-[1.5px] bg-border flex-1" />}
                            </div>
                            <Accordion type="single" collapsible className="w-full flex-1">
                              <AccordionItem value={item.id} className="border border-border bg-background/40 shadow-2xs rounded-lg overflow-hidden transition-all hover:border-border/80 my-2 data-[state=open]:bg-background/80">
                                <AccordionTrigger className="px-4 hover:no-underline group/trigger items-center">
                                  <div className="w-fit flex items-center gap-2 text-xs font-semibold text-foreground/90 whitespace-nowrap">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    {item.data}
                                  </div>

                                  <div className="w-full flex items-center justify-end gap-3 ml-auto sm:ml-0 pr-4">
                                    <Badge className="gap-2 text-[11px] text-muted-foreground bg-background border border-border/60 px-3 py-1 rounded-full shrink-0">
                                      <Stethoscope className="h-3 w-3" />
                                      {item.medico} • {item.procedimento} • <span className="font-medium text-theme-primary">{item.tipo}</span>
                                    </Badge>
                                  </div>
                                </AccordionTrigger>

                                <AccordionContent className="pb-0!">
                                  <div className="h-full grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60 p-4 gap-4 md:gap-0 border-t border-border/50 bg-card/30">
                                    <div className="md:pr-4">
                                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Anotações Clínicas</h4>
                                      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{item.anotacoes}</p>
                                    </div>

                                    <div className="md:px-4">
                                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-theme-primary mb-1.5 flex items-center gap-1">
                                        <span>✦</span> Resumo Inteligente IA
                                      </h4>
                                      <p className="text-xs text-foreground/80 leading-relaxed bg-theme-primary/5 border border-theme-primary/10 rounded-md p-2.5">{item.resumoIA}</p>
                                    </div>

                                    <div className="md:pl-4 relative group/btn">
                                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1.5">Prescrições e Conduta</h4>
                                      <p className="text-xs text-foreground/80 leading-relaxed italic">{item.prescricoes}</p>
                                      <Button
                                        size="icon"
                                        variant="secondary"
                                        className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-border shadow-xs opacity-0 group-hover/btn:opacity-100 transition-opacity"
                                      >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="exames" className="m-0">
                    <Card>
                      <CardHeader className="flex flex-row gap-1.5">
                        <FolderClock className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80">Histórico de exames e laudos</h3>
                      </CardHeader>

                      <CardContent className="overflow-x-auto w-full">
                        <div className="mx-auto flex w-full flex-col bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                          <div className="flex flex-col min-w-0">
                            <div className="hidden md:grid w-full md:grid-cols-[1.5fr_160px_220px_140px_100px] border-b border-border bg-muted/60 pl-5 pr-8 py-3 gap-4 text-xs font-semibold uppercase text-muted-foreground shrink-0">
                              <span>Exame solicitado</span>
                              <span>Resultado / Status</span>
                              <span>Observações Clínicas</span>
                              <span>Data do Exame</span>
                              <span className="text-right">Ações</span>
                            </div>

                            <div className="w-full min-h-18.25 overflow-y-auto flex flex-col custom-scrollbar">
                              <div className="h-full w-full flex flex-col justify-between">
                                <div className="flex flex-col w-full max-h-78">
                                  {dadosExames.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex flex-col md:grid md:grid-cols-[1.5fr_160px_220px_140px_100px] items-start md:items-center gap-4 border-b border-border/70 last:border-b-0 px-5 py-4 transition-colors hover:bg-muted/45 text-left w-full relative group"
                                    >
                                      <div className="flex min-w-0 items-center gap-3 w-full md:w-auto">
                                        <div className="h-9 w-9 shrink-0 rounded-full bg-theme-primary/10 flex items-center justify-center border border-theme-primary/20 text-theme-primary">
                                          <FileText className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <span className="block truncate text-sm font-semibold text-foreground">{item.exame}</span>
                                        </div>
                                      </div>
                                      <div className="flex flex-col md:contents gap-1.5 w-full">
                                        <div className="inline-flex max-w-full md:w-auto">
                                          <span
                                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                                              item.status === "Anexado" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                            }`}
                                          >
                                            {item.statusLabel}
                                          </span>
                                        </div>
                                        <span className="truncate text-xs text-muted-foreground max-w-[280px]">
                                          <span className="md:hidden font-medium text-foreground/70">Observações: </span>
                                          {item.observacoes}
                                        </span>
                                        <span className="truncate text-xs text-muted-foreground/80">
                                          <span className="md:hidden font-medium text-foreground/70">Data: </span>
                                          {item.data}
                                        </span>
                                      </div>
                                      <div className="absolute right-4 top-4 md:static md:flex md:w-full md:justify-end shrink-0">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs gap-1 text-theme-primary bg-background/50 md:bg-transparent border border-border/40 md:border-transparent"
                                          disabled={item.status !== "Anexado"}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                          }}
                                        >
                                          <span className="hidden lg:inline">Visualizar</span>
                                          <ExternalLink className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 border-t border-border/60 bg-muted/10 px-5 py-3 text-xs text-muted-foreground/80">
                              <Info className="h-3.5 w-3.5 text-theme-primary shrink-0" />
                              <span>Clique na linha correspondente do exame ou utilize as ações laterais para abrir os documentos e anexos originais emitidos.</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

