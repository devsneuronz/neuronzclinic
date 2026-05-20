"use client";

export const CHAT_DRAFT_STORAGE_PREFIX = "neuronzclinic.chat-drafts.";
export const CHAT_DRAFT_CHANGED_EVENT = "neuronzclinic:chat-draft-changed";

export type ChatDraftChangedDetail = {
  chatId: string;
  draft: string;
};

export function getChatDraftKey(chatId: string) {
  return `${CHAT_DRAFT_STORAGE_PREFIX}${chatId}`;
}

export function readChatDraft(chatId: string, fallback = "") {
  if (typeof window === "undefined") return fallback;

  try {
    const storedDraft = window.localStorage.getItem(getChatDraftKey(chatId));
    return storedDraft ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeChatDraft(chatId: string, draft: string) {
  if (typeof window === "undefined") return;

  try {
    const key = getChatDraftKey(chatId);
    if (draft.trim()) {
      window.localStorage.setItem(key, draft);
    } else {
      window.localStorage.removeItem(key);
    }

    window.dispatchEvent(
      new CustomEvent<ChatDraftChangedDetail>(CHAT_DRAFT_CHANGED_EVENT, {
        detail: { chatId, draft },
      }),
    );
  } catch {
    // Drafts are convenience-only; private browsing/storage errors should not block chat usage.
  }
}
