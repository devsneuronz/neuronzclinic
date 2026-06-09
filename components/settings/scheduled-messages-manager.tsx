"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelScheduledMessage, fetchChats, fetchScheduledMessages, updateScheduledMessage, type ChatRecord, type ScheduledMessageRecord } from "@/lib/supabase-rest";
import { CalendarClock, Pen, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EditingScheduledDialog } from "../chat/edit-scheduled-dialog";

function getContactName(message: ScheduledMessageRecord) {
  return message.contact_name?.trim() || message.chat_id;
}

function getPreview(message: ScheduledMessageRecord) {
  const text = message.text || message.content || message.caption;
  if (text?.trim()) return text.trim();
  if (message.filename) return message.filename;
  if (message.media_type) return "Anexo";
  return "Mensagem agendada";
}

function formatScheduledAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

export function ScheduledMessagesManager() {
  const [messages, setMessages] = useState<ScheduledMessageRecord[]>([]);
  const [chatsById, setChatsById] = useState<Record<string, ChatRecord>>({});
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const [editingMessage, setEditingMessage] = useState<ScheduledMessageRecord | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchScheduledMessages({ includeHistory: false }), fetchChats({ limit: 500 })])
      .then(([scheduled, chats]) => {
        if (!isMounted) return;
        setMessages(scheduled);
        setChatsById(Object.fromEntries(chats.map((chat) => [chat.chat_id, chat])));
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Não foi possível carregar os agendamentos.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredMessages = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messages;

    return messages.filter((message) => {
      const haystack = [getContactName(message), message.chat_id, getPreview(message), message.created_by, message.status].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [messages, search]);

  const groupedContacts = useMemo(() => {
    const groups = new Map<string, ScheduledMessageRecord[]>();

    for (const message of filteredMessages) {
      groups.set(message.chat_id, [...(groups.get(message.chat_id) ?? []), message]);
    }

    return Array.from(groups.entries())
      .map(([chatId, contactMessages]) => ({
        chatId,
        contactName: chatsById[chatId]?.nome_contato || chatsById[chatId]?.pushname || getContactName(contactMessages[0]),
        avatarUrl: chatsById[chatId]?.url_foto_perfil || null,
        messages: contactMessages.sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at)),
      }))
      .sort((a, b) => a.contactName.localeCompare(b.contactName, "pt-BR", { sensitivity: "base" }));
  }, [chatsById, filteredMessages]);

  async function handleCancel(messageId: string) {
    const previousMessages = messages;
    setCancelingId(messageId);
    setError(null);
    setMessages((current) => current.filter((message) => message.id !== messageId));

    try {
      await cancelScheduledMessage(messageId);
    } catch (err) {
      setMessages(previousMessages);
      setError(err instanceof Error ? err.message : "Não foi possível cancelar o agendamento.");
    } finally {
      setCancelingId(null);
    }
  }

  async function handleUpdateSuccess(updated: ScheduledMessageRecord) {
    setMessages((current) => [...current.filter((message) => message.id !== updated.id), updated].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at)));
  }

  return (
    <>
      <div className="space-y-4">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por contato, telefone ou mensagem" className="pl-9" />
        </div>

        {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}

        {isLoading ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">Carregando mensagens agendadas...</div>
        ) : groupedContacts.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">Nenhuma mensagem agendada encontrada.</div>
        ) : (
          <Accordion type="multiple" className="gap-2">
            {groupedContacts.map((group) => (
              <AccordionItem key={group.chatId} value={group.chatId} className="rounded-md border border-border bg-background px-3">
                <AccordionTrigger className="items-center gap-3 hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={group.avatarUrl || undefined} alt={group.contactName} />
                      <AvatarFallback className="bg-teal-500/15 text-sm font-bold text-teal-600">{getInitials(group.contactName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 text-left">
                      <p className="truncate font-semibold text-foreground">{group.contactName}</p>
                      <p className="truncate text-xs text-muted-foreground">{group.chatId}</p>
                    </div>
                  </div>
                  <Badge className="bg-teal-500 text-white hover:bg-teal-500">{group.messages.length}</Badge>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  {group.messages.map((message) => (
                    <div key={message.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-500/10 text-teal-600">
                        <CalendarClock className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <span className="truncate text-sm font-medium text-foreground">{getPreview(message)}</span>
                        <span className="text-xs text-muted-foreground">Agendado para: {formatScheduledAt(message.scheduled_at)}</span>
                        {message.last_error && <p className="mt-1 line-clamp-2 text-xs text-red-500">{message.last_error}</p>}
                      </div>
                      <Badge variant={message.status === "failed" ? "destructive" : "secondary"}>{message.status}</Badge>

                      <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-teal-500" onClick={() => setEditingMessage(message)} aria-label="Editar agendamento">
                        <Pen className="h-4 w-4" />
                      </Button>

                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-red-500"
                        onClick={() => handleCancel(message.id)}
                        disabled={cancelingId === message.id}
                        aria-label="Cancelar agendamento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>

      <EditingScheduledDialog
        message={editingMessage}
        onClose={() => setEditingMessage(null)}
        onUpdate={async (input) => {
          const updated = await updateScheduledMessage(input);
          handleUpdateSuccess(updated);
        }}
      />
    </>
  );
}
