"use client"

import { useEffect, useMemo, useState } from "react"
import type { ComponentType } from "react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  Timer,
  Trash2,
  UserRound,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type TaskStatus = "aguardando" | "resolvendo" | "finalizado"

interface Task {
  id: string
  subject: string
  description: string
  creator: string
  creatorInitials: string
  responsible: string
  responsibleInitials: string
  patient: string
  type: string
  status: TaskStatus
  statusLabel: string
  createdAt: string
  dueDate: string
}

const statusOrder: TaskStatus[] = ["aguardando", "resolvendo", "finalizado"]

const statusConfig: Record<
  TaskStatus,
  {
    label: string
    helper: string
    icon: ComponentType<{ className?: string }>
    columnClassName: string
    headerClassName: string
    helperClassName: string
    markerClassName: string
    countClassName: string
  }
> = {
  aguardando: {
    label: "Aguardando",
    helper: "Pendentes de triagem ou início",
    icon: CircleDashed,
    columnClassName: "border-amber-300 bg-amber-50 dark:border-amber-500/55 dark:bg-[#3a2a0b]",
    headerClassName: "text-amber-950 dark:text-amber-200",
    helperClassName: "text-amber-800/75 dark:text-amber-100/65",
    markerClassName: "bg-amber-600",
    countClassName: "border-amber-200 bg-amber-100 text-amber-950 dark:border-amber-400/35 dark:bg-amber-300/15 dark:text-amber-100",
  },
  resolvendo: {
    label: "Resolvendo",
    helper: "Em acompanhamento pela equipe",
    icon: Timer,
    columnClassName: "border-cyan-300 bg-cyan-50 dark:border-cyan-500/55 dark:bg-[#082f3b]",
    headerClassName: "text-cyan-950 dark:text-cyan-200",
    helperClassName: "text-cyan-800/75 dark:text-cyan-100/65",
    markerClassName: "bg-cyan-600",
    countClassName: "border-cyan-200 bg-cyan-100 text-cyan-950 dark:border-cyan-400/35 dark:bg-cyan-300/15 dark:text-cyan-100",
  },
  finalizado: {
    label: "Finalizadas",
    helper: "Concluídas no fluxo",
    icon: CheckCircle2,
    columnClassName: "border-teal-300 bg-teal-50 dark:border-teal-500/55 dark:bg-[#0b332d]",
    headerClassName: "text-teal-950 dark:text-teal-200",
    helperClassName: "text-teal-800/75 dark:text-teal-100/65",
    markerClassName: "bg-teal-600",
    countClassName: "border-teal-200 bg-teal-100 text-teal-950 dark:border-teal-400/35 dark:bg-teal-300/15 dark:text-teal-100",
  },
}

const filterAll = "Todos"

function formatDateTime(value: string, options: Intl.DateTimeFormatOptions) {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("pt-BR", options).format(date)
}

function isOverdue(task: Task) {
  if (!task.dueDate || task.status === "finalizado") return false

  const dueDate = new Date(task.dueDate)
  if (Number.isNaN(dueDate.getTime())) return false

  dueDate.setHours(23, 59, 59, 999)
  return dueDate.getTime() < Date.now()
}

