import { createContactNote, deleteContactNote, fetchContactNotes, type ChatRecord, type ContactNoteRecord } from "@/lib/supabase-rest";
import { Input } from "../ui/input";
import { Calendar, ChevronDown, FileText, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatTag } from "@/lib/chat-tags";
import { getChatTags, getReadableTextColor } from "@/lib/chat-tags";
import { getChatStatusColor, getChatStatusLabel, type ChatStatusOption } from "@/lib/chat-status";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Textarea } from "../ui/textarea";
import { Field, FieldDescription, FieldLabel } from "../ui/fields";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

type AppointmentOptions = {
  types: string[];
  professionals: Array<{ id: string; label: string }>;
  status: string[];
  attendanceModes: string[];
};

type TaskOptions = {
  types: string[];
  statuses: string[];
  users: Array<{ id: string; label: string }>;
};

type LatestAppointment = {
  id: string;
  status: string;
  type?: string;
  startDateTime?: string;
};

type LatestAppointmentResult = {
  key: string;
  appointment: LatestAppointment | null;
};

interface ProfileViewProps {
  chat?: ChatRecord;
  contactPhone?: string;
  statusOptions?: ChatStatusOption[];
  tagOptions?: ChatTag[];
  interestOptions?: ChatTag[];
  onChangeStatus?: (status: ChatStatusOption) => void;
  onToggleTag?: (tag: ChatTag) => void;
  onReorderTags?: (tags: ChatTag[]) => void;
  onCommitTagOrder?: (tags: ChatTag[]) => void;
  onChangeName?: (name: string) => Promise<void> | void;
  onChangeContactInfo?: (info: ContactInfoValues) => Promise<void> | void;
}

export type ContactInfoValues = {
  cidade_residencia: string | null;
  cidade_desejada: string | null;
  email_contato: string | null;
  phone_contact: string | null;
};

type ContactInfoField = keyof ContactInfoValues;
type ContactInfoFormValues = Record<ContactInfoField, string>;

function getDisplayName(chat?: ChatRecord) {
  return chat?.nome_contato || chat?.pushname || chat?.chat_id?.replace("@s.whatsapp.net", "") || "Contato sem nome";
}

function getContactInfoValues(chat?: ChatRecord): ContactInfoFormValues {
  return {
    cidade_residencia: chat?.cidade_residencia || "",
    cidade_desejada: chat?.cidade_desejada || "",
    email_contato: chat?.email_contato || "",
    phone_contact: chat?.phone_contact || "",
  };
}

function normalizeContactInfoValues(values: ContactInfoFormValues): ContactInfoValues {
  return {
    cidade_residencia: values.cidade_residencia.trim() || null,
    cidade_desejada: values.cidade_desejada.trim() || null,
    email_contato: values.email_contato.trim() || null,
    phone_contact: values.phone_contact.trim() || null,
  };
}

function getMergedTags(...groups: ChatTag[][]) {
  const tags = new Map<string, ChatTag>();

  for (const group of groups) {
    for (const tag of group) {
      const key = tag.id || tag.label;
      if (!tags.has(key)) tags.set(key, tag);
    }
  }

  return Array.from(tags.values());
}

function getMergedStatusOptions(...groups: ChatStatusOption[][]) {
  const statuses = new Map<string, ChatStatusOption>();

  for (const group of groups) {
    for (const status of group) {
      if (!status.label || statuses.has(status.label)) continue;
      statuses.set(status.label, status);
    }
  }

  return Array.from(statuses.values());
}

const fallbackAppointmentOptions: AppointmentOptions = {
  types: ["Consulta", "Retorno", "Avaliação", "Procedimento"],
  professionals: [],
  status: ["Agendado", "Confirmado", "Pendente", "Cancelado"],
  attendanceModes: ["Presencial", "Online"],
};

const fallbackTaskOptions: TaskOptions = {
  types: [],
  statuses: ["Aguardando"],
  users: [],
};

