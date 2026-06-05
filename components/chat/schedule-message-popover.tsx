import { cn } from "@/lib/utils";
import { CalendarClock, Clock } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

interface ScheduleMessagePopoverProps {
  isSending: boolean;
  attachment: File | null;
  draft: string;
  canSend: boolean;

  onScheduleMessage: (scheduledAt: string) => Promise<void>;
}

function getLocalDateTimeValue(date = new Date(Date.now() + 10 * 60 * 1000)) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

export function ScheduleMessagePopover({ isSending, attachment, draft, canSend, onScheduleMessage }: ScheduleMessagePopoverProps) {
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState(() => getLocalDateTimeValue());

  async function handleScheduleSubmit() {
    const date = new Date(scheduleDateTime);
    setScheduleError(null);

    if (!draft.trim() && !attachment) {
      setScheduleError("Digite uma mensagem ou selecione um anexo.");
      return;
    }

    if (Number.isNaN(date.getTime())) {
      setScheduleError("Escolha uma data valida.");
      return;
    }

    if (date.getTime() < Date.now() + 30000) {
      setScheduleError("Escolha um horario futuro.");
      return;
    }

    setIsScheduling(true);
    try {
      await onScheduleMessage(date.toISOString());
      setIsScheduleOpen(false);
      setScheduleDateTime(getLocalDateTimeValue());
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Não foi possível agendar.");
    } finally {
      setIsScheduling(false);
    }
  }

  return (
    <Popover open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("shrink-0 text-teal-500 hover:text-teal-600", isScheduleOpen && "bg-accent/50 border border-border")}
          disabled={isSending || !canSend}
          aria-label="Agendar mensagem"
          title="Agendar mensagem"
        >
          <Clock className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={12} className="w-80 rounded-md border-border bg-card p-3 shadow-xl">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Agendar mensagem</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{attachment ? attachment.name : draft.trim() || "Mensagem"}</p>
          </div>
          <input
            type="datetime-local"
            value={scheduleDateTime}
            onChange={(event) => setScheduleDateTime(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-teal-500"
          />
          {scheduleError && <p className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-500">{scheduleError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5 transition-colors" onClick={() => setIsScheduleOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" className="bg-teal-500 text-white hover:bg-teal-600" onClick={handleScheduleSubmit} disabled={isScheduling}>
              <CalendarClock className="h-4 w-4" />
              Agendar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

