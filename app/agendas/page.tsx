import { WeeklyCalendar } from "@/components/calendar/weekly-calendar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agenda",
};

export default function AgendasPage() {
  return (
    <div className="flex h-full">
      <WeeklyCalendar />
    </div>
  );
}
