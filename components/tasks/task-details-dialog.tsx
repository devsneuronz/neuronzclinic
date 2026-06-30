import { getAvatarInitials } from "@/lib/avatar-initials";
import { formatDateTime, getDateInputValue } from "@/lib/date";
import { fallbackTaskOptions, getTaskNoteAttachmentType, getTaskTypeBadgeClassName, isOverdue, ParsedTaskResolutionNote, StatusConfigMap, Task, TaskOptions, TaskResolutionNote } from "@/lib/task";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowRight, CalendarDays, ImageIcon, ListTodo, Loader2, Mic, Plus, Save, Square, Trash2, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

interface TaskDetailsDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPatientMessages: (task: Task) => void;
  onDelete: (task: Task) => void;
  onUpdate: (task: Task, values: { type: string; status: string; dueDate: string; responsibleUserId: string; subject: string; observations: string }) => void;
  notes: TaskResolutionNote[];
  noteDraft: string;
  noteAttachment: File | null;
  onNoteDraftChange: (value: string) => void;
  onNoteAttachmentChange: (file: File | null) => void;
  onCreateNote: (task: Task) => void;
  onDeleteNote: (noteId: string) => void;
  taskOptions: TaskOptions;
  isLoadingTaskOptions: boolean;
  isLoadingNotes: boolean;
  isSavingNote: boolean;
  deletingNoteId: string;
  isDeleting: boolean;
  isSaving: boolean;
  errorMessage: string;
  noteErrorMessage: string;
  statusConfig: StatusConfigMap;
}

