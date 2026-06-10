import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LucideIcon } from "lucide-react";

interface FilterMenuProps {
  value: string;
  options: string[];
  filterAll: string;
  onChange: (value: string) => void;
  icon: LucideIcon;
}

export function FilterMenu({ value, options, filterAll, onChange, icon: Icon }: FilterMenuProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-w-0 bg-background justify-between h-10! shadow-xs w-full md:w-fit">
        <div className="flex flex-row items-center gap-2.5 overflow-hidden truncate">
          <Icon className="hidden sm:inline h-4 w-4 text-muted-foreground/80 shrink-0" />

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
