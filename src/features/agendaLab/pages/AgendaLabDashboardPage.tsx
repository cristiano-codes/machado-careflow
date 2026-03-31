import { useMemo, useState } from "react";
import { Filter, Plus, Search, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { AgendaLabHeader } from "@/features/agendaLab/components/AgendaLabHeader";
import { LabMultiSelect } from "@/features/agendaLab/components/LabMultiSelect";
import { WeeklyAllocationGrid } from "@/features/agendaLab/components/WeeklyAllocationGrid";
import { useAgendaLab } from "@/features/agendaLab/context/AgendaLabContext";
import { LAB_WEEKDAYS, getClassStatusLabel, statusToBadgeVariant } from "@/features/agendaLab/utils/presentation";
import { enrichAllocations } from "@/features/agendaLab/utils/selectors";
import type { ClassStatus, Weekday } from "@/features/agendaLab/types";

type ViewMode = "grade" | "turmas" | "profissional" | "sala";

export function AgendaLabDashboardPage() {
  const { toast } = useToast();
  const { units, rooms, activities, classes, professionals, students, allocations, enrollments, classOccupancy } =
    useAgendaLab();
  const [mode, setMode] = useState<ViewMode>("grade");
  const [unitId, setUnitId] = useState("all");
  const [roomId, setRoomId] = useState("all");
  const [weekday, setWeekday] = useState<Weekday | "all">("all");
  const [professionalIds, setProfessionalIds] = useState<string[]>([]);
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<ClassStatus[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const enriched = useMemo(
    () =>
      enrichAllocations({ allocations, classes, rooms, activities, professionals, students, enrollments }),
    [allocations, classes, rooms, activities, professionals, students, enrollments]
  );

  const filtered = useMemo(
    () =>
      enriched.filter((item) => {
        if (!item.classData || !item.activity || !item.professional || !item.room) return false;
        if (unitId !== "all" && item.classData.unitId !== unitId) return false;
        if (roomId !== "all" && item.allocation.roomId !== roomId) return false;
        if (weekday !== "all" && item.allocation.weekday !== weekday) return false;
        if (professionalIds.length > 0 && !professionalIds.includes(item.allocation.professionalId)) return false;
        if (activityIds.length > 0 && !activityIds.includes(item.classData.activityId)) return false;
        if (statuses.length > 0 && !statuses.includes(item.classData.status)) return false;
        const text = `${item.classData.nome} ${item.activity.nome} ${item.room.nome} ${item.professional.nome}`.toLowerCase();
        return text.includes(search.trim().toLowerCase());
      }),
    [activityIds, enriched, professionalIds, roomId, search, statuses, unitId, weekday]
  );

  const weeklyItems = useMemo(
    () =>
      filtered
        .filter((item) => item.classData && item.activity && item.professional && item.room)
        .map((item) => ({
          id: item.allocation.id,
          weekday: item.allocation.weekday,
          horaInicial: item.allocation.horaInicial,
          horaFinal: item.allocation.horaFinal,
          titulo: item.classData!.nome,
          atividadeNome: item.activity!.nome,
          salaNome: item.room!.nome,
          profissionalNome: item.professional!.nome,
          ocupacaoTexto: `${classOccupancy.get(item.classData!.id)?.ativos || 0}/${item.classData!.capacidadeMaxima}`,
          status: item.allocation.status,
        })),
    [classOccupancy, filtered]
  );

  const classRows = useMemo(() => {
    const classSet = new Set(filtered.map((item) => item.allocation.classId));
    return classes.filter((item) => classSet.has(item.id));
  }, [classes, filtered]);

  const selected = useMemo(() => filtered.find((item) => item.allocation.id === selectedId) || null, [filtered, selectedId]);

  return (
    <div className="space-y-4">
      <AgendaLabHeader
        title="Agenda Teste"
        subtitle="Area de laboratorio para validar grade semanal, turmas, salas e alocacoes."
        actions={
          <Button onClick={() => toast({ title: "Laboratorio", description: "Use Turmas Teste para criar uma nova turma." })}>
            <Plus className="mr-2 h-4 w-4" />
            Nova turma
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" />Filtros</CardTitle>
          <CardDescription>Filtros locais para leitura operacional da unidade.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas</SelectItem>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <LabMultiSelect label="Profissional" options={professionals.map((p) => ({ value: p.id, label: p.nome }))} selected={professionalIds} placeholder="Todos" onChange={setProfessionalIds} />
            <LabMultiSelect label="Atividade" options={activities.map((a) => ({ value: a.id, label: a.nome }))} selected={activityIds} placeholder="Todas" onChange={setActivityIds} />
            <LabMultiSelect label="Status" options={[{ value: "ativa", label: "Ativa" }, { value: "planejada", label: "Planejada" }, { value: "pausada", label: "Pausada" }, { value: "encerrada", label: "Encerrada" }]} selected={statuses} placeholder="Todos" onChange={(v) => setStatuses(v as ClassStatus[])} />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sala</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas</SelectItem>{rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Dia</Label>
              <Select value={weekday} onValueChange={(v) => setWeekday(v as Weekday | "all")}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos</SelectItem>{LAB_WEEKDAYS.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 xl:col-span-2">
              <Label className="text-xs text-muted-foreground">Busca textual</Label>
              <div className="relative"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Turma, sala, atividade, profissional" /></div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{classRows.length} turmas e {filtered.length} alocacoes no recorte.</p>
        </CardContent>
      </Card>

      <Tabs value={mode} onValueChange={(value) => setMode(value as ViewMode)}>
        <TabsList className="grid w-full max-w-[640px] grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="grade">Grade semanal</TabsTrigger>
          <TabsTrigger value="turmas">Lista de turmas</TabsTrigger>
          <TabsTrigger value="profissional">Por profissional</TabsTrigger>
          <TabsTrigger value="sala">Por sala</TabsTrigger>
        </TabsList>
        <TabsContent value="grade" className="mt-3">
          <Card><CardContent className="p-4">{weeklyItems.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Sem blocos para o filtro atual.</p> : <WeeklyAllocationGrid items={weeklyItems} onItemClick={(item) => setSelectedId(item.id)} />}</CardContent></Card>
        </TabsContent>
        <TabsContent value="turmas" className="mt-3">
          <Card><CardContent className="p-4"><Table><TableHeader><TableRow><TableHead>Turma</TableHead><TableHead>Atividade</TableHead><TableHead>Profissional</TableHead><TableHead>Capacidade</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{classRows.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma turma.</TableCell></TableRow> : classRows.map((classItem) => { const activity = activities.find((a) => a.id === classItem.activityId); const pro = professionals.find((p) => p.id === classItem.profissionalPrincipalId); const activeCount = classOccupancy.get(classItem.id)?.ativos || 0; return <TableRow key={classItem.id}><TableCell className="font-medium">{classItem.nome}</TableCell><TableCell>{activity?.nome || "-"}</TableCell><TableCell>{pro?.nome || "-"}</TableCell><TableCell>{activeCount}/{classItem.capacidadeMaxima}</TableCell><TableCell><Badge variant={statusToBadgeVariant(classItem.status)}>{getClassStatusLabel(classItem.status)}</Badge></TableCell></TableRow>; })}</TableBody></Table></CardContent></Card>
        </TabsContent>
        <TabsContent value="profissional" className="mt-3">
          <div className="grid gap-4 md:grid-cols-2">{professionals.map((pro) => { const proClasses = classRows.filter((c) => c.profissionalPrincipalId === pro.id); if (proClasses.length === 0) return null; return <Card key={pro.id}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><UserCheck className="h-4 w-4" />{pro.nome}</CardTitle></CardHeader><CardContent className="space-y-2">{proClasses.map((c) => <div key={c.id} className="rounded-md border bg-slate-50 p-2 text-sm">{c.nome}</div>)}</CardContent></Card>; })}</div>
        </TabsContent>
        <TabsContent value="sala" className="mt-3">
          <div className="grid gap-4 md:grid-cols-2">{rooms.map((room) => { const roomClasses = filtered.filter((a) => a.allocation.roomId === room.id && a.classData).map((a) => a.classData!).filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i); if (roomClasses.length === 0) return null; return <Card key={room.id}><CardHeader className="pb-2"><CardTitle className="text-base">{room.nome}</CardTitle></CardHeader><CardContent className="space-y-2">{roomClasses.map((c) => <div key={c.id} className="rounded-md border bg-slate-50 p-2 text-sm">{c.nome}</div>)}</CardContent></Card>; })}</div>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="grid gap-2 p-4 text-xs text-muted-foreground md:grid-cols-3">
          <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5" />Visao semanal para operacao diaria.</div>
          <div>Conflitos e lotacao avancada sao validados na pagina Grade Teste.</div>
          <div>Fluxo isolado da agenda oficial, sem impacto em producao.</div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>{selected.classData?.nome || "Turma"}</SheetTitle>
                <SheetDescription>Detalhes do bloco selecionado.</SheetDescription>
              </SheetHeader>
              <p className="text-sm"><strong>Atividade:</strong> {selected.activity?.nome || "-"}</p>
              <p className="text-sm"><strong>Sala:</strong> {selected.room?.nome || "-"}</p>
              <p className="text-sm"><strong>Profissional:</strong> {selected.professional?.nome || "-"}</p>
              <p className="text-sm"><strong>Horario:</strong> {selected.allocation.horaInicial} - {selected.allocation.horaFinal}</p>
              <Button onClick={() => toast({ title: "Laboratorio", description: "Acao simulada." })}>Simular presenca</Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
