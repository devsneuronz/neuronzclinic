"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Loader2, Plus, Stethoscope, X } from "lucide-react";
import { useState } from "react";
import { ProfessionalCard, SettingsProfessional } from "./professional-card";

interface ProfessionalsProps {
  sortedProfessionals: SettingsProfessional[];
  isLoadingProfessionals: boolean;
  professionalError: string | null;
  procedures: any[];
  expertises: any[];
  onProfessionalAdded: () => void;
  onExpertiseAdded: (newExpertise: any) => void;
}

export function Professionals({
  sortedProfessionals,
  isLoadingProfessionals,
  professionalError,
  procedures,
  expertises,
  onProfessionalAdded,
  onExpertiseAdded,
}: ProfessionalsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [cpf, setCpf] = useState("");
  const [doencasAtendidas, setDoencasAtendidas] = useState("");
  const [selectedExpertiseId, setSelectedExpertiseId] = useState<string>("");
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);

  // Specialty inline adding states
  const [isAddingSpecialty, setIsAddingSpecialty] = useState(false);
  const [newSpecialtyName, setNewSpecialtyName] = useState("");
  const [isSavingSpecialty, setIsSavingSpecialty] = useState(false);

  // Handle specialty saving
  const handleSaveSpecialty = async () => {
    if (!newSpecialtyName.trim()) return;
    setIsSavingSpecialty(true);
    setError(null);
    try {
      const response = await fetch("/api/expertise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ especialidade: newSpecialtyName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Erro ao salvar especialidade");

      onExpertiseAdded(data.expertise);
      setSelectedExpertiseId(data.expertise.id);
      setNewSpecialtyName("");
      setIsAddingSpecialty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar especialidade.");
    } finally {
      setIsSavingSpecialty(false);
    }
  };

  // Toggle procedure selection
  const handleToggleProcedure = (id: string) => {
    setSelectedProcedureIds((current) =>
      current.includes(id) ? current.filter((pId) => pId !== id) : [...current, id]
    );
  };

  // Handle professional saving
  const handleSaveProfessional = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Nome e E-mail são obrigatórios.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        nome: name.trim(),
        email: email.trim(),
        cidade: cidade.trim(),
        cpf: cpf.trim(),
        doencas_atendidas: doencasAtendidas.trim(),
        expertises: selectedExpertiseId ? [selectedExpertiseId] : [],
        procedures: selectedProcedureIds,
      };

      const response = await fetch("/api/professionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Erro ao salvar profissional");

      onProfessionalAdded();
      setIsOpen(false);
      // Reset form
      setName("");
      setEmail("");
      setCidade("");
      setCpf("");
      setDoencasAtendidas("");
      setSelectedExpertiseId("");
      setSelectedProcedureIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o profissional.");
    } finally {
      setIsSaving(false);
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
      <div className="flex justify-end">
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Profissional
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg overflow-y-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Cadastrar Profissional</DialogTitle>
              <DialogDescription>
                Insira os dados do profissional. Caso o e-mail pertença a um usuário existente, eles serão vinculados.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveProfessional} className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="name">Nome completo *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Dr. João Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">E-mail *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Ex: joao.silva@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    placeholder="Ex: São Paulo"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input
                    id="cpf"
                    placeholder="Ex: 000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="doencas">Doenças Atendidas</Label>
                <Input
                  id="doencas"
                  placeholder="Ex: Hipertensão, Diabetes"
                  value={doencasAtendidas}
                  onChange={(e) => setDoencasAtendidas(e.target.value)}
                />
              </div>

              {/* Specialty Section */}
              <div className="space-y-1">
                <Label>Especialidade</Label>
                {!isAddingSpecialty ? (
                  <div className="flex gap-2">
                    <Select value={selectedExpertiseId} onValueChange={setSelectedExpertiseId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione uma especialidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {expertises.map((exp: any) => (
                          <SelectItem key={exp.id} value={exp.id}>
                            {exp.especialidade}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setIsAddingSpecialty(true)}
                      title="Adicionar Nova Especialidade"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center bg-muted/40 p-2 rounded-lg border">
                    <Input
                      placeholder="Nova especialidade..."
                      value={newSpecialtyName}
                      onChange={(e) => setNewSpecialtyName(e.target.value)}
                      className="flex-1 h-9"
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleSaveSpecialty}
                      disabled={isSavingSpecialty}
                      className="h-9 w-9 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                    >
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
                      className="h-9 w-9 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Procedures Section */}
              <div className="space-y-2">
                <Label>Procedimentos de Responsabilidade</Label>
                <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2 bg-card">
                  {procedures.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Nenhum procedimento cadastrado.</span>
                  ) : (
                    procedures.map((proc: any) => (
                      <label key={proc.id} className="flex items-center gap-2.5 text-sm cursor-pointer select-none py-1">
                        <input
                          type="checkbox"
                          checked={selectedProcedureIds.includes(proc.id)}
                          onChange={() => handleToggleProcedure(proc.id)}
                          className="rounded border-gray-300 text-theme-primary focus:ring-theme-primary h-4 w-4"
                        />
                        <span>{proc.nome}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/25">{error}</p>}

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Confirmar Cadastro
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {sortedProfessionals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-xl bg-muted/20">
          <Stethoscope className="h-10 w-10 text-muted-foreground/60 mb-2" />
          <h3 className="font-medium text-foreground">Nenhum profissional cadastrado</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            Cadastre o primeiro profissional de saúde da clínica clicando no botão acima.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
          {sortedProfessionals.map((professional) => (
            <ProfessionalCard key={professional.id} professional={professional} />
          ))}
        </div>
      )}
    </div>
  );
}
