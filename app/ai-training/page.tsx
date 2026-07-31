import type { Metadata } from "next";

import { AiTrainingPage } from "@/components/ai-training/ai-training-page";

export const metadata: Metadata = {
  title: "AI Training",
};

export default function Page() {
  return <AiTrainingPage />;
}
