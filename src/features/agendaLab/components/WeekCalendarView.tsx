import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import type { AgendaCalendarEvent } from "@/features/agendaLab/components/calendarTypes";
import { WeeklyAllocationGrid } from "@/features/agendaLab/components/WeeklyAllocationGrid";
import { OPERATIONAL_WEEKDAYS } from "@/features/agendaLab/utils/calendar";
import type { Weekday } from "@/features/agendaLab/types";

type WeekCalendarViewProps = {
  weekDates: Array<{ weekday: Weekday; date: Date }>;
  events: AgendaCalendarEvent[];
  onEventClick?: (event: AgendaCalendarEvent) => void;
};

export function WeekCalendarView({ weekDates, events, onEventClick }: WeekCalendarViewProps) {
  const eventById = new Map(events.map((event) => [event.occurrenceId, event]));
  const headers = Object.fromEntries(
    weekDates.map(({ weekday, date }) => [
      weekday,
      {
        short: format(date, "EEE", { locale: ptBR }).replace(".", "").toUpperCase(),
        label: format(date, "dd/MM"),
      },
    ])
  ) as Partial<Record<Weekday, { short?: string; label?: string; subtitle?: string }>>;

  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sem blocos para os filtros atuais na semana.
          </CardContent>
        </Card>
      ) : (
        <WeeklyAllocationGrid
          items={events.map((event) => ({
            id: event.occurrenceId,
            weekday: event.weekday,
            horaInicial: event.horaInicial,
            horaFinal: event.horaFinal,
            titulo: event.titulo,
            atividadeNome: event.atividadeNome,
            salaNome: event.salaNome,
            profissionalNome: event.profissionalNome,
            ocupacaoTexto: event.ocupacaoTexto,
            status: event.allocationStatus,
            hasRoomConflict: event.hasRoomConflict,
            hasProfessionalConflict: event.hasProfessionalConflict,
          }))}
          weekdays={OPERATIONAL_WEEKDAYS}
          headerOverrides={headers}
          onItemClick={(item) => {
            const found = eventById.get(item.id);
            if (found) onEventClick?.(found);
          }}
        />
      )}
    </div>
  );
}
