import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, endOfMonth, format, startOfDay, startOfMonth, subDays, subMonths, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { AgendaLabHeader } from "@/features/agendaLab/components/AgendaLabHeader";
import { CalendarToolbar, type CalendarViewMode } from "@/features/agendaLab/components/CalendarToolbar";
import { CollapsibleFilters } from "@/features/agendaLab/components/CollapsibleFilters";
import { DayCalendarView } from "@/features/agendaLab/components/DayCalendarView";
import { LabMultiSelect } from "@/features/agendaLab/components/LabMultiSelect";
import { MonthCalendarView } from "@/features/agendaLab/components/MonthCalendarView";
import { WeekCalendarView } from "@/features/agendaLab/components/WeekCalendarView";
import type { AgendaCalendarEvent } from "@/features/agendaLab/components/calendarTypes";
import { useAgendaLab } from "@/features/agendaLab/context/AgendaLabContext";
import type { ClassStatus, Weekday } from "@/features/agendaLab/types";
import {
  allocationOccursOnDate,
  getOperationalWeekDates,
  toIsoDateKey,
} from "@/features/agendaLab/utils/calendar";
import {
  LAB_WEEKDAYS,
  getAllocationStatusLabel,
  getClassStatusLabel,
  getWeekdayLabel,
  statusToBadgeVariant,
} from "@/features/agendaLab/utils/presentation";
import { enrichAllocations } from "@/features/agendaLab/utils/selectors";
import {
  readAgendaLabDashboardFiltersOpen,
  writeAgendaLabDashboardFiltersOpen,
} from "@/features/agendaLab/utils/storage";

type EnrichedItem = ReturnType<typeof enrichAllocations>[number];

function capitalizeFirst(text: string) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toCalendarEvent(params: {
  item: EnrichedItem;
  date: Date;
  classOccupancy: ReadonlyMap<string, { ativos: number }>;
  allocationConflicts: ReadonlyMap<string, { roomConflicts?: unknown[]; professionalConflicts?: unknown[] }>;
}): AgendaCalendarEvent | null {
  const { item, date, classOccupancy, allocationConflicts } = params;
  if (!item.classData || !item.activity || !item.professional || !item.room) return null;

  const conflict = allocationConflicts.get(item.allocation.id);
  const activeCount = classOccupancy.get(item.classData.id)?.ativos || 0;

  return {
    occurrenceId: `${item.allocation.id}-${toIsoDateKey(date)}`,
    occurrenceDate: date,
    allocationId: item.allocation.id,
    weekday: item.allocation.weekday,
    horaInicial: item.allocation.horaInicial,
    horaFinal: item.allocation.horaFinal,
    titulo: item.classData.nome,
    atividadeNome: item.activity.nome,
    salaNome: item.room.nome,
    profissionalNome: item.professional.nome,
    ocupacaoTexto: `${activeCount}/${item.classData.capacidadeMaxima}`,
    allocationStatus: item.allocation.status,
    classStatus: item.classData.status,
    hasRoomConflict: Boolean(conflict?.roomConflicts?.length),
    hasProfessionalConflict: Boolean(conflict?.professionalConflicts?.length),
  };
}

function getPeriodLabel(mode: CalendarViewMode, date: Date) {
  if (mode === "day") {
    return capitalizeFirst(format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }));
  }

  if (mode === "week") {
    const weekDates = getOperationalWeekDates(date);
    const start = weekDates[0]?.date || date;
    const end = weekDates[weekDates.length - 1]?.date || date;
    const startLabel = format(start, "dd/MM", { locale: ptBR });
    const endLabel = format(end, "dd/MM/yyyy", { locale: ptBR });
    return `${startLabel} - ${endLabel}`;
  }

  return capitalizeFirst(format(date, "MMMM 'de' yyyy", { locale: ptBR }));
}

