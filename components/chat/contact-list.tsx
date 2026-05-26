"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { CHAT_DRAFT_CHANGED_EVENT, CHAT_DRAFT_STORAGE_PREFIX, readChatDraft, type ChatDraftChangedDetail } from "@/lib/chat-drafts";
import { getChatStatusColor, getChatStatusLabel } from "@/lib/chat-status";
import { getChatTags, getReadableTextColor } from "@/lib/chat-tags";
import { ChatRecord, LatestMessageStatus } from "@/lib/supabase-rest";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronUp, Feather, FilterX, HatGlasses, Loader2, Search, Send, SquarePlus } from "lucide-react";
import type { FormEvent, UIEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { MessageStatusIcon } from "./message-status-icon";

interface ContactListProps {
  chats: ChatRecord[];
  search: string;
  isLoadingMessages?: boolean;
  isLoadingMore?: boolean;
  isSearching?: boolean;
  hasMore?: boolean;
  selectedId?: string;
  latestMessageStatuses?: Record<string, LatestMessageStatus>;
  onSearchChange?: (value: string) => void;
  onSelect?: (id: string) => void;
  onLoadMore?: () => void;
  onCreateContact?: (input: { name: string; phone: string; message: string }) => Promise<void>;

  isSignatureMode: boolean;
  onToggleAssinatura: (checked: boolean) => void;
  isGhostMode: boolean;
  onToggleGhost: (checked: boolean) => void;
  canUseAdminChatModes?: boolean;

  isMobile?: boolean;
}

const ALL_FILTERS = "all";
const scopeTabs = [
  { id: "all", label: "Todos" },
  { id: "ia", label: "Chats IA" },
  { id: "mine", label: "Meus Chats" },
] as const;
const stateTabs = [
  { id: "entrada", label: "Entrada" },
  { id: "aguardando", label: "Aguardando" },
  { id: "finalizados", label: "Finalizados" },
] as const;

type ScopeTab = (typeof scopeTabs)[number]["id"];
type StateTab = (typeof stateTabs)[number]["id"];

function getDisplayName(chat: ChatRecord) {
  return chat.nome_contato || chat.pushname || chat.chat_id?.replace("@s.whatsapp.net", "") || "Contato sem nome";
}

function getTime(chat: ChatRecord) {
  if (chat.last_message_time) {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(chat.last_message_time));
  }

  return chat.last_time_formatado ?? "";
}

function getFilterValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(getFilterValues);
  }

  if (typeof value === "object") {
    const source = "fields" in value && value.fields && typeof value.fields === "object" ? value.fields : value;
    const record = source as Record<string, unknown>;
    const candidate = record.Nome || record.nome || record.Name || record.name || record.label || record.Setor || record.setor;

    return getFilterValues(candidate);
  }

  return [];
}

