"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createSupabaseRealtimeSubscription } from "@/lib/supabase-realtime";
import type { CurrentUser, MentionableUser } from "@/lib/user-roles";
import { fetchMentionableUsers, isUserMentioned } from "@/lib/user-mentions";
import { cn } from "@/lib/utils";

type NoteNotification = {
  id: string;
  chatId: string;
  content: string;
  createdAt: string;
  read: boolean;
};

type RawChatNote = {
  id?: unknown;
  chat_id?: unknown;
  content?: unknown;
  created_at?: unknown;
};

type NoteMentionNotificationsProps = {
  user: CurrentUser | null;
  isCollapsed: boolean;
};

function getStorageKey(email: string) {
  return `neuronzclinic.note-mentions.${email.trim().toLowerCase()}`;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStoredNotifications(email: string) {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(getStorageKey(email));
    if (!stored) return [];

    const parsed = JSON.parse(stored) as NoteNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredNotifications(email: string, notifications: NoteNotification[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(getStorageKey(email), JSON.stringify(notifications.slice(0, 20)));
}

function playMentionSound() {
  const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
  } catch {
    // Browser autoplay rules can block sound until the user interacts with the page.
  }
}

function mapNotification(note: RawChatNote): NoteNotification | null {
  const id = getString(note.id);
  const content = getString(note.content);
  const chatId = getString(note.chat_id);

  if (!id || !content) return null;

  return {
    id,
    chatId,
    content,
    createdAt: getString(note.created_at) || new Date().toISOString(),
    read: false,
  };
}

function getTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NoteMentionNotifications({ user, isCollapsed }: NoteMentionNotificationsProps) {
  const [mentionUsers, setMentionUsers] = useState<MentionableUser[]>([]);
  const [notifications, setNotifications] = useState<NoteNotification[]>([]);
  const userEmail = user?.email ?? "";
  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!userEmail) {
        setNotifications([]);
        return;
      }

      setNotifications(readStoredNotifications(userEmail));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [userEmail]);

  useEffect(() => {
    let isMounted = true;

    fetchMentionableUsers()
      .then((users) => {
        if (isMounted) setMentionUsers(users);
      })
      .catch(() => {
        if (isMounted) setMentionUsers([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userEmail || mentionUsers.length === 0) return;

    const unsubscribe = createSupabaseRealtimeSubscription([{ table: "chat_notes", event: "INSERT" }], (payload) => {
      if (payload.table !== "chat_notes" || payload.eventType !== "INSERT" || !payload.record) return;

      const notification = mapNotification(payload.record as RawChatNote);
      if (!notification || !isUserMentioned(notification.content, mentionUsers, userEmail)) return;

      setNotifications((current) => {
        if (current.some((item) => item.id === notification.id)) return current;
        const next = [notification, ...current].slice(0, 20);
        writeStoredNotifications(userEmail, next);
        return next;
      });
      playMentionSound();
    });

    return () => {
      unsubscribe?.();
    };
  }, [mentionUsers, userEmail]);

  function markAllAsRead() {
    if (!userEmail) return;

    setNotifications((current) => {
      const next = current.map((notification) => ({ ...notification, read: true }));
      writeStoredNotifications(userEmail, next);
      return next;
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          title={isCollapsed ? "Notificações" : undefined}
          className={cn("relative w-full justify-start gap-3 px-3 py-2.5 text-muted-foreground hover:text-foreground", isCollapsed && "justify-center px-0")}
        >
          <Bell className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span className="truncate">Notificações</span>}
          {unreadCount > 0 && (
            <Badge className={cn("ml-auto h-5 min-w-5 rounded-full px-1.5 text-[10px]", isCollapsed && "absolute right-1 top-1")}>{unreadCount}</Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" sideOffset={12} className="w-80 p-2">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <DropdownMenuLabel className="px-0 py-0">Menções em notas</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={markAllAsRead} aria-label="Marcar notificações como lidas">
              <CheckCheck className="h-4 w-4" />
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhuma menção recebida.</p>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem key={notification.id} className="items-start gap-2 rounded-md px-2 py-2" onSelect={(event) => event.preventDefault()}>
              <MessageSquareText className={cn("mt-0.5 h-4 w-4", notification.read ? "text-muted-foreground" : "text-amber-500")} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm">{notification.content}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {notification.chatId || "Chat"} {getTimeLabel(notification.createdAt)}
                </span>
              </span>
              {!notification.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
