import { cn } from "@/lib/utils";
import { Check, CheckCheck } from "lucide-react";

type MessageStatusIconProps = {
  fromMe?: boolean | null;
  status?: string | null;
  timestamp?: string | null;
  className?: string;
};

function getNormalizedStatus(status?: string | null) {
  return (
    status
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_") ?? ""
  );
}

function hasAnyStatus(status: string, values: string[]) {
  return values.some((value) => status.includes(value));
}

function isBeforeYesterday(timestamp?: string | null) {
  if (!timestamp) return false;

  const messageTime = Date.parse(timestamp);
  if (!Number.isFinite(messageTime)) return false;

  const yesterdayStart = new Date();
  yesterdayStart.setHours(0, 0, 0, 0);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  return messageTime < yesterdayStart.getTime();
}

function isLegacyReadCandidate(status: string) {
  if (!status) return true;
  if (hasAnyStatus(status, ["sent", "server", "server_ack", "ack"]) || status === "2") return true;
  return false;
}

export function MessageStatusIcon({ fromMe, status, timestamp, className }: MessageStatusIconProps) {
  if (!fromMe) return null;

  const normalizedStatus = getNormalizedStatus(status);

  if (hasAnyStatus(normalizedStatus, ["error", "failed", "fail"])) {
    return <CheckCheck className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} aria-label="Falha ao enviar" />;
  }

  if (hasAnyStatus(normalizedStatus, ["pending", "sending", "queued"]) || ["0", "1"].includes(normalizedStatus)) {
    return <CheckCheck className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} aria-label="Enviando" />;
  }

  if (hasAnyStatus(normalizedStatus, ["unread", "not_read", "notread", "not_view", "notview"])) {
    return <CheckCheck className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} aria-label="Entregue" />;
  }

  if (isBeforeYesterday(timestamp) && isLegacyReadCandidate(normalizedStatus)) {
    return <CheckCheck className={cn("h-3.5 w-3.5 shrink-0 text-blue-500", className)} aria-label="Visualizada" />;
  }

  if (hasAnyStatus(normalizedStatus, ["read", "played", "read_ack", "viewed", "visualiz"]) || normalizedStatus === "4") {
    return <CheckCheck className={cn("h-3.5 w-3.5 shrink-0 text-blue-500", className)} aria-label="Visualizada" />;
  }

  if (hasAnyStatus(normalizedStatus, ["deliver", "delivery_ack"]) || normalizedStatus === "3") {
    return <CheckCheck className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} aria-label="Entregue" />;
  }

  if (hasAnyStatus(normalizedStatus, ["sent", "server", "server_ack", "ack"]) || normalizedStatus === "2") {
    return <Check className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} aria-label="Enviada" />;
  }

  return <CheckCheck className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} aria-label="Enviada" />;
}
