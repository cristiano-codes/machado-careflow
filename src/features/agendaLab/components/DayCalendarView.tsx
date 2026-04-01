import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Weekday } from "@/features/agendaLab/types";
import type { AgendaCalendarEvent } from "@/features/agendaLab/components/calendarTypes";
import { WeeklyAllocationGrid } from "@/features/agendaLab/components/WeeklyAllocationGrid";
import { getLabWeekdayFromDate } from "@/features/agendaLab/utils/calendar";

type DayCalendarViewProps = {
  date: Date;
  events: AgendaCalendarEvent[];
  onEventClick?: (event: AgendaCalendarEvent) => void;
};

function buildHeader(weekday: Weekday, date: Date) {
  const shortLabel = format(date, "EEE", { locale: ptBR }).replace(".", "").toUpperCase();
  return {
    [weekday]: {
      short: shortLabel,
      label: format(date, "dd/MM/yyyy"),
      subtitle: format(date, "EEEE", { locale: ptBR }),
    },
  };
}

export function DayCalendarView({ date, events, onEventClick }: DayCalendarViewProps) {
  const weekday = getLabWeekdayFromDate(date);
  const orderedEvents = [...events].sort((left, right) => left.horaInicial.localeCompare(right.horaInicial));

  if (!weekday) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
          <p>Dia sem operacao de grade no laboratorio.</p>
          <p>Use Semana ou Mes para navegar para um dia util.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-xs">
        <p className="text-muted-foreground">Visao do dia selecionado</p>
        <Badge variant="secondary">{orderedEvents.length} blocos</Badge>
      </div>
      {orderedEvents.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sem blocos para os filtros atuais neste dia.
          </CardContent>
        </Card>
      ) : (
        <WeeklyAllocationGrid
          weekdays={[weekday]}
          headerOverrides={buildHeader(weekday, date)}
          items={orderedEvents.map((event) => ({
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
          onItemClick={(item) => {
            const found = orderedEvents.find((event) => event.occurrenceId === item.id);
            if (found) onEventClick?.(found);
          }}
        />
      )}
    </div>
  );
}
