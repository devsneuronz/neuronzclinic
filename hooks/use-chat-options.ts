"use client";

import { useState, useEffect, useMemo } from "react";
import { getChatStatusLabel, normalizeStatusColor, sortStatusOptions, type ChatStatusOption } from "@/lib/chat-status";
import { getChatTags, getChatInterestTags, type ChatTag } from "@/lib/chat-tags";
import type { ChatRecord } from "@/lib/supabase-rest";

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

export function useChatOptions(chats: ChatRecord[] = []) {
  const [apiStatusOptions, setApiStatusOptions] = useState<ChatStatusOption[]>([]);
  const [apiTagOptions, setApiTagOptions] = useState<ChatTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isMounted = true;

    fetch("/api/chat-options")
      .then((response) => {
        if (!response.ok) throw new Error(`Não foi possível carregar opções (${response.status}).`);
        return response.json() as Promise<{ statuses?: ChatStatusOption[]; tags?: ChatTag[]; errors?: string[] }>;
      })
      .then((data) => {
        if (!isMounted) return;
        setApiStatusOptions(data.statuses ?? []);
        setApiTagOptions(data.tags ?? []);
        if (data.errors?.length) setError(data.errors.join(" | "));
      })
      .catch((err) => {
        if (!isMounted) return;
        setApiStatusOptions([]);
        setApiTagOptions([]);
        setError(err instanceof Error ? err.message : "Não foi possível carregar tags e status.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const fallbackStatusOptions = useMemo(() => getFallbackStatusOptions(chats), [chats]);
  const fallbackTagOptions = useMemo(() => getFallbackTagOptions(chats), [chats]);
  const fallbackInterestOptions = useMemo(() => getFallbackInterestOptions(chats), [chats]);

  const statusOptions = useMemo(() => {
    return apiStatusOptions.length > 0 ? apiStatusOptions : fallbackStatusOptions;
  }, [apiStatusOptions, fallbackStatusOptions]);

  const tagOptions = useMemo(() => {
    return apiTagOptions.length > 0 ? apiTagOptions : fallbackTagOptions;
  }, [apiTagOptions, fallbackTagOptions]);

  const interestOptions = fallbackInterestOptions;

  return {
    statusOptions,
    tagOptions,
    interestOptions,
    isLoading,
    error,
  };
}
