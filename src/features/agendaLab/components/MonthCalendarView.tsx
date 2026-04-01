import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgendaCalendarEvent } from "@/features/agendaLab/components/calendarTypes";
import { toIsoDateKey } from "@/features/agendaLab/utils/calendar";

type MonthCalendarViewProps = {
  referenceDate: Date;
  selectedDate: Date;
  eventsByDate: Map<string, AgendaCalendarEvent[]>;
  onSelectDate: (date: Date) => void;
};

const WEEKDAY_HEADERS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

export function MonthCalendarView({
  referenceDate,
  selectedDate,
  eventsByDate,
  onSelectDate,
}: MonthCalendarViewProps) {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="grid grid-cols-7 gap-1 pb-1">
          {WEEKDAY_HEADERS.map((header) => (
            <div key={header} className="px-2 py-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
              {header}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((date) => {
            const key = toIsoDateKey(date);
            const dayEvents = eventsByDate.get(key) || [];
            const hasConflict = dayEvents.some((item) => item.hasRoomConflict || item.hasProfessionalConflict);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDate(date)}
                className={cn(
                  "min-h-[110px] rounded-md border bg-background p-2 text-left transition hover:border-primary/60 hover:shadow-sm",
                  !isSameMonth(date, referenceDate) && "bg-slate-50 text-slate-400",
                  isSameDay(date, selectedDate) && "border-primary ring-2 ring-primary/20",
                  dayEvents.length > 0 && "bg-blue-50/60",
                  hasConflict && "border-rose-300 bg-rose-50/40"
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      isSameDay(date, new Date()) && "bg-primary text-primary-foreground"
                    )}
                  >
                    {format(date, "d")}
                  </span>
                  {dayEvents.length > 0 ? (
                    <Badge variant={hasConflict ? "destructive" : "secondary"} className="h-5 rounded-full px-1.5 text-[10px]">
                      {dayEvents.length}
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-1">
                  {dayEvents.slice(0, 2).map((event) => (
                    <p
                      key={event.occurrenceId}
                      className={cn(
                        "truncate rounded-sm px-1 py-0.5 text-[10px] font-medium",
                        event.hasRoomConflict || event.hasProfessionalConflict
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-700"
                      )}
                    >
                      {event.horaInicial} {event.titulo}
                    </p>
                  ))}
                  {dayEvents.length > 2 ? (
                    <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 2} blocos</p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
