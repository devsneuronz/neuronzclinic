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
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4">
          <p className="text-3xl font-bold text-foreground">{value}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardAppointments({ appointments }: { appointments: CalendarAppointment[] }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-semibold text-foreground">Próximas consultas de hoje</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {appointments.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma consulta encontrada para hoje.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Hora", "Paciente", "Procedimento", "Profissional", "Status"].map((item) => (
                    <th key={item} className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {item}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appointments.slice(0, 8).map((appointment) => {
                  const normalizedStatus = normalizeStatus(appointment.status);

                  return (
                    <tr key={appointment.id} className="transition-colors hover:bg-muted/50">
                      <td className="py-3 text-sm font-medium text-foreground">{formatTime(appointment.startDateTime)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">{getInitials(appointment.patient)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium text-foreground">{appointment.patient}</span>
                        </div>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">{appointment.type || "Consulta"}</td>
                      <td className="py-3 text-sm text-muted-foreground">{appointment.professional}</td>
                      <td className="py-3">
                        <Badge className={cn("capitalize", statusStyles[normalizedStatus] || "bg-secondary text-secondary-foreground")}>{appointment.status || "Sem status"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PendingTasks({ tasks }: { tasks: Task[] }) {
  const allOpenTasks = tasks.filter((task) => task.status !== "finalizado");
  const openTasks = allOpenTasks.slice(0, 4);

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold text-foreground">Tarefas e pendências</CardTitle>
          </div>
          <Badge variant="secondary">{allOpenTasks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {openTasks.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma pendência aberta.</div>
        ) : (
          <div className="divide-y divide-border">
            {openTasks.map((task) => {
              const dueDate = task.dueDate ? parseDateOnly(task.dueDate) ?? new Date(task.dueDate) : null;
              const isLate = dueDate && !Number.isNaN(dueDate.getTime()) && isBefore(dueDate, startOfToday());

              return (
                <div key={task.id} className="grid grid-cols-[1fr_auto] gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{task.subject || task.type || "Tarefa sem assunto"}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {task.patient || "Sem paciente"} · {task.responsible || "Sem responsável"}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge className={task.status === "resolvendo" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning-foreground"}>{task.statusLabel || task.status}</Badge>
                      <span className="truncate text-xs text-muted-foreground">{task.type}</span>
                    </div>
                  </div>
                  <div className="pt-0.5">
                    <Badge variant="outline" className={cn("shrink-0", isLate ? "border-destructive/30 text-destructive" : "text-muted-foreground")}>
                      {formatDateLabel(task.dueDate)}
                    </Badge>
                  </div>
                </div>
              );
            })}
            {allOpenTasks.length > openTasks.length ? <div className="pt-3 text-xs font-medium text-muted-foreground">+{allOpenTasks.length - openTasks.length} pendências no quadro de tarefas</div> : null}
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
      const date = task.dueDate ? parseDateOnly(task.dueDate) ?? new Date(task.dueDate) : null;
      return date && !Number.isNaN(date.getTime()) && isBefore(date, startOfToday());
    });
    const patients = new Set(appointments.map((appointment) => appointment.patient).filter(Boolean));

    return [
      { label: "Consultas Hoje", value: String(todayAppointments.length), description: "agendamentos carregados", icon: Calendar },
      { label: "Pacientes Hoje", value: String(patients.size), description: "pacientes com consulta", icon: Users },
      { label: "Pendências", value: String(pendingTasks.length), description: `${overdueTasks.length} atrasadas`, icon: AlertCircle },
      { label: "Em Atendimento", value: String(tasks.filter((task) => task.status === "resolvendo").length), description: "tarefas em resolução", icon: Clock },
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
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onCreateAppointment={() => void openAppointmentDialog()} />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Visão operacional de hoje</p>
                <h2 className="text-2xl font-semibold tracking-normal text-foreground">{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</h2>
              </div>
              <Button variant="outline" className="bg-background" onClick={() => loadData({ refresh: true })} disabled={isLoading || isRefreshing}>
                {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar
              </Button>
            </div>

            {errorMessage ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {errorMessage}
              </div>
            ) : null}
            {successMessage ? (
              <div className="flex items-center gap-2 rounded-md border border-success/25 bg-success/5 px-3 py-2 text-sm text-success">
                <CheckCircle className="h-4 w-4" />
                {successMessage}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </div>

            {isLoading ? (
              <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando dashboard
                </div>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <DashboardAppointments appointments={appointments} />
                </div>

                <div className="space-y-6 lg:col-span-1">
                  <PendingTasks tasks={tasks} />

                  <Card className="border-border bg-card shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg font-semibold text-foreground">Resumo de atividades</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {recentActivity.map((item, index) => (
                          <div key={item} className="flex items-start gap-3">
                            <div className="rounded-lg bg-primary/10 p-2 text-primary">{index === 0 ? <Calendar className="h-4 w-4" /> : index === 1 ? <Stethoscope className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}</div>
                            <p className="pt-1 text-sm font-medium text-foreground">{item}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
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
