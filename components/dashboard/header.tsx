"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function Header({ onCreateAppointment }: { onCreateAppointment?: () => void }) {
  return (
    <header className="flex h-15.25 items-center justify-between border-b border-border bg-card px-6 ">
      <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>

      <div className="flex items-center gap-4">
        <Button className="gap-2 bg-theme-primary text-white primary-foreground hover:bg-theme-primary/90" onClick={onCreateAppointment}>
          <Plus className="h-4 w-4" />
          Novo Agendamento
        </Button>
      </div>
    </header>
  );
}
