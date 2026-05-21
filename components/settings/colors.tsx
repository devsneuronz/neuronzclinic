import { Check } from "lucide-react";

interface ThemeCircleProps {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  muted: string;
  isActive: boolean;
  onClick: () => void;
}

export function ThemeCircle({ name, primary, secondary, muted, isActive, onClick }: ThemeCircleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className={`group relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all p-0.5 overflow-hidden shrink-0 ${isActive ? "border-primary scale-105 shadow-md" : "border-transparent hover:scale-105"}`}
      style={{ backgroundColor: muted }}
    >
      {/* Divisor interno cortado na diagonal (Estilo Google Chrome) */}
      <div className="absolute inset-0 flex flex-col rotate-[-45deg] scale-150 pointer-events-none">
        <div className="h-1/2 w-full" style={{ backgroundColor: primary }} />
        <div className="h-1/2 w-full" style={{ backgroundColor: secondary }} />
      </div>

      {/* Ícone de Check indicando seleção ativa */}
      {isActive && (
        <div className="z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm border border-card dynamic-check animate-in fade-in zoom-in-50 duration-150">
          <Check className="h-3 w-3 stroke-[3]" />
        </div>
      )}
    </button>
  );
}
