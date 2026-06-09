"use client";

import { Header } from "@/components/dashboard/header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, parseDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";
import { addDays, addHours, format, isBefore, isToday, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Bot, Calendar, CheckCircle, Clock, Loader2, RefreshCw, Stethoscope, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type CalendarAppointment = {
  id: string;
  status: string;
  type: string;
  attendanceMode: string;
  startDateTime: string;
  endDateTime: string;
  professional: string;
  patient: string;
  phone: string;
  observations: string;
};

type Task = {
  id: string;
  subject: string;
  description: string;
  status: "aguardando" | "resolvendo" | "finalizado";
  statusLabel: string;
  type: string;
  creator: string;
  responsible: string;
  patient: string;
  createdAt: string;
  dueDate: string;
};

type AppointmentOptions = {
  status: string[];
  types: string[];
  attendanceModes: string[];
  professionals: Array<{ id: string; label: string }>;
  patients: Array<{ id: string; label: string }>;
};

const emptyAppointmentOptions: AppointmentOptions = {
  status: [],
  types: [],
  attendanceModes: [],
  professionals: [],
  patients: [],
};

const statusStyles: Record<string, string> = {
  confirmado: "bg-success/10 text-success hover:bg-success/20",
  confirmada: "bg-success/10 text-success hover:bg-success/20",
  pendente: "bg-warning/10 text-warning-foreground hover:bg-warning/20",
  aguardando: "bg-warning/10 text-warning-foreground hover:bg-warning/20",
  cancelado: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  cancelada: "bg-destructive/10 text-destructive hover:bg-destructive/20",
};

function getInitials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : words[0]?.slice(0, 2) || "NC").toUpperCase();
}

function getAppointmentDate(appointment: CalendarAppointment) {
  const date = new Date(appointment.startDateTime);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : format(date, "HH:mm");
}

function formatDateLabel(value: string) {
  return formatDateTime(value, { day: "2-digit", month: "2-digit" }) || "Sem prazo";
}

