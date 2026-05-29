import { CheckCircle2 } from "lucide-react";

export function EmptyColumn({ isFiltering }: { isFiltering: boolean }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed bg-background/70 p-6 text-center">
      <CheckCircle2 className="mb-2 h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{isFiltering ? "Nada encontrado" : "Sem encaminhamentos"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{isFiltering ? "Ajuste busca ou filtros para ampliar a lista." : "Quando houver registros, eles aparecem aqui."}</p>
    </div>
  );
}
