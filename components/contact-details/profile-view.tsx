import { ChatRecord } from "@/lib/supabase-rest";
import { Input } from "../ui/input";
import { Calendar, ChevronDown, FileText, GripVertical, Check, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import type { ChatTag } from "@/lib/chat-tags";
import { getChatTags, getReadableTextColor } from "@/lib/chat-tags";
import { getChatStatusColor, getChatStatusLabel, type ChatStatusOption } from "@/lib/chat-status";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Textarea } from "../ui/textarea";
import { Field, FieldDescription, FieldLabel } from "../ui/fields";

interface ProfileViewProps {
  chat?: ChatRecord;
  contactPhone?: string;
  statusOptions?: ChatStatusOption[];
  tagOptions?: ChatTag[];
  interestOptions?: ChatTag[];
  onChangeStatus?: (status: ChatStatusOption) => void;
  onToggleTag?: (tag: ChatTag) => void;
  onReorderTags?: (tags: ChatTag[]) => void;
  onCommitTagOrder?: (tags: ChatTag[]) => void;
  onChangeName?: (name: string) => Promise<void> | void;
}

function getDisplayName(chat?: ChatRecord) {
  return chat?.nome_contato || chat?.pushname || chat?.chat_id?.replace("@s.whatsapp.net", "") || "Contato sem nome";
}

function getMergedTags(...groups: ChatTag[][]) {
  const tags = new Map<string, ChatTag>();

  for (const group of groups) {
    for (const tag of group) {
      const key = tag.id || tag.label;
      if (!tags.has(key)) tags.set(key, tag);
    }
  }

  return Array.from(tags.values());
}

function getMergedStatusOptions(...groups: ChatStatusOption[][]) {
  const statuses = new Map<string, ChatStatusOption>();

  for (const group of groups) {
    for (const status of group) {
      if (!status.label || statuses.has(status.label)) continue;
      statuses.set(status.label, status);
    }
  }

  return Array.from(statuses.values());
}