function uniqueValues(tasks: Task[], key: keyof Task) {
  return Array.from(new Set(tasks.map((task) => String(task[key] || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  )
}

async function fetchTaskRecords({ signal, refresh = false }: { signal?: AbortSignal; refresh?: boolean } = {}) {
  const response = await fetch(`/api/airtable/tasks${refresh ? "?refresh=1" : ""}`, { cache: "no-store", signal })
  const data = (await response.json()) as { tasks?: Task[]; message?: string }

  if (!response.ok) {
    throw new Error(data.message || "Não foi possível carregar os encaminhamentos.")
  }

  return data.tasks ?? []
}

function TaskCard({ task, onSelect }: { task: Task; onSelect: (task: Task) => void }) {
  const overdue = isOverdue(task)
  const dueDate = formatDateTime(task.dueDate, { day: "2-digit", month: "short", year: "numeric" })
  const createdAt = formatDateTime(task.createdAt, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect(task)
        }
      }}
      className="group cursor-pointer rounded-md border bg-card p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="max-w-full truncate border-primary/20 bg-primary/5 text-[11px] text-primary">
              {task.type || "Encaminhamento"}
            </Badge>
            {overdue ? (
              <Badge className="border-destructive/25 bg-destructive/5 text-[11px] text-destructive" variant="outline">
                <AlertCircle className="h-3 w-3" />
                Atrasada
              </Badge>
            ) : null}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
            {task.subject || "Encaminhamento sem assunto"}
          </h3>
        </div>
        <Avatar className="h-8 w-8 shrink-0 border border-primary/15">
          <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
            {task.responsibleInitials}
          </AvatarFallback>
        </Avatar>
      </div>

      {task.description ? (
        <p className="mb-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{task.description}</p>
      ) : (
        <p className="mb-4 text-sm italic leading-6 text-muted-foreground">Sem observações registradas.</p>
      )}

      <div className="space-y-3 border-t pt-3">
        {task.patient ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            <span className="truncate">{task.patient}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Responsável</p>
            <p className="truncate text-xs font-medium text-foreground">{task.responsible}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prazo</p>
            <p className={cn("text-xs font-medium", overdue ? "text-destructive" : "text-foreground")}>
              {dueDate || "Sem prazo"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="truncate">Criado por {task.creator}</span>
          {createdAt ? (
            <span className="flex shrink-0 items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {createdAt}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function EmptyColumn({ isFiltering }: { isFiltering: boolean }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed bg-background/70 p-6 text-center">
      <CheckCircle2 className="mb-2 h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{isFiltering ? "Nada encontrado" : "Sem encaminhamentos"}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isFiltering ? "Ajuste busca ou filtros para ampliar a lista." : "Quando houver registros, eles aparecem aqui."}
      </p>
    </div>
  )
}

function KanbanColumn({
  status,
  tasks,
  isFiltering,
  onSelectTask,
}: {
  status: TaskStatus
  tasks: Task[]
  isFiltering: boolean
  onSelectTask: (task: Task) => void
}) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <section className={cn("flex min-w-[300px] flex-1 flex-col rounded-md border p-3", config.columnClassName)}>
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="flex items-start gap-2">
          <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", config.markerClassName)} />
          <div>
            <div className={cn("flex items-center gap-2 font-semibold", config.headerClassName)}>
              <Icon className="h-4 w-4" />
              {config.label}
            </div>
            <p className={cn("mt-0.5 text-xs", config.helperClassName)}>{config.helper}</p>
          </div>
        </div>
        <span
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded-md border px-2 text-xs font-semibold shadow-xs",
            config.countClassName,
          )}
        >
          {tasks.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {tasks.length > 0 ? (
          tasks.map((task) => <TaskCard key={task.id} task={task} onSelect={onSelectTask} />)
        ) : (
          <EmptyColumn isFiltering={isFiltering} />
        )}
      </div>
    </section>
  )
}

function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-36 justify-between bg-background">
          <span className="truncate">{value === filterAll ? label : value}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 min-w-48 overflow-y-auto">
        {[filterAll, ...options].map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onChange(option)}>
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DetailRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm text-foreground">{value || "Nao informado"}</p>
    </div>
  )
}

