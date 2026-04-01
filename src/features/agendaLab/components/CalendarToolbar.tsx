import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PeriodDatePicker } from "@/features/agendaLab/components/PeriodDatePicker";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type CalendarViewMode = "day" | "week" | "month";

type CalendarToolbarProps = {
  mode: CalendarViewMode;
  onModeChange: (mode: CalendarViewMode) => void;
  periodLabel: string;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onPrevious: () => void;
  onToday: () => void;
  onNext: () => void;
};

export function CalendarToolbar({
  mode,
  onModeChange,
  periodLabel,
  selectedDate,
  onSelectDate,
  onPrevious,
  onToday,
  onNext,
}: CalendarToolbarProps) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => value && onModeChange(value as CalendarViewMode)}
            className="rounded-md border bg-muted/40 p-1"
            size="sm"
          >
            <ToggleGroupItem value="day" variant="outline">
              Dia
            </ToggleGroupItem>
            <ToggleGroupItem value="week" variant="outline">
              Semana
            </ToggleGroupItem>
            <ToggleGroupItem value="month" variant="outline">
              Mes
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="hidden h-6 w-px bg-border md:block" />

          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" onClick={onPrevious} aria-label="Periodo anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onToday}>
              Hoje
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onNext} aria-label="Proximo periodo">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <PeriodDatePicker mode={mode} selectedDate={selectedDate} onSelectDate={onSelectDate} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
          <p className="text-sm font-semibold text-slate-700">{periodLabel}</p>
        </div>
      </div>
    </div>
  );
}