export function TaskDetailsDialog({
  task,
  open,
  onOpenChange,
  onOpenPatientMessages,
  onDelete,
  onUpdate,
  notes,
  noteDraft,
  noteAttachment,
  onNoteDraftChange,
  onNoteAttachmentChange,
  onCreateNote,
  onDeleteNote,
  taskOptions,
  isLoadingTaskOptions,
  isLoadingNotes,
  isSavingNote,
  deletingNoteId,
  isDeleting,
  isSaving,
  errorMessage,
  noteErrorMessage,
  statusConfig,
}: TaskDetailsDialogProps) {
  const [type, setType] = useState(task?.type || fallbackTaskOptions.types[0]);
  const [status, setStatus] = useState(task ? task.statusLabel || statusConfig[task.status].label : fallbackTaskOptions.statuses[0]);
  const [dueDate, setDueDate] = useState(task ? getDateInputValue(task.dueDate) : "");
  const [responsibleUserId, setResponsibleUserId] = useState(task?.responsibleUserId || "");
  const [subject, setSubject] = useState(task?.subject || "");
  const [observations, setObservations] = useState(task?.description || "");
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecordingError, setAudioRecordingError] = useState("");
  const noteAttachmentInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const overdue = task ? isOverdue(task) : false;
  const createdAt = task
    ? formatDateTime(task.createdAt, {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const currentStatus = statusConfig[task?.status as keyof typeof statusConfig] || statusConfig.aguardando;

  function mergeOptions(options: string[], currentValue: string) {
    return Array.from(new Set([currentValue, ...options].map((option) => option.trim()).filter(Boolean)));
  }

  function getTaskNoteAttachmentLabel(file: File) {
    const type = getTaskNoteAttachmentType(file);
    if (type === "image") return "Imagem";
    if (type === "audio") return "Audio";
    return "Arquivo";
  }

  const taskNoteMediaPrefix = "task-note-media:";

  function parseTaskResolutionNoteContent(content: string): ParsedTaskResolutionNote {
    if (!content.startsWith(taskNoteMediaPrefix)) {
      return {
        type: "text",
        content,
        mediaUrl: "",
        fileName: "",
        mimeType: "",
      };
    }

    try {
      const parsed = JSON.parse(content.slice(taskNoteMediaPrefix.length)) as Partial<{
        type: "image" | "audio";
        caption: string;
        mediaUrl: string;
        fileName: string;
        mimeType: string;
      }>;

      if ((parsed.type === "image" || parsed.type === "audio") && parsed.mediaUrl) {
        return {
          type: parsed.type,
          content: typeof parsed.caption === "string" ? parsed.caption : "",
          mediaUrl: parsed.mediaUrl,
          fileName: parsed.fileName || "Anexo",
          mimeType: parsed.mimeType || "",
        };
      }
    } catch {
      // Legacy fallback: show the raw content if the saved metadata is malformed.
    }

    return {
      type: "text",
      content,
      mediaUrl: "",
      fileName: "",
      mimeType: "",
    };
  }

  const responsibleOptions = useMemo(() => {
    const options = taskOptions.users;

    if (!task?.responsibleUserId || options.some((user) => user.id === task.responsibleUserId)) {
      return options;
    }

    return [{ id: task.responsibleUserId, label: task.responsible || "Responsável atual" }, ...options];
  }, [task, taskOptions.users]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!task) return;

    onUpdate(task, {
      type,
      status,
      dueDate,
      responsibleUserId,
      subject,
      observations,
    });
  };

  const isBusy = isDeleting || isSaving;
  const attachmentType = getTaskNoteAttachmentType(noteAttachment);
  const canCreateNote = Boolean(noteDraft.trim() || noteAttachment) && attachmentType !== "unsupported";
  const noteMediaPreviewUrl = useMemo(() => (["image", "audio"].includes(attachmentType || "") && noteAttachment ? URL.createObjectURL(noteAttachment) : ""), [attachmentType, noteAttachment]);

  useEffect(() => {
    if (!task) return;

    let isCurrent = true;
    queueMicrotask(() => {
      if (!isCurrent) return;
      setType(task.type || fallbackTaskOptions.types[0]);
      setStatus(task.statusLabel || statusConfig[task.status].label);
      setDueDate(getDateInputValue(task.dueDate));
      setResponsibleUserId(task.responsibleUserId || "");
      setSubject(task.subject || "");
      setObservations(task.description || "");
    });

    return () => {
      isCurrent = false;
    };
  }, [task, statusConfig]);

  useEffect(() => {
    if (!noteMediaPreviewUrl) return;
    return () => URL.revokeObjectURL(noteMediaPreviewUrl);
  }, [noteMediaPreviewUrl]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    onNoteAttachmentChange(file);
    setAudioRecordingError("");
  };

  const handleClearAttachment = () => {
    onNoteAttachmentChange(null);
    if (noteAttachmentInputRef.current) noteAttachmentInputRef.current.value = "";
    setAudioRecordingError("");
  };

  const stopAudioRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const handleAudioRecording = async () => {
    if (isRecordingAudio) {
      stopAudioRecording();
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAudioRecordingError("Gravacao de audio nao suportada neste navegador.");
      return;
    }

    try {
      setAudioRecordingError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const audioFile = new File([audioBlob], `audio-tarefa-${Date.now()}.${extension}`, { type: mimeType });

        onNoteAttachmentChange(audioFile);
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        setIsRecordingAudio(false);
      };

      recorder.onerror = () => {
        setAudioRecordingError("Nao foi possivel gravar o audio.");
        setIsRecordingAudio(false);
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      };

      onNoteAttachmentChange(null);
      if (noteAttachmentInputRef.current) noteAttachmentInputRef.current.value = "";
      recorder.start();
      setIsRecordingAudio(true);
    } catch {
      setAudioRecordingError("Permita o acesso ao microfone para gravar o audio.");
      setIsRecordingAudio(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col p-0 overflow-hidden">
        {task ? (
          <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
            <DialogHeader className="p-6 pb-2 shrink-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Badge variant="outline" className={cn(" text-[10px] font-semibold px-2 py-0.5", getTaskTypeBadgeClassName(task.type))}>
                  {task.type || "Tarefa"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] font-semibold px-2 py-0.5 transition-colors", overdue ? "border-destructive/25 bg-destructive/5 text-destructive" : cn(currentStatus.headerClassName, currentStatus.columnClassName))}
                >
                  {overdue ? "Atrasada" : currentStatus.label}
                </Badge>
              </div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ListTodo className="h-4 w-4 text-theme-primary" />
                Editar tarefa
              </DialogTitle>
              <DialogDescription>Atualize os campos do encaminhamento registrado no Airtable.</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 min-h-0 custom-scrollbar">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Tipo</label>
                  <Select value={type} onValueChange={setType} required>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      {mergeOptions(taskOptions.types, task.type).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Status</label>
                  <Select value={status} onValueChange={setStatus} required>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      {mergeOptions(taskOptions.statuses, task.statusLabel || statusConfig[task.status].label).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Prazo</label>
                  <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Responsável</label>
                  <Select value={responsibleUserId} onValueChange={setResponsibleUserId} required>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoadingTaskOptions ? "Carregando..." : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      {responsibleOptions.length > 0 ? (
                        responsibleOptions.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.label}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-users" disabled>
                          Nenhum usuário encontrado
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block">Paciente</span>
                  {task.patient ? (
                    <button
                      type="button"
                      className={cn(
                        "group flex max-w-full items-center gap-2 rounded-md text-left transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
                        task.patientChatId ? "-mx-1 px-1.5 py-1 hover:bg-theme-primary/5 hover:text-foreground" : "cursor-default",
                      )}
                      onClick={() => {
                        if (task.patientChatId) onOpenPatientMessages(task);
                      }}
                      disabled={!task.patientChatId}
                    >
                      <Avatar className="h-7 w-7 shrink-0 border border-border/60">
                        <AvatarImage src={task.patientPhotoUrl || undefined} alt={task.patient} />
                        <AvatarFallback className="bg-muted text-[10px] font-bold text-muted-foreground">{getAvatarInitials(task.patient)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">{task.patient}</span>
                      {task.patientChatId ? <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-70" /> : null}
                    </button>
                  ) : (
                    <p className="py-1 text-sm text-muted-foreground italic">Não informado</p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block">Criada em</span>
                  <p className="flex items-center gap-1.5 py-1 text-sm text-foreground">
                    <CalendarDays className="h-4 w-4 text-muted-foreground/80" />
                    {createdAt || "Não informado"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Assunto</label>
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} required />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Observações</label>
                <Textarea className="min-h-20 resize-none" value={observations} onChange={(event) => setObservations(event.target.value)} />
              </div>

              <div className="space-y-3 border-t border-border/60 pt-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/90">Evolução / Resolução</h3>
                  <p className="text-[11px] text-muted-foreground">Registre o histórico de acompanhamento desta tarefa.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input ref={noteAttachmentInputRef} type="file" accept="image/*" className="hidden" onChange={handleAttachmentChange} disabled={isSavingNote || isRecordingAudio} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs transition hover:-translate-y-0.5 hover:border-sky-400/50 hover:bg-sky-400/10 hover:text-sky-600 hover:shadow-xs"
                    onClick={() => noteAttachmentInputRef.current?.click()}
                    disabled={isSavingNote || isRecordingAudio}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Imagem
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 text-xs transition hover:-translate-y-0.5 hover:shadow-xs",
                      isRecordingAudio ? "border-rose-400/50 bg-rose-400/10 text-rose-600 hover:bg-rose-400/15" : "hover:border-teal-400/50 hover:bg-teal-400/10 hover:text-teal-600",
                    )}
                    onClick={handleAudioRecording}
                    disabled={isSavingNote}
                  >
                    {isRecordingAudio ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
                    {isRecordingAudio ? "Parar gravação" : "Gravar áudio"}
                  </Button>

                  {noteAttachment ? (
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                        attachmentType === "unsupported" ? "border-destructive/25 bg-destructive/5 text-destructive" : "bg-background text-muted-foreground",
                      )}
                    >
                      <span className="truncate">
                        {attachmentType === "unsupported" ? "Formato não suportado" : getTaskNoteAttachmentLabel(noteAttachment)}: {noteAttachment.name}
                      </span>
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={handleClearAttachment} aria-label="Remover anexo">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : null}
                </div>

                {audioRecordingError ? (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive animate-fade-in">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {audioRecordingError}
                  </div>
                ) : null}

                {attachmentType === "image" && noteMediaPreviewUrl ? (
                  <div className="overflow-hidden rounded-lg border bg-background max-h-52 flex items-center justify-center p-2">
                    <img src={noteMediaPreviewUrl} alt={noteAttachment?.name || "Preview"} className="max-h-48 rounded-md object-contain" />
                  </div>
                ) : null}

                {attachmentType === "audio" && noteMediaPreviewUrl ? <audio controls className="w-full h-9" src={noteMediaPreviewUrl} /> : null}

                <Textarea
                  className="min-h-16 resize-none"
                  value={noteDraft}
                  onChange={(event) => onNoteDraftChange(event.target.value)}
                  placeholder={noteAttachment ? "Legenda opcional..." : "Digite uma atualização sobre a resolução da tarefa..."}
                  disabled={isSavingNote}
                />

                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground">{isLoadingNotes ? "Carregando histórico..." : `${notes.length} registro${notes.length === 1 ? "" : "s"}`}</p>
                  <Button type="button" size="sm" className="h-8 text-xs gap-1.5" disabled={!canCreateNote || isSavingNote} onClick={() => onCreateNote(task)}>
                    {isSavingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {isSavingNote ? "Salvando..." : "Adicionar evolução"}
                  </Button>
                </div>

                {noteErrorMessage ? (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive animate-fade-in">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {noteErrorMessage}
                  </div>
                ) : null}

                <div className="max-h-48 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {!isLoadingNotes && notes.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Nenhuma evolução registrada.</p>
                  ) : (
                    notes.map((note) => {
                      const parsedNote = parseTaskResolutionNoteContent(note.content);
                      return (
                        <div key={note.id} className="rounded-lg border bg-background/50 p-3 shadow-2xs">
                          <div className="mb-2 flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                            <div className="min-w-0 text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{formatDateTime(note.updated_at || note.created_at, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                              {note.status_snapshot && <span className="bg-muted px-1.5 py-0.5 rounded-sm border border-border/60 text-foreground/80">Status: {note.status_snapshot}</span>}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-md"
                              onClick={() => onDeleteNote(note.id)}
                              aria-label="Apagar evolução"
                              disabled={deletingNoteId === note.id}
                            >
                              {deletingNoteId === note.id ? <Loader2 className="h-3 animate-spin" /> : <Trash2 className="h-3" />}
                            </Button>
                          </div>

                          {parsedNote.type === "image" && (
                            <a href={parsedNote.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 block overflow-hidden rounded-md border bg-background max-h-40">
                              <img src={parsedNote.mediaUrl} alt={parsedNote.content || parsedNote.fileName} className="max-h-40 w-full object-contain" />
                            </a>
                          )}

                          {parsedNote.type === "audio" && <audio controls className="mb-2 w-full h-8" src={parsedNote.mediaUrl} />}

                          {parsedNote.content && <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">{parsedNote.content}</p>}
                          {parsedNote.type !== "text" && <p className="mt-1 truncate text-[10px] text-muted-foreground italic">{parsedNote.fileName}</p>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/20 shrink-0 flex items-center sm:justify-between gap-2">
              <div className="text-[11px] text-muted-foreground mr-auto">
                Criado por <span className="font-medium text-foreground/80">{task.creator || "Sistema"}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy} className="h-9 text-xs">
                  Fechar
                </Button>
                <Button type="button" variant="destructive" onClick={() => onDelete(task)} disabled={isBusy} className="gap-1.5 h-9 text-xs">
                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Excluir
                </Button>
                <Button type="submit" disabled={isBusy || isLoadingTaskOptions || !responsibleUserId} className="gap-1.5 h-9 text-xs bg-theme-primary text-white hover:bg-theme-primary/90">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salvar
                </Button>
              </div>
            </DialogFooter>

            {(overdue && !isSaving) || errorMessage ? (
              <div className="px-6 pb-4 bg-muted/20 space-y-2 shrink-0">
                {overdue && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-1.5 text-xs text-destructive animate-fade-in">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Esta tarefa está atrasada no Airtable.
                  </div>
                )}
                {errorMessage && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-1.5 text-xs text-destructive animate-fade-in">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {errorMessage}
                  </div>
                )}
              </div>
            ) : null}
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
