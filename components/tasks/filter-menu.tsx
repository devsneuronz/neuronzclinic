import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Loader2, LucideIcon } from "lucide-react";

interface FilterMenuProps {
  value: string;
  options: string[];
  filterAll: string;
  onChange: (value: string) => void;
  icon: LucideIcon;
  isLoading: boolean;
}

export function FilterMenu({ value, options, filterAll, onChange, icon: Icon, isLoading }: FilterMenuProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger className={cn("min-w-0 bg-background justify-between h-10! shadow-xs w-full md:w-fit", isLoading && "animate-shimmer")}>
        <div className="flex flex-row items-center gap-2.5 overflow-hidden truncate">
          {isLoading ? <Loader2 className="animate-spin" /> : <Icon className="hidden sm:inline h-4 w-4 text-muted-foreground/80 shrink-0" />}

          <SelectValue placeholder={filterAll} />
        </div>
      </SelectTrigger>

      <SelectContent className="max-h-72 min-w-48 overflow-y-auto">
        <SelectItem value=" " className="cursor-pointer">
          <span className="font-medium text-muted-foreground">{filterAll}</span>
        </SelectItem>

        {options.map((option) => (
          <SelectItem key={option} value={option} className="cursor-pointer capitalize">
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
