"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Maximize2, RefreshCw, Search, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContactDetails } from "@/components/contact-details/contact-details";
import type { ContactInfoValues } from "@/components/contact-details/profile-view";
import { getAvatarInitials } from "@/lib/avatar-initials";
import { getChatTags, getReadableTextColor, type ChatTag } from "@/lib/chat-tags";
import { getChatStatusColor, getChatStatusLabel, type ChatStatusOption } from "@/lib/chat-status";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { ChatRecord, fetchChats, updateChatDetails } from "@/lib/supabase-rest";

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
    if (!label || options.has(label)) continue;
    options.set(label, {
      label,
      color: getChatStatusColor(chat),
    });
  }

  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
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
  const [contacts, setContacts] = useState<ChatRecord[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTERS);
  const [cityFilter, setCityFilter] = useState(ALL_FILTERS);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string>();
  const [statusOptions, setStatusOptions] = useState<ChatStatusOption[]>([]);
  const [tagOptions, setTagOptions] = useState<ChatTag[]>([]);
  const loadRequestIdRef = useRef(0);

  const selectedContact = contacts.find((contact) => contact.id === selectedContactId);
  const fallbackStatusOptions = useMemo(() => getFallbackStatusOptions(contacts), [contacts]);
  const fallbackTagOptions = useMemo(() => getFallbackTagOptions(contacts), [contacts]);
  const contactStatusOptions = statusOptions.length > 0 ? statusOptions : fallbackStatusOptions;
  const contactTagOptions = tagOptions.length > 0 ? tagOptions : fallbackTagOptions;
  const cityOptions = useMemo(() => uniqueSorted(contacts.map(getContactCity)), [contacts]);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const hasSearch = debouncedSearch.length > 0;

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      if (statusFilter !== ALL_FILTERS && getChatStatusLabel(contact) !== statusFilter) return false;
      if (cityFilter !== ALL_FILTERS && getContactCity(contact) !== cityFilter) return false;
      return true;
    });
  }, [cityFilter, contacts, statusFilter]);

  const loadContacts = useCallback(async ({ refresh = false, offset = 0, searchTerm = "" }: { refresh?: boolean; offset?: number; searchTerm?: string } = {}) => {
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

      setContacts((current) => {
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
  }, []);

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
    setContacts((current) => current.map((contact) => (contact.id === contactId ? updater(contact) : contact)));
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
    const currentTags = getChatTags(contact);
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
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              Contatos
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-foreground">Contatos | Lista</h1>
            <p className="mt-1 text-sm text-muted-foreground">{filteredContacts.length} de {contacts.length} contatos carregados</p>
          </div>

          <Button type="button" variant="outline" onClick={() => void loadContacts({ refresh: true, searchTerm: debouncedSearch })} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone, cidade, email ou status" className="h-10 pl-9" />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10">
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
              <SelectTrigger className="h-10">
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
          </div>
        </div>

        {error && <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <div className="grid min-w-[980px] grid-cols-[minmax(260px,1.4fr)_170px_180px_170px_120px] border-b border-border bg-muted/60 px-5 py-3 text-xs font-semibold uppercase text-muted-foreground">
              <span>Nome</span>
              <span>Status</span>
              <span>Cidade</span>
              <span>Ultimo contato</span>
              <span className="text-right">Acoes</span>
            </div>

            <div className="min-w-[980px]">
              {isLoading ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando contatos...</p>
              ) : filteredContacts.length > 0 ? (
                filteredContacts.map((contact) => {
                  const name = getDisplayName(contact);
                  const tags = getChatTags(contact).slice(0, 2);

                  return (
                    <button
                      key={contact.id}
                      type="button"
                      className="grid w-full grid-cols-[minmax(260px,1.4fr)_170px_180px_170px_120px] items-center gap-3 border-b border-border/70 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/45"
                      onClick={() => setSelectedContactId(contact.id)}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={contact.url_foto_perfil ?? undefined} alt={name} />
                          <AvatarFallback className="text-sm">{getAvatarInitials(name)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{getContactPhone(contact)}</span>
                          {tags.length > 0 && (
                            <span className="mt-1 flex gap-1">
                              {tags.map((tag) => (
                                <Badge
                                  key={tag.id || tag.label}
                                  className="h-4 border-0 px-1.5 text-[9px] leading-none"
                                  style={tag.color ? { backgroundColor: tag.color, color: getReadableTextColor(tag.color) } : undefined}
                                >
                                  {tag.label}
                                </Badge>
                              ))}
                            </span>
                          )}
                        </span>
                      </span>

                      <Badge className="max-w-full border-0 px-2 py-1 text-[10px] text-white" style={{ backgroundColor: getChatStatusColor(contact) }}>
                        <span className="truncate">{getChatStatusLabel(contact)}</span>
                      </Badge>
                      <span className="truncate text-sm text-muted-foreground">{getContactCity(contact) || "Sem cidade"}</span>
                      <span className="truncate text-sm text-muted-foreground">{getLastContactLabel(contact)}</span>
                      <span className="flex justify-end gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground">
                          <Maximize2 className="h-4 w-4" />
                        </span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</p>
              )}
            </div>
          </div>
        </div>

        {!isLoading && hasMore && !hasSearch && (
          <Button type="button" variant="outline" className="self-center" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Carregando..." : "Carregar mais contatos"}
          </Button>
        )}
      </div>

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
                  onChangeStatus={(status) => void handleChangeContactStatus(selectedContact, status)}
                  onToggleTag={(tag) => void handleToggleContactTag(selectedContact, tag)}
                  onChangeName={(name) => handleChangeName(selectedContact, name)}
                  onChangeContactInfo={(info) => handleChangeContactInfo(selectedContact, info)}
                  onMarkAsRead={() => void handleMarkAsRead(selectedContact)}
                  onMarkAsUnread={() => void handleMarkAsUnread(selectedContact)}
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
    </div>
  );
}
