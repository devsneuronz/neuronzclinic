"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Loader2, Plus, Save, Stethoscope, Trash2, UserCog, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SupabaseProcedure } from "./clinic-info-manager";
import { ProfessionalCard } from "./professional-card";
import type { ProfessionalUserOption } from "./settings";

const MAX_SELECTED_EXPERTISES = 2;
const NO_LINKED_USER = "__none__";

function getUserOptionKey(user: ProfessionalUserOption) {
  return `${user.source}:${user.id}`;
}

export type SettingsProfessional = {
  id: string;
  name: string;
  email: string;
  cidade?: string;
  cpf?: string;
  doencas_atendidas?: string;
  user_id?: string | null;
  expertises: Expertise[];
  procedures: SupabaseProcedure[];
};

export type Expertise = {
  id: string;
  especialidade: string;
};

interface ProfessionalsProps {
  sortedProfessionals: SettingsProfessional[];
  isLoadingProfessionals: boolean;
  professionalError: string | null;
  procedures: SupabaseProcedure[];
  expertises: Expertise[];
  users: ProfessionalUserOption[];
  onProfessionalAdded: () => void;
  onExpertiseAdded: (newExpertise: Expertise) => void;
  onExpertiseDeleted: (expertiseId: string) => void;
}

export function Professionals({ sortedProfessionals, isLoadingProfessionals, professionalError, procedures, expertises, users, onProfessionalAdded, onExpertiseAdded, onExpertiseDeleted }: ProfessionalsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingProfessional, setEditingProfessional] = useState<SettingsProfessional | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [cpf, setCpf] = useState("");
  const [doencasAtendidas, setDoencasAtendidas] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(NO_LINKED_USER);
  const [selectedExpertiseIds, setSelectedExpertiseIds] = useState<string[]>([]);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);

  const [isAddingSpecialty, setIsAddingSpecialty] = useState(false);
  const [newSpecialtyName, setNewSpecialtyName] = useState("");
  const [isSavingSpecialty, setIsSavingSpecialty] = useState(false);
  const [deletingExpertiseId, setDeletingExpertiseId] = useState<string | null>(null);
  const [confirmingDeleteExpertiseId, setConfirmingDeleteExpertiseId] = useState<string | null>(null);

  const hasChanges = (() => {
    if (!editingProfessional) {
      return name.trim().length > 0 && email.trim().length > 0;
    }

    const origExpertiseIds = editingProfessional.expertises?.map((e) => e.id) || [];
    const origProcedures = editingProfessional.procedures?.map((p) => p.id) || [];

    const expertisesChanged = origExpertiseIds.length !== selectedExpertiseIds.length || !selectedExpertiseIds.every((id) => origExpertiseIds.includes(id));
    const proceduresChanged = origProcedures.length !== selectedProcedureIds.length || !selectedProcedureIds.every((id) => origProcedures.includes(id));
    const originalUserKey = editingProfessional.user_id ? `supabase:${editingProfessional.user_id}` : NO_LINKED_USER;
    const userChanged = selectedUserId !== originalUserKey;

    return (
      name.trim() !== (editingProfessional.name || "") ||
      email.trim() !== (editingProfessional.email || "") ||
      cidade.trim() !== (editingProfessional.cidade || "") ||
      cpf.trim() !== (editingProfessional.cpf || "") ||
      doencasAtendidas.trim() !== (editingProfessional.doencas_atendidas || "") ||
      userChanged ||
      expertisesChanged ||
      proceduresChanged
    );
  })();

  const selectedUser = users.find((user) => getUserOptionKey(user) === selectedUserId);
  const hasLinkedUser = Boolean(selectedUser);
  const linkedSupabaseUserIds = new Set(sortedProfessionals.map((professional) => professional.user_id).filter((userId): userId is string => Boolean(userId && userId !== editingProfessional?.user_id)));
  const linkedEmails = new Set(
    sortedProfessionals
      .filter((professional) => professional.id !== editingProfessional?.id)
      .map((professional) => professional.email.trim().toLowerCase())
      .filter(Boolean),
  );

  const resetForm = () => {
    setEditingProfessional(null);
    setName("");
    setEmail("");
    setCidade("");
    setCpf("");
    setDoencasAtendidas("");
    setSelectedUserId(NO_LINKED_USER);
    setSelectedExpertiseIds([]);
    setSelectedProcedureIds([]);
    setError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsOpen(true);
  };

  const handleOpenEdit = (professional: SettingsProfessional) => {
    setEditingProfessional(professional);

    setName(professional.name || "");
    setEmail(professional.email || "");
    setCidade(professional.cidade || "");
    setCpf(professional.cpf || "");
    setDoencasAtendidas(professional.doencas_atendidas || "");
    setSelectedUserId(professional.user_id ? `supabase:${professional.user_id}` : NO_LINKED_USER);

    setSelectedExpertiseIds(professional.expertises?.map((e) => e.id) || []);
    setSelectedProcedureIds(professional.procedures?.map((p) => p.id) || []);

    setIsOpen(true);
  };

  const handleSelectUser = (value: string) => {
    setSelectedUserId(value);

    if (value === NO_LINKED_USER) {
      return;
    }

    const user = users.find((item) => getUserOptionKey(item) === value);
    if (!user) {
      return;
    }

    setName(user.name || "");
    setEmail(user.email || "");
  };

  const handleSaveProfessional = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Nome e E-mail são obrigatórios.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const isEditing = !!editingProfessional;

      const payload = {
        ...(isEditing && { id: editingProfessional.id }),
        user_id: selectedUser?.source === "supabase" ? selectedUser.id : null,
        linked_user_source: selectedUser?.source || null,
        nome: name.trim(),
        email: email.trim(),
        cidade: cidade.trim(),
        cpf: cpf.trim(),
        doencas_atendidas: doencasAtendidas.trim(),
        expertises: selectedExpertiseIds,
        procedures: selectedProcedureIds,
      };

      const response = await fetch("/api/professionals", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Erro ao salvar profissional");

      onProfessionalAdded();
      setIsOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o profissional.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSpecialty = async () => {
    if (!newSpecialtyName.trim()) return;
    setIsSavingSpecialty(true);
    setError(null);
    try {
      const response = await fetch("/api/expertise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertise: newSpecialtyName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Erro ao salvar especialidade");

      onExpertiseAdded(data.expertise);
      setSelectedExpertiseIds((current) => {
        if (current.includes(data.expertise.id) || current.length >= MAX_SELECTED_EXPERTISES) {
          return current;
        }

        return [...current, data.expertise.id];
      });
      setNewSpecialtyName("");
      setIsAddingSpecialty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar especialidade.");
    } finally {
      setIsSavingSpecialty(false);
    }
  };

  const handleToggleExpertise = (id: string) => {
    setSelectedExpertiseIds((current) => {
      if (current.includes(id)) {
        return current.filter((eId) => eId !== id);
      }

      if (current.length >= MAX_SELECTED_EXPERTISES) {
        return current;
      }

      return [...current, id];
    });
  };

  const handleDeleteExpertise = async (id: string) => {
    setDeletingExpertiseId(id);
    setConfirmingDeleteExpertiseId(null);
    setError(null);

    try {
      const response = await fetch(`/api/expertise?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || "Erro ao excluir especialidade");
      }

      setSelectedExpertiseIds((current) => current.filter((expertiseId) => expertiseId !== id));
      onExpertiseDeleted(id);
      onProfessionalAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir especialidade.");
    } finally {
      setDeletingExpertiseId(null);
    }
  };

  const handleToggleProcedure = (id: string) => {
    setSelectedProcedureIds((current) => (current.includes(id) ? current.filter((pId) => pId !== id) : [...current, id]));
  };

  const handleDeleteProfessional = async () => {
    if (!editingProfessional) return;
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/professionals?id=${editingProfessional.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Erro ao excluir profissional");

      onProfessionalAdded();
      setIsDeleteConfirmOpen(false);
      setIsOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o profissional.");
      setIsDeleteConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoadingProfessionals) {
    return (
      <div className="flex h-full min-h-[300px] flex-row gap-3 items-center justify-center rounded-2xl border border-dashed bg-card/50 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-theme-primary" />
        <span>Carregando profissionais...</span>
      </div>
    );
  }

  if (professionalError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
        {professionalError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button className="rounded-xl flex items-center gap-2" onClick={handleOpenCreate}>
        <Plus className="h-4 w-4" />
        Adicionar Profissional
      </Button>

      <div className="flex justify-end">
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-6 pb-2 shrink-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                {editingProfessional ? <UserCog className="h-4 w-4 text-theme-primary" /> : <UserPlus className="h-4 w-4 text-theme-primary" />}
                {editingProfessional ? "Editar Profissional" : "Cadastrar Profissional"}
              </DialogTitle>
              <DialogDescription>{editingProfessional ? "Atualize os dados cadastrais deste profissional." : "Insira os dados do profissional. Caso o e-mail pertença a um usuário existente, eles serão vinculados."}</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveProfessional} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 min-h-0 custom-scrollbar">
                <div className="space-y-2">
                  <label htmlFor="professional-user" className="text-xs font-semibold text-foreground">
                    Usuario vinculado
                  </label>
                  <Select value={selectedUserId} onValueChange={handleSelectUser}>
                    <SelectTrigger id="professional-user" className="w-full">
                      <SelectValue placeholder="Selecione um usuario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_LINKED_USER}>Sem usuario vinculado</SelectItem>
                      {users.map((user) => {
                        const userKey = getUserOptionKey(user);
                        const isLinkedToAnotherProfessional = user.source === "supabase" ? linkedSupabaseUserIds.has(user.id) : linkedEmails.has(user.email.trim().toLowerCase());

                        return (
                          <SelectItem key={userKey} value={userKey} disabled={isLinkedToAnotherProfessional}>
                            {user.name} - {user.email}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {hasLinkedUser && <p className="text-[11px] text-muted-foreground">Nome e e-mail serao herdados do usuario selecionado.</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-xs font-semibold text-foreground">
                      Nome completo *
                    </label>
                    <Input id="name" placeholder="Ex: Dr. João Silva" value={name} onChange={(e) => setName(e.target.value)} disabled={hasLinkedUser} required />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="email" className="text-xs font-semibold text-foreground">
                      E-mail *
                    </label>
                    <Input id="email" type="email" placeholder="Ex: joao.silva@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={hasLinkedUser} required />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="cidade" className="text-xs font-semibold text-foreground">
                      Cidade
                    </label>
                    <Input id="cidade" placeholder="Ex: São Paulo" value={cidade} onChange={(e) => setCidade(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="cpf" className="text-xs font-semibold text-foreground">
                      CPF
                    </label>
                    <Input id="cpf" placeholder="Ex: 000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="doencas" className="text-xs font-semibold text-foreground">
                    Doenças Atendidas
                  </label>
                  <Input id="doencas" placeholder="Ex: Hipertensão, Diabetes" value={doencasAtendidas} onChange={(e) => setDoencasAtendidas(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Especialidades *</label>
                    {!isAddingSpecialty && (
                      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs flex items-center gap-1 cursor-pointer" onClick={() => setIsAddingSpecialty(true)}>
                        <Plus className="h-3 w-3" />
                        Nova Especialidade
                      </Button>
                    )}
                  </div>

                  {!isAddingSpecialty ? (
                    <div className="border border-border/80 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1 bg-card/50 custom-scrollbar">
                      {expertises.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic block p-1">Nenhuma especialidade cadastrada.</span>
                      ) : (
                        expertises.map((exp: Expertise) => {
                          const isChecked = selectedExpertiseIds.includes(exp.id);
                          const isDisabled = selectedExpertiseIds.length >= MAX_SELECTED_EXPERTISES && !isChecked;
                          const isConfirmingDelete = confirmingDeleteExpertiseId === exp.id;

                          return (
                            <div key={exp.id} className={`flex items-center gap-2 rounded px-1.5 py-1 transition-all ${isDisabled ? "opacity-40" : "hover:bg-muted/40"}`}>
                              <label className={`flex min-w-0 flex-1 items-center gap-2.5 text-sm select-none ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() => handleToggleExpertise(exp.id)}
                                  className="rounded border-border text-theme-primary focus:ring-theme-primary h-4 w-4 disabled:opacity-50 cursor-pointer"
                                />
                                <span className="truncate text-xs font-medium text-foreground/90">{exp.especialidade}</span>
                              </label>
                              {isConfirmingDelete && <span className="shrink-0 text-[11px] font-medium text-destructive">Deseja mesmo excluir?</span>}
                              <Button
                                type="button"
                                variant={isConfirmingDelete ? "destructive" : "ghost"}
                                size="icon"
                                onClick={() => {
                                  if (isConfirmingDelete) {
                                    handleDeleteExpertise(exp.id);
                                    return;
                                  }

                                  setConfirmingDeleteExpertiseId(exp.id);
                                }}
                                disabled={deletingExpertiseId === exp.id}
                                className="h-6 w-6 shrink-0"
                                title={isConfirmingDelete ? "Confirmar exclusao" : "Excluir especialidade"}
                              >
                                {deletingExpertiseId === exp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isConfirmingDelete ? <Check className="h-3.5 w-3.5 text-destructive" /> : <X className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirmingDeleteExpertiseId(null)}
                                disabled={deletingExpertiseId === exp.id}
                                className={`h-6 w-6 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground ${isConfirmingDelete ? "" : "hidden"}`}
                                title="Cancelar exclusao"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center bg-muted/30 p-2 rounded-lg border border-border/60">
                      <Input placeholder="Nova especialidade..." value={newSpecialtyName} onChange={(e) => setNewSpecialtyName(e.target.value)} className="flex-1 h-9 bg-background" autoFocus />
                      <Button type="button" variant="ghost" size="icon" onClick={handleSaveSpecialty} disabled={isSavingSpecialty} className="h-9 w-9 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 shrink-0">
                        {isSavingSpecialty ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setIsAddingSpecialty(false);
                          setNewSpecialtyName("");
                        }}
                        className="h-9 w-9 text-destructive hover:text-destructive/80 hover:bg-destructive/10 shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Procedimentos de Responsabilidade</label>
                  <div className="border border-border/80 rounded-lg p-3 max-h-36 overflow-y-auto space-y-1 bg-card/50 custom-scrollbar">
                    {procedures.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic block p-1">Nenhum procedimento cadastrado.</span>
                    ) : (
                      procedures.map((proc: SupabaseProcedure) => (
                        <label key={proc.id} className="flex items-center gap-2.5 text-sm cursor-pointer select-none py-1 rounded px-1.5 hover:bg-muted/40 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedProcedureIds.includes(proc.id)}
                            onChange={() => handleToggleProcedure(proc.id)}
                            className="rounded border-border text-theme-primary focus:ring-theme-primary h-4 w-4 cursor-pointer"
                          />
                          <span className="text-xs font-medium text-foreground/90">{proc.nome}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {error && <p className="text-xs font-medium text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20 animate-fade-in">{error}</p>}
              </div>

              <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/20 shrink-0 flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSaving} className="gap-2 h-9 text-xs font-medium">
                    Cancelar
                  </Button>
                  <Button variant="primary" type="submit" disabled={isSaving || !hasChanges} className="gap-2 h-9 text-xs font-medium">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editingProfessional ? "Salvar Alterações" : "Confirmar Cadastro"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Excluir Profissional
              </DialogTitle>
              <DialogDescription className="pt-2">
                Tem certeza que deseja excluir o profissional <strong>{editingProfessional?.name}</strong>? Esta ação não poderá ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDeleteConfirmOpen(false)} disabled={isDeleting} className="h-9 text-xs font-medium">
                Cancelar
              </Button>
              <Button type="button" variant="destructive" onClick={handleDeleteProfessional} disabled={isDeleting} className="gap-2 h-9 text-xs font-medium">
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Confirmar Exclusão
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {sortedProfessionals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-xl bg-muted/20">
          <Stethoscope className="h-10 w-10 text-muted-foreground/60 mb-2" />
          <h3 className="font-medium text-foreground">Nenhum profissional cadastrado</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">Cadastre o primeiro profissional de saúde da clínica clicando no botão acima.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedProfessionals.map((professional) => (
            <ProfessionalCard
              key={professional.id}
              professional={professional}
              onEdit={() => handleOpenEdit(professional)}
              onDelete={() => {
                setEditingProfessional(professional);
                setIsDeleteConfirmOpen(true);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

