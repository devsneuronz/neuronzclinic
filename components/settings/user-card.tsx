"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { FolderKanban, HardHat, Loader2, Mail, Pencil, Shield, User } from "lucide-react";
import { useMemo, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { Sector } from "./sectors-manager";

export type SettingsUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "user";
  tags?: string[];
  sectorIds: string[];
  tagIds: string[];
};

interface UserCardProps {
  user: SettingsUser;
  sectors: Sector[];
  onUpdated: (user: SettingsUser) => void;
}

export function UserCard({ user, sectors, onUpdated }: UserCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(user.sectorIds);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleTags = user.tags!.slice(0, 3);
  const hiddenTags = user.tags!.slice(3);

  const sectorMap = useMemo(() => Object.fromEntries(sectors.map((sector) => [sector.name, sector])), [sectors]);

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/airtable/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, sectorIds: selectedIds }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Não foi possível atualizar o usuário.");
      onUpdated({ ...user, sectorIds: selectedIds, tags: sectors.filter((sector) => selectedIds.includes(sector.id)).map((sector) => sector.name) });
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o usuário.");
    } finally {
      setIsSaving(false);
    }
  }
  return (
    <Card className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs hover:shadow-md hover:border-border transition-all duration-200 group pt-6 pb-0 gap-2">
      <CardHeader className="flex flex-col">
        <div className="w-full h-16 rounded-md bg-linear-to-tr to-theme-primary/80"></div>
        <div className="flex flex-row items-center gap-2 space-y-0 -mt-8 w-full px-2">
          <Avatar className="h-11 w-11 rounded-full bg-[var(--sidebar-custom-primary)] text-[var(--sidebar-custom-primary-fg)] font-semibold shadow-xs">
            <AvatarFallback className="rounded-xl bg-transparent">{getAvatarInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 items-center justify-between gap-2 w-full">
            <CardTitle title={user.name} className="min-w-0 flex-1 truncate text-base font-semibold">
              {user.name}
            </CardTitle>
            <div className="shrink-0 flex items-center px-2 py-1 text-[11px] font-medium text-muted-foreground bg-muted rounded-md">
              {user.role === "admin" && (
                <div className="inline-flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Admin
                </div>
              )}
              {user.role === "manager" && (
                <div className="inline-flex items-center gap-1">
                  <HardHat className="h-3 w-3" />
                  Manager
                </div>
              )}
              {user.role === "user" && (
                <div className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Usuário
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-2 space-y-3 flex-1">
        <div className="rounded-xl bg-muted/30 p-3 border border-border/40 space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Mail className="h-3 w-3" />
            E-mail
          </span>
          <p className="break-all text-xs font-medium text-foreground/90">{user.email}</p>
        </div>
      </CardContent>

      <div className="mt-auto border-t border-border/60 bg-muted/30 px-5 py-4 space-y-3 h-24.75">
        <div className="flex items-center justify-between gap-2 h-7">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase flex items-center gap-1.5">
            <FolderKanban className="h-3.5 w-3.5 opacity-70" />
            Setores sob responsabilidade
          </span>
          {/^rec[a-zA-Z0-9]+$/.test(user.id) && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={() => {
                setSelectedIds(user.sectorIds);
                setIsOpen(true);
              }}
              aria-label={`Editar setores de ${user.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {user.tags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleTags.map((tag) => {
              const sector = sectorMap[tag];

              return (
                <span
                  key={`${user.email}-${tag}`}
                  className="inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: `${sector?.color}50`,
                    borderColor: sector?.color,
                  }}
                >
                  {tag}
                </span>
              );
            })}

            {hiddenTags.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="rounded-full">
                      +{hiddenTags.length}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="p-2 rounded-full">
                    <div className="flex gap-1">
                      {hiddenTags.map((tag) => {
                        const sector = sectorMap[tag];

                        return (
                          <Badge
                            key={tag}
                            className="rounded-full border"
                            style={{
                              backgroundColor: `${sector?.color}50`,
                              borderColor: sector?.color,
                            }}
                          >
                            {tag}
                          </Badge>
                        );
                      })}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/80 italic">Nenhum setor atribuído até o momento</p>
        )}
      </div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setores de {user.name}</DialogTitle>
            <DialogDescription>Escolha os setores sob responsabilidade deste usuário.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-80 gap-2 overflow-y-auto">
            {sectors.map((sector) => (
              <label key={sector.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(sector.id)}
                  onChange={() => setSelectedIds((current) => (current.includes(sector.id) ? current.filter((id) => id !== sector.id) : [...current, sector.id]))}
                  className="size-4 accent-primary"
                />
                <span className="size-3 rounded-full" style={{ backgroundColor: sector.color }} />
                <span className="text-sm font-medium">{sector.name}</span>
              </label>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
