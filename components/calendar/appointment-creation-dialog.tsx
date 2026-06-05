import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, normalizeText } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarPlus, Loader2, Search } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { CalendarAppointment } from "./weekly-calendar";

export interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: CalendarAppointment | null;
  startDate?: Date;
  endDate?: Date;
  options: {
    status: string[];
    types: string[];
    attendanceModes: string[];
    patients: Array<{ id: string; label: string }>;
    professionals: { id: string; label: string }[];
  };
  onCreate: (data: FormData) => Promise<void>;
  onUpdate?: (id: string, data: FormData) => Promise<void>;
  isSaving?: boolean;
}

export const AppointmentCreationDialog: React.FC<AppointmentDialogProps> = ({ open, onOpenChange, appointment, startDate, endDate, options, onCreate, onUpdate, isSaving = false }) => {
  const isEdit = Boolean(appointment);

  const [appointmentStatus, setAppointmentStatus] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [appointmentStartDateTime, setAppointmentStartDateTime] = useState("");
  const [appointmentEndDateTime, setAppointmentEndDateTime] = useState("");
  const [appointmentAttendanceMode, setAppointmentAttendanceMode] = useState("");
  const [appointmentProfessionalId, setAppointmentProfessionalId] = useState("");
  const [appointmentPatientId, setAppointmentPatientId] = useState("");
  const [appointmentPatientSearch, setAppointmentPatientSearch] = useState("");
  const [appointmentObservations, setAppointmentObservations] = useState("");

  const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false);
  const selectedAppointmentPatient = useMemo(() => options.patients.find((patient) => patient.id === appointmentPatientId), [appointmentPatientId, options.patients]);
  const patientSearchResults = useMemo(() => {
    const query = normalizeText(appointmentPatientSearch);
    if (!query) return [];

    return options.patients.filter((patient) => normalizeText(patient.label).includes(query)).slice(0, 8);
  }, [appointmentPatientSearch, options.patients]);

  const formatDateTimeLocal = (date?: Date) => {
    if (!date) return "";
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    return localISOTime;
  };

  useEffect(() => {
    if (isEdit && appointment) {
      setAppointmentStatus(appointment.status);
      setAppointmentType(appointment.type);
      setAppointmentStartDateTime(formatDateTimeLocal(startDate));
      setAppointmentEndDateTime(formatDateTimeLocal(endDate));
      setAppointmentAttendanceMode(appointment.attendanceMode);
      setAppointmentProfessionalId(appointment.professionalId);
      setAppointmentPatientId(appointment.patientId ?? "");
      setAppointmentObservations(appointment.observations ?? "");
    } else if (open) {
      setAppointmentStatus("");
      setAppointmentType("");
      setAppointmentStartDateTime(formatDateTimeLocal(startDate));
      setAppointmentEndDateTime(formatDateTimeLocal(endDate));
      setAppointmentAttendanceMode("");
      setAppointmentProfessionalId("");
      setAppointmentPatientId("");
      setAppointmentPatientSearch("");
      setAppointmentObservations("");
    }
  }, [isEdit, appointment, open, startDate, endDate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("status", appointmentStatus);
    formData.append("type", appointmentType);
    formData.append("attendanceMode", appointmentAttendanceMode);
    formData.append("startDateTime", appointmentStartDateTime);
    if (appointmentEndDateTime) formData.append("endDateTime", appointmentEndDateTime);
    formData.append("professionalId", appointmentProfessionalId);
    if (appointmentPatientId) formData.append("patientId", appointmentPatientId);
    if (appointmentObservations) formData.append("observations", appointmentObservations);

    try {
      if (isEdit && appointment && onUpdate) {
        await onUpdate(appointment.id, formData);
      } else {
        await onCreate(formData);
      }
      onOpenChange(false);
    } catch {
      // The parent already displays the API error and keeps the form open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4 text-primary" />
            {isEdit ? "Editar agendamento" : "Novo agendamento"}
          </DialogTitle>
          <DialogDescription>{appointmentStartDateTime ? format(new Date(appointmentStartDateTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "Selecione os dados do agendamento."}</DialogDescription>
        </DialogHeader>

        <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 min-h-0">
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
                <Input type="datetime-local" value={appointmentStartDateTime} onChange={(e) => setAppointmentStartDateTime(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Fim</label>
                <Input type="datetime-local" value={appointmentEndDateTime} onChange={(e) => setAppointmentEndDateTime(e.target.value)} />
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
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Observações</label>
              <Textarea className="min-h-20 resize-none" value={appointmentObservations} onChange={(e) => setAppointmentObservations(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/20 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Salvar alterações" : "Salvar agendamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentCreationDialog;