export function ProfileView({ chat, contactPhone, statusOptions = [], tagOptions = [], onChangeStatus, onToggleTag, onReorderTags, onCommitTagOrder, onChangeName }: ProfileViewProps) {
  const [bottomTab, setBottomTab] = useState<"consultas" | "avisos">("consultas");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [draggedTagId, setDraggedTagId] = useState<string | null>(null);
  const pendingReorderedTagsRef = useRef<ChatTag[] | null>(null);
  const tags = getChatTags(chat);
  const [selectedInterests, setSelectedInterests] = useState<ChatTag[]>([]);
  const selectedTagKeys = new Set(tags.flatMap((tag) => [tag.id, tag.label.toLowerCase()]));
  const availableTags = getMergedTags(tags, tagOptions);
  const availableInterest = getMergedTags(selectedInterests, tagOptions);
  const availableStatuses = getMergedStatusOptions(
    [
      {
        label: getChatStatusLabel(chat),
        color: getChatStatusColor(chat),
      },
    ],
    statusOptions,
  );

  const bottomTabs = [
    { id: "consultas", label: "Consultas" },
    { id: "avisos", label: "Avisos / Tarefas" },
  ] as const;

  function moveTag(targetTagId: string) {
    if (!draggedTagId || draggedTagId === targetTagId) return;

    const draggedIndex = tags.findIndex((tag) => tag.id === draggedTagId);
    const targetIndex = tags.findIndex((tag) => tag.id === targetTagId);
    if (draggedIndex < 0 || targetIndex < 0) return;

    const nextTags = [...tags];
    const [draggedTag] = nextTags.splice(draggedIndex, 1);
    nextTags.splice(targetIndex, 0, draggedTag);
    pendingReorderedTagsRef.current = nextTags;
    onReorderTags?.(nextTags);
  }

  function finishTagDrag() {
    setDraggedTagId(null);

    if (pendingReorderedTagsRef.current) {
      onCommitTagOrder?.(pendingReorderedTagsRef.current);
      pendingReorderedTagsRef.current = null;
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Status contato</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center justify-between rounded px-3 py-1.5 text-sm font-medium shadow-sm"
                  style={{
                    backgroundColor: getChatStatusColor(chat),
                    color: getReadableTextColor(getChatStatusColor(chat)),
                  }}
                >
                  {getChatStatusLabel(chat)}
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-[100] max-h-72 w-56">
                {availableStatuses.map((status) => (
                  <DropdownMenuItem key={status.label} className="cursor-pointer" onClick={() => onChangeStatus?.(status)}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color || "#22c55e" }} />
                    <span className="truncate">{status.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Status agendamento</label>
            <button className="flex w-full items-center justify-between rounded bg-muted px-3 py-1.5 text-sm text-muted-foreground">
              Nenhum
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <button className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
            <span>+ Agendamento</span>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
            <span>+ Aviso / Tarefa</span>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="mb-4">
          <Accordion type="single" collapsible defaultValue="contact-info">
            <AccordionItem value="contact-info" className="border-none rounded-xl bg-muted/60 px-3">
              <AccordionTrigger className="py-3 text-sm font-semibold text-foreground hover:no-underline">Informações do contato</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 gap-3 p-1">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">Cidade residência</label>
                    <Input className="h-8 bg-background text-sm" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">Cidade desejada</label>
                    <Input className="h-8 bg-background text-sm" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">Email</label>
                    <Input className="h-8 bg-background text-sm" type="email" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">Celular</label>
                    <Input className="h-8 bg-background text-sm" defaultValue={contactPhone || chat?.phone_contact || ""} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-semibold text-foreground">Interesses</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex w-full flex-wrap items-center gap-2 rounded border border-border bg-card px-3 py-2 text-left">
                {selectedInterests.length > 0 ? (
                  selectedInterests.map((interest) => (
                    <span
                      key={interest.id}
                      draggable
                      className={cn("flex cursor-grab items-center gap-1 rounded bg-teal-600 px-2 py-0.5 text-xs font-medium text-white transition-opacity active:cursor-grabbing", draggedTagId === interest.id && "opacity-50")}
                      style={
                        interest.color
                          ? {
                              backgroundColor: interest.color,
                              color: getReadableTextColor(interest.color),
                            }
                          : undefined
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", interest.id);
                        setDraggedTagId(interest.id);
                      }}
                      onDragEnter={() => moveTag(interest.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnd={finishTagDrag}
                    >
                      <GripVertical className="h-3 w-3 opacity-60" />
                      {interest.label}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhum interesse</span>
                )}
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[100] max-h-72 w-72">
              {availableInterest.length > 0 ? (
                availableInterest.map((interest) => (
                  <DropdownMenuCheckboxItem
                    key={interest.id || interest.label}
                    checked={selectedInterests.some((i) => i.id === interest.id)}
                    className="cursor-pointer"
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => {
                      setSelectedInterests((prev) => (prev.some((i) => i.id === interest.id) ? prev.filter((i) => i.id !== interest.id) : [...prev, interest]));
                    }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: interest.color || "#0d9488" }} />
                    <span className="truncate">{interest.label}</span>
                  </DropdownMenuCheckboxItem>
                ))
              ) : (
                <DropdownMenuItem disabled>Nenhum interesse encontrado</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-4">
          <div className="mb-1.5">
            <label className="block text-sm font-semibold text-foreground">Tags do contato</label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Arraste para reordenar. As 3 primeiras aparecem na lista.</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex w-full flex-wrap items-center gap-2 rounded border border-border bg-card px-3 py-2 text-left">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <span
                      key={tag.id}
                      draggable
                      className={cn("flex cursor-grab items-center gap-1 rounded bg-teal-600 px-2 py-0.5 text-xs font-medium text-white transition-opacity active:cursor-grabbing", draggedTagId === tag.id && "opacity-50")}
                      style={
                        tag.color
                          ? {
                              backgroundColor: tag.color,
                              color: getReadableTextColor(tag.color),
                            }
                          : undefined
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", tag.id);
                        setDraggedTagId(tag.id);
                      }}
                      onDragEnter={() => moveTag(tag.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnd={finishTagDrag}
                    >
                      <GripVertical className="h-3 w-3 opacity-60" />
                      {tag.label}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhuma tag</span>
                )}
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[100] max-h-72 w-72">
              {availableTags.length > 0 ? (
                availableTags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id || tag.label}
                    checked={selectedTagKeys.has(tag.id) || selectedTagKeys.has(tag.label.toLowerCase())}
                    className="cursor-pointer"
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => onToggleTag?.(tag)}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || "#0d9488" }} />
                    <span className="truncate">{tag.label}</span>
                  </DropdownMenuCheckboxItem>
                ))
              ) : (
                <DropdownMenuItem disabled>Nenhuma tag encontrada</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-4">
          <Field>
            <FieldLabel htmlFor="textarea-message">Anotações</FieldLabel>
            <FieldDescription className="text-[11px] text-muted-foreground">Adicione anotações sobre o atendimento, preferências ou lembretes.</FieldDescription>
            <Textarea id="textarea-message" className="max-h-48" />
          </Field>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="flex">
          {bottomTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setBottomTab(tab.id)}
              className={cn("flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors", bottomTab === tab.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="h-32 p-4">{bottomTab === "consultas" ? <p className="text-sm text-muted-foreground">Nenhuma consulta registrada</p> : <p className="text-sm text-muted-foreground">Nenhum aviso ou tarefa</p>}</div>
      </div>
    </>
  );
}
