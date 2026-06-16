import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, normalizeText } from "@/lib/utils";
import { Search } from "lucide-react";
import React, { useMemo, useState } from "react";
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
  initialPatient?: { id: string; label: string } | null;
}

export const AppointmentCreationDialog: React.FC<AppointmentDialogProps> = ({ options }) => {
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

  return (
    <Dialog>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col p-0 overflow-hidden">
        <form className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 min-h-0">
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
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentCreationDialog;
