import { StatusConfigMap, Task, TaskStatus } from "@/lib/task";
import { cn } from "@/lib/utils";
import { EmptyColumn } from "./empty-column";
import { TaskCard } from "./task-card";

interface TaskStatusGridProps {
  status: TaskStatus;
  tasks: Task[];
  isFiltering: boolean;
  onSelectTask: (task: Task) => void;
  onOpenPatientChat: (task: Task) => void;
  statusConfig: StatusConfigMap;
}

export function TaskStatusGrid({ status, tasks, isFiltering, onSelectTask, onOpenPatientChat, statusConfig }: TaskStatusGridProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  const colorName = config?.markerClassName?.replace("bg-", "") || "theme-primary/50";

  return (
    <section className={cn("flex min-w-full flex-1 flex-col rounded-md border p-3", config.columnClassName)}>
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

      {tasks.length > 0 ? (
        <div className="p-1 grid flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 overflow-y-auto pr-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "group cursor-pointer rounded-md border bg-card p-4 text-left shadow-xs transition hover:ring-2 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2",
                `hover:ring-${colorName} focus-visible:ring-${colorName}`,
              )}
            >
              <TaskCard task={task} onSelect={onSelectTask} onOpenPatientChat={onOpenPatientChat} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyColumn isFiltering={isFiltering} />
      )}
    </section>
  );
}
