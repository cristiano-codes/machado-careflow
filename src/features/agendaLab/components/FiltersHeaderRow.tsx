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
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex min-h-[36px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="min-w-0 text-sm font-medium text-slate-600 sm:truncate">{summary}</p>
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