function getLocalDateTimeValue(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function getLocalDateValue(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function getReadableDateTime(value: string) {
  if (!value) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ProfileView({ chat, contactPhone, statusOptions = [], tagOptions = [], onChangeStatus, onToggleTag, onReorderTags, onCommitTagOrder, onChangeContactInfo }: ProfileViewProps) {
  const [bottomTab, setBottomTab] = useState<"consultas" | "avisos">("consultas");
  const [draggedTagId, setDraggedTagId] = useState<string | null>(null);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [appointmentOptions, setAppointmentOptions] = useState<AppointmentOptions>(fallbackAppointmentOptions);
  const [isLoadingAppointmentOptions, setIsLoadingAppointmentOptions] = useState(true);
  const [latestAppointmentResult, setLatestAppointmentResult] = useState<LatestAppointmentResult | null>(null);
  const [taskOptions, setTaskOptions] = useState<TaskOptions>(fallbackTaskOptions);
  const [isLoadingTaskOptions, setIsLoadingTaskOptions] = useState(true);
  const [appointmentStatus, setAppointmentStatus] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [appointmentAttendanceMode, setAppointmentAttendanceMode] = useState("");
  const [appointmentDateTime, setAppointmentDateTime] = useState("");
  const [appointmentProfessionalId, setAppointmentProfessionalId] = useState("");
  const [appointmentPatientName, setAppointmentPatientName] = useState("");
  const [appointmentObservations, setAppointmentObservations] = useState("");
  const [isCreatingAppointment, setIsCreatingAppointment] = useState(false);
  const [appointmentFeedback, setAppointmentFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [taskType, setTaskType] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [taskCreatedAt, setTaskCreatedAt] = useState(getLocalDateTimeValue);
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskResponsibleUserId, setTaskResponsibleUserId] = useState("");
  const [taskPatientName, setTaskPatientName] = useState("");
  const [taskSubject, setTaskSubject] = useState("");
  const [taskObservations, setTaskObservations] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [contactNotes, setContactNotes] = useState<ContactNoteRecord[]>([]);
  const [contactNoteDraft, setContactNoteDraft] = useState("");
  const [isLoadingContactNotes, setIsLoadingContactNotes] = useState(false);
  const [isSavingContactNote, setIsSavingContactNote] = useState(false);
  const [contactNoteFeedback, setContactNoteFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [contactInfo, setContactInfo] = useState(() => getContactInfoValues(chat));
  const [isSavingContactInfo, setIsSavingContactInfo] = useState(false);
  const [contactInfoFeedback, setContactInfoFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const pendingReorderedTagsRef = useRef<ChatTag[] | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const tags = getChatTags(chat);
  const [selectedInterests, setSelectedInterests] = useState<ChatTag[]>([]);
  const patientName = getDisplayName(chat);
  const selectedTagKeys = new Set(tags.flatMap((tag) => [tag.id, tag.label.toLowerCase()]));
  const availableTags = getMergedTags(tags, tagOptions);
  const availableInterest = getMergedTags(selectedInterests, tagOptions);
  const availableStatuses = getMergedStatusOptions(
    [
      {
        label: getChatStatusLabel(chat),
        color: getChatStatusColor(chat),
      },
    ],
    statusOptions,
  );

  const bottomTabs = [
    { id: "consultas", label: "Consultas" },
    { id: "avisos", label: "Avisos / Tarefas" },
  ] as const;
  const latestAppointmentKey = `${chat?.chat_id || ""}|${contactPhone || chat?.phone_contact || ""}`;
  const latestAppointment = latestAppointmentResult?.key === latestAppointmentKey ? latestAppointmentResult.appointment : null;
  const isLoadingLatestAppointment = Boolean(latestAppointmentKey && latestAppointmentResult?.key !== latestAppointmentKey);
  const appointmentStatusLabel = isLoadingLatestAppointment ? "Carregando..." : latestAppointment?.status || "Nenhum";
  const hasUnsavedContactInfo = (Object.keys(contactInfo) as ContactInfoField[]).some(
    (field) => normalizeContactInfoValues(contactInfo)[field] !== normalizeContactInfoValues(getContactInfoValues(chat))[field],
  );

  function handleChangeContactInfoField(field: ContactInfoField, value: string) {
    setContactInfo((current) => ({ ...current, [field]: value }));
    setContactInfoFeedback(null);
  }

  function handleChangeContactEmail(value: string) {
    handleChangeContactInfoField("email_contato", value);
    window.requestAnimationFrame(() => {
      const input = emailInputRef.current;
      if (!input) return;
      input.scrollLeft = input.scrollWidth;
    });
  }

  async function handleSaveContactInfo() {
    if (!chat?.id || !onChangeContactInfo) return;

    const currentValues = normalizeContactInfoValues(getContactInfoValues(chat));
    const nextValues = normalizeContactInfoValues(contactInfo);
    const hasChanges = (Object.keys(nextValues) as ContactInfoField[]).some((field) => nextValues[field] !== currentValues[field]);

    if (!hasChanges) return;

    setIsSavingContactInfo(true);
    setContactInfoFeedback(null);

    try {
      await onChangeContactInfo(nextValues);
      setContactInfoFeedback({ type: "success", message: "Informacoes salvas." });
    } catch (error) {
      setContactInfo(getContactInfoValues(chat));
      setContactInfoFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível salvar as informações do contato.",
      });
    } finally {
      setIsSavingContactInfo(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    fetch("/api/airtable/appointment-options")
      .then((response) => response.json() as Promise<Partial<AppointmentOptions>>)
      .then((data) => {
        if (!isMounted) return;

        setAppointmentOptions({
          types: data.types?.length ? data.types : fallbackAppointmentOptions.types,
          professionals: data.professionals?.length ? data.professionals : fallbackAppointmentOptions.professionals,
          status: data.status?.length ? data.status : fallbackAppointmentOptions.status,
          attendanceModes: data.attendanceModes?.length ? data.attendanceModes : fallbackAppointmentOptions.attendanceModes,
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setAppointmentOptions(fallbackAppointmentOptions);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingAppointmentOptions(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const chatId = chat?.chat_id || "";
    const phone = contactPhone || chat?.phone_contact || "";
    const key = `${chatId}|${phone}`;
    if (!chatId && !phone) return;

    let isMounted = true;
    const params = new URLSearchParams();
    if (chatId) params.set("chatId", chatId);
    if (phone) params.set("contactPhone", phone);

    fetch(`/api/airtable/appointments?${params.toString()}`)
      .then((response) => response.json() as Promise<{ latestAppointment?: LatestAppointment | null }>)
      .then((data) => {
        if (!isMounted) return;
        setLatestAppointmentResult({ key, appointment: data.latestAppointment ?? null });
      })
      .catch(() => {
        if (!isMounted) return;
        setLatestAppointmentResult({ key, appointment: null });
      });

    return () => {
      isMounted = false;
    };
  }, [chat?.chat_id, chat?.phone_contact, contactPhone]);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/airtable/task-options")
      .then((response) => response.json() as Promise<Partial<TaskOptions>>)
      .then((data) => {
        if (!isMounted) return;

        const statuses = data.statuses?.length ? data.statuses : fallbackTaskOptions.statuses;
        setTaskOptions({
          types: data.types?.length ? data.types : fallbackTaskOptions.types,
          statuses,
          users: data.users?.length ? data.users : fallbackTaskOptions.users,
        });
        setTaskStatus((current) => current || statuses.find((status) => status.toLowerCase() === "aguardando") || statuses[0] || "");
      })
      .catch(() => {
        if (!isMounted) return;
        setTaskOptions(fallbackTaskOptions);
        setTaskStatus((current) => current || fallbackTaskOptions.statuses[0] || "");
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingTaskOptions(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const chatId = chat?.chat_id || "";
    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      if (!isMounted) return;

      if (!chatId) {
        setContactNotes([]);
        setContactNoteDraft("");
        setContactNoteFeedback(null);
        setIsLoadingContactNotes(false);
        return;
      }

      setIsLoadingContactNotes(true);
      setContactNoteFeedback(null);

      fetchContactNotes(chatId)
        .then((notes) => {
          if (!isMounted) return;
          setContactNotes(notes);
        })
        .catch((error) => {
          if (!isMounted) return;
          setContactNotes([]);
          setContactNoteFeedback({
            type: "error",
            message: error instanceof Error ? error.message : "Não foi possível carregar as anotações do contato.",
          });
        })
        .finally(() => {
          if (!isMounted) return;
          setIsLoadingContactNotes(false);
        });
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [chat?.chat_id]);

  async function handleCreateAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppointmentFeedback(null);
    setIsCreatingAppointment(true);

    try {
      const response = await fetch("/api/airtable/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: appointmentStatus,
          type: appointmentType,
          attendanceMode: appointmentAttendanceMode,
          startDateTime: appointmentDateTime,
          professionalId: appointmentProfessionalId,
          patientName: appointmentPatientName,
          contactPhone: contactPhone || chat?.phone_contact || "",
          chatId: chat?.chat_id || "",
          observations: appointmentObservations,
        }),
      });
      const data = (await response.json()) as { id?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível criar o agendamento.");
      }

      setAppointmentFeedback({ type: "success", message: data.message || "Agendamento criado com sucesso." });
      setAppointmentStatus("");
      setAppointmentType("");
      setAppointmentAttendanceMode("");
      setAppointmentDateTime("");
      setAppointmentProfessionalId("");
      setAppointmentObservations("");
      setLatestAppointmentResult({
        key: latestAppointmentKey,
        appointment: data.id ? { id: data.id, status: appointmentStatus, type: appointmentType, startDateTime: appointmentDateTime } : null,
      });
      window.setTimeout(() => {
        setIsAppointmentDialogOpen(false);
      }, 700);
    } catch (error) {
      setAppointmentFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível criar o agendamento.",
      });
    } finally {
      setIsCreatingAppointment(false);
    }
  }

  function handleAppointmentDialogOpenChange(open: boolean) {
    setIsAppointmentDialogOpen(open);

    if (open) {
      setAppointmentPatientName(patientName);
      setAppointmentFeedback(null);
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskFeedback(null);
    setIsCreatingTask(true);

    try {
      const response = await fetch("/api/airtable/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: taskType,
          status: taskStatus,
          createdAt: taskCreatedAt,
          dueDate: taskDueDate,
          responsibleUserId: taskResponsibleUserId,
          patientName: taskPatientName,
          contactPhone: contactPhone || chat?.phone_contact || "",
          chatId: chat?.chat_id || "",
          subject: taskSubject,
          observations: taskObservations,
        }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível criar o aviso/tarefa.");
      }

      setTaskFeedback({ type: "success", message: data.message || "Aviso/tarefa criado com sucesso." });
      setTaskType("");
      setTaskDueDate("");
      setTaskResponsibleUserId("");
      setTaskSubject("");
      setTaskObservations("");
      window.setTimeout(() => {
        setIsTaskDialogOpen(false);
      }, 700);
    } catch (error) {
      setTaskFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível criar o aviso/tarefa.",
      });
    } finally {
      setIsCreatingTask(false);
    }
  }

  function handleTaskDialogOpenChange(open: boolean) {
    setIsTaskDialogOpen(open);

    if (open) {
      setTaskPatientName(patientName);
      setTaskCreatedAt(getLocalDateTimeValue());
      setTaskDueDate(getLocalDateValue());
      setTaskFeedback(null);
      setTaskStatus((current) => current || taskOptions.statuses.find((status) => status.toLowerCase() === "aguardando") || taskOptions.statuses[0] || "");
    }
  }

  function moveTag(targetTagId: string) {
    if (!draggedTagId || draggedTagId === targetTagId) return;

    const draggedIndex = tags.findIndex((tag) => tag.id === draggedTagId);
    const targetIndex = tags.findIndex((tag) => tag.id === targetTagId);
    if (draggedIndex < 0 || targetIndex < 0) return;

    const nextTags = [...tags];
    const [draggedTag] = nextTags.splice(draggedIndex, 1);
    nextTags.splice(targetIndex, 0, draggedTag);
    pendingReorderedTagsRef.current = nextTags;
    onReorderTags?.(nextTags);
  }

  function finishTagDrag() {
    setDraggedTagId(null);

    if (pendingReorderedTagsRef.current) {
      onCommitTagOrder?.(pendingReorderedTagsRef.current);
      pendingReorderedTagsRef.current = null;
    }
  }

  async function handleCreateContactNote() {
    const chatId = chat?.chat_id || "";
    const content = contactNoteDraft.trim();

    if (!chatId || !content) return;

    setIsSavingContactNote(true);
    setContactNoteFeedback(null);

    try {
      const note = await createContactNote({
        chatId,
        contactPhone: contactPhone || chat?.phone_contact || null,
        content,
      });

      setContactNotes((current) => [note, ...current.filter((currentNote) => currentNote.id !== note.id)]);
      setContactNoteDraft("");
      setContactNoteFeedback({ type: "success", message: "Anotação salva." });
    } catch (error) {
      setContactNoteFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível salvar a anotação do contato.",
      });
    } finally {
      setIsSavingContactNote(false);
    }
  }

  async function handleDeleteContactNote(noteId: string) {
    const previousNotes = contactNotes;

    setContactNotes((current) => current.filter((note) => note.id !== noteId));
    setContactNoteFeedback(null);

    try {
      await deleteContactNote(noteId);
    } catch (error) {
      setContactNotes(previousNotes);
      setContactNoteFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível apagar a anotação do contato.",
      });
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Status contato</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center justify-between rounded px-3 py-1.5 text-sm font-medium shadow-sm"
                  style={{
                    backgroundColor: getChatStatusColor(chat),
                    color: getReadableTextColor(getChatStatusColor(chat)),
                  }}
                >
                  {getChatStatusLabel(chat)}
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-[100] max-h-72 w-56">
                {availableStatuses.map((status) => (
                  <DropdownMenuItem key={status.label} className="cursor-pointer" onClick={() => onChangeStatus?.(status)}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color || "#22c55e" }} />
                    <span className="truncate">{status.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Status agendamento</label>
            <button className="flex w-full items-center justify-between rounded bg-muted px-3 py-1.5 text-sm text-muted-foreground" title={latestAppointment?.type || undefined}>
              <span className="truncate">{appointmentStatusLabel}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <Dialog open={isAppointmentDialogOpen} onOpenChange={handleAppointmentDialogOpenChange}>
            <DialogTrigger asChild>
              <button className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
                <span>+ Agendamento</span>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-[700px] gap-0 rounded-md p-0">
              <DialogHeader className="border-b border-border px-4 py-3">
                <DialogTitle className="text-base font-medium">Novo agendamento</DialogTitle>
              </DialogHeader>

              <form className="space-y-6 px-6 py-6" onSubmit={handleCreateAppointment}>
                <div className="grid gap-4 md:grid-cols-2 md:gap-x-12">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Status</label>
                    <Select value={appointmentStatus} onValueChange={setAppointmentStatus} required>
                      <SelectTrigger className="h-10 w-full bg-muted text-muted-foreground">
                        <SelectValue placeholder={isLoadingAppointmentOptions ? "Carregando..." : "Selecione"} />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        {appointmentOptions.status.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Data e Hora</label>
                    <div className="relative">
                      <Input type="datetime-local" className="h-10 pr-10" aria-label="Data e hora do agendamento" value={appointmentDateTime} onChange={(event) => setAppointmentDateTime(event.target.value)} required />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Tipo</label>
                    <Select value={appointmentType} onValueChange={setAppointmentType} required>
                      <SelectTrigger className="h-10 w-full bg-muted text-muted-foreground">
                        <SelectValue placeholder={isLoadingAppointmentOptions ? "Carregando..." : "Selecione"} />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        {appointmentOptions.types.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Presencial/Online</label>
                    <Select value={appointmentAttendanceMode} onValueChange={setAppointmentAttendanceMode} required>
                      <SelectTrigger className="h-10 w-full bg-muted text-muted-foreground">
                        <SelectValue placeholder={isLoadingAppointmentOptions ? "Carregando..." : "Selecione"} />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        {appointmentOptions.attendanceModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {mode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Paciente</label>
                    <Input className="h-10" value={appointmentPatientName} onChange={(event) => setAppointmentPatientName(event.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Profissional</label>
                    <Select value={appointmentProfessionalId} onValueChange={setAppointmentProfessionalId} required>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder={isLoadingAppointmentOptions ? "Carregando..." : "Selecione"} />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        {appointmentOptions.professionals.length > 0 ? (
                          appointmentOptions.professionals.map((professional) => (
                            <SelectItem key={professional.id} value={professional.id}>
                              {professional.label}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-professionals" disabled>
                            Nenhum profissional encontrado
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Observações</label>
                  <Textarea className="min-h-20 resize-none rounded-md" value={appointmentObservations} onChange={(event) => setAppointmentObservations(event.target.value)} />
                </div>

                {appointmentFeedback && (
                  <p className={cn("rounded-md px-3 py-2 text-sm", appointmentFeedback.type === "success" ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive")}>
                    {appointmentFeedback.message}
                  </p>
                )}

                <DialogFooter className="border-t border-border pt-3">
                  <Button
                    type="submit"
                    className="bg-black text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-zinc-800 hover:shadow-md dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    disabled={isCreatingAppointment || isLoadingAppointmentOptions}
                  >
                    {isCreatingAppointment ? "Criando..." : "Criar agendamento"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={isTaskDialogOpen} onOpenChange={handleTaskDialogOpenChange}>
            <DialogTrigger asChild>
              <button className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
                <span>+ Aviso / Tarefa</span>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-[700px] gap-0 rounded-md p-0">
              <DialogHeader className="border-b border-border px-4 py-3">
                <DialogTitle className="text-base font-medium">Novo Aviso / Tarefa</DialogTitle>
              </DialogHeader>

              <form className="space-y-6 px-6 py-6" onSubmit={handleCreateTask}>
                <div className="grid gap-4 md:grid-cols-2 md:gap-x-16">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Tipo</label>
                    <Select value={taskType} onValueChange={setTaskType} required>
                      <SelectTrigger className="h-10 w-full bg-muted text-muted-foreground">
                        <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        {taskOptions.types.length > 0 ? (
                          taskOptions.types.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-task-types" disabled>
                            Nenhum tipo encontrado
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Status</label>
                    <Select value={taskStatus} onValueChange={setTaskStatus} required>
                      <SelectTrigger className="h-10 w-full bg-orange-400 text-white [&_svg]:text-white">
                        <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        {taskOptions.statuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Data da criação</label>
                    <Input className="h-10" value={getReadableDateTime(taskCreatedAt)} readOnly />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Prazo da tarefa</label>
                    <div className="relative">
                      <Input type="date" className="h-10 pr-10" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} required />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Contato / Paciente</label>
                    <Input className="h-10" value={taskPatientName} onChange={(event) => setTaskPatientName(event.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Usuário responsável</label>
                    <Select value={taskResponsibleUserId} onValueChange={setTaskResponsibleUserId} required>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        {taskOptions.users.length > 0 ? (
                          taskOptions.users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.label}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-task-users" disabled>
                            Nenhum usuário encontrado
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <label className="text-xs font-semibold text-foreground">Assunto / Finalidade</label>
                  <Input className="mt-1.5 h-10" value={taskSubject} onChange={(event) => setTaskSubject(event.target.value)} required />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Descrição / Observações</label>
                  <Textarea className="min-h-20 resize-y rounded-md" value={taskObservations} onChange={(event) => setTaskObservations(event.target.value)} />
                </div>

                {taskFeedback && (
                  <p className={cn("rounded-md px-3 py-2 text-sm", taskFeedback.type === "success" ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive")}>
                    {taskFeedback.message}
                  </p>
                )}

                <DialogFooter className="border-t border-border pt-3">
                  <Button
                    type="submit"
                    className="bg-black text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-zinc-800 hover:shadow-md dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    disabled={isCreatingTask || isLoadingTaskOptions}
                  >
                    {isCreatingTask ? "Criando..." : "Criar Aviso/Tarefa"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4">
          <Accordion type="single" collapsible defaultValue="contact-info">
            <AccordionItem value="contact-info" className="border-none rounded-xl bg-muted/60 px-3">
              <AccordionTrigger className="py-3 text-sm font-semibold text-foreground hover:no-underline">Informações do contato</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 gap-3 p-1">
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">Cidade residência</label>
                    <Input
                      className="h-8 max-w-full bg-background text-sm"
                      value={contactInfo.cidade_residencia}
                      onChange={(event) => handleChangeContactInfoField("cidade_residencia", event.target.value)}
                      disabled={isSavingContactInfo}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">Cidade desejada</label>
                    <Input
                      className="h-8 max-w-full bg-background text-sm"
                      value={contactInfo.cidade_desejada}
                      onChange={(event) => handleChangeContactInfoField("cidade_desejada", event.target.value)}
                      disabled={isSavingContactInfo}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">Email</label>
                    <Input
                      ref={emailInputRef}
                      className="h-8 max-w-full bg-background text-sm"
                      type="email"
                      value={contactInfo.email_contato}
                      onChange={(event) => handleChangeContactEmail(event.target.value)}
                      disabled={isSavingContactInfo}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">Celular</label>
                    <Input
                      className="h-8 max-w-full bg-background text-sm"
                      value={contactInfo.phone_contact}
                      onChange={(event) => handleChangeContactInfoField("phone_contact", event.target.value)}
                      disabled={isSavingContactInfo}
                    />
                  </div>
                </div>
                <div className="mx-1 mt-3 flex items-center justify-between gap-3">
                  <p className={cn("text-xs", contactInfoFeedback?.type === "error" ? "text-destructive" : "text-muted-foreground")}>
                    {isSavingContactInfo ? "Salvando informações..." : contactInfoFeedback?.message || (hasUnsavedContactInfo ? "Alterações pendentes." : "Tudo salvo.")}
                  </p>
                  <Button type="button" size="sm" disabled={!hasUnsavedContactInfo || isSavingContactInfo || !chat?.id} onClick={() => void handleSaveContactInfo()}>
                    {isSavingContactInfo ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-semibold text-foreground">Interesses</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex w-full flex-wrap items-center gap-2 rounded border border-border bg-card px-3 py-2 text-left">
                {selectedInterests.length > 0 ? (
                  selectedInterests.map((interest) => (
                    <span
                      key={interest.id}
                      draggable
                      className={cn("flex cursor-grab items-center gap-1 rounded bg-teal-600 px-2 py-0.5 text-xs font-medium text-white transition-opacity active:cursor-grabbing", draggedTagId === interest.id && "opacity-50")}
                      style={
                        interest.color
                          ? {
                              backgroundColor: interest.color,
                              color: getReadableTextColor(interest.color),
                            }
                          : undefined
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", interest.id);
                        setDraggedTagId(interest.id);
                      }}
                      onDragEnter={() => moveTag(interest.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnd={finishTagDrag}
                    >
                      <GripVertical className="h-3 w-3 opacity-60" />
                      {interest.label}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhum interesse</span>
                )}
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[100] max-h-72 w-72">
              {availableInterest.length > 0 ? (
                availableInterest.map((interest) => (
                  <DropdownMenuCheckboxItem
                    key={interest.id || interest.label}
                    checked={selectedInterests.some((i) => i.id === interest.id)}
                    className="cursor-pointer"
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => {
                      setSelectedInterests((prev) => (prev.some((i) => i.id === interest.id) ? prev.filter((i) => i.id !== interest.id) : [...prev, interest]));
                    }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: interest.color || "#0d9488" }} />
                    <span className="truncate">{interest.label}</span>
                  </DropdownMenuCheckboxItem>
                ))
              ) : (
                <DropdownMenuItem disabled>Nenhum interesse encontrado</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-4">
          <div className="mb-1.5">
            <label className="block text-sm font-semibold text-foreground">Tags do contato</label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Arraste para reordenar. As 3 primeiras aparecem na lista.</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex w-full flex-wrap items-center gap-2 rounded border border-border bg-card px-3 py-2 text-left">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <span
                      key={tag.id}
                      draggable
                      className={cn("flex cursor-grab items-center gap-1 rounded bg-teal-600 px-2 py-0.5 text-xs font-medium text-white transition-opacity active:cursor-grabbing", draggedTagId === tag.id && "opacity-50")}
                      style={
                        tag.color
                          ? {
                              backgroundColor: tag.color,
                              color: getReadableTextColor(tag.color),
                            }
                          : undefined
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", tag.id);
                        setDraggedTagId(tag.id);
                      }}
                      onDragEnter={() => moveTag(tag.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnd={finishTagDrag}
                    >
                      <GripVertical className="h-3 w-3 opacity-60" />
                      {tag.label}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhuma tag</span>
                )}
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[100] max-h-72 w-72">
              {availableTags.length > 0 ? (
                availableTags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id || tag.label}
                    checked={selectedTagKeys.has(tag.id) || selectedTagKeys.has(tag.label.toLowerCase())}
                    className="cursor-pointer"
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => onToggleTag?.(tag)}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || "#0d9488" }} />
                    <span className="truncate">{tag.label}</span>
                  </DropdownMenuCheckboxItem>
                ))
              ) : (
                <DropdownMenuItem disabled>Nenhuma tag encontrada</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-4">
          <Field>
            <FieldLabel htmlFor="textarea-message">Anotações</FieldLabel>
            <FieldDescription className="text-[11px] text-muted-foreground">Adicione anotações sobre o atendimento, preferências ou lembretes.</FieldDescription>
            <Textarea
              id="textarea-message"
              className="max-h-48 min-h-24 resize-y"
              value={contactNoteDraft}
              onChange={(event) => setContactNoteDraft(event.target.value)}
              placeholder="Digite uma nova anotação"
              disabled={!chat?.chat_id || isSavingContactNote}
            />
          </Field>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {isLoadingContactNotes ? "Carregando anotações..." : `${contactNotes.length} anotação${contactNotes.length === 1 ? "" : "es"}`}
            </p>
            <Button type="button" size="sm" disabled={!chat?.chat_id || !contactNoteDraft.trim() || isSavingContactNote} onClick={() => void handleCreateContactNote()}>
              {isSavingContactNote ? "Salvando..." : "Salvar anotação"}
            </Button>
          </div>

          {contactNoteFeedback && (
            <p className={cn("mt-3 rounded-md px-3 py-2 text-sm", contactNoteFeedback.type === "success" ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive")}>
              {contactNoteFeedback.message}
            </p>
          )}

          <div className="mt-3 space-y-2">
            {!isLoadingContactNotes && contactNotes.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">Nenhuma anotação registrada.</p>
            ) : (
              contactNotes.map((note) => (
                <div key={note.id} className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-muted-foreground">{getReadableDateTime(note.updated_at || note.created_at)}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void handleDeleteContactNote(note.id)} aria-label="Apagar anotação">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{note.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="flex">
          {bottomTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setBottomTab(tab.id)}
              className={cn("flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors", bottomTab === tab.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="h-32 p-4">{bottomTab === "consultas" ? <p className="text-sm text-muted-foreground">Nenhuma consulta registrada</p> : <p className="text-sm text-muted-foreground">Nenhum aviso ou tarefa</p>}</div>
      </div>
    </>
  );
}
