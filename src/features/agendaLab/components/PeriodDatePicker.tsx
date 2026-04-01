import { useEffect, useMemo, useState } from "react";
import { addMonths, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CalendarViewMode } from "@/features/agendaLab/components/CalendarToolbar";

type PeriodDatePickerProps = {
  mode: CalendarViewMode;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, month) => ({
  value: String(month),
  label: format(new Date(2026, month, 1), "MMMM", { locale: ptBR }),
}));

function getYearOptions(anchor: Date) {
  const anchorYear = anchor.getFullYear();
  return Array.from({ length: 31 }, (_, index) => anchorYear - 15 + index);
}

function getModeHint(mode: CalendarViewMode) {
  if (mode === "day") return "Modo Dia: abre a data escolhida.";
  if (mode === "week") return "Modo Semana: abre a semana da data escolhida.";
  return "Modo Mes: abre o mes da data escolhida.";
}

export function PeriodDatePicker({ mode, selectedDate, onSelectDate }: PeriodDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState<Date>(selectedDate);

  useEffect(() => {
    if (!open) {
      setDisplayMonth(selectedDate);
    }
  }, [open, selectedDate]);

  const yearOptions = useMemo(() => getYearOptions(selectedDate), [selectedDate]);
  const selectedMonthValue = String(displayMonth.getMonth());
  const selectedYearValue = String(displayMonth.getFullYear());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8 px-2.5" aria-label="Selecionar data">
          <CalendarDays className="h-4 w-4" />
          Calendario
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Select
              value={selectedMonthValue}
              onValueChange={(value) =>
                setDisplayMonth((current) => new Date(current.getFullYear(), Number(value), 1))
              }
            >
              <SelectTrigger className="h-8 min-w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((month) => (
                  <SelectItem key={month.value} value={month.value}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedYearValue}
              onValueChange={(value) =>
                setDisplayMonth((current) => new Date(Number(value), current.getMonth(), 1))
              }
            >
              <SelectTrigger className="h-8 min-w-[96px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
              aria-label="Proximo mes"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Calendar
            mode="single"
            locale={ptBR}
            selected={selectedDate}
            month={displayMonth}
            onMonthChange={setDisplayMonth}
            onSelect={(date) => {
              if (!date) return;
              onSelectDate(startOfDay(date));
              setOpen(false);
            }}
          />

          <p className="px-1 text-xs text-muted-foreground">{getModeHint(mode)}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
