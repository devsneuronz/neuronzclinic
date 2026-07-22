"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import type { IaRequest } from "@/lib/ia-request";
import { generateProcedureSlots, ProfessionalAgenda, WEEKDAYS } from "@/lib/professional-schedule";
import { cn } from "@/lib/utils";
import type { UseEmblaCarouselType } from "embla-carousel-react";
import { CalendarClock, ChevronLeft, ChevronRight, Lock, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import { SkeletonShimmer } from "../ui/skeleton-shimmer";
import { ScheduleRulesManagerDialog } from "./schedule-rules-manager";

type PreviewSlot = {
  time: string;
  procedureName: string;
  color: string;
};

type AgendaPreviewPayload = {
  agenda: ProfessionalAgenda | null;
  bookedSlotsByDate?: Record<string, string[]>;
  bookedIntervalsByDate?: Record<string, Array<{ start: string; end: string }>>;
  selectedProfessionalId?: string;
  canCreateAgenda?: boolean;
  canEditAgenda?: boolean;
  message?: string;
};

type ProfessionalAgendaPreviewProps = {
  professionalId?: string;
};

type CarouselApi = UseEmblaCarouselType[1];

function isActiveIaRequestStatus(status: string) {
  const normalized = status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return !["confirmed", "confirmado", "done", "completed", "resolved", "resolvido", "concluido", "concluído", "canceled", "cancelled", "cancelado"].includes(normalized);
}

function getLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextDates(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return getLocalIsoDate(date);
  });
}

function getWeekdayFromIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

function isHexColor(value?: string) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "");
}

function getSlotColor(color?: string) {
  return isHexColor(color) ? (color as string) : "#0d9488";
}

function getSlotsForDate(agenda: ProfessionalAgenda, date: string): PreviewSlot[] {
  const weekday = getWeekdayFromIsoDate(date);
  const rule = agenda.rules.find((item) => item.weekday === weekday);
  if (!rule?.isOpen) return [];

  const slotsByTime = new Map<string, PreviewSlot>();

  for (const period of rule.periods.filter((item) => item.enabled)) {
    for (const time of generateProcedureSlots(period)) {
      if (slotsByTime.has(time)) continue;
      slotsByTime.set(time, {
        time,
        procedureName: period.procedureName,
        color: getSlotColor(period.procedureColor),
      });
    }
  }

  return Array.from(slotsByTime.values()).sort((a, b) => a.time.localeCompare(b.time));
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "");
}

