"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getChatStatusColor, getChatStatusLabel } from "@/lib/chat-status";
import { formatDateTime } from "@/lib/date";
import { ChatRecord, fetchChats } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
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
  medicoId?: string;
  paciente: string;
  procedimento: string;
  tipo: string;
  status?: string;
  anotacoes: string;
  resumoIA: string;
  prescricoes: string;
}

type ContactAppointment = {
  id: string;
  status: string;
  type: string;
  attendanceMode: string;
  startDateTime: string;
  endDateTime: string;
  professionalId: string;
  professional: string;
  observations: string;
};

type RawExamRecord = {
  id: string;
  paciente_nome?: string | null;
  codigo_tuss?: string | null;
  analitos?: unknown;
  historico_analitos?: unknown;
  data_realizacao?: string | null;
  status?: string | null;
  observacoes?: string | null;
  arquivo_url?: string | null;
  nome_arquivo?: string | null;
  processamento_status?: string | null;
  texto_extraido?: string | null;
  tipo_exame?: string | null;
  grupo_comparacao?: string | null;
  mime_type?: string | null;
  storage_path?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  "ida-contato"?: string | null;
  "ida-agendamento"?: string | null;
};

type MedicalRecord = {
  id: string;
  status: string | null;
  content_html: string | null;
  content_json: unknown;
  updated_at: string;
};

type SaveStatus = "idle" | "loading" | "unsaved" | "saving" | "saved" | "error";

export interface Exame {
  id: string;
  exame: string;
  status: "Anexado" | "Aguardando";
  statusLabel: string;
  observacoes: string;
  data: string;
  url?: string;
  pacienteNome?: string | null;
  codigoTuss?: string | null;
  analitos?: unknown;
  historicoAnalitos?: unknown;
  textoExtraido?: string | null;
  tipoExame?: string | null;
  grupoComparacao?: string | null;
  nomeArquivo?: string | null;
  mimeType?: string | null;
  storagePath?: string | null;
  processamentoStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

type ExamAnalyteRow = {
  parametro: string;
  resultado: string;
  unidade: string;
  referencia: string;
  status: string;
};

function formatClinicalDateTime(value: string) {
  return (
    formatDateTime(value, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) || "Data não informada"
  );
}

function formatClinicalDate(value?: string | null) {
  if (!value) return "Pendente";
  return formatDateTime(value, { day: "2-digit", month: "long", year: "numeric" }) || "Pendente";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJsonValue(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function formatExamValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function getRecordText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") return formatExamValue(value);
  }

  return "";
}

function mapAnalyteRecord(record: Record<string, unknown>, fallbackName = ""): ExamAnalyteRow {
  return {
    parametro: getRecordText(record, ["parametro", "analito", "nome", "name", "item", "exame", "test"]) || fallbackName || "Analito",
    resultado: getRecordText(record, ["resultado", "valor", "value", "result", "medida"]) || "-",
    unidade: getRecordText(record, ["unidade", "unit", "units"]) || "-",
    referencia: getRecordText(record, ["referencia", "valor_referencia", "intervalo_referencia", "reference", "ref"]) || "-",
    status: getRecordText(record, ["status", "situacao", "flag", "interpretacao"]) || "-",
  };
}

function normalizeAnalyteRows(value: unknown): ExamAnalyteRow[] {
  const parsed = parseJsonValue(value);

  if (Array.isArray(parsed)) {
    return parsed
      .map((item, index) => {
        if (isPlainRecord(item)) return mapAnalyteRecord(item);
        return {
          parametro: `Item ${index + 1}`,
          resultado: formatExamValue(item),
          unidade: "-",
          referencia: "-",
          status: "-",
        };
      })
      .filter((row) => row.parametro !== "-" || row.resultado !== "-");
  }

  if (isPlainRecord(parsed)) {
    const nested = parsed.analitos || parsed.items || parsed.resultados || parsed.results || parsed.exames;
    if (nested && nested !== parsed) {
      const nestedRows = normalizeAnalyteRows(nested);
      if (nestedRows.length) return nestedRows;
    }

    return Object.entries(parsed).map(([key, item]) => {
      if (isPlainRecord(item)) return mapAnalyteRecord(item, key);
      return {
        parametro: key,
        resultado: formatExamValue(item),
        unidade: "-",
        referencia: "-",
        status: "-",
      };
    });
  }

  return [];
}

function mapAppointmentToRecord(appointment: ContactAppointment): AtendimentoPassado {
  return {
    id: appointment.id,
    data: formatClinicalDateTime(appointment.startDateTime),
    medico: appointment.professional || "Sem profissional",
    medicoId: appointment.professionalId,
    paciente: "",
    procedimento: appointment.type || "Atendimento",
    tipo: appointment.attendanceMode || appointment.status || "Sem formato",
    status: appointment.status,
    anotacoes: appointment.observations || "Nenhuma anotação clínica registrada neste agendamento.",
    resumoIA: "Resumo clínico ainda não registrado para este atendimento.",
    prescricoes: "Nenhuma prescrição vinculada nesta visão.",
  };
}

function mapExamToRecord(exam: RawExamRecord): Exame {
  const hasAttachment = Boolean(exam.arquivo_url);
  const status = hasAttachment ? "Anexado" : "Aguardando";
  const title = exam.tipo_exame || exam.grupo_comparacao || exam.nome_arquivo || exam.codigo_tuss || "Exame sem nome";

  return {
    id: exam.id,
    exame: title,
    status,
    statusLabel: hasAttachment ? "Anexado no Prontuário" : exam.processamento_status || exam.status || "Aguardando",
    observacoes: exam.observacoes || exam.status || "Sem observações",
    data: formatClinicalDate(exam.data_realizacao),
    url: exam.arquivo_url || undefined,
    pacienteNome: exam.paciente_nome,
    codigoTuss: exam.codigo_tuss,
    analitos: exam.analitos,
    historicoAnalitos: exam.historico_analitos,
    textoExtraido: exam.texto_extraido,
    tipoExame: exam.tipo_exame,
    grupoComparacao: exam.grupo_comparacao,
    nomeArquivo: exam.nome_arquivo,
    mimeType: exam.mime_type,
    storagePath: exam.storage_path,
    processamentoStatus: exam.processamento_status,
    createdAt: exam.created_at,
    updatedAt: exam.updated_at,
  };
}

export default function MedicalRecords() {
  const { user } = useCurrentUser();
  const [selectedPatient, setSelectedPatient] = React.useState<string>("");
  const [selectedAppointment, setSelectedAppointment] = React.useState<string>("");

  const [visibleCount, setVisibleCount] = useState(10);

  const [appointmentPatientSearch, setAppointmentPatientSearch] = useState("");
  const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false);

