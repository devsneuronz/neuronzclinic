import { StatusConfigMap, Task, TaskStatus } from "@/lib/task";
import { cn } from "@/lib/utils";
import { EmptyColumn } from "./empty-column";
import { TaskCard } from "./task-card";

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  isFiltering: boolean;
  onSelectTask: (task: Task) => void;
  onOpenPatientChat: (task: Task) => void;
  statusConfig: StatusConfigMap;
}

export function KanbanColumn({ status, tasks, isFiltering, onSelectTask, onOpenPatientChat, statusConfig }: KanbanColumnProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <section className={cn("flex min-w-[300px] flex-1 flex-col rounded-md border p-3", config.columnClassName)}>
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="flex items-start gap-2">
          <span className={cn("mt-1.25 h-2.5 w-2.5 rounded-full", config.markerClassName)} />
          <div>
            <div className={cn("flex items-center gap-2 font-semibold", config.headerClassName)}>
              <Icon className="h-4 w-4" />
              {config.label}
            </div>
            <p className={cn("mt-0.5 text-xs", config.helperClassName)}>{config.helper}</p>
          </div>
        </div>
        <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-md border px-2 text-xs font-semibold shadow-xs", config.countClassName)}>{tasks.length}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-1">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <div key={task.id} className={cn("group cursor-pointer rounded-md border bg-card p-4 text-left shadow-xs transition hover:ring-2 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2", config.ringClassName)}>
              <TaskCard task={task} onSelect={onSelectTask} onOpenPatientChat={onOpenPatientChat} />
            </div>
          ))
        ) : (
          <EmptyColumn isFiltering={isFiltering} />
        )}
      </div>
    </section>
  );
}
