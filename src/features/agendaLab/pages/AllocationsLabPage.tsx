import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AgendaLabHeader } from "@/features/agendaLab/components/AgendaLabHeader";
import { AgendaLabSyncBanner } from "@/features/agendaLab/components/AgendaLabSyncBanner";
import { CollapsibleFilters } from "@/features/agendaLab/components/CollapsibleFilters";
import { FiltersHeaderRow } from "@/features/agendaLab/components/FiltersHeaderRow";
import { WeeklyAllocationGrid } from "@/features/agendaLab/components/WeeklyAllocationGrid";
import { useAgendaLab } from "@/features/agendaLab/context/AgendaLabContext";
import { useLabFiltersPanel } from "@/features/agendaLab/hooks/useLabFiltersPanel";
import type { Allocation, AllocationRecurrence, AllocationStatus, Weekday } from "@/features/agendaLab/types";
import { makeLabId } from "@/features/agendaLab/utils/id";
import { parseTimeToMinutes } from "@/features/agendaLab/utils/time";
import {
  LAB_WEEKDAYS,
  getAllocationStatusLabel,
  getWeekdayLabel,
  statusToBadgeVariant,
} from "@/features/agendaLab/utils/presentation";
import { enrichAllocations } from "@/features/agendaLab/utils/selectors";

type AllocationDraft = Omit<Allocation, "id">;

const STATUS: AllocationStatus[] = ["ativa", "planejada", "suspensa"];
const RECURRENCES: AllocationRecurrence[] = ["semanal", "quinzenal", "mensal"];

function createDraft(classId: string, roomId: string, professionalId: string): AllocationDraft {
  return {
    classId,
    weekday: "seg",
    horaInicial: "08:00",
    horaFinal: "09:30",
    roomId,
    professionalId,
    recorrencia: "semanal",
    status: "planejada",
    observacao: "",
  };
}

