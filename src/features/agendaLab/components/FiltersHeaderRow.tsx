import { FilterToggleButton } from "@/features/agendaLab/components/FilterToggleButton";

type FiltersHeaderRowProps = {
  summary: string;
  open: boolean;
  activeFiltersCount: number;
  onToggle: () => void;
};

export function FiltersHeaderRow({
  summary,
  open,
  activeFiltersCount,
  onToggle,
}: FiltersHeaderRowProps) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-sm text-muted-foreground sm:truncate">{summary}</p>
        <FilterToggleButton
          open={open}
          activeCount={activeFiltersCount}
          onClick={onToggle}
          className="self-start sm:self-auto"
        />
      </div>
    </div>
  );
}
