import { Check } from "lucide-react";

interface ThemeCircleProps {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  muted: string;
  surface?: string;
  isActive: boolean;
  onClick: () => void;
}

export function ThemeCircle({ name, primary, secondary, muted, surface, isActive, onClick }: ThemeCircleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className={`group relative flex min-h-24 flex-col overflow-hidden rounded-lg border p-3 text-left transition-all ${isActive ? "border-theme-primary bg-theme-primary/10 shadow-sm ring-2 ring-theme-primary/15" : "border-border/70 bg-background hover:border-theme-primary/40 hover:bg-muted/30"}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/70 shadow-xs" style={{ backgroundColor: surface ?? muted }}>
          <span className="h-full flex-1" style={{ backgroundColor: primary }} />
          <span className="h-full flex-1" style={{ backgroundColor: secondary }} />
          <span className="h-full flex-1" style={{ backgroundColor: muted }} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {[primary, secondary, muted].map((color) => (
              <span key={color} className="h-2 w-2 rounded-full border border-black/10" style={{ backgroundColor: color }} />
            ))}
          </span>
        </span>
      </div>

      <div className="mt-auto grid gap-1.5">
        <div className="h-2 rounded-full" style={{ backgroundColor: primary }} />
        <div className="h-2 w-4/5 rounded-full" style={{ backgroundColor: secondary }} />
      </div>

      {isActive && (
        <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-theme-primary text-theme-primary-fg shadow-sm border border-card dynamic-check animate-in fade-in zoom-in-50 duration-150">
          <Check className="h-3 w-3 stroke-[3]" />
        </div>
      )}
    </button>
  );
}
