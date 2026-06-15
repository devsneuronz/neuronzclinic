"use client";

import { ExpandedImageModal } from "@/components/chat/expanded-image-modal";
import { ContactDetails } from "@/components/contact-details/contact-details";
import type { ContactInfoValues } from "@/components/contact-details/profile-view";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { getChatStatusColor, getChatStatusLabel, normalizeStatusColor, sortStatusOptions, type ChatStatusOption } from "@/lib/chat-status";
import { CHAT_INTEREST_FIELD_CANDIDATES, getChatInterestTags, getChatTags, getReadableTextColor, type ChatTag } from "@/lib/chat-tags";
import { ChatRecord, fetchChats, updateChatDetails } from "@/lib/supabase-rest";
import { filterChatsForUser } from "@/lib/user-access";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowRight, Loader2, Maximize2, RefreshCw, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = 100;
const SEARCH_PAGE_SIZE = 1000;
const ALL_FILTERS = "all";

function getDisplayName(chat?: ChatRecord) {
  return chat?.nome_contato || chat?.pushname || chat?.chat_id?.replace("@s.whatsapp.net", "") || "Contato sem nome";
}

function getContactPhone(chat?: ChatRecord) {
  const candidates = [chat?.phone_contact, chat?.chat_id, chat?.lid_id];
  const phone = candidates.map((value) => value?.replace(/@.+$/, "").replace(/\D/g, "")).find((value) => value && value.length >= 8);

  return phone || chat?.phone_contact?.trim() || chat?.chat_id?.replace(/@.+$/, "") || "Sem telefone";
}

function getContactCity(chat: ChatRecord) {
  return chat.cidade_residencia || chat.cidade_desejada || "";
}

