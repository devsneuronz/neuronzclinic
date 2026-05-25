import type { Metadata } from "next";
import { KanbanBoard } from "@/components/tasks/kanban-board";

export const metadata: Metadata = {
  title: "Tarefas",
};

export default function TarefasPage() {
  return (
    <div className="flex h-screen bg-background">
      <KanbanBoard />
    </div>
  );
}