function TaskDetailsDialog({
  task,
  open,
  onOpenChange,
  onDelete,
  isDeleting,
  errorMessage,
}: {
  task: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (task: Task) => void
  isDeleting: boolean
  errorMessage: string
}) {
  const overdue = task ? isOverdue(task) : false
  const createdAt = task
    ? formatDateTime(task.createdAt, {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""
  const dueDate = task ? formatDateTime(task.dueDate, { day: "2-digit", month: "long", year: "numeric" }) : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {task ? (
          <>
            <DialogHeader className="pr-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                  {task.type || "Tarefa"}
                </Badge>
                <Badge variant="outline" className={cn(overdue ? "border-destructive/25 bg-destructive/5 text-destructive" : "")}>
                  {overdue ? "Atrasada" : task.statusLabel || statusConfig[task.status].label}
                </Badge>
              </div>
              <DialogTitle className="pt-2 text-xl leading-7">{task.subject || "Tarefa sem assunto"}</DialogTitle>
              <DialogDescription>Detalhes do encaminhamento registrado no Airtable.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 border-y py-4 sm:grid-cols-2">
              <DetailRow label="Paciente" value={task.patient} />
              <DetailRow label="Responsavel" value={task.responsible} />
              <DetailRow label="Criado por" value={task.creator} />
              <DetailRow label="Status" value={task.statusLabel || statusConfig[task.status].label} />
              <DetailRow label="Criada em" value={createdAt} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prazo</p>
                <p className={cn("mt-1 flex items-center gap-2 text-sm font-medium", overdue ? "text-destructive" : "text-foreground")}>
                  <CalendarDays className="h-4 w-4" />
                  {dueDate || "Sem prazo"}
                </p>
              </div>
              <DetailRow className="sm:col-span-2" label="Observacoes" value={task.description || "Sem observacoes registradas."} />
            </div>

            {errorMessage ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {errorMessage}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
                Fechar
              </Button>
              <Button type="button" variant="destructive" onClick={() => onDelete(task)} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeleting ? "Excluindo..." : "Excluir tarefa"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState(filterAll)
  const [creatorFilter, setCreatorFilter] = useState(filterAll)
  const [responsibleFilter, setResponsibleFilter] = useState(filterAll)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState("")
  const [taskActionError, setTaskActionError] = useState("")

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        setErrorMessage("")
        setTasks(await fetchTaskRecords({ signal: controller.signal }))
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os encaminhamentos.")
        setTasks([])
      } finally {
        setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

  const loadTasks = async ({ refresh = false }: { refresh?: boolean } = {}) => {
    const shouldShowFullLoader = tasks.length === 0
    setIsLoading(shouldShowFullLoader)
    setIsRefreshing(!shouldShowFullLoader)
    setErrorMessage("")

    try {
      setTasks(await fetchTaskRecords({ refresh }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os encaminhamentos.")
      if (tasks.length === 0) setTasks([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const handleDeleteTask = async (task: Task) => {
    const shouldDelete = window.confirm(`Excluir a tarefa "${task.subject || task.type || "sem assunto"}"?`)
    if (!shouldDelete) return

    setDeletingTaskId(task.id)
    setTaskActionError("")

    try {
      const response = await fetch(`/api/airtable/tasks?id=${encodeURIComponent(task.id)}`, {
        method: "DELETE",
      })
      const data = (await response.json()) as { message?: string }

      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel excluir a tarefa.")
      }

      setTasks((current) => current.filter((currentTask) => currentTask.id !== task.id))
      setSelectedTask(null)
    } catch (error) {
      setTaskActionError(error instanceof Error ? error.message : "Nao foi possivel excluir a tarefa.")
    } finally {
      setDeletingTaskId("")
    }
  }

  const typeOptions = useMemo(() => uniqueValues(tasks, "type"), [tasks])
  const creatorOptions = useMemo(() => uniqueValues(tasks, "creator"), [tasks])
  const responsibleOptions = useMemo(() => uniqueValues(tasks, "responsible"), [tasks])

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return tasks.filter((task) => {
      const matchesQuery = query
        ? [task.subject, task.description, task.patient, task.creator, task.responsible, task.type]
            .join(" ")
            .toLowerCase()
            .includes(query)
        : true
      const matchesType = typeFilter === filterAll || task.type === typeFilter
      const matchesCreator = creatorFilter === filterAll || task.creator === creatorFilter
      const matchesResponsible = responsibleFilter === filterAll || task.responsible === responsibleFilter

      return matchesQuery && matchesType && matchesCreator && matchesResponsible
    })
  }, [creatorFilter, responsibleFilter, searchQuery, tasks, typeFilter])

  const tasksByStatus = useMemo(
    () =>
      statusOrder.reduce(
        (acc, status) => {
          acc[status] = filteredTasks.filter((task) => task.status === status)
          return acc
        },
        {} as Record<TaskStatus, Task[]>,
      ),
    [filteredTasks],
  )

  const isFiltering =
    Boolean(searchQuery.trim()) || typeFilter !== filterAll || creatorFilter !== filterAll || responsibleFilter !== filterAll
  const totalOpen = tasksByStatus.aguardando.length + tasksByStatus.resolvendo.length

  return (
    <div className="flex h-screen flex-1 flex-col bg-background">
      <header className="border-b bg-card px-6 py-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-cyan-600" />
                Airtable / Encaminhamentos
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-foreground">Tarefas</h1>
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-md border bg-background shadow-xs">
              <div className="px-4 py-2 text-center">
                <p className="text-lg font-semibold text-foreground">{filteredTasks.length}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Visíveis</p>
              </div>
              <div className="border-x px-4 py-2 text-center">
                <p className="text-lg font-semibold text-foreground">{totalOpen}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Abertas</p>
              </div>
              <div className="px-4 py-2 text-center">
                <p className="text-lg font-semibold text-foreground">{tasksByStatus.finalizado.length}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Finalizadas</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por assunto, paciente, responsável..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-10 bg-background pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterMenu label="Tipo" value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
              <FilterMenu label="Criador" value={creatorFilter} options={creatorOptions} onChange={setCreatorFilter} />
              <FilterMenu
                label="Responsável"
                value={responsibleFilter}
                options={responsibleOptions}
                onChange={setResponsibleFilter}
              />
              <Button
                type="button"
                variant="outline"
                className="bg-background"
                onClick={() => loadTasks({ refresh: true })}
                disabled={isLoading || isRefreshing}
              >
                {isLoading || isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {isRefreshing ? "Atualizando" : "Atualizar"}
              </Button>
            </div>
          </div>

          {errorMessage ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errorMessage}
            </div>
          ) : null}
          {isRefreshing ? (
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Atualizando tarefas em segundo plano...
            </div>
          ) : null}
        </div>
      </header>

      <main className="flex flex-1 gap-4 overflow-x-auto p-5">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando encaminhamentos
            </div>
          </div>
        ) : (
          statusOrder.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              isFiltering={isFiltering}
              onSelectTask={(task) => {
                setTaskActionError("")
                setSelectedTask(task)
              }}
            />
          ))
        )}
      </main>
      <TaskDetailsDialog
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) {
            setTaskActionError("")
            setSelectedTask(null)
          }
        }}
        onDelete={handleDeleteTask}
        isDeleting={Boolean(selectedTask && deletingTaskId === selectedTask.id)}
        errorMessage={taskActionError}
      />
    </div>
  )
}