  const [patients, setPatients] = useState<ChatRecord[]>([]);
  const [selectedContact, setSelectedContact] = useState<ChatRecord | null>(null);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [appointments, setAppointments] = useState<AtendimentoPassado[]>([]);
  const [exams, setExams] = useState<Exame[]>([]);
  const [isLoadingClinicalData, setIsLoadingClinicalData] = useState(false);
  const [medicalRecordId, setMedicalRecordId] = useState("");
  const [medicalRecordStatus, setMedicalRecordStatus] = useState("draft");
  const [editorContentHtml, setEditorContentHtml] = useState("");
  const [editorContentJson, setEditorContentJson] = useState<unknown>(null);
  const [medicalRecordSaveStatus, setMedicalRecordSaveStatus] = useState<SaveStatus>("idle");
  const [examUploadStatus, setExamUploadStatus] = useState<SaveStatus>("idle");
  const [examUploadMessage, setExamUploadMessage] = useState("");
  const [selectedExamDetails, setSelectedExamDetails] = useState<Exame | null>(null);
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [isFinalizingMedicalRecord, setIsFinalizingMedicalRecord] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [hasMorePatients, setHasMorePatients] = useState(true);
  const examFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSavedHtmlRef = useRef("");
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
    setSelectedAppointment("");
    setAppointmentPatientSearch("");
    setIsPatientSearchOpen(false);
  };

  useEffect(() => {
    if (!selectedContact) {
      setAppointments([]);
      setExams([]);
      return;
    }

    const contact = selectedContact;
    let ignore = false;

    async function loadClinicalData() {
      setIsLoadingClinicalData(true);
      try {
        const appointmentParams = new URLSearchParams();
        if (contact.ida_contato) appointmentParams.set("contactId", contact.ida_contato);
        appointmentParams.set("chatId", contact.chat_id || "");
        appointmentParams.set("contactPhone", getContactPhone(contact));

        const examParams = new URLSearchParams();
        if (contact.ida_contato) examParams.set("idaContato", contact.ida_contato);
        examParams.set("patientName", getDisplayName(contact));

        const [appointmentResponse, examResponse] = await Promise.all([
          fetch(`/api/airtable/appointments?${appointmentParams}`, { cache: "no-store" }),
          fetch(`/api/medical-records/exams?${examParams}`, { cache: "no-store" }),
        ]);

        const appointmentData = (await appointmentResponse.json().catch(() => ({}))) as { appointments?: ContactAppointment[] };
        const examData = (await examResponse.json().catch(() => ({}))) as { exams?: RawExamRecord[] };

        if (ignore) return;

        const mappedAppointments = (appointmentData.appointments ?? []).map(mapAppointmentToRecord);
        setAppointments(mappedAppointments);
        setSelectedAppointment((current) => current || mappedAppointments[0]?.id || "");
        setExams((examData.exams ?? []).map(mapExamToRecord));
      } catch (error) {
        if (!ignore) {
          console.error("Error loading clinical data:", error);
          setAppointments([]);
          setExams([]);
        }
      } finally {
        if (!ignore) setIsLoadingClinicalData(false);
      }
    }

    void loadClinicalData();

    return () => {
      ignore = true;
    };
  }, [selectedContact]);

  const agendamentosPlaceholder: AtendimentoPassado[] = [
    {
      id: "p1",
      data: "--/--/----",
      medico: "Médico Clinico",
      paciente: "",
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
      paciente: "",
      procedimento: "Retorno",
      tipo: "Teleconsulta",
      anotacoes: "Nenhuma anotação disponível.",
      resumoIA: "Aguardando seleção de paciente para análise.",
      prescricoes: "Nenhuma prescrição.",
    },
  ];

  const examesPlaceholder: Exame[] = [
    { id: "e1", exame: "Exame Clínico Laboratorial", status: "Aguardando", statusLabel: "Aguardando", observacoes: "Nenhuma observação disponível.", data: "--/--/----" },
    { id: "e2", exame: "Exame de Imagem Diagnóstica", status: "Aguardando", statusLabel: "Aguardando", observacoes: "Nenhuma observação disponível.", data: "--/--/----" },
  ];

  const dadosAgendamentos = selectedPatient ? appointments : agendamentosPlaceholder;
  const dadosExames = selectedPatient ? exams : examesPlaceholder;
  const selectedAppointmentDetails = appointments.find((appointment) => appointment.id === selectedAppointment);
  const selectedAppointmentLabel = selectedAppointmentDetails?.data || selectedAppointment;
  const selectedExamAnalytes = useMemo(() => normalizeAnalyteRows(selectedExamDetails?.analitos), [selectedExamDetails]);

  const reloadExams = useCallback(async () => {
    if (!selectedContact) return;

    const examParams = new URLSearchParams();
    if (selectedContact.ida_contato) examParams.set("idaContato", selectedContact.ida_contato);
    if (selectedAppointment) examParams.set("idaAgendamento", selectedAppointment);
    examParams.set("patientName", getDisplayName(selectedContact));

    const response = await fetch(`/api/medical-records/exams?${examParams}`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { exams?: RawExamRecord[]; message?: string };

    if (!response.ok) throw new Error(data.message || "Não foi possível atualizar os exames.");

    setExams((data.exams ?? []).map(mapExamToRecord));
  }, [selectedAppointment, selectedContact]);

  useEffect(() => {
    if (!selectedContact || !selectedAppointment) {
      setMedicalRecordId("");
      setMedicalRecordStatus("draft");
      setEditorContentHtml("");
      setEditorContentJson(null);
      lastSavedHtmlRef.current = "";
      setMedicalRecordSaveStatus("idle");
      return;
    }

    let ignore = false;

    async function loadMedicalRecord() {
      setMedicalRecordSaveStatus("loading");
      try {
        const params = new URLSearchParams({ appointmentId: selectedAppointment });
        const response = await fetch(`/api/medical-records?${params}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { record?: MedicalRecord | null; message?: string };

        if (ignore) return;
        if (!response.ok) throw new Error(data.message || "Não foi possível carregar o prontuário.");

        const record = data.record;
        const html = record?.content_html || "";

        setMedicalRecordId(record?.id || "");
        setMedicalRecordStatus(record?.status || "draft");
        setEditorContentHtml(html);
        setEditorContentJson(record?.content_json ?? null);
        lastSavedHtmlRef.current = html;
        setMedicalRecordSaveStatus(record ? "saved" : "idle");
      } catch (error) {
        if (!ignore) {
          console.error("Error loading medical record:", error);
          setMedicalRecordId("");
          setMedicalRecordStatus("draft");
          setEditorContentHtml("");
          setEditorContentJson(null);
          lastSavedHtmlRef.current = "";
          setMedicalRecordSaveStatus("error");
        }
      }
    }

    void loadMedicalRecord();

    return () => {
      ignore = true;
    };
  }, [selectedAppointment, selectedContact]);

  useEffect(() => {
    if (!selectedContact || !selectedAppointment || medicalRecordSaveStatus === "loading" || medicalRecordSaveStatus === "saving") return;
    if (editorContentHtml === lastSavedHtmlRef.current) return;

    const timeout = window.setTimeout(async () => {
      try {
        setMedicalRecordSaveStatus("saving");
        const response = await fetch("/api/medical-records", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: medicalRecordId || undefined,
            contactChatId: selectedContact.chat_id,
            contactAirtableId: selectedContact.ida_contato || null,
            contactName: getDisplayName(selectedContact),
            contactPhone: getContactPhone(selectedContact),
            appointmentAirtableId: selectedAppointment,
            professionalAirtableId: selectedAppointmentDetails?.medicoId || null,
            professionalName: selectedAppointmentDetails?.medico || null,
            title: selectedAppointmentLabel || "Prontuário clínico",
            status: medicalRecordStatus,
            contentHtml: editorContentHtml,
            contentJson: editorContentJson,
            metadata: {
              appointmentLabel: selectedAppointmentLabel,
              procedure: selectedAppointmentDetails?.procedimento || null,
              attendanceMode: selectedAppointmentDetails?.tipo || null,
            },
            userEmail: user?.email || null,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as { record?: MedicalRecord; message?: string };

        if (!response.ok) throw new Error(data.message || "Não foi possível salvar o prontuário.");

        setMedicalRecordId(data.record?.id || medicalRecordId);
        lastSavedHtmlRef.current = editorContentHtml;
        setMedicalRecordSaveStatus("saved");
      } catch (error) {
        console.error("Error saving medical record:", error);
        setMedicalRecordSaveStatus("error");
      }
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [
    editorContentHtml,
    editorContentJson,
    medicalRecordId,
    medicalRecordStatus,
    medicalRecordSaveStatus,
    selectedAppointment,
    selectedAppointmentDetails,
    selectedAppointmentLabel,
    selectedContact,
    user?.email,
  ]);

  const handleFinalizeMedicalRecord = async () => {
    if (!selectedContact || !selectedAppointment || isFinalizingMedicalRecord) return;

    try {
      setIsFinalizingMedicalRecord(true);
      setMedicalRecordSaveStatus("saving");

      const response = await fetch("/api/medical-records", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: medicalRecordId || undefined,
          contactChatId: selectedContact.chat_id,
          contactAirtableId: selectedContact.ida_contato || null,
          contactName: getDisplayName(selectedContact),
          contactPhone: getContactPhone(selectedContact),
          appointmentAirtableId: selectedAppointment,
          professionalAirtableId: selectedAppointmentDetails?.medicoId || null,
          professionalName: selectedAppointmentDetails?.medico || null,
          title: selectedAppointmentLabel || "Prontuário clínico",
          status: "finalized",
          contentHtml: editorContentHtml,
          contentJson: editorContentJson,
          metadata: {
            appointmentLabel: selectedAppointmentLabel,
            procedure: selectedAppointmentDetails?.procedimento || null,
            attendanceMode: selectedAppointmentDetails?.tipo || null,
          },
          userEmail: user?.email || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { record?: MedicalRecord; message?: string };

      if (!response.ok) throw new Error(data.message || "Não foi possível finalizar o prontuário.");

      setMedicalRecordId(data.record?.id || medicalRecordId);
      setMedicalRecordStatus("finalized");
      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === selectedAppointment ? { ...appointment, status: "Finalizado" } : appointment,
        ),
      );
      lastSavedHtmlRef.current = editorContentHtml;
      setMedicalRecordSaveStatus("saved");
      setIsFinalizeDialogOpen(false);
    } catch (error) {
      console.error("Error finalizing medical record:", error);
      setMedicalRecordSaveStatus("error");
    } finally {
      setIsFinalizingMedicalRecord(false);
    }
  };

  const handleExamFileSelected = async (file?: File | null) => {
    if (!file || !selectedContact || !selectedAppointment || examUploadStatus === "loading") return;

    try {
      setExamUploadStatus("loading");
      setExamUploadMessage("");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("paciente_nome", getDisplayName(selectedContact));
      formData.append("status", "Recebido");
      if (selectedContact.ida_contato) formData.append("ida-contato", selectedContact.ida_contato);
      formData.append("chat_id", selectedContact.chat_id || "");
      formData.append("contact_name", getDisplayName(selectedContact));
      formData.append("contact_phone", getContactPhone(selectedContact));
      formData.append("ida-agendamento", selectedAppointment);
      formData.append("appointment_label", selectedAppointmentLabel);
      if (medicalRecordId) formData.append("medical_record_id", medicalRecordId);
      if (user?.email) formData.append("user_email", user.email);

      const response = await fetch("/api/medical-records/exams/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) throw new Error(data.message || "Não foi possível enviar o exame.");

      setExamUploadStatus("saved");
      setExamUploadMessage("Exame enviado para processamento.");
      await reloadExams().catch((error) => console.error("Error reloading exams:", error));
    } catch (error) {
      console.error("Error uploading exam:", error);
      setExamUploadStatus("error");
      setExamUploadMessage(error instanceof Error ? error.message : "Não foi possível enviar o exame.");
    } finally {
      if (examFileInputRef.current) examFileInputRef.current.value = "";
    }
  };

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
              <div className="flex flex-col lg:flex-row gap-4 pt-1 items-stretch">
                <Card className={cn("w-full lg:w-[360px] xl:w-1/3 min-h-[373px] flex flex-col justify-between transition-all ring-0 ring-theme-primary/50 shrink-0", !selectedAppointment && "ring-3")}>
                  <CardHeader className="pb-3">
                    <CardTitle>Paciente e Agendamento</CardTitle>
                    <CardDescription>Escolha o paciente e o atendimento associado.</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                    <div className="flex flex-row gap-2 pt-2">
                      <div className="w-full space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground">Paciente</Label>
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
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            handleSelectPatient(patient);
                                          }}
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

                    {selectedContact ? (
                      <div className="rounded-xl border border-border bg-muted/20 p-4 animate-in fade-in duration-200">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground text-sm" title={getDisplayName(selectedContact)}>
                              {getDisplayName(selectedContact)}
                            </p>

                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <Phone className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{getContactPhone(selectedContact)}</span>
                            </div>
                          </div>

                          {getChatStatusLabel(selectedContact) && (
                            <Badge className="text-white uppercase border-0 text-[10px] px-2 py-0.5 shrink-0" style={{ backgroundColor: getChatStatusColor(selectedContact) }}>
                              {getChatStatusLabel(selectedContact)}
                            </Badge>
                          )}
                        </div>

                        <Separator className="my-3" />

                        <div className="w-full space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground">Agendamento</Label>
                          <Select value={selectedAppointment} onValueChange={setSelectedAppointment}>
                            <SelectTrigger className="w-full h-10 bg-background border-border text-sm">
                              <SelectValue placeholder={isLoadingClinicalData ? "Carregando atendimentos..." : "Selecione o horário do atendimento..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {appointments.length > 0 ? (
                                appointments.map((appointment) => (
                                  <SelectItem key={appointment.id} value={appointment.id}>
                                    <span className="text-xs block max-w-[280px] truncate">
                                      {appointment.data} - {appointment.procedimento}
                                    </span>
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="no-appointments" disabled>
                                  Nenhum atendimento encontrado
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-muted/5 p-4 flex flex-col justify-between min-h-[120px] transition-colors">
                        <div className="flex items-start justify-between opacity-60 gap-2">
                          <div className="space-y-1.5 w-full min-w-0">
                            <p className="text-sm font-medium text-muted-foreground/70 italic truncate">Nenhum paciente selecionado</p>

                            <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                              <Phone className="h-3.5 w-3.5 opacity-70 shrink-0" />
                              <span>(00) 00000-0000</span>
                            </div>
                          </div>

                          <Badge className="bg-muted border border-border px-2 py-0.5 text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider shrink-0">Status</Badge>
                        </div>

                        <Separator className="my-3 opacity-50" />

                        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                          <CalendarDays className="h-3.5 w-3.5 opacity-70 shrink-0" />
                          <span className="italic truncate">Selecione um paciente abaixo para vincular os dados</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden flex flex-col flex-1 relative min-h-[500px] lg:min-h-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-muted/30 border-b border-border px-5 py-3.5 gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-theme-primary/10 text-theme-primary shrink-0">
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-semibold text-foreground/90 leading-none truncate">{selectedAppointment ? selectedAppointmentLabel : "Prontuário Clínico"}</span>
                    </div>

                    {selectedAppointment && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 border border-emerald-500/20 w-fit shrink-0 animate-in fade-in duration-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Agendamento selecionado
                        </span>

                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium w-fit shrink-0",
                            medicalRecordSaveStatus === "error"
                              ? "border-red-500/20 bg-red-500/10 text-red-600"
                              : "border-border bg-background text-muted-foreground",
                          )}
                        >
                          {(medicalRecordSaveStatus === "loading" || medicalRecordSaveStatus === "saving") && <Loader2 className="h-3 w-3 animate-spin" />}
                          {medicalRecordSaveStatus === "loading"
                            ? "Carregando prontuário"
                            : medicalRecordSaveStatus === "saving"
                              ? "Salvando"
                              : medicalRecordSaveStatus === "saved"
                                ? "Salvo"
                                : medicalRecordSaveStatus === "error"
                                  ? "Erro ao salvar"
                                  : "Rascunho"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div
                    className={cn(
                      "grid grid-cols-1 xl:grid-cols-[1fr_230px] divide-y xl:divide-y-0 xl:divide-x divide-border flex-1 min-h-0 transition-all duration-300",
                      !selectedAppointment && "pointer-events-none select-none opacity-40",
                    )}
                  >
                    <div className="flex flex-col bg-background/50 overflow-y-auto min-h-[350px] xl:min-h-0">
                      <Editor
                        disabled={!selectedAppointment || medicalRecordSaveStatus === "loading"}
                        content={editorContentHtml}
                        onChange={({ html, json }) => {
                          setEditorContentHtml(html);
                          setEditorContentJson(json);
                          if (html !== lastSavedHtmlRef.current) {
                            setMedicalRecordSaveStatus("unsaved");
                          }
                        }}
                      />
                    </div>

                    <div className="p-4 bg-muted/5 flex flex-col justify-start gap-2.5 overflow-y-auto shrink-0 xl:shrink flex-row xl:flex-col flex-wrap xl:flex-nowrap">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1 px-1 flex items-center gap-1.5 w-full">
                        <Sparkles className="h-3 w-3 text-blue-500" />
                        Ações Clínicas e IA
                      </div>

                      <Button disabled={!selectedAppointment} variant="outline" className="flex-1 xl:w-full xl:flex-initial justify-start gap-2.5 h-10 text-xs font-medium text-foreground/80 border-border min-w-[150px]">
                        <Mic className="h-4 w-4 shrink-0 text-blue-500" />
                        Gravação com IA
                      </Button>
                      <Button disabled={!selectedAppointment} variant="outline" className="flex-1 xl:w-full xl:flex-initial justify-start gap-2.5 h-10 text-xs font-medium text-foreground/80 border-border min-w-[150px]">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        Nova Prescrição
                      </Button>
                      <input
                        ref={examFileInputRef}
                        type="file"
                        accept="application/pdf,image/*,.pdf"
                        className="hidden"
                        onChange={(event) => void handleExamFileSelected(event.target.files?.[0])}
                      />
                      <Button
                        disabled={!selectedAppointment || examUploadStatus === "loading"}
                        variant="outline"
                        className="flex-1 xl:w-full xl:flex-initial justify-start gap-2.5 h-10 text-xs font-medium text-foreground/80 border-border min-w-[150px]"
                        onClick={() => examFileInputRef.current?.click()}
                      >
                        {examUploadStatus === "loading" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-theme-primary shrink-0" />
                        ) : (
                          <FilePlus className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        {examUploadStatus === "loading" ? "Enviando exame..." : "+ Resultado/Exame"}
                      </Button>
                      {examUploadMessage ? (
                        <p
                          className={cn(
                            "w-full px-1 text-[11px] leading-relaxed",
                            examUploadStatus === "error" ? "text-red-600" : "text-emerald-600",
                          )}
                        >
                          {examUploadMessage}
                        </p>
                      ) : null}

                      <Button
                        disabled={!selectedAppointment || isFinalizingMedicalRecord || medicalRecordSaveStatus === "loading"}
                        className={cn(
                          "w-full text-xs rounded-full font-bold mt-2 xl:mt-auto text-white h-10 justify-start gap-2.5",
                          medicalRecordStatus === "finalized"
                            ? "bg-emerald-700 hover:bg-emerald-700"
                            : "bg-emerald-600 hover:bg-emerald-700",
                        )}
                        onClick={() => setIsFinalizeDialogOpen(true)}
                      >
                        {isFinalizingMedicalRecord ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                        {medicalRecordStatus === "finalized" ? "Consulta Finalizada" : isFinalizingMedicalRecord ? "Finalizando..." : "Finalizar Consulta"}
                      </Button>

                      {medicalRecordStatus === "finalized" && (
                        <p className="px-1 text-[11px] leading-relaxed text-emerald-600">Consulta finalizada</p>
                      )}
                    </div>
                  </div>

                  {!selectedAppointment && (
                    <div className="rounded-xl absolute inset-0 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300 z-10">
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
                        className="data-[state=active]:border-theme-border group relative data-[state=active]:bg-theme-bg px-3.5 rounded-full text-xs font-medium transition-all gap-2 cursor-pointer data-[state=active]:shadow-xs data-[state=active]:text-theme-fg"
                      >
                        <CalendarClock className="group-data-[state=active]:text-theme-primary h-3.5 w-3.5 transition-all duration-300" />
                        Agendamentos
                      </TabsTrigger>
                      <TabsTrigger
                        value="exames"
                        className="data-[state=active]:border-theme-border group relative data-[state=active]:bg-theme-bg px-3.5 rounded-full text-xs font-medium transition-all gap-2 cursor-pointer data-[state=active]:shadow-xs data-[state=active]:text-theme-fg"
                      >
                        <FolderClock className="group-data-[state=active]:text-theme-primary h-3.5 w-3.5 transition-all duration-300" />
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
                        {isLoadingClinicalData && selectedPatient ? (
                          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-theme-primary" />
                            Carregando histórico de agendamentos...
                          </div>
                        ) : dadosAgendamentos.length > 0 ? (
                          dadosAgendamentos.map((item, index) => (
                          <div key={item.id} className="relative flex gap-4 group">
                            <div className="flex flex-col items-center translate-y-6.5 shrink-0">
                              <div className="h-3.5 w-3.5 rounded-full border-2 border-theme-primary/50 bg-background z-10 shadow-xs group-hover:border-theme-primary transition-colors duration-300" />
                              {index !== dadosAgendamentos.length - 1 && <div className="w-[1.5px] bg-border/60 flex-1 min-h-[40px]" />}
                            </div>
                            <Accordion type="single" collapsible className="w-full flex-1">
                              <AccordionItem value={item.id} className="border border-border/70 bg-background/40 shadow-2xs rounded-xl overflow-hidden transition-all hover:border-border my-1.5 data-[state=open]:bg-background/80">
                                <AccordionTrigger className="px-4 py-3.5 hover:no-underline group/trigger flex flex-col sm:flex-row items-start sm:items-center gap-2 text-left">
                                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground/90 whitespace-nowrap">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    {item.data}
                                  </div>

                                  <div className="w-fit md:w-full flex items-center md:justify-end gap-3 md:ml-auto sm:ml-0 pr-4">
                                    <Badge className="gap-2 text-[11px] text-muted-foreground bg-background border border-border/60 px-3 py-1 rounded-full shrink-0">
                                      <Stethoscope className="h-3 w-3" />
                                      {item.medico} • {item.procedimento} • <span className="font-medium text-theme-primary">{item.status || item.tipo}</span>
                                    </Badge>
                                  </div>
                                </AccordionTrigger>

                                <AccordionContent className="pb-0">
                                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60 p-4 gap-4 md:gap-0 border-t border-border/40 bg-muted/5">
                                    <div className="md:pr-4">
                                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Anotações Clínicas</h4>
                                      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{item.anotacoes}</p>
                                    </div>

                                    <div className="md:px-4">
                                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-theme-primary mb-1 flex items-center gap-1">
                                        <span>✦</span> Resumo Inteligente IA
                                      </h4>
                                      <p className="text-xs text-foreground/80 leading-relaxed bg-theme-primary/5 border border-theme-primary/10 rounded-lg p-2.5">{item.resumoIA}</p>
                                    </div>

                                    <div className="md:pl-4 relative group/btn min-h-[60px]">
                                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Prescrições e Conduta</h4>
                                      <p className="text-xs text-foreground/80 leading-relaxed italic">{item.prescricoes}</p>
                                      <Button
                                        size="icon"
                                        variant="secondary"
                                        className="absolute right-0 bottom-0 md:top-1/2 md:-translate-y-1/2 h-7 w-7 rounded-full border border-border shadow-xs opacity-0 group-hover/btn:opacity-100 transition-opacity cursor-pointer"
                                      >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">Nenhum agendamento encontrado para este contato.</div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="exames">
                    <Card>
                      <CardHeader className="flex flex-row gap-1.5">
                        <FolderClock className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80">Histórico de exames e laudos</h3>
                      </CardHeader>

                      <CardContent>
                        <div className="w-full flex flex-col bg-card rounded-xl border border-border/70 shadow-2xs overflow-hidden">
                          <div className="hidden md:grid w-full md:grid-cols-[1.5fr_140px_2fr_130px_90px] border-b border-border bg-muted/40 px-5 py-3 gap-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
                            <span>Exame solicitado</span>
                            <span>Status</span>
                            <span>Observações Clínicas</span>
                            <span>Data</span>
                            <span className="text-right">Ações</span>
                          </div>

                          <div className="w-full flex flex-col max-h-[450px] overflow-y-auto custom-scrollbar divide-y divide-border/50">
                            {isLoadingClinicalData && selectedPatient ? (
                              <div className="flex items-center gap-2 px-5 py-5 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin text-theme-primary" />
                                Carregando exames...
                              </div>
                            ) : dadosExames.length > 0 ? (
                              dadosExames.map((item) => (
                              <div
                                key={item.id}
                                role="button"
                                tabIndex={0}
                                className="flex flex-col md:grid md:grid-cols-[1.5fr_140px_2fr_130px_90px] items-start md:items-center gap-3 md:gap-4 px-5 py-4 transition-colors hover:bg-muted/20 relative group text-left w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary/40"
                                onClick={() => setSelectedExamDetails(item)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setSelectedExamDetails(item);
                                  }
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-3 w-full md:w-auto">
                                  <div className="h-8 w-8 shrink-0 rounded-lg bg-theme-primary/10 flex items-center justify-center border border-theme-primary/15 text-theme-primary">
                                    <FileText className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-foreground/90">{item.exame}</span>
                                  </div>
                                </div>

                                <div className="inline-flex md:w-auto">
                                  <span
                                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                                      item.status === "Anexado" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                    }`}
                                  >
                                    {item.statusLabel}
                                  </span>
                                </div>

                                <span className="text-xs text-muted-foreground max-w-full md:max-w-[280px] truncate">
                                  <span className="md:hidden font-semibold text-foreground/70">Obs: </span>
                                  {item.observacoes || "Sem observações"}
                                </span>

                                <span className="text-xs text-muted-foreground/80 whitespace-nowrap">
                                  <span className="md:hidden font-semibold text-foreground/70">Data: </span>
                                  {item.data}
                                </span>

                                <div className="absolute right-4 top-4 md:static md:flex md:w-full md:justify-end shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs gap-1.5 text-theme-primary bg-theme-primary/5 hover:bg-theme-primary/10 md:bg-transparent border border-theme-primary/10 md:border-transparent cursor-pointer rounded-md"
                                    disabled={item.status !== "Anexado"}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
                                    }}
                                  >
                                    <span className="inline md:hidden lg:inline">Ver</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              ))
                            ) : (
                              <div className="px-5 py-5 text-sm text-muted-foreground">Nenhum exame encontrado para este contato.</div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 border-t border-border/60 bg-muted/20 px-5 py-3 text-xs text-muted-foreground/80">
                            <Info className="h-3.5 w-3.5 text-theme-primary shrink-0" />
                            <span>Clique em uma linha para ver os dados extraídos. Use Ver para abrir o documento original.</span>
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

      <Dialog open={Boolean(selectedExamDetails)} onOpenChange={(open) => !open && setSelectedExamDetails(null)}>
        <DialogContent className="max-h-[86vh] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedExamDetails?.exame || "Detalhes do exame"}</DialogTitle>
            <DialogDescription>
              {selectedExamDetails?.pacienteNome || (selectedContact ? getDisplayName(selectedContact) : "Paciente")} • {selectedExamDetails?.data || "Data pendente"}
            </DialogDescription>
          </DialogHeader>

          {selectedExamDetails ? (
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                  <p className="mt-1 text-foreground">{selectedExamDetails.statusLabel}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wider text-muted-foreground">Tipo</p>
                  <p className="mt-1 text-foreground">{selectedExamDetails.tipoExame || selectedExamDetails.grupoComparacao || "-"}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wider text-muted-foreground">Arquivo</p>
                  <p className="mt-1 truncate text-foreground">{selectedExamDetails.nomeArquivo || "-"}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wider text-muted-foreground">Código TUSS</p>
                  <p className="mt-1 text-foreground">{selectedExamDetails.codigoTuss || "-"}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80">Analitos extraídos</h3>
                  <span className="text-xs text-muted-foreground">{selectedExamAnalytes.length ? `${selectedExamAnalytes.length} itens` : "Sem tabela estruturada"}</span>
                </div>

                {selectedExamAnalytes.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="max-h-[320px] overflow-auto">
                      <table className="w-full min-w-[720px] text-left text-xs">
                        <thead className="sticky top-0 bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-bold">Parâmetro</th>
                            <th className="px-3 py-2 font-bold">Resultado</th>
                            <th className="px-3 py-2 font-bold">Unidade</th>
                            <th className="px-3 py-2 font-bold">Referência</th>
                            <th className="px-3 py-2 font-bold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {selectedExamAnalytes.map((row, index) => (
                            <tr key={`${row.parametro}-${index}`} className="bg-background/60">
                              <td className="px-3 py-2 font-medium text-foreground">{row.parametro}</td>
                              <td className="px-3 py-2 text-foreground/90">{row.resultado}</td>
                              <td className="px-3 py-2 text-muted-foreground">{row.unidade}</td>
                              <td className="px-3 py-2 text-muted-foreground">{row.referencia}</td>
                              <td className="px-3 py-2 text-muted-foreground">{row.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                    Nenhum analito estruturado foi encontrado para este exame.
                  </div>
                )}
              </div>

              {selectedExamDetails.observacoes || selectedExamDetails.textoExtraido ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80">Observações e texto extraído</h3>
                    {selectedExamDetails.observacoes ? (
                      <p className="rounded-lg border border-border bg-muted/20 p-3 text-sm leading-relaxed text-foreground/80">{selectedExamDetails.observacoes}</p>
                    ) : null}
                    {selectedExamDetails.textoExtraido ? (
                      <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
                        {selectedExamDetails.textoExtraido}
                      </pre>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            {selectedExamDetails?.url ? (
              <Button type="button" variant="outline" className="gap-2" onClick={() => window.open(selectedExamDetails.url, "_blank", "noopener,noreferrer")}>
                Abrir original
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button type="button" onClick={() => setSelectedExamDetails(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{medicalRecordStatus === "finalized" ? "Consulta já finalizada" : "Finalizar consulta"}</DialogTitle>
            <DialogDescription>
              {medicalRecordStatus === "finalized"
                ? "Este prontuário já está marcado como finalizado. Você pode salvar novamente o estado atual."
                : "O conteúdo atual do prontuário será salvo e marcado como finalizado."}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">{selectedContact ? getDisplayName(selectedContact) : "Paciente"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{selectedAppointmentLabel || "Agendamento selecionado"}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsFinalizeDialogOpen(false)} disabled={isFinalizingMedicalRecord}>
              Cancelar
            </Button>
            <Button type="button" className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleFinalizeMedicalRecord} disabled={isFinalizingMedicalRecord}>
              {isFinalizingMedicalRecord ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isFinalizingMedicalRecord ? "Finalizando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