export function AllocationsLabPage() {
  const { toast } = useToast();
  const {
    classes,
    rooms,
    professionals,
    activities,
    students,
    allocations,
    enrollments,
    classOccupancy,
    allocationConflicts,
    upsertAllocation,
    removeAllocation,
    isWriteEnabled,
  } = useAgendaLab();
  const [filtersOpen, setFiltersOpen] = useLabFiltersPanel("allocations");
  const [roomFilter, setRoomFilter] = useState("all");
  const [professionalFilter, setProfessionalFilter] = useState("all");
  const [weekdayFilter, setWeekdayFilter] = useState<Weekday | "all">("all");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<AllocationStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Allocation | null>(null);
  const [draft, setDraft] = useState<AllocationDraft>(() =>
    createDraft(classes[0]?.id || "", rooms[0]?.id || "", professionals[0]?.id || "")
  );

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
    [activities, allocations, classes, enrollments, professionals, rooms, students]
  );

  const filtered = useMemo(
    () =>
      enriched.filter((item) => {
        if (!item.classData || !item.room || !item.professional || !item.activity) return false;
        if (roomFilter !== "all" && item.allocation.roomId !== roomFilter) return false;
        if (professionalFilter !== "all" && item.allocation.professionalId !== professionalFilter) return false;
        if (weekdayFilter !== "all" && item.allocation.weekday !== weekdayFilter) return false;
        if (classFilter !== "all" && item.allocation.classId !== classFilter) return false;
        if (statusFilter !== "all" && item.allocation.status !== statusFilter) return false;
        const text = `${item.classData.nome} ${item.room.nome} ${item.professional.nome} ${item.activity.nome}`.toLowerCase();
        return text.includes(search.trim().toLowerCase());
      }),
    [classFilter, enriched, professionalFilter, roomFilter, search, statusFilter, weekdayFilter]
  );

  const weeklyItems = useMemo(
    () =>
      filtered.map((item) => {
        const classData = item.classData!;
        const conflict = allocationConflicts.get(item.allocation.id);
        const activeCount = classOccupancy.get(classData.id)?.ativos || 0;
        return {
          id: item.allocation.id,
          weekday: item.allocation.weekday,
          horaInicial: item.allocation.horaInicial,
          horaFinal: item.allocation.horaFinal,
          titulo: classData.nome,
          atividadeNome: item.activity?.nome || "-",
          salaNome: item.room?.nome || "-",
          profissionalNome: item.professional?.nome || "-",
          ocupacaoTexto: `${activeCount}/${classData.capacidadeMaxima}`,
          status: item.allocation.status,
          hasRoomConflict: Boolean(conflict?.roomConflicts.length),
          hasProfessionalConflict: Boolean(conflict?.professionalConflicts.length),
        };
      }),
    [allocationConflicts, classOccupancy, filtered]
  );

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (classFilter !== "all") {
      const classItem = classes.find((item) => item.id === classFilter);
      labels.push(`Turma: ${classItem?.nome || classFilter}`);
    }
    if (roomFilter !== "all") {
      const room = rooms.find((item) => item.id === roomFilter);
      labels.push(`Sala: ${room?.nome || roomFilter}`);
    }
    if (professionalFilter !== "all") {
      const professional = professionals.find((item) => item.id === professionalFilter);
      labels.push(`Profissional: ${professional?.nome || professionalFilter}`);
    }
    if (weekdayFilter !== "all") labels.push(`Dia: ${getWeekdayLabel(weekdayFilter)}`);
    if (statusFilter !== "all") labels.push(`Status: ${getAllocationStatusLabel(statusFilter)}`);
    if (search.trim()) labels.push(`Busca: ${search.trim()}`);
    return labels;
  }, [classFilter, classes, professionalFilter, professionals, roomFilter, rooms, search, statusFilter, weekdayFilter]);

  function openCreate() {
    setEditing(null);
    setDraft(createDraft(classes[0]?.id || "", rooms[0]?.id || "", professionals[0]?.id || ""));
    setOpen(true);
  }

  function openEdit(item: Allocation) {
    setEditing(item);
    setDraft({ ...item });
    setOpen(true);
  }

  async function handleSave() {
    if (!draft.classId || !draft.roomId || !draft.professionalId) {
      toast({ title: "Alocacao", description: "Turma, sala e profissional sao obrigatorios.", variant: "destructive" });
      return;
    }
    const start = parseTimeToMinutes(draft.horaInicial);
    const end = parseTimeToMinutes(draft.horaFinal);
    if (start === null || end === null || end <= start) {
      toast({ title: "Alocacao", description: "Horario invalido.", variant: "destructive" });
      return;
    }
    const id = editing?.id || makeLabId("allocation");
    try {
      await upsertAllocation({ id, ...draft });
      setOpen(false);
      const conflict = allocationConflicts.get(id);
      if (conflict?.hasConflict) {
        toast({ title: "Alocacao", description: "Alocacao salva com conflito detectado na grade.", variant: "destructive" });
      } else {
        toast({ title: "Alocacao", description: editing ? "Alocacao atualizada." : "Alocacao criada com sucesso." });
      }
    } catch (error) {
      toast({
        title: "Alocacao",
        description: error instanceof Error ? error.message : "Nao foi possivel salvar a alocacao.",
        variant: "destructive",
      });
    }
  }

  async function handleRemoveAllocation(id: string) {
    try {
      await removeAllocation(id);
      toast({ title: "Alocacao", description: "Alocacao removida." });
    } catch (error) {
      toast({
        title: "Alocacao",
        description: error instanceof Error ? error.message : "Nao foi possivel remover a alocacao.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <AgendaLabHeader
        title="Grade Teste"
        subtitle="Ambiente de homologacao para alocacao de turmas por dia, horario, sala e profissional."
        actions={
          <Button size="sm" className="h-9" disabled={!isWriteEnabled} onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova alocacao
          </Button>
        }
      />

      <AgendaLabSyncBanner />

      <FiltersHeaderRow
        summary={`${filtered.length} alocacoes no recorte atual.`}
        open={filtersOpen}
        activeFiltersCount={activeFilterLabels.length}
        onToggle={() => setFiltersOpen((current) => !current)}
      />

      <CollapsibleFilters
        open={filtersOpen}
        filters={activeFilterLabels}
        description="Filtros de visualizacao para leitura operacional de alocacoes."
      >
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Turma</Label><Select value={classFilter} onValueChange={setClassFilter}><SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Sala</Label><Select value={roomFilter} onValueChange={setRoomFilter}><SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{rooms.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Profissional</Label><Select value={professionalFilter} onValueChange={setProfessionalFilter}><SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{professionals.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Dia</Label><Select value={weekdayFilter} onValueChange={(value) => setWeekdayFilter(value as Weekday | "all")}><SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{LAB_WEEKDAYS.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Status</Label><Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as AllocationStatus | "all")}><SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{STATUS.map((item) => <SelectItem key={item} value={item}>{getAllocationStatusLabel(item)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Busca</Label><div className="relative"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Turma, sala, profissional" /></div></div>
        </div>
      </CollapsibleFilters>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" />Grade semanal</CardTitle></CardHeader>
        <CardContent>{weeklyItems.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma alocacao encontrada.</p> : <WeeklyAllocationGrid items={weeklyItems} />}</CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">Lista de alocacoes</CardTitle><CardDescription>Conflitos de sala ou profissional ficam destacados para apoio da analise operacional.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Turma</TableHead><TableHead>Dia/horario</TableHead><TableHead>Sala</TableHead><TableHead>Profissional</TableHead><TableHead>Status</TableHead><TableHead>Conflito</TableHead><TableHead className="text-right">Acoes</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma alocacao no filtro atual.</TableCell></TableRow>
              ) : (
                filtered.map((item) => {
                  const conflict = allocationConflicts.get(item.allocation.id);
                  return (
                    <TableRow key={item.allocation.id}>
                      <TableCell className="font-medium">{item.classData?.nome || "-"}</TableCell>
                      <TableCell>{getWeekdayLabel(item.allocation.weekday)} {item.allocation.horaInicial} - {item.allocation.horaFinal}</TableCell>
                      <TableCell>{item.room?.nome || "-"}</TableCell>
                      <TableCell>{item.professional?.nome || "-"}</TableCell>
                      <TableCell><Badge variant={statusToBadgeVariant(item.allocation.status)}>{getAllocationStatusLabel(item.allocation.status)}</Badge></TableCell>
                      <TableCell>{conflict?.hasConflict ? <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />Conflito detectado</span> : <span className="text-xs text-muted-foreground">Sem conflito</span>}</TableCell>
                      <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={!isWriteEnabled} onClick={() => openEdit(item.allocation)}>Editar</Button><Button size="sm" variant="outline" disabled={!isWriteEnabled} onClick={() => void handleRemoveAllocation(item.allocation.id)}>Remover</Button></div></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar alocacao" : "Nova alocacao"}</DialogTitle>
            <DialogDescription>Sala e profissional variam por alocacao, sem vinculo fixo por turma.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Turma</Label><Select value={draft.classId} onValueChange={(value) => setDraft((prev) => ({ ...prev, classId: value }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Dia da semana</Label><Select value={draft.weekday} onValueChange={(value) => setDraft((prev) => ({ ...prev, weekday: value as Weekday }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LAB_WEEKDAYS.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Hora inicial</Label><Input type="time" value={draft.horaInicial} onChange={(event) => setDraft((prev) => ({ ...prev, horaInicial: event.target.value }))} /></div>
            <div className="space-y-1"><Label>Hora final</Label><Input type="time" value={draft.horaFinal} onChange={(event) => setDraft((prev) => ({ ...prev, horaFinal: event.target.value }))} /></div>
            <div className="space-y-1"><Label>Sala</Label><Select value={draft.roomId} onValueChange={(value) => setDraft((prev) => ({ ...prev, roomId: value }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{rooms.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Profissional</Label><Select value={draft.professionalId} onValueChange={(value) => setDraft((prev) => ({ ...prev, professionalId: value }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{professionals.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Recorrencia</Label><Select value={draft.recorrencia} onValueChange={(value) => setDraft((prev) => ({ ...prev, recorrencia: value as AllocationRecurrence }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RECURRENCES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Status</Label><Select value={draft.status} onValueChange={(value) => setDraft((prev) => ({ ...prev, status: value as AllocationStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS.map((item) => <SelectItem key={item} value={item}>{getAllocationStatusLabel(item)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1 md:col-span-2"><Label>Observacao</Label><Textarea rows={2} value={draft.observacao} onChange={(event) => setDraft((prev) => ({ ...prev, observacao: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!isWriteEnabled}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
