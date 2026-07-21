"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { generateProcedureSlots, ProfessionalAgenda, WEEKDAYS } from "@/lib/schedule/professional-agenda";
import { cn } from "@/lib/utils";
import type { UseEmblaCarouselType } from "embla-carousel-react";
import { CalendarClock, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import { SkeletonShimmer } from "../ui/skeleton-shimmer";
import { AgendaRulesManagerDialog } from "./agenda-rules-manager";

type AgendaPreviewPayload = {
  agenda: ProfessionalAgenda | null;
  bookedSlotsByDate?: Record<string, string[]>;
  bookedIntervalsByDate?: Record<string, Array<{ start: string; end: string }>>;
  selectedProfessionalId?: string;
  message?: string;
};

type ProfessionalAgendaPreviewProps = {
  professionalId?: string;
};

type CarouselApi = UseEmblaCarouselType[1];

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

function getSlotsForDate(agenda: ProfessionalAgenda, date: string) {
  const weekday = getWeekdayFromIsoDate(date);
  const rule = agenda.rules.find((item) => item.weekday === weekday);
  if (!rule?.isOpen) return [];

  return rule.periods
    .filter((period) => period.enabled)
    .flatMap(generateProcedureSlots)
    .filter((time, index, slots) => slots.indexOf(time) === index)
    .sort();
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

export function ProfessionalAgendaPreview({ professionalId }: ProfessionalAgendaPreviewProps) {
  const { user, isLoading: isLoadingUser } = useCurrentUser();
  const [agenda, setAgenda] = useState<ProfessionalAgenda | null>(null);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState("");
  const [bookedSlotsByDate, setBookedSlotsByDate] = useState<Record<string, string[]>>({});
  const [bookedIntervalsByDate, setBookedIntervalsByDate] = useState<Record<string, Array<{ start: string; end: string }>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const isDoctorCardPreview = Boolean(professionalId);

  const previewDates = useMemo(() => getNextDates(isDoctorCardPreview ? 7 : 14), [isDoctorCardPreview]);

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);

  useEffect(() => {
    if (!user?.email || isLoadingUser) return;

    let isActive = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        email: user.email,
        role: user.role,
      });
      if (professionalId) params.set("professionalId", professionalId);

      setIsLoading(true);

      fetch(`/api/professional-agendas?${params.toString()}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Nao foi possivel carregar a agenda.");
          return (await response.json()) as AgendaPreviewPayload;
        })
        .then((payload) => {
          if (!isActive) return;

          setAgenda(payload.agenda ?? null);
          setSelectedProfessionalId(payload.selectedProfessionalId ?? payload.agenda?.professionalId ?? professionalId ?? "");
          setBookedSlotsByDate(payload.bookedSlotsByDate ?? {});
          setBookedIntervalsByDate(payload.bookedIntervalsByDate ?? {});
        })
        .catch(() => {
          if (!isActive) return;

          setAgenda(null);
          setSelectedProfessionalId("");
          setBookedSlotsByDate({});
          setBookedIntervalsByDate({});
        })
        .finally(() => {
          if (isActive) setIsLoading(false);
        });
    }, 0);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [isLoadingUser, professionalId, user?.email, user?.role]);

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
    return (
      <div className={isDoctorCardPreview ? "" : "flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center"}>
        <p className={isDoctorCardPreview ? "rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[11px] font-medium text-muted-foreground" : "text-sm font-medium text-muted-foreground"}>Agenda ainda nao criada.</p>
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
                          const isBooked = isSlotBooked(slot, bookedSlots, bookedIntervals);

                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={isBooked}
                              className={
                                isBooked
                                  ? "block w-full cursor-not-allowed rounded-lg border border-rose-200 bg-rose-50/50 py-1.5 text-center text-[11px] font-semibold text-rose-700 line-through opacity-70"
                                  : "block w-full rounded-lg border border-theme-primary/15 bg-theme-primary/10 py-1.5 text-center text-[11px] font-semibold text-theme-primary transition-all hover:bg-theme-primary hover:text-white"
                              }
                              title={isBooked ? "Horario ocupado" : "Horario disponivel"}
                            >
                              {slot}
                              {!isDoctorCardPreview && isBooked ? " ocupado" : ""}
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

      {isDialogOpen && <AgendaRulesManagerDialog professionalId={selectedProfessionalId || professionalId} open={isDialogOpen} onOpenChange={setIsDialogOpen} />}
    </div>
  );
}
