import { KanbanBoard } from "@/components/tasks/kanban-board";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tarefas",
};

export default function TarefasPage() {
  return (
    <div className="flex h-dvh bg-background">
      <KanbanBoard />
    </div>
  );
}
