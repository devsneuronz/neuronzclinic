import { cn } from "@/lib/utils";
import { useId } from "react";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  hasHexLabel?: boolean;
  classname?: string;
  size?: string;
  disabled?: boolean;
}

export default function ColorPicker({ value = "#3b82f6", onChange, hasHexLabel = true, classname, size, disabled }: ColorPickerProps) {
  const uniqueId = useId();

  return (
    <div className={cn("space-y-2", classname)}>
      <label
        htmlFor={uniqueId}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-md text-sm shadow-sm transition-all hover:bg-muted/30 focus-within:ring-ring/50 focus-within:ring-3",
          hasHexLabel ? "h-full w-full px-3 py-2 border border-input bg-background" : "w-fit h-fit ",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted/30",
        )}
      >
        <span className={cn("aspect-square shrink-0 rounded-full border border-black/10 shadow-sm", size ? `w-${size}` : "h-5 w-5")} style={{ backgroundColor: value }} />

        {hasHexLabel && <span className="font-mono text-xs uppercase text-muted-foreground">{value}</span>}

        <input id={uniqueId} type="color" value={value} onChange={(event) => onChange(event.target.value)} className="sr-only" disabled={disabled} />
      </label>
    </div>
  );
}

