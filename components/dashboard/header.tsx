"use client"

import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function Header({ onCreateAppointment }: { onCreateAppointment?: () => void }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      {/* Title */}
      <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Procurar paciente, agendamento..."
            className="w-80 bg-secondary pl-9 text-sm"
          />
        </div>

        {/* New Appointment */}
        <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={onCreateAppointment}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Agendamento</span>
        </Button>
      </div>
    </header>
  )
}
