"use client";

import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";

export function useSignatureMode() {
  const { user } = useCurrentUser();

  const [isSignatureMode, setIsSignatureMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("neuronzclinic.chat.use-signature");
      return saved === null ? true : saved === "true";
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem("neuronzclinic.chat.use-signature", String(isSignatureMode));
  }, [isSignatureMode]);

  const canUseAdminChatModes = user?.role === "admin";
  const effectiveSignatureMode = canUseAdminChatModes ? isSignatureMode : false;

  return {
    isSignatureMode: effectiveSignatureMode,
    rawSignatureMode: isSignatureMode,
    setSignatureMode: setIsSignatureMode,
    canUseAdminChatModes,
  };
}