export function AgendaLabDashboardPage() {
  const { toast } = useToast();
  const {
    units,
    rooms,
    activities,
    classes,
    professionals,
    students,
    allocations,
    enrollments,
    classOccupancy,
    allocationConflicts,
  } = useAgendaLab();

  const [calendarMode, setCalendarMode] = useState<CalendarViewMode>("week");
  const [referenceDate, setReferenceDate] = useState<Date>(() => startOfDay(new Date()));
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => readAgendaLabDashboardFiltersOpen(false));

  const [unitId, setUnitId] = useState("all");
  const [roomId, setRoomId] = useState("all");
  const [weekdayFilter, setWeekdayFilter] = useState<Weekday | "all">("all");
  const [professionalIds, setProfessionalIds] = useState<string[]>([]);
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<ClassStatus[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<AgendaCalendarEvent | null>(null);

  useEffect(() => {
    writeAgendaLabDashboardFiltersOpen(filtersOpen);
  }, [filtersOpen]);

  useEffect(() => {
    if (calendarMode !== "month" && weekdayFilter !== "all") {
      setWeekdayFilter("all");
    }
  }, [calendarMode, weekdayFilter]);

  const enriched = useMemo(
    () =>
      enrichAllocations({
        allocations,
        classes,
        rooms,
        activities,
        professionals,
        students,
        enrollments,
      }),
    [allocations, classes, rooms, activities, professionals, students, enrollments]
  );

  const filtered = useMemo(
    () =>
      enriched.filter((item) => {
        if (!item.classData || !item.activity || !item.professional || !item.room) return false;
        if (unitId !== "all" && item.classData.unitId !== unitId) return false;
        if (roomId !== "all" && item.allocation.roomId !== roomId) return false;
        if (calendarMode === "month" && weekdayFilter !== "all" && item.allocation.weekday !== weekdayFilter) return false;
        if (professionalIds.length > 0 && !professionalIds.includes(item.allocation.professionalId)) return false;
        if (activityIds.length > 0 && !activityIds.includes(item.classData.activityId)) return false;
        if (statuses.length > 0 && !statuses.includes(item.classData.status)) return false;

        const text = `${item.classData.nome} ${item.activity.nome} ${item.room.nome} ${item.professional.nome}`.toLowerCase();
        return text.includes(search.trim().toLowerCase());
      }),
    [activityIds, calendarMode, enriched, professionalIds, roomId, search, statuses, unitId, weekdayFilter]
  );

  const classRows = useMemo(() => {
    const classSet = new Set(filtered.map((item) => item.allocation.classId));
    return classes.filter((item) => classSet.has(item.id));
  }, [classes, filtered]);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];

    if (unitId !== "all") {
      const unit = units.find((item) => item.id === unitId);
      labels.push(`Unidade: ${unit?.nome || unitId}`);
    }
    if (professionalIds.length > 0) {
      labels.push(professionalIds.length === 1 ? "1 profissional" : `${professionalIds.length} profissionais`);
    }
    if (activityIds.length > 0) {
      labels.push(activityIds.length === 1 ? "1 atividade" : `${activityIds.length} atividades`);
    }
    if (statuses.length > 0) {
      labels.push(statuses.length === 1 ? `Status: ${getClassStatusLabel(statuses[0])}` : `${statuses.length} status`);
    }
    if (roomId !== "all") {
      const room = rooms.find((item) => item.id === roomId);
      labels.push(`Sala: ${room?.nome || roomId}`);
    }
    if (calendarMode === "month" && weekdayFilter !== "all") {
      labels.push(`Dia: ${getWeekdayLabel(weekdayFilter)}`);
    }
    if (search.trim()) {
      labels.push(`Busca: ${search.trim()}`);
    }

    return labels;
  }, [activityIds, calendarMode, professionalIds, roomId, rooms, search, statuses, unitId, units, weekdayFilter]);

  const periodLabel = useMemo(() => getPeriodLabel(calendarMode, referenceDate), [calendarMode, referenceDate]);

  const weekDates = useMemo(() => getOperationalWeekDates(referenceDate), [referenceDate]);

  const dayEvents = useMemo(() => {
    const result: AgendaCalendarEvent[] = [];

    for (const item of filtered) {
      if (!item.classData) continue;
      if (
        !allocationOccursOnDate({
          date: referenceDate,
          weekday: item.allocation.weekday,
          recurrence: item.allocation.recorrencia,
          classData: item.classData,
        })
      ) {
        continue;
      }

      const event = toCalendarEvent({
        item,
        date: referenceDate,
        classOccupancy,
        allocationConflicts,
      });
      if (event) result.push(event);
    }

    return result.sort((left, right) => left.horaInicial.localeCompare(right.horaInicial));
  }, [allocationConflicts, classOccupancy, filtered, referenceDate]);

  const weekEvents = useMemo(() => {
    const datesByWeekday = new Map(weekDates.map((item) => [item.weekday, item.date]));
    const result: AgendaCalendarEvent[] = [];

    for (const item of filtered) {
      if (!item.classData) continue;
      const date = datesByWeekday.get(item.allocation.weekday);
      if (!date) continue;

      if (
        !allocationOccursOnDate({
          date,
          weekday: item.allocation.weekday,
          recurrence: item.allocation.recorrencia,
          classData: item.classData,
        })
      ) {
        continue;
      }

      const event = toCalendarEvent({
        item,
        date,
        classOccupancy,
        allocationConflicts,
      });
      if (event) result.push(event);
    }

    return result.sort((left, right) => {
      const dateDiff = left.occurrenceDate.getTime() - right.occurrenceDate.getTime();
      if (dateDiff !== 0) return dateDiff;
      return left.horaInicial.localeCompare(right.horaInicial);
    });
  }, [allocationConflicts, classOccupancy, filtered, weekDates]);

  const monthEventsByDate = useMemo(() => {
    const result = new Map<string, AgendaCalendarEvent[]>();
    const monthStart = startOfMonth(referenceDate);
    const monthEnd = endOfMonth(referenceDate);
    let cursor = monthStart;

    while (cursor <= monthEnd) {
      const dateEvents: AgendaCalendarEvent[] = [];
      for (const item of filtered) {
        if (!item.classData) continue;
        if (
          !allocationOccursOnDate({
            date: cursor,
            weekday: item.allocation.weekday,
            recurrence: item.allocation.recorrencia,
            classData: item.classData,
          })
        ) {
          continue;
        }

        const event = toCalendarEvent({
          item,
          date: cursor,
          classOccupancy,
          allocationConflicts,
        });
        if (event) dateEvents.push(event);
      }

      if (dateEvents.length > 0) {
        dateEvents.sort((left, right) => left.horaInicial.localeCompare(right.horaInicial));
        result.set(toIsoDateKey(cursor), dateEvents);
      }

      cursor = addDays(cursor, 1);
    }

    return result;
  }, [allocationConflicts, classOccupancy, filtered, referenceDate]);

  useEffect(() => {
    if (!selectedEvent) return;
    const stillExists = filtered.some((item) => item.allocation.id === selectedEvent.allocationId);
    if (!stillExists) setSelectedEvent(null);
  }, [filtered, selectedEvent]);

  function handlePreviousPeriod() {
    setReferenceDate((current) => {
      if (calendarMode === "day") return subDays(current, 1);
      if (calendarMode === "week") return subWeeks(current, 1);
      return subMonths(current, 1);
    });
  }

  function handleNextPeriod() {
    setReferenceDate((current) => {
      if (calendarMode === "day") return addDays(current, 1);
      if (calendarMode === "week") return addWeeks(current, 1);
      return addMonths(current, 1);
    });
  }

  function handleToday() {
    setReferenceDate(startOfDay(new Date()));
  }

  function handleMonthDateSelect(date: Date) {
    setReferenceDate(startOfDay(date));
    setCalendarMode("day");
  }

  return (
    <div className="space-y-4">
      <AgendaLabHeader
        title="Agenda Teste"
        subtitle="Area de laboratorio para validar grade operacional, turmas, salas e alocacoes."
        actions={
          <Button onClick={() => toast({ title: "Laboratorio", description: "Use Turmas Teste para criar uma nova turma." })}>
            <Plus className="mr-2 h-4 w-4" />
            Nova turma
          </Button>
        }
      />

      <CalendarToolbar
        mode={calendarMode}
        onModeChange={setCalendarMode}
        periodLabel={periodLabel}
        selectedDate={referenceDate}
        onSelectDate={(date) => setReferenceDate(startOfDay(date))}
        onPrevious={handlePreviousPeriod}
        onToday={handleToday}
        onNext={handleNextPeriod}
        filtersOpen={filtersOpen}
        activeFiltersCount={activeFilterLabels.length}
        onToggleFilters={() => setFiltersOpen((current) => !current)}
      />

      <CollapsibleFilters
        open={filtersOpen}
        filters={activeFilterLabels}
        classCount={classRows.length}
        allocationCount={filtered.length}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Unidade</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {units.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <LabMultiSelect
            label="Profissional"
            options={professionals.map((item) => ({ value: item.id, label: item.nome }))}
            selected={professionalIds}
            placeholder="Todos"
            onChange={setProfessionalIds}
          />

          <LabMultiSelect
            label="Atividade"
            options={activities.map((item) => ({ value: item.id, label: item.nome }))}
            selected={activityIds}
            placeholder="Todas"
            onChange={setActivityIds}
          />

          <LabMultiSelect
            label="Status"
            options={[
              { value: "ativa", label: "Ativa" },
              { value: "planejada", label: "Planejada" },
              { value: "pausada", label: "Pausada" },
              { value: "encerrada", label: "Encerrada" },
            ]}
            selected={statuses}
            placeholder="Todos"
            onChange={(value) => setStatuses(value as ClassStatus[])}
          />

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Sala</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {rooms.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {calendarMode === "month" ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Dia</Label>
              <Select value={weekdayFilter} onValueChange={(value) => setWeekdayFilter(value as Weekday | "all")}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {LAB_WEEKDAYS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1 xl:col-span-2">
            <Label className="text-xs text-muted-foreground">Busca textual</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Turma, sala, atividade, profissional"
              />
            </div>
          </div>
        </div>
      </CollapsibleFilters>

      {calendarMode === "day" ? (
        <DayCalendarView date={referenceDate} events={dayEvents} onEventClick={setSelectedEvent} />
      ) : null}

      {calendarMode === "week" ? (
        <WeekCalendarView weekDates={weekDates} events={weekEvents} onEventClick={setSelectedEvent} />
      ) : null}

      {calendarMode === "month" ? (
        <MonthCalendarView
          referenceDate={referenceDate}
          selectedDate={referenceDate}
          eventsByDate={monthEventsByDate}
          onSelectDate={handleMonthDateSelect}
        />
      ) : null}

      <Card>
        <CardContent className="grid gap-2 p-4 text-xs text-muted-foreground md:grid-cols-3">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            Calendario operacional com leitura por dia, semana e mes.
          </div>
          <div>{classRows.length} turmas no recorte atual com lotacao por bloco visivel na agenda.</div>
          <div>Fluxo isolado da agenda oficial, sem impacto em producao.</div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedEvent)} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selectedEvent ? (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>{selectedEvent.titulo}</SheetTitle>
                <SheetDescription>Detalhes do bloco selecionado.</SheetDescription>
              </SheetHeader>

              <div className="space-y-2 text-sm">
                <p>
                  <strong>Data:</strong>{" "}
                  {capitalizeFirst(format(selectedEvent.occurrenceDate, "EEEE, dd/MM/yyyy", { locale: ptBR }))}
                </p>
                <p>
                  <strong>Horario:</strong> {selectedEvent.horaInicial} - {selectedEvent.horaFinal}
                </p>
                <p>
                  <strong>Atividade:</strong> {selectedEvent.atividadeNome}
                </p>
                <p>
                  <strong>Sala:</strong> {selectedEvent.salaNome}
                </p>
                <p>
                  <strong>Profissional:</strong> {selectedEvent.profissionalNome}
                </p>
                <p>
                  <strong>Ocupacao:</strong> {selectedEvent.ocupacaoTexto}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={statusToBadgeVariant(selectedEvent.classStatus)}>
                  Turma: {getClassStatusLabel(selectedEvent.classStatus)}
                </Badge>
                <Badge variant={statusToBadgeVariant(selectedEvent.allocationStatus)}>
                  Alocacao: {getAllocationStatusLabel(selectedEvent.allocationStatus)}
                </Badge>
                <Badge variant="outline">{getWeekdayLabel(selectedEvent.weekday)}</Badge>
              </div>

              {selectedEvent.hasRoomConflict || selectedEvent.hasProfessionalConflict ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  Conflito detectado para sala e/ou profissional na Grade Teste.
                </p>
              ) : (
                <p className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                  Sem conflito detectado para este bloco no recorte atual.
                </p>
              )}

              <Button onClick={() => toast({ title: "Laboratorio", description: "Acao simulada." })}>
                Simular presenca
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