function normalizeStatus(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toDateTimeLocalValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

async function fetchDashboardData() {
  const todayStart = startOfToday();
  const tomorrowStart = addDays(todayStart, 1);

  const appointmentsUrl = new URL("/api/airtable/appointments", window.location.origin);
  appointmentsUrl.searchParams.set("start", todayStart.toISOString());
  appointmentsUrl.searchParams.set("end", tomorrowStart.toISOString());

  const [appointmentsResponse, tasksResponse] = await Promise.all([fetch(appointmentsUrl, { cache: "no-store" }), fetch("/api/airtable/tasks", { cache: "no-store" })]);

  const appointmentsData = (await appointmentsResponse.json()) as { appointments?: CalendarAppointment[]; message?: string };
  const tasksData = (await tasksResponse.json()) as { tasks?: Task[]; message?: string };

  if (!appointmentsResponse.ok) throw new Error(appointmentsData.message || "Não foi possível carregar os agendamentos.");
  if (!tasksResponse.ok) throw new Error(tasksData.message || "Não foi possível carregar as tarefas.");

  return {
    appointments: appointmentsData.appointments ?? [],
    tasks: tasksData.tasks ?? [],
  };
}

async function fetchAppointmentOptions() {
  const response = await fetch("/api/airtable/appointment-options", { cache: "no-store" });
  const data = (await response.json()) as Partial<AppointmentOptions> & { message?: string };

  if (!response.ok) throw new Error(data.message || "Não foi possível carregar as opções de agendamento.");

  return {
    status: Array.isArray(data.status) ? data.status : [],
    types: Array.isArray(data.types) ? data.types : [],
    attendanceModes: Array.isArray(data.attendanceModes) ? data.attendanceModes : [],
    professionals: Array.isArray(data.professionals) ? data.professionals : [],
    patients: Array.isArray(data.patients) ? data.patients : [],
  };
}

function StatCard({ label, value, description, icon: Icon }: { label: string; value: string; description: string; icon: typeof Calendar }) {
  return (
    <Card className="border border-border bg-card shadow-sm transition-all hover:shadow-md">
      <CardContent className=" flex items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground truncate first-letter:uppercase" title={description}>
            {description}
          </p>
        </div>

        <div className="rounded-xl bg-theme-primary/30 p-2.5 text-theme-primary-fg shrink-0">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardAppointments({ appointments }: { appointments: CalendarAppointment[] }) {
  return (
    <Card className="border border-border bg-card shadow-sm h-full flex flex-col overflow-hidden gap-0">
      <CardHeader className="shrink-0 border-b border-border/40 gap-0">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold text-foreground">Próximas consultas de hoje</CardTitle>
        </div>
      </CardHeader>

      <div className="grid grid-cols-[80px_2fr_1.2fr_1.2fr_110px] border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden shrink-0 gap-4">
        <span>Hora</span>
        <span>Paciente</span>
        <span>Procedimento</span>
        <span>Profissional</span>
        <span className="text-right">Status</span>
      </div>

      <CardContent className="flex-1 overflow-y-auto p-0 min-h-0 custom-scrollbar">
        {appointments.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground p-6">
            <Calendar className="h-8 w-8 text-muted-foreground/60 stroke-[1.5]" />
            <p className="font-medium">Nenhuma consulta encontrada para hoje.</p>
          </div>
        ) : (
          <div className="flex flex-col w-full divide-y divide-border/60">
            {appointments.slice(0, 10).map((appointment) => {
              const normalizedStatus = normalizeStatus(appointment.status);

              return (
                <div key={appointment.id} className="flex flex-col md:grid md:grid-cols-[80px_2fr_1.2fr_1.2fr_110px] items-start md:items-center gap-2 md:gap-4 px-4 py-3.5 md:py-3 transition-colors hover:bg-muted/40 group">
                  <div className="flex items-center gap-2 md:block shrink-0">
                    <span className="text-xs font-bold uppercase text-muted-foreground md:hidden bg-muted px-1.5 py-0.5 rounded">Hora:</span>
                    <span className="text-sm font-semibold text-foreground tracking-tight tabular-nums">{formatTime(appointment.startDateTime)}</span>
                  </div>

                  <div className="w-full min-w-0 flex items-center gap-2.5">
                    <Avatar className="h-7 w-7 border border-border shrink-0">
                      <AvatarFallback className="bg-secondary text-[10px] font-bold text-secondary-foreground">{getInitials(appointment.patient)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{appointment.patient}</span>
                  </div>

                  <div className="flex items-center gap-2 md:block w-full min-w-0">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Procedimento:</span>
                    <p className="text-sm text-muted-foreground truncate">{appointment.type || "Consulta"}</p>
                  </div>

                  <div className="flex items-center gap-2 md:block w-full min-w-0">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Profissional:</span>
                    <p className="text-sm text-muted-foreground truncate">{appointment.professional}</p>
                  </div>

                  <div className="flex items-center justify-between md:justify-end w-full md:w-auto pt-1 md:pt-0 border-t border-dashed border-border/60 md:border-none shrink-0">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Status atual</span>
                    <Badge variant="outline" className={cn("capitalize font-medium text-xs px-2 py-0.5 rounded-md border shadow-none", statusStyles[normalizedStatus] || "bg-secondary/40 text-secondary-foreground border-secondary")}>
                      {appointment.status || "Sem status"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PendingTasks({ tasks }: { tasks: Task[] }) {
  const allOpenTasks = tasks.filter((task) => task.status !== "finalizado");
  const openTasks = allOpenTasks.slice(0, 5);

  return (
    <Card className="border border-border bg-card shadow-sm h-full flex flex-col overflow-hidden gap-0">
      <CardHeader className="pb-3 shrink-0 border-b border-border/40 gap-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold text-foreground">Tarefas e pendências</CardTitle>
          </div>
          <Badge variant="secondary" className="rounded-full px-2 py-0.5 font-bold text-xs">
            {allOpenTasks.length}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 min-h-0 custom-scrollbar">
        {openTasks.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground border-dashed border-2 rounded-xl">Nenhuma pendência aberta.</div>
        ) : (
          <div className="space-y-1.5 h-full flex flex-col items-center">
            {openTasks.map((task) => {
              const dueDate = task.dueDate ? (parseDateOnly(task.dueDate) ?? new Date(task.dueDate)) : null;
              const isLate = dueDate && !Number.isNaN(dueDate.getTime()) && isBefore(dueDate, startOfToday());

              return (
                <div key={task.id} className="w-full flex items-start justify-between gap-3 p-2.5 m-0 rounded-lg border border-transparent hover:border-border hover:bg-muted/30 transition-all">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground leading-snug">{task.subject || task.type || "Tarefa sem assunto"}</p>
                    <p className="text-xs text-muted-foreground font-medium">
                      {task.patient || "Sem paciente"} · <span className="opacity-80">{task.responsible || "Sem responsável"}</span>
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "shadow-none text-[10px] font-bold px-1.5 py-0 rounded",
                          task.status === "resolvendo" ? "bg-primary/10 text-primary border border-primary/20" : "bg-warning/10 text-warning-foreground border border-warning/20",
                        )}
                      >
                        {task.statusLabel || task.status}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground/70 truncate">{task.type}</span>
                    </div>
                  </div>

                  <div className="shrink-0 pt-0.5">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-md", isLate ? "bg-destructive/5 border-destructive/30 text-destructive font-bold" : "bg-muted/40 text-muted-foreground border-border")}
                    >
                      {formatDateLabel(task.dueDate)}
                    </Badge>
                  </div>
                </div>
              );
            })}

            {allOpenTasks.length > openTasks.length && (
              <div className="pt-2 px-1 text-center lg:text-left">
                <span className="inline-block text-xs font-semibold text-primary bg-primary/5 px-2 py-1 rounded-md border border-primary/10">+{allOpenTasks.length - openTasks.length} pendências no quadro geral</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardContent() {
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [appointmentOptions, setAppointmentOptions] = useState<AppointmentOptions>(emptyAppointmentOptions);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [isLoadingAppointmentOptions, setIsLoadingAppointmentOptions] = useState(false);
  const [isSavingAppointment, setIsSavingAppointment] = useState(false);
  const [appointmentStatus, setAppointmentStatus] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [appointmentAttendanceMode, setAppointmentAttendanceMode] = useState("");
  const [appointmentProfessionalId, setAppointmentProfessionalId] = useState("");
  const [appointmentPatientId, setAppointmentPatientId] = useState("");
  const [appointmentPatientSearch, setAppointmentPatientSearch] = useState("");
  const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false);
  const [appointmentStartDateTime, setAppointmentStartDateTime] = useState("");
  const [appointmentEndDateTime, setAppointmentEndDateTime] = useState("");
  const [appointmentObservations, setAppointmentObservations] = useState("");

  const loadData = async ({ refresh = false }: { refresh?: boolean } = {}) => {
    setIsLoading(!refresh);
    setIsRefreshing(refresh);
    setErrorMessage("");

    try {
      const data = await fetchDashboardData();
      setAppointments(data.appointments);
      setTasks(data.tasks);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar a dashboard.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        const data = await fetchDashboardData();
        if (!isActive) return;
        setAppointments(data.appointments);
        setTasks(data.tasks);
      } catch (error) {
        if (!isActive) return;
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar a dashboard.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const selectedAppointmentPatient = useMemo(() => appointmentOptions.patients.find((patient) => patient.id === appointmentPatientId), [appointmentOptions.patients, appointmentPatientId]);

  const patientSearchResults = useMemo(() => {
    const query = normalizeText(appointmentPatientSearch);
    if (!query) return [];

    return appointmentOptions.patients.filter((patient) => normalizeText(patient.label).includes(query)).slice(0, 8);
  }, [appointmentOptions.patients, appointmentPatientSearch]);

  const openAppointmentDialog = async () => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setMinutes(now.getMinutes() > 30 ? 0 : 30, 0, 0);
    if (startDate.getTime() < now.getTime()) startDate.setHours(startDate.getHours() + 1);

    setSuccessMessage("");
    setErrorMessage("");
    setIsAppointmentDialogOpen(true);
    setAppointmentStartDateTime(toDateTimeLocalValue(startDate));
    setAppointmentEndDateTime(toDateTimeLocalValue(addHours(startDate, 1)));
    setAppointmentPatientId("");
    setAppointmentPatientSearch("");
    setAppointmentObservations("");
    setIsPatientSearchOpen(false);

    const applyOptions = (options: AppointmentOptions) => {
      setAppointmentStatus(options.status[0] || "");
      setAppointmentType(options.types[0] || "");
      setAppointmentAttendanceMode(options.attendanceModes[0] || "");
      setAppointmentProfessionalId(options.professionals[0]?.id || "");
    };

    if (appointmentOptions.status.length > 0) {
      applyOptions(appointmentOptions);
      return;
    }

    setIsLoadingAppointmentOptions(true);
    try {
      const options = await fetchAppointmentOptions();
      setAppointmentOptions(options);
      applyOptions(options);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar as opções de agendamento.");
    } finally {
      setIsLoadingAppointmentOptions(false);
    }
  };

  const handleCreateAppointment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingAppointment(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/airtable/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: appointmentStatus,
          type: appointmentType,
          attendanceMode: appointmentAttendanceMode,
          startDateTime: appointmentStartDateTime,
          endDateTime: appointmentEndDateTime,
          professionalId: appointmentProfessionalId,
          patientId: appointmentPatientId,
          observations: appointmentObservations,
        }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) throw new Error(data.message || "Não foi possível criar o agendamento.");

      setSuccessMessage(data.message || "Agendamento criado com sucesso.");
      setIsAppointmentDialogOpen(false);
      await loadData({ refresh: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível criar o agendamento.");
    } finally {
      setIsSavingAppointment(false);
    }
  };

  const stats = useMemo(() => {
    const todayAppointments = appointments.filter((appointment) => {
      const date = getAppointmentDate(appointment);
      return date ? isToday(date) : false;
    });
    const pendingTasks = tasks.filter((task) => task.status !== "finalizado");
    const overdueTasks = pendingTasks.filter((task) => {
      const date = task.dueDate ? (parseDateOnly(task.dueDate) ?? new Date(task.dueDate)) : null;
      return date && !Number.isNaN(date.getTime()) && isBefore(date, startOfToday());
    });
    const patients = new Set(appointments.map((appointment) => appointment.patient).filter(Boolean));

    return [
      {
        label: "Consultas Hoje",
        value: String(todayAppointments.length),
        description: todayAppointments.length === 1 ? "agendamento carregado" : "agendamentos carregados",
        icon: Calendar,
      },
      {
        label: "Pacientes Hoje",
        value: String(patients.size),
        description: patients.size === 1 ? "paciente com consulta" : "pacientes com consulta",
        icon: Users,
      },
      {
        label: "Pendências",
        value: String(pendingTasks.length),
        description: `${overdueTasks.length} ${overdueTasks.length === 1 ? "atrasada" : "atrasadas"}`,
        icon: AlertCircle,
      },
      {
        label: "Em Atendimento",
        value: String(tasks.filter((t) => t.status === "resolvendo").length),
        description: tasks.filter((t) => t.status === "resolvendo").length === 1 ? "tarefa em resolução" : "tarefas em resolução",
        icon: Clock,
      },
    ];
  }, [appointments, tasks]);

  const recentActivity = useMemo(() => {
    const confirmed = appointments.filter((appointment) => normalizeStatus(appointment.status).includes("confirm")).length;
    const openTasks = tasks.filter((task) => task.status !== "finalizado").length;

    return [
      `${appointments.length} consultas encontradas para hoje`,
      `${confirmed} consultas confirmadas`,
      `${openTasks} tarefas ou pendências abertas`,
      `${tasks.filter((task) => task.status === "finalizado").length} tarefas finalizadas no quadro`,
    ];
  }, [appointments, tasks]);

  return (
    <div className="flex h-full bg-background">
      <div className="flex flex-1 flex-col h-full overflow-hidden">
        <Header onCreateAppointment={() => void openAppointmentDialog()} />

        <main className="flex-1 h-auto overflow-y-auto lg:h-full lg:overflow-hidden p-4 sm:p-6 flex flex-col min-h-0">
          <div className="mx-auto w-full max-w-7xl flex flex-col h-auto lg:h-full min-h-0 space-y-4 sm:space-y-6">
            <div className="flex flex-wrap gap-3 justify-between items-end shrink-0">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Visão operacional de hoje</p>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-normal text-foreground first-letter:uppercase">{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</h2>
              </div>
              <Button variant="outline" className="h-10.5 shrink-0" onClick={() => loadData({ refresh: true })} disabled={isLoading || isRefreshing}>
                {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="hidden md:inline ml-2">Atualizar</span>
              </Button>
            </div>

            {(errorMessage || successMessage) && (
              <div className="shrink-0 space-y-2">
                {errorMessage ? (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">{errorMessage}</span>
                  </div>
                ) : null}
                {successMessage ? (
                  <div className="flex items-center gap-2 rounded-md border border-success/25 bg-success/5 px-3 py-2 text-sm text-success">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">{successMessage}</span>
                  </div>
                ) : null}
              </div>
            )}

            <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 shrink-0">
              {stats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </div>

            <div className="flex-1 min-h-0 w-full h-auto lg:h-full">
              {isLoading ? (
                <div className="flex h-64 lg:h-full items-center justify-center rounded-lg border border-dashed">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando dashboard
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-3 h-auto lg:h-full min-h-0 lg:overflow-hidden pb-6 lg:pb-0">
                  <div className="lg:col-span-2 flex flex-col h-auto lg:h-full lg:min-h-0 overflow-visible lg:overflow-hidden">
                    <div className="flex-1 lg:overflow-y-auto rounded-xl">
                      <DashboardAppointments appointments={appointments} />
                    </div>
                  </div>

                  <div className="lg:col-span-1 flex flex-col gap-4 sm:gap-6 h-auto lg:h-full lg:min-h-0">
                    <div className="h-full overflow-visible lg:overflow-hidden flex flex-col">
                      <PendingTasks tasks={tasks} />
                    </div>

                    <Card className="h-fit flex flex-col border-border bg-card shadow-sm gap-0 overflow-visible">
                      <CardHeader className="pb-3 shrink-0 gap-0">
                        <div className="flex items-center gap-2">
                          <Bot className="h-5 w-5 text-primary" />
                          <CardTitle className="text-base sm:text-lg font-semibold text-foreground">Resumo de atividades</CardTitle>
                        </div>
                      </CardHeader>

                      <CardContent className=" lg:overflow-y-auto">
                        <div className="space-y-3">
                          {recentActivity.map((item, index) => (
                            <div key={item} className="flex items-start gap-3">
                              <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
                                {index === 0 ? <Calendar className="h-4 w-4" /> : index === 1 ? <Stethoscope className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                              </div>
                              <p className="pt-1 text-sm font-medium text-foreground leading-tight">{item}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <Dialog open={isAppointmentDialogOpen} onOpenChange={setIsAppointmentDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo agendamento</DialogTitle>
            <DialogDescription>Crie uma consulta vinculada a um paciente do Airtable.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateAppointment}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Status</label>
                <Select value={appointmentStatus} onValueChange={setAppointmentStatus} required disabled={isLoadingAppointmentOptions}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isLoadingAppointmentOptions ? "Carregando..." : "Status"} />
                  </SelectTrigger>
                  <SelectContent>
                    {appointmentOptions.status.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Tipo</label>
                <Select value={appointmentType} onValueChange={setAppointmentType} required disabled={isLoadingAppointmentOptions}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isLoadingAppointmentOptions ? "Carregando..." : "Tipo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {appointmentOptions.types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Início</label>
                <Input type="datetime-local" value={appointmentStartDateTime} onChange={(event) => setAppointmentStartDateTime(event.target.value)} required />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Fim</label>
                <Input type="datetime-local" value={appointmentEndDateTime} onChange={(event) => setAppointmentEndDateTime(event.target.value)} required />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Presencial/Online</label>
                <Select value={appointmentAttendanceMode} onValueChange={setAppointmentAttendanceMode} required disabled={isLoadingAppointmentOptions}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isLoadingAppointmentOptions ? "Carregando..." : "Formato"} />
                  </SelectTrigger>
                  <SelectContent>
                    {appointmentOptions.attendanceModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Profissional</label>
                <Select value={appointmentProfessionalId} onValueChange={setAppointmentProfessionalId} required disabled={isLoadingAppointmentOptions}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isLoadingAppointmentOptions ? "Carregando..." : "Profissional"} />
                  </SelectTrigger>
                  <SelectContent>
                    {appointmentOptions.professionals.map((professional) => (
                      <SelectItem key={professional.id} value={professional.id}>
                        {professional.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Paciente</label>
              <div className="relative">
                <Input
                  value={appointmentPatientSearch}
                  placeholder={selectedAppointmentPatient?.label || "Digite o nome do paciente"}
                  onBlur={() => window.setTimeout(() => setIsPatientSearchOpen(false), 120)}
                  onChange={(event) => {
                    setAppointmentPatientSearch(event.target.value);
                    setAppointmentPatientId("");
                    setIsPatientSearchOpen(true);
                  }}
                  onFocus={() => {
                    if (appointmentPatientSearch.trim()) setIsPatientSearchOpen(true);
                  }}
                />
                {isPatientSearchOpen && appointmentPatientSearch.trim() ? (
                  <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                    {patientSearchResults.length > 0 ? (
                      patientSearchResults.map((patient) => (
                        <button
                          key={patient.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                            appointmentPatientId === patient.id && "bg-accent text-accent-foreground",
                          )}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setAppointmentPatientId(patient.id);
                            setAppointmentPatientSearch(patient.label);
                            setIsPatientSearchOpen(false);
                          }}
                        >
                          <span className="truncate">{patient.label}</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-2 py-2 text-sm text-muted-foreground">Nenhum paciente encontrado</div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Observações</label>
              <Textarea className="min-h-20 resize-none" value={appointmentObservations} onChange={(event) => setAppointmentObservations(event.target.value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAppointmentDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingAppointment || isLoadingAppointmentOptions || !appointmentStatus || !appointmentType || !appointmentAttendanceMode || !appointmentProfessionalId || !appointmentPatientId}>
                {isSavingAppointment ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar agendamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
