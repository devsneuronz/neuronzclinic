import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CircleCheck, Loader2, Trash2 } from "lucide-react";

export type ConfirmActionDialogState = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  isLoading?: boolean;
  onConfirm: () => void;
};

interface ConfirmActionDialogProps {
  state: ConfirmActionDialogState;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmActionDialog({ state, onOpenChange }: ConfirmActionDialogProps) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {state.variant === "destructive" ? <Trash2 className="h-4 w-4 text-destructive" /> : <CircleCheck className="h-4 w-4 text-theme-primary" />}
            {state.title}
          </DialogTitle>
          <DialogDescription>{state.description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={state.isLoading} className="h-9 text-xs">
            Cancelar
          </Button>
          <Button type="button" variant={state.variant === "destructive" ? "destructive" : "primary"} onClick={state.onConfirm} disabled={state.isLoading} className="h-9 gap-1.5 text-xs">
            {state.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {state.isLoading ? "Processando..." : state.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
