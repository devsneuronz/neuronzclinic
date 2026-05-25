"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CalendarIcon, CalendarPlus, ChevronLeft, ChevronRight, Circle, Clock, Loader2, Phone, Plus, Search, Stethoscope, User, UserPlus } from "lucide-react";
import type { FormEvent, MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type ViewType = "Mês" | "Semana" | "Dia" | "Lista";

type CalendarAppointment = {
  id: string;
  status: string;
  type: string;
  attendanceMode: string;
  startDateTime: string;
  endDateTime: string;
  professionalId: string;
  professional: string;
  patientId: string;
  patient: string;
  phone: string;
  observations: string;
};

type AppointmentOptions = {
  status: string[];
  types: string[];
  attendanceModes: string[];
  professionals: Array<{ id: string; label: string }>;
  patients: Array<{ id: string; label: string }>;
};

const views: ViewType[] = ["Mês", "Semana", "Dia", "Lista"];
const timeSlots = Array.from({ length: 16 }, (_, index) => index + 6);
const allValue = "todos";
const dayStartHour = 6;
const dayEndHour = 22;
const slotStepMinutes = 15;

const correctHeightAspect = 1.5;

function getDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getAppointmentDate(appointment: CalendarAppointment) {
  const date = new Date(appointment.startDateTime);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAppointmentEndDate(appointment: CalendarAppointment) {
  const date = new Date(appointment.endDateTime);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAppointmentTime(appointment: CalendarAppointment) {
  const startDate = getAppointmentDate(appointment);
  const endDate = getAppointmentEndDate(appointment);

  if (!startDate) return "--";
  if (!endDate) return format(startDate, "HH:mm");

  return `${format(startDate, "HH:mm")} - ${format(endDate, "HH:mm")}`;
}

function getStatusColorHex(status: string) {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus.includes("aguard")) {
    return {
      base: "#f59e0b",
      bg: "#f59e0b1a",
    };
  }

  if (normalizedStatus.includes("confirm")) {
    return {
      base: "#10b981",
      bg: "#10b9811a",
    };
  }

  if (normalizedStatus.includes("cancel")) {
    return {
      base: "#ef4444",
      bg: "#ef44441a",
    };
  }

  if (normalizedStatus.includes("atrasad")) {
    return {
      base: "#f97316",
      bg: "#f973161a",
    };
  }

  if (normalizedStatus.includes("finaliz") || normalizedStatus.includes("conclu")) {
    return {
      base: "#6366f1",
      bg: "#6366f11a",
    };
  }

  return {
    base: "#94a3b8",
    bg: "#94a3b81a",
  };
}
function getRange(date: Date, activeView: ViewType) {
  if (activeView === "Mês") {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);

    return {
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: addDays(endOfWeek(monthEnd, { weekStartsOn: 1 }), 1),
    };
  }

  if (activeView === "Dia") {
    return {
      start: startOfDay(date),
      end: addDays(startOfDay(date), 1),
    };
  }

  const weekStart = startOfWeek(date, { weekStartsOn: 1 });

  return {
    start: weekStart,
    end: addDays(weekStart, 7),
  };
}

function getHeaderTitle(date: Date, activeView: ViewType) {
  if (activeView === "Mês") {
    return format(date, "MMMM 'de' yyyy", { locale: ptBR });
  }

  if (activeView === "Dia") {
    return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  }

  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  if (isSameMonth(weekStart, weekEnd)) {
    return `${format(weekStart, "d", { locale: ptBR })} - ${format(weekEnd, "d 'de' MMM 'de' yyyy", { locale: ptBR })}`;
  }

  return `${format(weekStart, "d 'de' MMM", { locale: ptBR })} - ${format(weekEnd, "d 'de' MMM 'de' yyyy", { locale: ptBR })}`;
}

function getAppointmentStyle(appointment: CalendarAppointment) {
  const startDate = getAppointmentDate(appointment);
  const endDate = getAppointmentEndDate(appointment);

  if (!startDate) return { top: 0, height: 78 };

  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const visibleStartMinutes = dayStartHour * 60;

  const relativeMinutes = startMinutes - visibleStartMinutes;

  const durationMinutes = endDate ? Math.max(30, (endDate.getTime() - startDate.getTime()) / 60000) : 60;

  return {
    top: Math.max(4, relativeMinutes * correctHeightAspect + 2),
    height: Math.max(44, durationMinutes * correctHeightAspect - 4),
  };
}

function toDateTimeLocalValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function getDateAtMinute(day: Date, minuteOfDay: number) {
  const date = startOfDay(day);
  date.setMinutes(minuteOfDay);
  return date;
}

function getPointerMinute(event: MouseEvent<HTMLElement>, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
  const rawMinute = dayStartHour * 60 + y / correctHeightAspect;
  const snappedMinute = Math.round(rawMinute / slotStepMinutes) * slotStepMinutes;

  return Math.min(Math.max(snappedMinute, dayStartHour * 60), dayEndHour * 60);
}

export function WeeklyCalendar() {
  const [activeView, setActiveView] = useState<ViewType>("Semana");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [options, setOptions] = useState<AppointmentOptions>({ status: [], types: [], attendanceModes: [], professionals: [], patients: [] });
  const [statusFilter, setStatusFilter] = useState(allValue);
  const [typeFilter, setTypeFilter] = useState(allValue);
  const [professionalFilter, setProfessionalFilter] = useState(allValue);
  const [patientFilter, setPatientFilter] = useState("");
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSavingAppointment, setIsSavingAppointment] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selection, setSelection] = useState<{ day: Date; startMinute: number; endMinute: number } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<CalendarAppointment | null>(null);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
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

  const range = useMemo(() => getRange(currentDate, activeView), [activeView, currentDate]);
  const professionalLabels = useMemo(() => new Map(options.professionals.map((professional) => [professional.id, professional.label])), [options.professionals]);
  const selectedAppointmentPatient = useMemo(() => options.patients.find((patient) => patient.id === appointmentPatientId), [appointmentPatientId, options.patients]);
  const patientSearchResults = useMemo(() => {
    const query = normalizeText(appointmentPatientSearch);
    if (!query) return [];

    return options.patients.filter((patient) => normalizeText(patient.label).includes(query)).slice(0, 8);
  }, [appointmentPatientSearch, options.patients]);

  const currentStatusColor = statusFilter === allValue ? "#94a3b8" : getStatusColorHex(statusFilter).base;

  const visibleDays = useMemo(() => {
    if (activeView === "Dia") return [startOfDay(currentDate)];

    const start = activeView === "Mês" ? range.start : startOfWeek(currentDate, { weekStartsOn: 1 });
    const length = activeView === "Mês" ? 42 : 7;

    return Array.from({ length }, (_, index) => addDays(start, index));
  }, [activeView, currentDate, range.start]);

  const filteredAppointments = useMemo(() => {
    const patientQuery = normalizeText(patientFilter);

    return appointments.filter((appointment) => {
      const professionalLabel = professionalLabels.get(appointment.professionalId);
      const professionalMatches = professionalFilter === allValue || appointment.professionalId === professionalFilter;
      const statusMatches = statusFilter === allValue || appointment.status.toLowerCase() === statusFilter.toLowerCase();
      const typeMatches = typeFilter === allValue || appointment.type.toLowerCase() === typeFilter.toLowerCase();
      const searchablePatient = normalizeText([appointment.patient, appointment.phone, appointment.patientId, appointment.observations].filter(Boolean).join(" "));
      const patientMatches = !patientQuery || searchablePatient.includes(patientQuery);

      return professionalMatches && statusMatches && typeMatches && patientMatches && (professionalLabel || appointment.professional);
    });
  }, [appointments, patientFilter, professionalFilter, professionalLabels, statusFilter, typeFilter]);

  const appointmentsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarAppointment[]>();

    for (const appointment of filteredAppointments) {
      const date = getAppointmentDate(appointment);
      if (!date) continue;

      const key = getDateKey(date);
      const dayAppointments = grouped.get(key) ?? [];
      dayAppointments.push(appointment);
      grouped.set(key, dayAppointments);
    }

    for (const dayAppointments of grouped.values()) {
      dayAppointments.sort((a, b) => {
        const aDate = getAppointmentDate(a)?.getTime() ?? 0;
        const bDate = getAppointmentDate(b)?.getTime() ?? 0;
        return aDate - bDate;
      });
    }

    return grouped;
  }, [filteredAppointments]);

  useEffect(() => {
    let isActive = true;

    async function loadOptions() {
      await Promise.resolve();
      if (isActive) setIsLoadingOptions(true);

      try {
        const response = await fetch("/api/airtable/appointment-options");
        const data = (await response.json()) as Partial<AppointmentOptions>;
        if (!isActive) return;

        setOptions({
          status: Array.isArray(data.status) ? data.status : [],
          types: Array.isArray(data.types) ? data.types : [],
          attendanceModes: Array.isArray(data.attendanceModes) ? data.attendanceModes : [],
          professionals: Array.isArray(data.professionals) ? data.professionals : [],
          patients: Array.isArray(data.patients) ? data.patients : [],
        });
      } catch {
        if (isActive) setErrorMessage("Não foi possível carregar os filtros do Airtable.");
      } finally {
        if (isActive) setIsLoadingOptions(false);
      }
    }

    void loadOptions();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const params = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });

    if (statusFilter !== allValue) params.set("status", statusFilter);
    if (typeFilter !== allValue) params.set("type", typeFilter);

    async function loadAppointments() {
      await Promise.resolve();
      if (!isActive) return;

      setIsLoadingAppointments(true);
      setErrorMessage("");

      try {
        const response = await fetch(`/api/airtable/appointments?${params.toString()}`);
        const data = (await response.json()) as { appointments?: CalendarAppointment[]; message?: string };
        if (!isActive) return;
        setAppointments(Array.isArray(data.appointments) ? data.appointments : []);
        if (data.message) setErrorMessage(data.message);
      } catch {
        if (isActive) {
          setAppointments([]);
          setErrorMessage("Não foi possível carregar os agendamentos.");
        }
      } finally {
        if (isActive) setIsLoadingAppointments(false);
      }
    }

    void loadAppointments();

    return () => {
      isActive = false;
    };
  }, [range.end, range.start, refreshKey, statusFilter, typeFilter]);

  function goToPrevious() {
    if (activeView === "Mês") setCurrentDate((date) => subMonths(date, 1));
    else if (activeView === "Dia") setCurrentDate((date) => addDays(date, -1));
    else setCurrentDate((date) => subWeeks(date, 1));
  }

  function goToNext() {
    if (activeView === "Mês") setCurrentDate((date) => addMonths(date, 1));
    else if (activeView === "Dia") setCurrentDate((date) => addDays(date, 1));
    else setCurrentDate((date) => addWeeks(date, 1));
  }

  function openAppointmentDialog(startDate: Date, endDate = addDays(startDate, 0)) {
    const safeEndDate = endDate.getTime() > startDate.getTime() ? endDate : new Date(startDate.getTime() + 60 * 60 * 1000);

    setAppointmentStatus(options.status[0] ?? "");
    setAppointmentType(options.types[0] ?? "");
    setAppointmentAttendanceMode(options.attendanceModes[0] ?? "");
    setAppointmentProfessionalId(professionalFilter !== allValue ? professionalFilter : (options.professionals[0]?.id ?? ""));
    setAppointmentPatientId("");
    setAppointmentPatientSearch("");
    setIsPatientSearchOpen(false);
    setAppointmentStartDateTime(toDateTimeLocalValue(startDate));
    setAppointmentEndDateTime(toDateTimeLocalValue(safeEndDate));
    setAppointmentObservations("");
    setSelection(null);
    setErrorMessage("");
    setSuccessMessage("");
    setIsAppointmentDialogOpen(true);
  }

  function openAppointmentDialogFromSelection(selectionValue: { day: Date; startMinute: number; endMinute: number }) {
    const startMinute = Math.min(selectionValue.startMinute, selectionValue.endMinute);
    const endMinute = Math.max(selectionValue.startMinute, selectionValue.endMinute);
    const startDate = getDateAtMinute(selectionValue.day, startMinute);
    const endDate = getDateAtMinute(selectionValue.day, Math.max(endMinute, startMinute + 60));

    openAppointmentDialog(startDate, endDate);
  }

  function handleGridMouseDown(day: Date, event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const minute = getPointerMinute(event, event.currentTarget);
    setSelection({ day, startMinute: minute, endMinute: Math.min(minute + 60, dayEndHour * 60) });
  }

  function handleGridMouseMove(day: Date, event: MouseEvent<HTMLDivElement>) {
    if (!selection || getDateKey(selection.day) !== getDateKey(day)) return;

    const minute = getPointerMinute(event, event.currentTarget);
    setSelection((currentSelection) => (currentSelection ? { ...currentSelection, endMinute: minute } : currentSelection));
  }

  function handleGridMouseUp(day: Date, event: MouseEvent<HTMLDivElement>) {
    if (!selection || getDateKey(selection.day) !== getDateKey(day)) return;

    const minute = getPointerMinute(event, event.currentTarget);
    openAppointmentDialogFromSelection({ ...selection, endMinute: minute });
  }

  async function handleCreateAppointment(event: FormEvent<HTMLFormElement>) {
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

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível criar o agendamento.");
      }

      setSuccessMessage(data.message || "Agendamento criado com sucesso.");
      setIsAppointmentDialogOpen(false);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível criar o agendamento.");
    } finally {
      setIsSavingAppointment(false);
    }
  }

  function renderAppointmentCard(appointment: CalendarAppointment) {
    const startDate = getAppointmentDate(appointment);
    const professional = professionalLabels.get(appointment.professionalId) || appointment.professional;

    return (
      <button
        key={appointment.id}
        type="button"
        className="p-1 gap-2 group flex flex-row h-full max-h-full w-full rounded-md border border-border/70 bg-secondary text-left shadow-sm transition-all hover:ring-2 hover:ring-theme-primary/50 hover:shadow-xl cursor-pointer items-stretch"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedAppointment(appointment);
        }}
      >
        <div className="w-1 shrink-0 rounded-full transition-transform" style={{ backgroundColor: getStatusColorHex(appointment.status).base }} />

        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 overflow-y-auto">
          <div className="flex min-w-0 items-center justify-between gap-2 shrink-0">
            <div className="flex min-w-0 items-center gap-1.5">
              {startDate && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-foreground/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-foreground/90 font-mono">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {format(startDate, "HH:mm")}
                </span>
              )}
              <p className="truncate text-xs font-semibold text-muted-foreground">{professional}</p>
            </div>
          </div>

          <div className="my-2 min-w-0 flex flex-col gap-0.5">
            <h4 className="truncate text-sm font-bold text-foreground tracking-tight">{appointment.patient}</h4>
            {appointment.phone && <p className="truncate text-[11px] font-medium text-muted-foreground/80 font-mono">{appointment.phone}</p>}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 pt-1.5 border-t border-border/30 shrink-0">
            <span className="truncate text-[10px] font-bold tracking-wider text-primary uppercase">{appointment.type || "Geral"}</span>

            <span
              className="shrink-0 w-fit rounded px-2 py-0.5 text-[10px] font-bold tracking-wide border transition-all"
              style={{
                borderColor: `${getStatusColorHex(appointment.status).base}33`,
                backgroundColor: getStatusColorHex(appointment.status).bg,
                color: getStatusColorHex(appointment.status).base,
              }}
            >
              {appointment.status}
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col bg-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 h-15.25">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPrevious} aria-label="Periodo anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center justify-center">
            <h1 className="text-lg whitespace-nowrap font-semibold capitalize text-foreground">{getHeaderTitle(currentDate, activeView)}</h1>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNext} aria-label="Proximo periodo">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {activeView === "Dia" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>

              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={currentDate}
                  onSelect={(date) => {
                    if (date) {
                      setCurrentDate(date);
                      setActiveView("Dia");
                    }
                  }}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          )}
          {isLoadingAppointments && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Carregando...
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button className="gap-2 bg-theme-primary text-white hover:bg-theme-primary/90" onClick={() => openAppointmentDialog(new Date())}>
            <Plus className="h-4 w-4" />
            Novo Agendamento
          </Button>
          <Button variant="outline" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Novo Paciente
          </Button>
        </div>
      </header>

      <div className={cn("px-6 py-3", activeView !== "Semana" && activeView !== "Dia" && "border-border border-b")}>
        <div className="flex gap-1">
          {views.map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors text-muted-foregroun",
                activeView === view ? "bg-theme-primary text-white" : "cursor-pointer text-muted-foreground hover:bg-theme-accent hover:text-foreground dark:hover:bg-theme-primary/20",
              )}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col">
            {errorMessage && <div className="border-b border-border bg-amber-500/10 px-6 py-2 text-sm text-amber-700 dark:text-amber-300">{errorMessage}</div>}
            {successMessage && <div className="border-b border-border bg-emerald-500/10 px-6 py-2 text-sm text-emerald-700 dark:text-emerald-300">{successMessage}</div>}
            {activeView === "Mês" ? (
              <div className="min-w-341.5 grid min-h-full grid-cols-7 border-b border-border ">
                {visibleDays.map((day) => {
                  const dayAppointments = appointmentsByDay.get(getDateKey(day)) ?? [];
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "min-h-32 cursor-pointer border-r border-t border-border p-2 last:border-r-0 hover:bg-muted/40",
                        !isSameMonth(day, currentDate) && "bg-muted/30 text-muted-foreground",
                        isSameDay(day, new Date()) && "bg-theme-accent/30 hover:bg-theme-accent/40",
                      )}
                      onClick={() => {
                        setCurrentDate(day);
                        setActiveView("Dia");
                      }}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className={cn("text-xs font-semibold uppercase", isSameDay(day, new Date()) && "text-theme-primary")}>{isSameDay(day, new Date()) ? "Hoje" : format(day, "EEE", { locale: ptBR })}</span>
                        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-sm", isSameDay(day, new Date()) && "bg-theme-primary text-theme-primary-fg")}>{format(day, "d")}</span>
                      </div>
                      <div className="space-y-1.5">
                        {dayAppointments.slice(0, 3).map((appointment) => renderAppointmentCard(appointment))}
                        {dayAppointments.length > 3 && <p className="text-xs font-medium text-muted-foreground">+{dayAppointments.length - 3} agendamentos</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : activeView === "Lista" ? (
              <div className="p-6">
                <div className="overflow-hidden rounded-md border border-border">
                  {filteredAppointments.length === 0 ? (
                    <div className="flex h-56 flex-col items-center justify-center gap-2 text-muted-foreground">
                      <CalendarDays className="h-8 w-8" />
                      <p className="text-sm">Nenhum agendamento neste período.</p>
                    </div>
                  ) : (
                    filteredAppointments.map((appointment) => {
                      const startDate = getAppointmentDate(appointment);
                      const professional = professionalLabels.get(appointment.professionalId) || appointment.professional;
                      return (
                        <div key={appointment.id} className="grid grid-cols-[120px_1fr_1fr_1fr_120px] gap-4 border-b border-border px-4 py-3 last:border-b-0">
                          <span className="text-sm font-semibold text-foreground">{startDate ? format(startDate, "dd/MM HH:mm") : "--"}</span>
                          <span className="truncate text-sm text-foreground">{appointment.patient}</span>
                          <span className="truncate text-sm text-muted-foreground">{appointment.type || "Sem tipo"}</span>
                          <span className="truncate text-sm text-muted-foreground">{professional}</span>
                          <span className={cn("truncate text-sm font-medium")} style={{ color: getStatusColorHex(appointment.status).base }}>
                            {appointment.status}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className={cn("sticky top-0 z-50 flex border-b border-t border-theme-border bg-theme-bg/85 backdrop-blur-xs", activeView == "Semana" && "min-w-341.5")}>
                  <div className="w-16 flex-shrink-0 border-r border-theme-border" />
                  {visibleDays.map((day) => (
                    <div key={day.toISOString()} className={cn("flex-1 border-r border-theme-border px-2 py-3 text-center last:border-r-0", isSameDay(day, new Date()) && "bg-theme-primary/10")}>
                      <p className={cn("text-xs uppercase", isSameDay(day, new Date()) ? "text-theme-fg font-semibold" : "text-theme-fg/60")}>{format(day, "EEE", { locale: ptBR })}</p>
                      <p className={cn("mt-0.5 text-sm", isSameDay(day, new Date()) ? "font-bold text-theme-fg/90" : "font-medium text-theme-fg/80")}>{format(day, "dd/MM")}</p>
                    </div>
                  ))}
                </div>
                <div className={cn("relative flex min-h-[960px]", activeView == "Semana" && "min-w-341.5")}>
                  <div className="w-16 flex-shrink-0 border-r border-border">
                    {timeSlots.map((hour) => (
                      <div key={hour} className="h-[90px] border-b border-border flex justify-center items-center">
                        <span className="text-xs font-medium text-muted-foreground ">{String(hour).padStart(2, "0")}:00</span>
                      </div>
                    ))}
                  </div>
                  {visibleDays.map((day) => {
                    const dayAppointments = appointmentsByDay.get(getDateKey(day)) ?? [];
                    const daySelection = selection && getDateKey(selection.day) === getDateKey(day) ? selection : null;
                    const selectionTop = daySelection ? (Math.min(daySelection.startMinute, daySelection.endMinute) - dayStartHour * 60) * correctHeightAspect : 0;
                    const selectionHeight = daySelection ? Math.max(slotStepMinutes, Math.abs(daySelection.endMinute - daySelection.startMinute)) * correctHeightAspect : 0;
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn("relative flex-1 cursor-crosshair border-r border-border last:border-r-0", isSameDay(day, new Date()) && "bg-primary/5")}
                        onMouseDown={(event) => handleGridMouseDown(day, event)}
                        onMouseMove={(event) => handleGridMouseMove(day, event)}
                        onMouseUp={(event) => handleGridMouseUp(day, event)}
                        onMouseLeave={() => {
                          if (daySelection) setSelection(null);
                        }}
                      >
                        {timeSlots.map((hour) => (
                          <div key={hour} className="h-[90px] border-b border-border" />
                        ))}
                        {daySelection && <div className="pointer-events-none absolute left-1 right-1 z-10 rounded-md border border-dashed border-primary bg-primary/15" style={{ top: selectionTop, height: selectionHeight }} />}
                        {dayAppointments.map((appointment) => {
                          const style = getAppointmentStyle(appointment);
                          return (
                            <div key={appointment.id} className="absolute left-1 right-1 z-10" style={{ top: style.top, height: style.height }} onMouseDown={(event) => event.stopPropagation()}>
                              {renderAppointmentCard(appointment)}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className={cn("w-72 flex-shrink-0 border-border border-l bg-card p-4", activeView !== "Mês" && activeView !== "Lista" && "border-t")}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Filtros</h3>
            {isLoadingOptions && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <Circle
                    className="h-3 w-3 transition-colors duration-200"
                    style={{
                      fill: currentStatusColor,
                      stroke: currentStatusColor,
                    }}
                  />
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value={allValue}>Todos</SelectItem>
                  {options.status.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full">
                  <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={allValue}>Todos</SelectItem>
                  {options.types.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Profissional</label>
              <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                <SelectTrigger className="w-full">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Selecione o profissional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={allValue}>Todos</SelectItem>
                  {options.professionals.map((professional) => (
                    <SelectItem key={professional.id} value={professional.id}>
                      {professional.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Paciente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={patientFilter}
                  onChange={(event) => setPatientFilter(event.target.value)}
                  placeholder="Buscar paciente..."
                  className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Dialog
        open={!!selectedAppointment}
        onOpenChange={(open) => {
          if (!open) setSelectedAppointment(null);
        }}
      >
        <DialogContent className="max-w-lg">
          {selectedAppointment && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  {selectedAppointment.type || "Agendamento"}
                </DialogTitle>
                <DialogDescription>{selectedAppointment.status}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div
                  className="rounded-md border-l-4 p-4  "
                  style={{
                    backgroundColor: getStatusColorHex(selectedAppointment.status).bg,
                    borderColor: getStatusColorHex(selectedAppointment.status).base,
                    color: getStatusColorHex(selectedAppointment.status).base,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{professionalLabels.get(selectedAppointment.professionalId) || selectedAppointment.professional}</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{selectedAppointment.patient}</p>
                    </div>
                    <span className="rounded-md bg-background/80 px-2 py-1 text-xs font-bold text-foreground">{formatAppointmentTime(selectedAppointment)}</span>
                  </div>
                </div>

                <div className="grid gap-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {getAppointmentDate(selectedAppointment) ? format(getAppointmentDate(selectedAppointment) as Date, "dd/MM/yyyy", { locale: ptBR }) : "--"} · {formatAppointmentTime(selectedAppointment)}
                    </span>
                  </div>
                  {selectedAppointment.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{selectedAppointment.phone}</span>
                    </div>
                  )}
                  {selectedAppointment.attendanceMode && (
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedAppointment.attendanceMode}</span>
                    </div>
                  )}
                </div>

                {selectedAppointment.observations && (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">Observações</p>
                    <p className="mt-1 text-sm text-foreground">{selectedAppointment.observations}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAppointmentDialogOpen} onOpenChange={setIsAppointmentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarPlus className="h-4 w-4 text-primary" />
              Novo agendamento
            </DialogTitle>
            <DialogDescription>{appointmentStartDateTime ? format(new Date(appointmentStartDateTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "Selecione os dados do agendamento."}</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateAppointment}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Status</label>
                <Select value={appointmentStatus} onValueChange={setAppointmentStatus} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.status.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Tipo</label>
                <Select value={appointmentType} onValueChange={setAppointmentType} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.types.map((type) => (
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
                <Select value={appointmentAttendanceMode} onValueChange={setAppointmentAttendanceMode} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Formato" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.attendanceModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Profissional</label>
                <Select value={appointmentProfessionalId} onValueChange={setAppointmentProfessionalId} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.professionals.map((professional) => (
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
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={appointmentPatientSearch}
                  placeholder={selectedAppointmentPatient?.label || "Digite o nome do paciente"}
                  onBlur={() => {
                    window.setTimeout(() => setIsPatientSearchOpen(false), 120);
                  }}
                  onChange={(event) => {
                    setAppointmentPatientSearch(event.target.value);
                    setAppointmentPatientId("");
                    setIsPatientSearchOpen(true);
                  }}
                  onFocus={() => {
                    if (appointmentPatientSearch.trim()) setIsPatientSearchOpen(true);
                  }}
                />
                {isPatientSearchOpen && appointmentPatientSearch.trim() && (
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
                )}
              </div>
              {selectedAppointmentPatient && <p className="text-xs text-muted-foreground">Selecionado: {selectedAppointmentPatient.label}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Observações</label>
              <Textarea className="min-h-20 resize-none" value={appointmentObservations} onChange={(event) => setAppointmentObservations(event.target.value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAppointmentDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingAppointment || !appointmentStatus || !appointmentType || !appointmentAttendanceMode || !appointmentProfessionalId || !appointmentPatientId}>
                {isSavingAppointment && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar agendamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
