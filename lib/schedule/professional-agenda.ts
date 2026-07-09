export type WeekdayName = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

export type ProfessionalAgendaStatus = "active" | "inactive";

export type ProfessionalSchedulePeriod = {
  id: string;
  procedureId: string;
  procedureName: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
};

export type ProfessionalScheduleRule = {
  id: string;
  weekday: WeekdayName;
  isOpen: boolean;
  periods: ProfessionalSchedulePeriod[];
};

export type ProfessionalAgenda = {
  id: string | null;
  professionalId: string;
  professionalName: string;
  professionalEmail: string;
  status: ProfessionalAgendaStatus;
  rules: ProfessionalScheduleRule[];
};

export type ProfessionalAgendaProcedure = {
  id: string;
  name: string;
  status: string;
};

export const WEEKDAYS: WeekdayName[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export const WEEKDAY_LABELS: Record<WeekdayName, string> = {
  sunday: "Domingo",
  monday: "Segunda-feira",
  tuesday: "Terca-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sabado",
};

export function timeToMinutes(time: string) {
  const [hourText = "0", minuteText = "0"] = time.slice(0, 5).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return hour * 60 + minute;
}

export function minutesToTime(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function generateProcedureSlots(period: Pick<ProfessionalSchedulePeriod, "enabled" | "startTime" | "endTime" | "slotDurationMinutes">) {
  if (!period.enabled) return [];

  const start = timeToMinutes(period.startTime);
  const end = timeToMinutes(period.endTime);
  const duration = Number(period.slotDurationMinutes);

  if (!Number.isFinite(duration) || duration <= 0 || start >= end) return [];

  const slots: string[] = [];
  for (let current = start; current + duration <= end; current += duration) {
    slots.push(minutesToTime(current));
  }

  return slots;
}

export function createDefaultRules(): ProfessionalScheduleRule[] {
  return WEEKDAYS.map((weekday, index) => ({
    id: `new-${weekday}`,
    weekday,
    isOpen: index >= 1 && index <= 5,
    periods: [],
  }));
}
