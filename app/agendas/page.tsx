import type { Metadata } from "next";
import { WeeklyCalendar } from "@/components/calendar/weekly-calendar";

export const metadata: Metadata = {
  title: "Agenda",
};

export default function AgendasPage() {
  return (
    <div className="flex h-screen">
      <WeeklyCalendar />
    </div>
  );
}

