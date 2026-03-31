import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type LabMultiSelectOption = {
  value: string;
  label: string;
};

type LabMultiSelectProps = {
  label: string;
  options: LabMultiSelectOption[];
  selected: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
};

function buildSummary(selected: string[], options: LabMultiSelectOption[], placeholder: string) {
  if (selected.length === 0) return placeholder;
  const labels = options
    .filter((item) => selected.includes(item.value))
    .map((item) => item.label);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

export function LabMultiSelect({
  label,
  options,
  selected,
  placeholder,
  onChange,
}: LabMultiSelectProps) {
  function toggle(value: string, checked: boolean) {
    if (checked) {
      onChange(Array.from(new Set([...selected, value])));
      return;
    }
    onChange(selected.filter((item) => item !== value));
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 w-full justify-between font-normal">
            <span className="truncate text-left">
              {buildSummary(selected, options, placeholder)}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {selected.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onChange([])}
              >
                Limpar
              </Button>
            ) : null}
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">Sem opcoes para este filtro.</p>
            ) : (
              options.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.includes(option.value)}
                    onCheckedChange={(checked) => toggle(option.value, checked === true)}
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