function getUniqueOptions(values: unknown[]) {
  return Array.from(new Set(values.flatMap(getFilterValues))).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function getSectorIds(value: unknown) {
  return getFilterValues(value).filter((sector) => /^rec[a-zA-Z0-9]+$/.test(sector));
}

function getSectorLabel(id: string, labels: Record<string, string>) {
  return labels[id] || id;
}

export function ContactList({
  chats,
  search,
  isLoadingMore,
  isSearching,
  hasMore,
  selectedId,
  latestMessageStatuses = {},
  onSearchChange,
  onSelect,
  onLoadMore,
  onCreateContact,
  isSignatureMode,
  onToggleAssinatura,
  isGhostMode,
  onToggleGhost,
  canUseAdminChatModes = false,
  isMobile,
}: ContactListProps) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTERS);
  const [tagFilter, setTagFilter] = useState(ALL_FILTERS);
  const [sectorFilter, setSectorFilter] = useState(ALL_FILTERS);
  const [scopeTab, setScopeTab] = useState<ScopeTab>("all");
  const [stateTab, setStateTab] = useState<StateTab>("entrada");
  const [sectorLabels, setSectorLabels] = useState<Record<string, string>>({});
  const [sectorCatalog, setSectorCatalog] = useState<string[]>([]);
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>({});
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactMessage, setNewContactMessage] = useState("");
  const [newContactError, setNewContactError] = useState("");
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const autoLoadKeyRef = useRef("");

  const statusOptions = useMemo(() => getUniqueOptions(chats.map(getChatStatusLabel)), [chats]);
  const tagOptions = useMemo(() => getUniqueOptions(chats.flatMap((chat) => getChatTags(chat).map((tag) => tag.label))), [chats]);
  const sectorIds = useMemo(() => Array.from(new Set(chats.flatMap((chat) => getSectorIds(chat.setor)))), [chats]);
  const sectorOptions = useMemo(() => (sectorCatalog.length > 0 ? sectorCatalog : getUniqueOptions(sectorIds.map((id) => getSectorLabel(id, sectorLabels)))), [sectorCatalog, sectorIds, sectorLabels]);

  const hasActiveFilters = statusFilter !== ALL_FILTERS || tagFilter !== ALL_FILTERS || sectorFilter !== ALL_FILTERS;

  const { user, isLoading } = useCurrentUser();
  const userName = user?.name ?? "Usuário";

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDraftsByChatId((current) => {
        const next = { ...current };

        for (const chat of chats) {
          const draft = readChatDraft(chat.chat_id, chat.draft ?? "");
          if (draft.trim()) {
            next[chat.chat_id] = draft;
          } else {
            delete next[chat.chat_id];
          }
        }

        return next;
      });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [chats]);

  useEffect(() => {
    function handleDraftChanged(event: Event) {
      const detail = (event as CustomEvent<ChatDraftChangedDetail>).detail;
      if (!detail?.chatId) return;

      setDraftsByChatId((current) => {
        if (detail.draft.trim()) {
          return { ...current, [detail.chatId]: detail.draft };
        }

        const next = { ...current };
        delete next[detail.chatId];
        return next;
      });
    }

    function handleStorage(event: StorageEvent) {
      if (!event.key?.startsWith(CHAT_DRAFT_STORAGE_PREFIX)) return;

      const chatId = event.key.slice(CHAT_DRAFT_STORAGE_PREFIX.length);
      setDraftsByChatId((current) => {
        if (event.newValue?.trim()) {
          return { ...current, [chatId]: event.newValue };
        }

        const next = { ...current };
        delete next[chatId];
        return next;
      });
    }

    window.addEventListener(CHAT_DRAFT_CHANGED_EVENT, handleDraftChanged);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CHAT_DRAFT_CHANGED_EVENT, handleDraftChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/airtable/sectors")
      .then((response) => response.json() as Promise<{ labels?: Record<string, string>; sectors?: string[] }>)
      .then((data) => {
        if (!isMounted) return;
        setSectorLabels((current) => ({ ...current, ...(data.labels ?? {}) }));
        setSectorCatalog(data.sectors ?? []);
      })
      .catch(() => {
        if (!isMounted) return;
        setSectorCatalog([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const missingSectorIds = sectorIds.filter((id) => !sectorLabels[id]);

    if (missingSectorIds.length === 0) return;

    let isMounted = true;

    fetch(`/api/airtable/sectors?ids=${encodeURIComponent(missingSectorIds.join(","))}`)
      .then((response) => response.json() as Promise<{ labels?: Record<string, string>; sectors?: string[] }>)
      .then((data) => {
        if (!isMounted) return;
        setSectorLabels((current) => ({
          ...current,
          ...Object.fromEntries(missingSectorIds.map((id) => [id, id])),
          ...(data.labels ?? {}),
        }));
        if (data.sectors?.length) setSectorCatalog(data.sectors);
      })
      .catch(() => {
        if (!isMounted) return;
        setSectorLabels((current) => ({
          ...current,
          ...Object.fromEntries(missingSectorIds.map((id) => [id, current[id] || id])),
        }));
      });

    return () => {
      isMounted = false;
    };
  }, [sectorIds, sectorLabels]);

  const filteredChats = useMemo(() => {
    return chats.filter((chat) => {
      if (statusFilter !== ALL_FILTERS && getChatStatusLabel(chat) !== statusFilter) return false;
      if (
        sectorFilter !== ALL_FILTERS &&
        !getSectorIds(chat.setor)
          .map((id) => getSectorLabel(id, sectorLabels))
          .includes(sectorFilter)
      ) {
        return false;
      }
      if (tagFilter !== ALL_FILTERS && !getChatTags(chat).some((tag) => tag.label === tagFilter)) return false;

      return true;
    });
  }, [chats, sectorFilter, sectorLabels, statusFilter, tagFilter]);

  const visibleChats = useMemo(() => {
    const stateFilteredChats = filteredChats.filter((chat) => {
      if (scopeTab === "ia" && chat.ia_responde !== true) return false;
      if (scopeTab === "mine" && chat.ia_responde === true) return false;
      if (scopeTab === "all") return true;

      if (stateTab === "finalizados") return chat.finalizada === true;
      if (chat.finalizada === true) return false;
      if (stateTab === "aguardando") return chat.last_message_fromMe === true;

      return chat.last_message_fromMe !== true;
    });

    return stateFilteredChats;
  }, [filteredChats, scopeTab, stateTab]);

  const tabCounts = useMemo(() => {
    const counts = {
      aguardando: 0,
      entrada: 0,
      finalizados: 0,
    };

    const chatsInScope = filteredChats.filter((chat) => {
      if (scopeTab === "ia" && chat.ia_responde !== true) return false;
      if (scopeTab === "mine" && chat.ia_responde === true) return false;
      return true;
    });

    chatsInScope.forEach((chat) => {
      if (chat.finalizada === true) {
        counts.finalizados += 1;
      } else if (chat.last_message_fromMe === true) {
        counts.aguardando += 1;
      } else {
        counts.entrada += 1;
      }
    });

    return counts;
  }, [filteredChats, scopeTab]);

  function clearFilters() {
    setStatusFilter(ALL_FILTERS);
    setTagFilter(ALL_FILTERS);
    setSectorFilter(ALL_FILTERS);
  }

  function resetNewContactForm() {
    setNewContactName("");
    setNewContactPhone("");
    setNewContactMessage("");
    setNewContactError("");
  }

  async function handleCreateContactSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newContactName.trim();
    const phone = newContactPhone.trim();
    const message = newContactMessage.trim();

    if (!phone) {
      setNewContactError("Informe o telefone do contato.");
      return;
    }

    if (!message) {
      setNewContactError("Digite a primeira mensagem.");
      return;
    }

    setIsCreatingContact(true);
    setNewContactError("");

    try {
      await onCreateContact?.({ name, phone, message });
      setIsNewContactOpen(false);
      resetNewContactForm();
    } catch (error) {
      setNewContactError(error instanceof Error ? error.message : "Não foi possível adicionar o contato.");
    } finally {
      setIsCreatingContact(false);
    }
  }

  function handleListScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceFromBottom < 160 && hasMore && !isLoadingMore) {
      onLoadMore?.();
    }
  }

  useEffect(() => {
    if (!hasMore || isLoadingMore || isLoading || isSearching) return;

    const frameId = window.requestAnimationFrame(() => {
      const target = listScrollRef.current;
      if (!target) return;

      const hasFilledVisibleArea = target.scrollHeight > target.clientHeight + 24;
      if (!hasFilledVisibleArea) {
        const autoLoadKey = [chats.length, visibleChats.length, scopeTab, stateTab, statusFilter, tagFilter, sectorFilter].join("|");
        if (autoLoadKeyRef.current === autoLoadKey) return;

        autoLoadKeyRef.current = autoLoadKey;
        onLoadMore?.();
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [chats.length, hasMore, isLoading, isLoadingMore, isSearching, onLoadMore, scopeTab, sectorFilter, stateTab, statusFilter, tagFilter, visibleChats.length]);

  return (
    <div className={cn("flex h-full shrink-0 flex-col border-r border-border bg-card", isMobile ? "w-full" : "w-[340px]")}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-gradient-to-br from-teal-600 to-teal-800 text-xs text-white">P</AvatarFallback>
        </Avatar>
        <span className="font-medium text-foreground whitespace-nowrap">{isLoading ? "Carregando usuário..." : userName}</span>

        {canUseAdminChatModes && (
        <div className="ml-auto flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center ">
                  <Feather className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                  <Switch className="scale-75" checked={isSignatureMode} onCheckedChange={onToggleAssinatura} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                <p className="text-xs font-medium">Modo assinatura</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  <HatGlasses className="mr-1 h-4 w-4 text-muted-foreground" />
                  <Switch className="scale-75" checked={isGhostMode} onCheckedChange={onToggleGhost} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                <p className="text-xs font-medium">Não visualizar mensagens</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        )}
      </div>

      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => onSearchChange?.(event.target.value)} placeholder="Procure a conversa" className="h-9 border-0 bg-secondary pl-9 text-sm" />
          </div>

          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" title="Novo contato" aria-label="Novo contato" onClick={() => setIsNewContactOpen(true)}>
            <SquarePlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border bg-muted/80">
        <div className="flex h-10 items-center justify-between px-3">
          <button className="text-sm font-semibold text-foreground" onClick={() => setIsFiltersOpen((current) => !current)}>
            Filtros
          </button>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              disabled={!hasActiveFilters}
              size="icon"
              className={cn("h-7 w-7 text-muted-foreground", hasActiveFilters && "hover:bg-red-500/10! hover:text-red-500")}
              onClick={clearFilters}
              title="Limpar filtros"
              aria-label="Limpar filtros"
            >
              <FilterX className="h-4 w-4" />
            </Button>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setIsFiltersOpen((current) => !current)} aria-label={isFiltersOpen ? "Ocultar filtros" : "Mostrar filtros"}>
              {isFiltersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {isFiltersOpen && (
          <div className="space-y-2 px-3 pb-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-full bg-card text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTERS}>
                  <span className="text-muted-foreground">Selecione um status</span>
                </SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="h-8 w-full bg-card text-xs">
                <SelectValue placeholder="Tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTERS}>
                  <span className="text-muted-foreground">Selecione uma tag</span>
                </SelectItem>
                {tagOptions.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger className="h-8 w-full bg-card text-xs">
                <SelectValue placeholder="Setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTERS}>
                  <span className="text-muted-foreground">Selecione um setor</span>
                </SelectItem>
                {sectorOptions.map((sector) => (
                  <SelectItem key={sector} value={sector}>
                    {sector}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="border-b border-border bg-card">
        <div className="grid h-11 grid-cols-3 px-2">
          {scopeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "relative text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                scopeTab === tab.id && "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-(--color-theme-primary)",
              )}
              onClick={() => setScopeTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {scopeTab !== "all" && (
          <div className="grid grid-cols-3 gap-1 border-t border-border/60 bg-secondary/60 p-1.5">
            {stateTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "h-8 rounded-md text-xs font-medium text-muted-foreground transition-colors flex flex-row items-center justify-center gap-1",
                  stateTab === tab.id ? "bg-theme-primary text-white shadow-sm ring-1 ring-border/70" : "hover:bg-theme-accent hover:text-foreground dark:hover:bg-theme-primary/20",
                )}
                onClick={() => setStateTab(tab.id)}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-semibold transition-colors",
                    stateTab === tab.id ? "bg-white/20 text-white" : "bg-muted-foreground/15 text-muted-foreground",
                  )}
                >
                  {tabCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={listScrollRef} className="flex-1 overflow-y-auto" onScroll={handleListScroll}>
        {isLoading || isSearching ? (
          <div className="p-4 text-sm text-muted-foreground">Carregando conversas...</div>
        ) : visibleChats.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>
        ) : (
          visibleChats.map((chat) => {
            const name = getDisplayName(chat);
            const tags = getChatTags(chat).slice(0, 3);
            const latestStatus = latestMessageStatuses[chat.chat_id];
            const draft = draftsByChatId[chat.chat_id]?.trim();
            const hasDraft = !!draft;
            const previewText = hasDraft ? draft : chat.text_last_message || "Sem mensagens recentes";

            return (
              <button
                key={chat.id}
                onClick={() => onSelect?.(chat.id)}
                className={cn("flex w-full items-start gap-3 border-b border-border/50 p-3 text-left transition-colors hover:bg-theme-accent/30", selectedId === chat.id && "bg-theme-accent/10")}
              >
                <div className="relative h-11 w-11 shrink-0">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={chat.url_foto_perfil ?? undefined} alt={name} />
                    <AvatarFallback className="bg-muted text-sm font-medium text-muted-foreground">{getAvatarInitials(name)}</AvatarFallback>
                  </Avatar>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card"
                    style={{ backgroundColor: getChatStatusColor(chat) }}
                    title={`Status: ${getChatStatusLabel(chat)}`}
                    aria-label={`Status: ${getChatStatusLabel(chat)}`}
                  />
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{getTime(chat)}</span>
                  </div>

                  <div className="mt-0.5 flex items-center gap-1">
                    {!hasDraft && chat.text_last_message && <MessageStatusIcon fromMe={chat.last_message_fromMe} status={latestStatus?.status} timestamp={latestStatus?.timestamp_msg ?? chat.last_message_time} />}

                    <p className="truncate text-sm text-muted-foreground">
                      {hasDraft && <span className="font-medium text-theme-primary">Rascunho: </span>}
                      {previewText || chat.text_last_message || "Sem mensagens recentes"}
                    </p>

                    {!!chat.unread_count && <Badge className="ml-auto h-5 min-w-5 shrink-0 bg-green-500 px-1.5 text-[10px] font-medium text-white">{chat.unread_count <= 99 ? chat.unread_count : "+99"}</Badge>}
                  </div>

                  {tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <Badge
                          key={tag.id}
                          className="h-4 border-0 bg-teal-600 px-1.5 text-[9px] font-medium leading-none text-white"
                          style={
                            tag.color
                              ? {
                                  backgroundColor: tag.color,
                                  color: getReadableTextColor(tag.color),
                                }
                              : undefined
                          }
                        >
                          {tag.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
        {!isLoading && (
          <div className="p-3">
            {hasMore && isLoadingMore ? (
              <p className="py-2 text-center text-xs text-muted-foreground">Carregando mais conversas...</p>
            ) : !hasActiveFilters && scopeTab === "all" && chats.length > 0 && !hasMore ? (
              <p className="py-2 text-center text-xs text-muted-foreground">Todas as conversas carregadas</p>
            ) : null}
          </div>
        )}
      </div>

      <Dialog
        open={isNewContactOpen}
        onOpenChange={(open) => {
          setIsNewContactOpen(open);
          if (!open && !isCreatingContact) resetNewContactForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form className="space-y-4" onSubmit={handleCreateContactSubmit}>
            <DialogHeader>
              <DialogTitle>Novo contato</DialogTitle>
              <DialogDescription>Envie uma primeira mensagem para iniciar a conversa.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="new-contact-name">Nome</Label>
              <Input
                id="new-contact-name"
                value={newContactName}
                onChange={(event) => setNewContactName(event.target.value)}
                placeholder="Nome do contato"
                autoComplete="name"
                disabled={isCreatingContact}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-contact-phone">Telefone</Label>
              <Input
                id="new-contact-phone"
                value={newContactPhone}
                onChange={(event) => setNewContactPhone(event.target.value)}
                placeholder="(11) 99999-9999"
                autoComplete="tel"
                disabled={isCreatingContact}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-contact-message">Mensagem</Label>
              <Textarea
                id="new-contact-message"
                value={newContactMessage}
                onChange={(event) => setNewContactMessage(event.target.value)}
                placeholder="Digite a mensagem"
                className="min-h-28 resize-y"
                disabled={isCreatingContact}
              />
            </div>

            {newContactError && <p className="text-sm text-destructive">{newContactError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewContactOpen(false)} disabled={isCreatingContact}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreatingContact} className="bg-theme-primary text-white hover:bg-theme-primary/90">
                {isCreatingContact ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
