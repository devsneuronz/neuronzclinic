import { getAvatarInitials } from "@/lib/avatar-initials";
import { formatDateTime, getTodayDate } from "@/lib/date";
import { fallbackTaskOptions, getTaskNoteAttachmentType, isOverdue, ParsedTaskResolutionNote, StatusConfigMap, Task, TaskOptions, TaskResolutionNote } from "@/lib/task";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowRight, CalendarDays, ImageIcon, Loader2, Mic, Plus, Save, Square, Trash2, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { FieldLabel } from "../ui/fields";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

interface TaskDetailsDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPatientChat: (task: Task) => void;
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
  onOpenPatientChat,
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
  const [dueDate, setDueDate] = useState(task ? getDateInputValue(task.dueDate) || getTodayDate() : getTodayDate());
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

  function getDateInputValue(value: string) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().slice(0, 10);
  }

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {task ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <DialogHeader className="pr-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                  {task.type || "Tarefa"}
                </Badge>
                <Badge variant="outline" className={cn(overdue ? "border-destructive/25 bg-destructive/5 text-destructive" : "")}>
                  {overdue ? "Atrasada" : task.statusLabel || statusConfig[task.status].label}
                </Badge>
              </div>
              <DialogTitle className="pt-2 text-xl leading-7">Editar tarefa</DialogTitle>
              <DialogDescription>Atualize os campos do encaminhamento registrado no Airtable.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 border-y py-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Tipo</FieldLabel>
                <Select value={type} onValueChange={setType} required>
                  <SelectTrigger className="h-10 w-full">
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

              <div className="space-y-1.5">
                <FieldLabel>Status</FieldLabel>
                <Select value={status} onValueChange={setStatus} required>
                  <SelectTrigger className="h-10 w-full">
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

              <div className="space-y-1.5">
                <FieldLabel>Prazo</FieldLabel>
                <Input type="date" className="h-10" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Responsável</FieldLabel>
                <Select value={responsibleUserId} onValueChange={setResponsibleUserId} required>
                  <SelectTrigger className="h-10 w-full">
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

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Paciente</p>
                {task.patient ? (
                  <button
                    type="button"
                    className={cn(
                      "group mt-1 flex max-w-full items-center gap-2 rounded-md text-left transition-colors",
                      task.patientChatId ? "-mx-1 px-1.5 py-1 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" : "cursor-default",
                    )}
                    onClick={() => {
                      if (task.patientChatId) onOpenPatientChat(task);
                    }}
                    disabled={!task.patientChatId}
                  >
                    <Avatar className="h-8 w-8 shrink-0 border">
                      <AvatarImage src={task.patientPhotoUrl || undefined} alt={task.patient} />
                      <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">{getAvatarInitials(task.patient)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 break-words text-sm font-medium text-foreground">{task.patient}</span>
                    {task.patientChatId ? <ArrowRight className="h-4 w-4 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-70" /> : null}
                  </button>
                ) : (
                  <p className="mt-1 break-words text-sm text-foreground">Nao informado</p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Criada em</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-foreground">
                  <CalendarDays className="h-4 w-4" />
                  {createdAt || "Nao informado"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Assunto</FieldLabel>
              <Input className="h-10" value={subject} onChange={(event) => setSubject(event.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Observações</FieldLabel>
              <Textarea className="min-h-28 resize-y" value={observations} onChange={(event) => setObservations(event.target.value)} />
            </div>

            <section className="space-y-3 border-t pt-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Evolução / resolução</h3>
                <p className="mt-1 text-xs text-muted-foreground">Registre o histórico de acompanhamento desta tarefa.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input ref={noteAttachmentInputRef} type="file" accept="image/*" className="hidden" onChange={handleAttachmentChange} disabled={isSavingNote || isRecordingAudio} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="transition hover:-translate-y-0.5 hover:border-sky-400/50 hover:bg-sky-400/10 hover:text-sky-600 hover:shadow-xs"
                  onClick={() => noteAttachmentInputRef.current?.click()}
                  disabled={isSavingNote || isRecordingAudio}
                >
                  <ImageIcon className="h-4 w-4" />
                  Imagem
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "transition hover:-translate-y-0.5 hover:shadow-xs",
                    isRecordingAudio ? "border-rose-400/50 bg-rose-400/10 text-rose-600 hover:bg-rose-400/15" : "hover:border-teal-400/50 hover:bg-teal-400/10 hover:text-teal-600",
                  )}
                  onClick={handleAudioRecording}
                  disabled={isSavingNote}
                >
                  {isRecordingAudio ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
                  {isRecordingAudio ? "Parar gravação" : "Gravar audio"}
                </Button>
                {noteAttachment ? (
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs",
                      attachmentType === "unsupported" ? "border-destructive/25 bg-destructive/5 text-destructive" : "bg-background text-muted-foreground",
                    )}
                  >
                    <span className="truncate">
                      {attachmentType === "unsupported" ? "Formato nao suportado" : getTaskNoteAttachmentLabel(noteAttachment)}: {noteAttachment.name}
                    </span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handleClearAttachment} aria-label="Remover anexo">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>

              {audioRecordingError ? (
                <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {audioRecordingError}
                </div>
              ) : null}

              {attachmentType === "image" && noteMediaPreviewUrl ? (
                <div className="overflow-hidden rounded-md border bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={noteMediaPreviewUrl} alt={noteAttachment?.name || "Preview da imagem"} className="max-h-64 w-full object-contain" />
                </div>
              ) : null}

              {attachmentType === "audio" && noteMediaPreviewUrl ? <audio controls className="w-full" src={noteMediaPreviewUrl} /> : null}

              <Textarea
                className="min-h-24 resize-y"
                value={noteDraft}
                onChange={(event) => onNoteDraftChange(event.target.value)}
                placeholder={noteAttachment ? "Legenda opcional" : "Digite uma atualização sobre a resolução da tarefa"}
                disabled={isSavingNote}
              />

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{isLoadingNotes ? "Carregando histórico..." : `${notes.length} registro${notes.length === 1 ? "" : "s"}`}</p>
                <Button type="button" size="sm" disabled={!canCreateNote || isSavingNote} onClick={() => onCreateNote(task)}>
                  {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {isSavingNote ? "Salvando..." : "Adicionar evolução"}
                </Button>
              </div>

              {noteErrorMessage ? (
                <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {noteErrorMessage}
                </div>
              ) : null}

              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {!isLoadingNotes && notes.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">Nenhuma evolução registrada.</p>
                ) : (
                  notes.map((note) => {
                    const parsedNote = parseTaskResolutionNoteContent(note.content);

                    return (
                      <div key={note.id} className="rounded-md border bg-card px-3 py-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 text-[11px] text-muted-foreground">
                            <span>{formatDateTime(note.updated_at || note.created_at, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                            {note.status_snapshot ? <span className="ml-2">Status: {note.status_snapshot}</span> : null}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => onDeleteNote(note.id)}
                            aria-label="Apagar evolução"
                            disabled={deletingNoteId === note.id}
                          >
                            {deletingNoteId === note.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>

                        {parsedNote.type === "image" ? (
                          <a href={parsedNote.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 block overflow-hidden rounded-md border bg-background">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={parsedNote.mediaUrl} alt={parsedNote.content || parsedNote.fileName} className="max-h-72 w-full object-contain" />
                          </a>
                        ) : null}

                        {parsedNote.type === "audio" ? (
                          <audio controls className="mb-2 w-full" src={parsedNote.mediaUrl}>
                            <a href={parsedNote.mediaUrl}>{parsedNote.fileName}</a>
                          </audio>
                        ) : null}

                        {parsedNote.content ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{parsedNote.content}</p> : null}
                        {parsedNote.type !== "text" ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{parsedNote.fileName}</p> : null}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <div className="text-xs text-muted-foreground">Criado por {task.creator || "Sistema"}</div>

            {overdue ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Esta tarefa está atrasada.
              </div>
            ) : null}

            {errorMessage ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {errorMessage}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
                Fechar
              </Button>
              <Button type="button" variant="destructive" onClick={() => onDelete(task)} disabled={isBusy}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeleting ? "Excluindo..." : "Excluir tarefa"}
              </Button>
              <Button type="submit" disabled={isBusy || isLoadingTaskOptions || !responsibleUserId}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