function getLastContactLabel(chat: ChatRecord) {
  const value = chat.last_message_time || chat.updated_at;
  if (!value) return "Sem registro";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Sem registro";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(timestamp));
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function getFallbackStatusOptions(chats: ChatRecord[]) {
  const options = new Map<string, ChatStatusOption>();

  for (const chat of chats) {
    const label = getChatStatusLabel(chat);
    if (!label) continue;

    const key = label.toLowerCase();
    const current = options.get(key);
    options.set(key, {
      label,
      color: current?.color || normalizeStatusColor(chat.hex_status),
    });
  }

  return sortStatusOptions(Array.from(options.values()));
}

function getFallbackTagOptions(chats: ChatRecord[]) {
  const options = new Map<string, ChatTag>();

  for (const chat of chats) {
    for (const tag of getChatTags(chat)) {
      const key = tag.id || tag.label;
      if (!/^rec[a-zA-Z0-9]+$/.test(tag.id) || options.has(key)) continue;
      options.set(key, tag);
    }
  }

  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function getFallbackInterestOptions(chats: ChatRecord[]) {
  const options = new Map<string, ChatTag>();

  for (const chat of chats) {
    for (const interest of getChatInterestTags(chat)) {
      const key = interest.id || interest.label;
      if (options.has(key)) continue;
      options.set(key, interest);
    }
  }

  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function getTagKey(tag: ChatTag) {
  return tag.id || tag.label;
}

function getStatusFields(chat: ChatRecord, status: ChatStatusOption) {
  const normalizedStatus = status.label.toLowerCase();

  return {
    Status_chat: status.label,
    hex_status: status.color || chat.hex_status,
    finalizada: normalizedStatus === "finalizada" ? true : normalizedStatus === "aberta" ? false : chat.finalizada,
  };
}

export default function ContatosPage() {
  const router = useRouter();
  const { user, isLoading: isCurrentUserLoading } = useCurrentUser();
  const [contacts, setContacts] = useState<ChatRecord[]>([]);
  const contactsRef = useRef<ChatRecord[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [expandedContactPhoto, setExpandedContactPhoto] = useState<{ url: string; alt: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTERS);
  const [cityFilter, setCityFilter] = useState(ALL_FILTERS);
  const [interestFilter, setInterestFilter] = useState(ALL_FILTERS);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string>();
  const [statusOptions, setStatusOptions] = useState<ChatStatusOption[]>([]);
  const [tagOptions, setTagOptions] = useState<ChatTag[]>([]);
  const loadRequestIdRef = useRef(0);
  const setContactsState = useCallback((updater: ChatRecord[] | ((current: ChatRecord[]) => ChatRecord[])) => {
    const nextContacts = typeof updater === "function" ? updater(contactsRef.current) : updater;
    contactsRef.current = nextContacts;
    setContacts(nextContacts);
  }, []);

  const accessibleContacts = useMemo(() => (isCurrentUserLoading ? [] : filterChatsForUser(user, contacts)), [contacts, isCurrentUserLoading, user]);
  const selectedContact = accessibleContacts.find((contact) => contact.id === selectedContactId);
  const fallbackStatusOptions = useMemo(() => getFallbackStatusOptions(contacts), [contacts]);
  const fallbackTagOptions = useMemo(() => getFallbackTagOptions(contacts), [contacts]);
  const fallbackInterestOptions = useMemo(() => getFallbackInterestOptions(contacts), [contacts]);
  const contactStatusOptions = statusOptions.length > 0 ? statusOptions : fallbackStatusOptions;
  const contactTagOptions = tagOptions.length > 0 ? tagOptions : fallbackTagOptions;
  const contactInterestOptions = fallbackInterestOptions;
  const cityOptions = useMemo(() => uniqueSorted(contacts.map(getContactCity)), [contacts]);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const hasSearch = debouncedSearch.length > 0;

  const filteredContacts = useMemo(() => {
    return accessibleContacts.filter((contact) => {
      if (statusFilter !== ALL_FILTERS && getChatStatusLabel(contact) !== statusFilter) return false;
      if (cityFilter !== ALL_FILTERS && getContactCity(contact) !== cityFilter) return false;
      if (interestFilter !== ALL_FILTERS && !getChatInterestTags(contact).some((interest) => interest.label === interestFilter)) return false;
      return true;
    });
  }, [accessibleContacts, cityFilter, interestFilter, statusFilter]);

  const loadContacts = useCallback(
    async ({ refresh = false, offset = 0, searchTerm = "" }: { refresh?: boolean; offset?: number; searchTerm?: string } = {}) => {
      const requestId = ++loadRequestIdRef.current;
      const trimmedSearch = searchTerm.trim();

      if (refresh) {
        setIsLoading(true);
      }

      try {
        const data = await fetchChats({
          limit: trimmedSearch ? SEARCH_PAGE_SIZE : PAGE_SIZE,
          offset: refresh ? 0 : offset,
          search: trimmedSearch || undefined,
        });
        if (requestId !== loadRequestIdRef.current) return;

        setContactsState((current) => {
          if (refresh) return data;
          const knownIds = new Set(current.map((contact) => contact.id));
          return [...current, ...data.filter((contact) => !knownIds.has(contact.id))];
        });
        setHasMore(!trimmedSearch && data.length === PAGE_SIZE);
        setError(undefined);
      } catch (err) {
        if (requestId !== loadRequestIdRef.current) return;
        setError(err instanceof Error ? err.message : "Nao foi possivel carregar os contatos.");
      } finally {
        if (requestId !== loadRequestIdRef.current) return;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [setContactsState],
  );

  useEffect(() => {
    window.queueMicrotask(() => void loadContacts({ refresh: true, searchTerm: debouncedSearch }));
  }, [debouncedSearch, loadContacts]);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/chat-options")
      .then((response) => response.json() as Promise<{ statuses?: ChatStatusOption[]; tags?: ChatTag[] }>)
      .then((data) => {
        if (!isMounted) return;
        setStatusOptions(data.statuses ?? []);
        setTagOptions(data.tags ?? []);
      })
      .catch(() => {
        if (!isMounted) return;
        setStatusOptions([]);
        setTagOptions([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function loadMore() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    void loadContacts({ offset: contacts.length, searchTerm: debouncedSearch });
  }

  function updateContactById(contactId: string, updater: (contact: ChatRecord) => ChatRecord) {
    setContactsState((current) => current.map((contact) => (contact.id === contactId ? updater(contact) : contact)));
  }

  function restoreContact(contact: ChatRecord) {
    updateContactById(contact.id, () => contact);
  }

  async function handleToggleStatus(contact: ChatRecord) {
    const nextFinalizada = !contact.finalizada;
    updateContactById(contact.id, (current) => ({ ...current, finalizada: nextFinalizada }));
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, finalizada: nextFinalizada });
    } catch (err) {
      restoreContact(contact);
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o status da conversa.");
    }
  }

  async function handleToggleIA(contact: ChatRecord) {
    const nextIAStatus = !contact.ia_responde;
    updateContactById(contact.id, (current) => ({ ...current, ia_responde: nextIAStatus }));
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, ia_responde: nextIAStatus });
    } catch (err) {
      restoreContact(contact);
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o status da IA.");
    }
  }

  async function handleChangeName(contact: ChatRecord, name: string) {
    const nextName = name.trim() || null;
    updateContactById(contact.id, (current) => ({ ...current, nome_contato: nextName }));
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, nome_contato: nextName });
    } catch (err) {
      restoreContact(contact);
      const message = err instanceof Error ? err.message : "Nao foi possivel salvar o nome do contato.";
      setError(message);
      throw new Error(message);
    }
  }

  async function handleChangeContactInfo(contact: ChatRecord, info: ContactInfoValues) {
    updateContactById(contact.id, (current) => ({ ...current, ...info }));
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, ...info });
    } catch (err) {
      restoreContact(contact);
      const message = err instanceof Error ? err.message : "Nao foi possivel salvar as informacoes do contato.";
      setError(message);
      throw new Error(message);
    }
  }

  async function handleChangeContactStatus(contact: ChatRecord, status: ChatStatusOption) {
    const updatePatch = getStatusFields(contact, status);
    updateContactById(contact.id, (current) => ({ ...current, ...updatePatch }));
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, ...updatePatch });
    } catch (err) {
      restoreContact(contact);
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o status do contato.");
    }
  }

  async function handleToggleContactTag(contact: ChatRecord, tag: ChatTag) {
    const latestContact = contactsRef.current.find((current) => current.id === contact.id) ?? contact;
    const currentTags = getChatTags(latestContact);
    const tagKey = getTagKey(tag);
    const hasTag = currentTags.some((currentTag) => getTagKey(currentTag) === tagKey);
    const nextTags = hasTag ? currentTags.filter((currentTag) => getTagKey(currentTag) !== tagKey) : [...currentTags, tag];

    updateContactById(contact.id, (current) => ({
      ...current,
      json_tags: nextTags,
      json_tags_parsed: nextTags,
      tag_chat_array: nextTags,
    }));
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, tags: nextTags });
    } catch (err) {
      restoreContact(contact);
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar as tags do contato.");
    }
  }

  async function handleToggleContactInterest(contact: ChatRecord, interest: ChatTag) {
    const latestContact = contactsRef.current.find((current) => current.id === contact.id) ?? contact;
    const currentInterests = getChatInterestTags(latestContact);
    const interestKey = getTagKey(interest);
    const hasInterest = currentInterests.some((currentInterest) => getTagKey(currentInterest) === interestKey);
    const nextInterests = hasInterest ? currentInterests.filter((currentInterest) => getTagKey(currentInterest) !== interestKey) : [...currentInterests, interest];
    const interestPatch = CHAT_INTEREST_FIELD_CANDIDATES.reduce<Record<string, ChatTag[]>>((patch, field) => {
      patch[field] = nextInterests;
      return patch;
    }, {});

    updateContactById(contact.id, (current) => ({
      ...current,
      ...interestPatch,
    }));
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, interestTags: nextInterests });
    } catch (err) {
      restoreContact(contact);
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar os interesses do contato.");
    }
  }

  function handleReorderTags(contact: ChatRecord, tags: ChatTag[]) {
    updateContactById(contact.id, (current) => ({
      ...current,
      json_tags: tags,
      json_tags_parsed: tags,
      tag_chat_array: tags,
    }));
  }

  async function handleCommitTagOrder(contact: ChatRecord, tags: ChatTag[]) {
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, tags });
    } catch (err) {
      restoreContact(contact);
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar a ordem das tags.");
    }
  }

  async function handleMarkAsRead(contact: ChatRecord) {
    updateContactById(contact.id, (current) => ({ ...current, unread_count: 0 }));
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, unread_count: 0 });
    } catch (err) {
      restoreContact(contact);
      setError(err instanceof Error ? err.message : "Nao foi possivel marcar a conversa como lida.");
    }
  }

  async function handleMarkAsUnread(contact: ChatRecord) {
    const unreadCount = Math.max(contact.unread_count || 0, 1);
    updateContactById(contact.id, (current) => ({ ...current, unread_count: unreadCount }));
    setError(undefined);

    try {
      await updateChatDetails({ id: contact.id, unread_count: unreadCount });
    } catch (err) {
      restoreContact(contact);
      setError(err instanceof Error ? err.message : "Nao foi possivel marcar a conversa como nao lida.");
    }
  }

  function goToChat(contact: ChatRecord) {
    router.push(`/chats?chatId=${encodeURIComponent(contact.chat_id)}`);
  }

  return (
    <div className="flex min-h-dvh h-full bg-background">
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex min-h-15.25 items-center justify-between border-b border-border bg-card px-6">
          <h1 className="text-xl font-semibold text-foreground">Contatos</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="h-full mx-auto max-w-7xl flex flex-col gap-6">
            <div className="flex w-full flex-col bg-card rounded-xl p-4 sm:p-6 border border-border shadow-sm gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Contatos
                  </div>
                  <h1 className="mt-1 text-2xl font-semibold tracking-normal text-foreground">Contatos | Lista</h1>
                  <p className="text-sm text-muted-foreground">
                    {filteredContacts.length} de {contacts.length} contatos carregados
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-row flex-wrap items-center justify-between gap-3 flex-1 w-full lg:max-w-6xl">
                  <div className="relative flex-1 min-w-[200px] sm:min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone, cidade, email ou status" className="h-9 pl-9 w-full" />
                  </div>

                  <div className="flex flex-1 flex-wrap sm:flex-initial gap-3 min-w-[200px]">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 flex-1 sm:w-36">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTERS}>Status</SelectItem>
                        {contactStatusOptions.map((status) => (
                          <SelectItem key={status.label} value={status.label}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={cityFilter} onValueChange={setCityFilter}>
                      <SelectTrigger className="h-9 flex-1 sm:w-40">
                        <SelectValue placeholder="Cidade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTERS}>Cidade</SelectItem>
                        {cityOptions.map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={interestFilter} onValueChange={setInterestFilter}>
                      <SelectTrigger className="h-9 flex-1 sm:w-40">
                        <SelectValue placeholder="Interesse" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTERS}>Interesse</SelectItem>
                        {contactInterestOptions.map((interest) => (
                          <SelectItem key={getTagKey(interest)} value={interest.label}>
                            {interest.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    className="h-9 w-9 sm:w-fit shrink-0 gap-2 px-3 sm:px-4"
                    type="button"
                    variant="outline"
                    onClick={() => void loadContacts({ refresh: true, searchTerm: debouncedSearch })}
                    disabled={isLoading}
                    title="Atualizar contatos"
                  >
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    <span className="hidden sm:inline">Atualizar</span>
                  </Button>
                </div>
              </div>
              {error && <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>

            <div className="mx-auto flex w-full flex-col bg-card rounded-xl border border-border shadow-sm overflow-hidden ">
              <div className="flex flex-col min-h-0">
                <div className="hidden md:grid w-full grid-cols-[1.4fr_140px_160px_160px_80px] border-b border-border bg-muted/60 pl-5 pr-8 py-3 gap-4 text-xs font-semibold uppercase text-muted-foreground shrink-0">
                  <span>Nome</span>
                  <span>Status</span>
                  <span>Cidade</span>
                  <span>Último contato</span>
                  <span className="text-right">Ações</span>
                </div>
                <div className="w-full  min-h-18.25 overflow-y-auto split-scroll flex flex-col items-center justify-center">
                  {isLoading ? (
                    <div className="my-auto w-fit inline-flex items-center justify-center gap-2 rounded-xl bg-muted/80 px-5 text-xs font-semibold text-foreground border border-border/80 shadow-xs py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-theme-primary" />
                      <span>Carregando contatos...</span>
                    </div>
                  ) : filteredContacts.length > 0 ? (
                    <div className="h-full w-full flex flex-col justify-between">
                      <div className="flex flex-col w-full">
                        {filteredContacts.map((contact) => {
                          const name = getDisplayName(contact);
                          const tags = getChatTags(contact).slice(0, 2);
                          return (
                            <button
                              key={contact.id}
                              type="button"
                              className="flex flex-col gap-3 md:grid md:grid-cols-[1.4fr_140px_160px_160px_80px] items-start md:items-center gap-2 md:gap-4 border-b border-border/70 last:border-b-0 px-5 py-4 transition-colors hover:bg-muted/45 text-left w-full relative group"
                              onClick={() => setSelectedContactId(contact.id)}
                            >
                              <div className="flex min-w-0 items-center gap-3 w-full md:w-auto">
                                <span
                                  className={cn("shrink-0 rounded-full", contact.url_foto_perfil && "cursor-zoom-in")}
                                  onClick={(event) => {
                                    if (!contact.url_foto_perfil) return;
                                    event.stopPropagation();
                                    setExpandedContactPhoto({ url: contact.url_foto_perfil, alt: `Foto de ${name}` });
                                  }}
                                >
                                  <Avatar className="h-10 w-10 shrink-0">
                                    <AvatarImage src={contact.url_foto_perfil ?? undefined} alt={name} />
                                    <AvatarFallback className="text-sm">{getAvatarInitials(name)}</AvatarFallback>
                                  </Avatar>
                                </span>
                                <div className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
                                  <span className="block truncate text-xs text-muted-foreground">{getContactPhone(contact)}</span>
                                  {tags.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                                      <span>Tags:</span>
                                      {tags.map((tag) => (
                                        <Badge key={tag.id || tag.label} className="h-4 border-0 text-[9px] px-1.5 leading-none" style={tag.color ? { backgroundColor: tag.color, color: getReadableTextColor(tag.color) } : undefined}>
                                          {tag.label}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:contents">
                                <div className="inline-flex max-w-full md:w-auto">
                                  <Badge className="border-0 px-2 py-0.5 text-[10px] text-white rounded-md" style={{ backgroundColor: getChatStatusColor(contact) }}>
                                    <span className="truncate">{getChatStatusLabel(contact)}</span>
                                  </Badge>
                                </div>
                                <span className="text-muted-foreground/30 text-xs md:hidden">•</span>
                                <span className="truncate text-xs md:text-sm text-muted-foreground">
                                  <span className="md:hidden font-medium text-foreground/70">Cidade: </span>
                                  {getContactCity(contact) || "Sem cidade"}
                                </span>
                                <span className="text-muted-foreground/30 text-xs md:hidden">•</span>
                                <span className="truncate text-xs md:text-sm text-muted-foreground">
                                  <span className="md:hidden font-medium text-foreground/70">Último contato: </span>
                                  {getLastContactLabel(contact)}
                                </span>
                              </div>

                              <div className="absolute right-4 top-4 md:static md:flex md:w-full md:justify-end shrink-0">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted group-hover:text-foreground md:hover:bg-background">
                                  <Maximize2 className="h-4 w-4" />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {hasMore && !hasSearch && (
                        <div className="flex w-full justify-center py-6 border-t border-border/20 bg-linear-to-t from-background/40 to-transparent shrink-0">
                          <Button
                            type="button"
                            disabled={isLoadingMore}
                            onClick={loadMore}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-muted/80 px-5 text-xs font-semibold text-foreground border border-border/80 shadow-xs hover:bg-theme-accent hover:text-foreground hover:border-border active:scale-98 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
                          >
                            {isLoadingMore ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-theme-primary" />
                                <span>Carregando contatos...</span>
                              </>
                            ) : (
                              <>
                                <ArrowDown className="h-3.5 w-3.5 opacity-70 transition-transform" />
                                <span>Carregar mais contatos</span>
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-6">Nenhum contato encontrado.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>

        <Dialog open={Boolean(selectedContact)} onOpenChange={(open) => !open && setSelectedContactId(null)}>
          <DialogContent className="max-h-[92vh] max-w-2xl overflow-hidden p-0" showCloseButton={false}>
            {selectedContact && (
              <div className="flex h-[86vh] flex-col">
                <DialogTitle className="sr-only">Detalhes do contato {getDisplayName(selectedContact)}</DialogTitle>
                <div className="min-h-0 flex-1">
                  <ContactDetails
                    chat={selectedContact}
                    onClose={() => setSelectedContactId(null)}
                    onToggleStatus={() => void handleToggleStatus(selectedContact)}
                    onToggleIA={() => void handleToggleIA(selectedContact)}
                    statusOptions={contactStatusOptions}
                    tagOptions={contactTagOptions}
                    interestOptions={contactInterestOptions}
                    onChangeStatus={(status) => void handleChangeContactStatus(selectedContact, status)}
                    onToggleTag={(tag) => void handleToggleContactTag(selectedContact, tag)}
                    onToggleInterest={(interest) => void handleToggleContactInterest(selectedContact, interest)}
                    onChangeName={(name) => handleChangeName(selectedContact, name)}
                    onChangeContactInfo={(info) => handleChangeContactInfo(selectedContact, info)}
                    onReorderTags={(tags) => handleReorderTags(selectedContact, tags)}
                    onCommitTagOrder={(tags) => void handleCommitTagOrder(selectedContact, tags)}
                  />
                </div>
                <DialogFooter className="border-t border-border bg-card p-3">
                  <Button type="button" variant="ghost" onClick={() => setSelectedContactId(null)}>
                    Fechar
                  </Button>
                  <Button type="button" onClick={() => goToChat(selectedContact)}>
                    Ir para o chat
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {expandedContactPhoto && <ExpandedImageModal image={expandedContactPhoto} onClose={() => setExpandedContactPhoto(null)} />}
      </div>
    </div>
  );
}
