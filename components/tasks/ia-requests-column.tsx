import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import type { IaRequest } from "@/lib/ia-request";
import type { ChatRecord } from "@/lib/supabase-rest";
import { SkeletonShimmer } from "../ui/skeleton-shimmer";
import { EmptyColumn } from "./empty-column";
import { IaCard } from "./ia-card";
import { formatIaRequestDate, getIaRequestActionConfig, getIaRequestStatusLabel, isIaRequestCompleted } from "./ia-request-utils";

type AssistantInfo = {
  name?: string | null;
  gender?: string | null;
};

interface IaRequestsColumnProps {
  requests: IaRequest[];
  chatsById: Map<string, ChatRecord>;
  isFiltering: boolean;
  isAdmin: boolean;
  fullWidth?: boolean;
  getChatDisplayName: (chat: ChatRecord) => string;
  onSelectRequest: (request: IaRequest) => void;
  onOpenRequestChat: (request: IaRequest, chat?: ChatRecord) => void;
}

export function IaRequestsColumn({ requests, chatsById, isFiltering, isAdmin, getChatDisplayName, onSelectRequest, onOpenRequestChat, fullWidth = false }: IaRequestsColumnProps) {
  const [assistant, setAssistant] = useState<AssistantInfo>({ name: "IA", gender: "female" });
  const [isLoadingAssistant, setIsLoadingAssistant] = useState(true);
  const assistantName = assistant.name?.trim() || "IA";
  const assistantArticle = assistant.gender === "mulher" ? "pela" : "pelo";
  const sortedRequests = [...requests].sort((a, b) => Number(isIaRequestCompleted(a.status)) - Number(isIaRequestCompleted(b.status)));

  useEffect(() => {
    let isCurrent = true;

    async function loadAssistantName() {
      setIsLoadingAssistant(true);
      try {
        const response = await fetch("/api/ia-assistant", { cache: "no-store" });

        if (!response.ok) return;

        const data = (await response.json()) as { assistant?: AssistantInfo | null; assistants?: AssistantInfo[] };
        if (!isCurrent) return;

        setAssistant(data.assistant ?? data.assistants?.[0] ?? { name: "IA", gender: "female" });
      } catch {
        if (isCurrent) setAssistant({ name: "IA", gender: "female" });
      } finally {
        if (isCurrent) setIsLoadingAssistant(false);
      }
    }

    void loadAssistantName();

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <section className={cn("flex flex-1 flex-col rounded-md border border-blue-700/20 bg-blue-700/5 p-3", fullWidth ? "min-w-full" : "min-w-[300px]")}>
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="flex items-start gap-2">
          <span className="mt-1.25 h-2.5 w-2.5 rounded-full bg-blue-900" />
          <div>
            <div className="flex items-center gap-2 font-semibold text-blue-900">
              <Sparkles className="h-3.5 w-3.5" />
              Avisos da IA
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {isLoadingAssistant ? (
                <SkeletonShimmer className="w-50 h-3 mt-1 rounded-md" />
              ) : (
                <span>
                  Solicitações e alertas gerados {assistantArticle} {assistantName}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-md border border-blue-700/20 bg-blue-700/10 px-2 text-xs font-semibold text-blue-800 shadow-xs">{requests.length}</span>
      </div>

      {requests.length > 0 ? (
        <div className={cn("flex-1 overflow-y-auto p-1 pr-1 custom-scrollbar", fullWidth ? "grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3" : "flex flex-col gap-3")}>
          {sortedRequests.map((request) => {
            const chat = request.chatId ? chatsById.get(request.chatId) : undefined;
            return (
              <IaCard
                key={request.id}
                request={request}
                chat={chat}
                contactName={chat ? getChatDisplayName(chat) : ""}
                chosenDate={formatIaRequestDate(request.chosenDate)}
                statusLabel={getIaRequestStatusLabel(request.status)}
                actionConfig={getIaRequestActionConfig(request.action)}
                isAdmin={isAdmin}
                onSelect={onSelectRequest}
                onOpenChat={onOpenRequestChat}
              />
            );
          })}
        </div>
      ) : (
        <EmptyColumn isFiltering={isFiltering} />
      )}
    </section>
  );
}