function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${date}T12:00:00`));
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function isSlotBooked(slot: string, bookedSlots: Set<string>, bookedIntervals: Array<{ start: string; end: string }>) {
  if (bookedSlots.has(slot)) return true;

  const slotMinute = timeToMinutes(slot);
  return bookedIntervals.some((interval) => {
    const start = timeToMinutes(interval.start);
    const end = timeToMinutes(interval.end);
    return Number.isFinite(start) && Number.isFinite(end) && slotMinute >= start && slotMinute < end;
  });
}

function localDateAndTimeFromIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function mergeIaRequestBookedSlots({
  requests,
  agendaId,
  bookedSlotsByDate,
  bookedIntervalsByDate,
}: {
  requests: IaRequest[];
  agendaId: string;
  bookedSlotsByDate: Record<string, string[]>;
  bookedIntervalsByDate: Record<string, Array<{ start: string; end: string }>>;
}) {
  const nextSlots = { ...bookedSlotsByDate };
  const nextIntervals = { ...bookedIntervalsByDate };

  for (const request of requests) {
    if (!request.chosenDate || request.professionalScheduleId !== agendaId || !isActiveIaRequestStatus(request.status)) continue;

    const local = localDateAndTimeFromIso(request.chosenDate);
    if (!local?.date || !local.time) continue;

    nextSlots[local.date] = Array.from(new Set([...(nextSlots[local.date] ?? []), local.time]));
    nextIntervals[local.date] = nextIntervals[local.date] ?? [];
  }

  return { bookedSlotsByDate: nextSlots, bookedIntervalsByDate: nextIntervals };
}

export function ProfessionalSchedulePreview({ professionalId }: ProfessionalAgendaPreviewProps) {
  const { user, isLoading: isLoadingUser } = useCurrentUser();
  const [agenda, setAgenda] = useState<ProfessionalAgenda | null>(null);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState("");
  const [bookedSlotsByDate, setBookedSlotsByDate] = useState<Record<string, string[]>>({});
  const [bookedIntervalsByDate, setBookedIntervalsByDate] = useState<Record<string, Array<{ start: string; end: string }>>>({});
  const [canCreateAgenda, setCanCreateAgenda] = useState(false);
  const [canEditAgenda, setCanEditAgenda] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const isDoctorCardPreview = Boolean(professionalId);

  const previewDates = useMemo(() => getNextDates(isDoctorCardPreview ? 7 : 14), [isDoctorCardPreview]);

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);
  const loadAgenda = useCallback(() => {
    if (!user?.email || isLoadingUser) return;

    let isActive = true;
    const params = new URLSearchParams({
      email: user.email,
      role: user.role,
    });
    if (professionalId) params.set("professionalId", professionalId);

    setIsLoading(true);

    fetch(`/api/professional-schedule?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel carregar a agenda.");
        return (await response.json()) as AgendaPreviewPayload;
      })
      .then((payload) => {
        if (!isActive) return;

        setAgenda(payload.agenda ?? null);
        setSelectedProfessionalId(payload.selectedProfessionalId ?? payload.agenda?.professionalId ?? professionalId ?? "");
        setCanCreateAgenda(Boolean(payload.canCreateAgenda));
        setCanEditAgenda(Boolean(payload.canEditAgenda));

        const agendaId = payload.agenda?.id ?? "";
        const baseBookedSlots = payload.bookedSlotsByDate ?? {};
        const baseBookedIntervals = payload.bookedIntervalsByDate ?? {};
        setBookedSlotsByDate(baseBookedSlots);
        setBookedIntervalsByDate(baseBookedIntervals);
        if (!agendaId) {
          return;
        }

        const iaParams = new URLSearchParams({
          email: user.email,
          role: user.role,
        });
        if (user.id) iaParams.set("userId", user.id);

        fetch(`/api/ia-requests?${iaParams.toString()}`, { cache: "no-store" })
          .then(async (response) => (response.ok ? ((await response.json()) as { requests?: IaRequest[] }) : { requests: [] }))
          .then((iaPayload) => {
            if (!isActive) return;
            const merged = mergeIaRequestBookedSlots({
              requests: Array.isArray(iaPayload.requests) ? iaPayload.requests : [],
              agendaId,
              bookedSlotsByDate: baseBookedSlots,
              bookedIntervalsByDate: baseBookedIntervals,
            });
            setBookedSlotsByDate(merged.bookedSlotsByDate);
            setBookedIntervalsByDate(merged.bookedIntervalsByDate);
          })
          .catch(() => {
            if (!isActive) return;
            setBookedSlotsByDate(baseBookedSlots);
            setBookedIntervalsByDate(baseBookedIntervals);
          });
      })
      .catch(() => {
        if (!isActive) return;

        setAgenda(null);
        setSelectedProfessionalId("");
        setBookedSlotsByDate({});
        setBookedIntervalsByDate({});
        setCanCreateAgenda(false);
        setCanEditAgenda(false);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [isLoadingUser, professionalId, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadAgenda();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadAgenda]);

  function handleDialogOpenChange(open: boolean) {
    setIsDialogOpen(open);
    if (!open) {
      window.setTimeout(() => loadAgenda(), 0);
    }
  }

  if (isLoadingUser || isLoading) {
    const skeletonDays = Array.from({ length: isDoctorCardPreview ? 3 : 6 }, (_, i) => i + 1);
    const skeletonSlots = Array.from({ length: 12 }, (_, i) => i + 1);

    return (
      <div className={isDoctorCardPreview ? "space-y-2 rounded-3xl border border-border/60 bg-background/70 p-3" : "flex min-h-0 w-full flex-col gap-4"}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SkeletonShimmer className="h-4 w-4 rounded-full" />
            <SkeletonShimmer className="h-4 w-32 rounded-md" />
          </div>
          <SkeletonShimmer className={isDoctorCardPreview ? "h-7 w-7 rounded-tr-xl" : "h-9 w-24 rounded-tr-xl"} />
        </div>

        <div className={isDoctorCardPreview ? "min-w-0 w-full rounded-xl border border-border bg-background p-3 shadow-sm" : "min-w-0 w-full rounded-xl border border-border bg-background p-4 shadow-sm"}>
          <div className="mb-3 flex items-center justify-center">
            <div className="flex items-center gap-3">
              <SkeletonShimmer className="h-7 w-7 rounded-md" />
              <SkeletonShimmer className="h-4 w-28 rounded-md" />
              <SkeletonShimmer className="h-7 w-7 rounded-md" />
            </div>
          </div>

          <Carousel opts={{ align: "start" }} className="w-full">
            <CarouselContent className="-ml-3">
              {skeletonDays.map((index) => (
                <CarouselItem key={index} className={isDoctorCardPreview ? "basis-1/3 pl-3" : "basis-1/2 sm:basis-1/4 lg:basis-1/6 pl-3"}>
                  <div className="flex min-w-0 flex-col items-center gap-1.5">
                    <SkeletonShimmer className="h-3 w-10 rounded-sm" />
                    <SkeletonShimmer className="mb-2 h-3 w-8 rounded-sm" />
                    <div className={cn("w-full space-y-1.5  pr-1", isDoctorCardPreview ? "h-20" : "h-[calc(100dvh-482px)]")}>
                      {skeletonSlots.map((slotIndex) => (
                        <SkeletonShimmer key={slotIndex} className="block h-7.5 w-full rounded-lg" />
                      ))}
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      </div>
    );
  }

  if (!agenda?.id) {
    const canStartAgenda = canCreateAgenda || canEditAgenda;

    return (
      <div className={isDoctorCardPreview ? "space-y-2" : "flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center"}>
        <p className={isDoctorCardPreview ? "rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[11px] font-medium text-muted-foreground" : "text-sm font-medium text-muted-foreground"}>Agenda ainda nao criada.</p>
        {canStartAgenda ? (
          <Button
            type="button"
            variant={isDoctorCardPreview ? "outline" : "primary"}
            size={isDoctorCardPreview ? "sm" : "default"}
            className={isDoctorCardPreview ? "h-8 w-full gap-1.5 text-[11px]" : "gap-2"}
            onClick={() => setIsDialogOpen(true)}
          >
            <Settings className="h-3.5 w-3.5" />
            Criar agenda
          </Button>
        ) : null}
        {isDialogOpen && <ScheduleRulesManagerDialog professionalId={selectedProfessionalId || professionalId} open={isDialogOpen} onOpenChange={handleDialogOpenChange} />}
      </div>
    );
  }

  return (
    <div className={isDoctorCardPreview ? "space-y-2 rounded-3xl border border-border/60 bg-background/70 p-3" : "flex min-h-0 w-full flex-col gap-4"}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={isDoctorCardPreview ? "inline-flex min-w-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70" : "inline-flex min-w-0 items-center gap-2 text-base font-semibold text-foreground"}
        >
          <CalendarClock className="h-3 w-3 shrink-0" />
          {isDoctorCardPreview ? "Agenda IA" : agenda.professionalName}
        </span>
        <div className="flex items-center gap-2">
          {agenda.status !== "active" && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">Inativa</span>}
          <Button
            type="button"
            variant={isDoctorCardPreview ? "ghost" : "outline"}
            size={isDoctorCardPreview ? "icon-sm" : "sm"}
            className={isDoctorCardPreview ? "h-7 w-7 rounded-tr-xl" : "gap-2 "}
            onClick={() => setIsDialogOpen(true)}
            title="Configurar agenda"
          >
            <Settings className="h-3.5 w-3.5" />
            {!isDoctorCardPreview && "Configurar"}
          </Button>
        </div>
      </div>

      <div className={isDoctorCardPreview ? "min-w-0 w-full rounded-xl border border-border bg-background p-3 shadow-sm" : "min-w-0 w-full rounded-xl border border-border bg-background p-4 shadow-sm"}>
        <div className="mb-3 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <button type="button" onClick={scrollPrev} className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted" aria-label="Voltar dias">
              <ChevronLeft className="h-4 w-4 stroke-[2.5]" />
            </button>
            <p className="text-sm font-bold text-foreground">Horarios disponiveis</p>
            <button type="button" onClick={scrollNext} className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted" aria-label="Avancar dias">
              <ChevronRight className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        <Carousel
          setApi={setApi}
          opts={{
            align: "start",
            slidesToScroll: isDoctorCardPreview ? 3 : 4,
            containScroll: "trimSnaps",
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-3">
            {previewDates.map((date) => {
              const slots = getSlotsForDate(agenda, date);
              const bookedSlots = new Set(bookedSlotsByDate[date] ?? []);
              const bookedIntervals = bookedIntervalsByDate[date] ?? [];

              return (
                <CarouselItem key={date} className={isDoctorCardPreview ? "basis-1/3 pl-3" : "basis-1/2 sm:basis-1/4 lg:basis-1/6 pl-3"}>
                  <div className="flex min-w-0 flex-col items-center">
                    <p className="truncate text-center text-xs font-bold capitalize leading-tight text-foreground pr-4">{formatDayLabel(date)}</p>
                    <p className="mb-2 text-center text-[11px] font-medium text-muted-foreground pr-4">{formatDateLabel(date)}</p>

                    <div className={cn("w-full space-y-1.5 overflow-y-auto custom-scrollbar pr-1 scrollbar-gutter-stable", isDoctorCardPreview ? "h-20" : "h-[calc(100dvh-482px)]")}>
                      {slots.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border py-1.5 text-center text-xs font-medium text-muted-foreground">--</div>
                      ) : (
                        slots.map((slot) => {
                          const isBooked = isSlotBooked(slot.time, bookedSlots, bookedIntervals);

                          return (
                            <button
                              key={slot.time}
                              type="button"
                              disabled={isBooked}
                              className={cn(
                                "relative flex items-center justify-center gap-1 w-full rounded-lg py-1.5 text-center text-[11px] font-semibold transition-all duration-200 border",
                                isBooked ? "cursor-not-allowed text-muted-foreground/60 select-none line-through opacity-35" : "active:scale-[0.98]",
                              )}
                              style={{
                                borderColor: `${slot.color}40`,
                                backgroundColor: `${slot.color}1a`,
                                color: slot.color,
                              }}
                              title={isBooked ? "Horário ocupado" : `${slot.procedureName} disponível`}
                            >
                              {!isDoctorCardPreview && isBooked && <Lock className="h-3 w-3 text-muted-foreground/40 shrink-0" />}

                              <span>{slot.time}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
      </div>

      {isDialogOpen && <ScheduleRulesManagerDialog professionalId={selectedProfessionalId || professionalId} open={isDialogOpen} onOpenChange={handleDialogOpenChange} />}
    </div>
  );
}
