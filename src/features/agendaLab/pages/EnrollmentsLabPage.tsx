import { useMemo, useState } from "react";
import { AlertTriangle, ListChecks, Plus, Search } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AgendaLabHeader } from "@/features/agendaLab/components/AgendaLabHeader";
import { AgendaLabSyncBanner } from "@/features/agendaLab/components/AgendaLabSyncBanner";
import { CollapsibleFilters } from "@/features/agendaLab/components/CollapsibleFilters";
import { FiltersHeaderRow } from "@/features/agendaLab/components/FiltersHeaderRow";
import { useAgendaLab } from "@/features/agendaLab/context/AgendaLabContext";
import { useLabFiltersPanel } from "@/features/agendaLab/hooks/useLabFiltersPanel";
import type { EnrollmentPriority, EnrollmentStatus, StudentEnrollment } from "@/features/agendaLab/types";
import { hasDuplicateActiveEnrollment } from "@/features/agendaLab/utils/conflicts";
import { makeLabId } from "@/features/agendaLab/utils/id";
import { getEnrollmentStatusLabel, statusToBadgeVariant } from "@/features/agendaLab/utils/presentation";

type EnrollmentDraft = Omit<StudentEnrollment, "id">;

const STATUS: EnrollmentStatus[] = ["ativo", "aguardando_vaga", "suspenso", "desligado", "concluido"];
const PRIORITY: EnrollmentPriority[] = ["alta", "media", "baixa"];

function createDraft(classId: string, studentId: string): EnrollmentDraft {
  return {
    classId,
    studentId,
    status: "ativo",
    dataEntrada: "",
    dataSaida: null,
    prioridade: "media",
    origemEncaminhamento: "",
    observacao: "",
  };
}

export function EnrollmentsLabPage() {
  const { toast } = useToast();
  const { classes, students, enrollments, classOccupancy, enrollmentConflicts, upsertEnrollment, isWriteEnabled } = useAgendaLab();
  const [filtersOpen, setFiltersOpen] = useLabFiltersPanel("enrollments");
  const [classFilter, setClassFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("lista");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StudentEnrollment | null>(null);
  const [draft, setDraft] = useState<EnrollmentDraft>(() => createDraft(classes[0]?.id || "", students[0]?.id || ""));

  const filtered = useMemo(
    () =>
      enrollments.filter((item) => {
        if (classFilter !== "all" && item.classId !== classFilter) return false;
        if (studentFilter !== "all" && item.studentId !== studentFilter) return false;
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        const className = classes.find((entry) => entry.id === item.classId)?.nome || "";
        const studentName = students.find((entry) => entry.id === item.studentId)?.nome || "";
        const text = `${className} ${studentName} ${item.origemEncaminhamento}`.toLowerCase();
        return text.includes(search.trim().toLowerCase());
      }),
    [classFilter, classes, enrollments, search, statusFilter, studentFilter, students]
  );

  const classesById = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes]);
  const studentsById = useMemo(() => new Map(students.map((item) => [item.id, item])), [students]);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (classFilter !== "all") {
      labels.push(`Turma: ${classesById.get(classFilter)?.nome || classFilter}`);
    }
    if (studentFilter !== "all") {
      labels.push(`Aluno: ${studentsById.get(studentFilter)?.nome || studentFilter}`);
    }
    if (statusFilter !== "all") {
      labels.push(`Status: ${getEnrollmentStatusLabel(statusFilter)}`);
    }
    if (search.trim()) {
      labels.push(`Busca: ${search.trim()}`);
    }
    return labels;
  }, [classFilter, classesById, search, statusFilter, studentFilter, studentsById]);

  function openCreate() {
    setEditing(null);
    setDraft(createDraft(classes[0]?.id || "", students[0]?.id || ""));
    setOpen(true);
  }

  function openEdit(item: StudentEnrollment) {
    setEditing(item);
    setDraft({ ...item });
    setOpen(true);
  }

  async function handleSave() {
    if (!draft.classId || !draft.studentId) {
      toast({ title: "Matricula", description: "Turma e aluno sao obrigatorios.", variant: "destructive" });
      return;
    }
    if (hasDuplicateActiveEnrollment(enrollments, draft.classId, draft.studentId, editing?.id)) {
      toast({
        title: "Matricula",
        description: "Aluno ja possui matricula ativa/espera nesta turma.",
        variant: "destructive",
      });
      return;
    }
    const classItem = classesById.get(draft.classId);
    const activeCount = classOccupancy.get(draft.classId)?.ativos || 0;
    const isActivation = draft.status === "ativo" && (!editing || editing.status !== "ativo");
    if (classItem && isActivation && activeCount >= classItem.capacidadeMaxima) {
      toast({
        title: "Matricula",
        description: "Turma lotada. Cadastre como aguardando_vaga ou ajuste capacidade.",
        variant: "destructive",
      });
      return;
    }
    try {
      await upsertEnrollment({ id: editing?.id || makeLabId("enrollment"), ...draft });
      setOpen(false);
      toast({ title: "Matricula", description: editing ? "Matricula atualizada." : "Matricula criada com sucesso." });
    } catch (error) {
      toast({
        title: "Matricula",
        description: error instanceof Error ? error.message : "Nao foi possivel salvar a matricula.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <AgendaLabHeader
        title="Matriculas Teste"
        subtitle="Ambiente de homologacao para controle do vinculo aluno-turma com prioridade e alertas."
        actions={
          <Button size="sm" className="h-9" disabled={!isWriteEnabled} onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova matricula
          </Button>
        }
      />

      <AgendaLabSyncBanner />

      <FiltersHeaderRow
        summary={`${filtered.length} matriculas no recorte atual.`}
        open={filtersOpen}
        activeFiltersCount={activeFilterLabels.length}
        onToggle={() => setFiltersOpen((current) => !current)}
      />

      <CollapsibleFilters
        open={filtersOpen}
        filters={activeFilterLabels}
        description="Filtros de visualizacao para leitura operacional de matriculas."
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Turma</Label><Select value={classFilter} onValueChange={setClassFilter}><SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Aluno</Label><Select value={studentFilter} onValueChange={setStudentFilter}><SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{students.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Status</Label><Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EnrollmentStatus | "all")}><SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{STATUS.map((item) => <SelectItem key={item} value={item}>{getEnrollmentStatusLabel(item)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Busca</Label><div className="relative"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Turma, aluno, origem" /></div></div>
        </div>
      </CollapsibleFilters>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-[500px] grid-cols-3">
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="turma">Por turma</TabsTrigger>
          <TabsTrigger value="aluno">Por aluno</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-3">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4" />Registros de matriculas</CardTitle><CardDescription>{filtered.length} registro(s) encontrados no filtro atual.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Turma</TableHead><TableHead>Aluno</TableHead><TableHead>Status</TableHead><TableHead>Entrada</TableHead><TableHead>Prioridade</TableHead><TableHead>Conflito</TableHead><TableHead className="text-right">Acoes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma matricula encontrada.</TableCell></TableRow>
                  ) : (
                    filtered.map((item) => {
                      const conflict = enrollmentConflicts.get(item.id);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{classesById.get(item.classId)?.nome || "-"}</TableCell>
                          <TableCell>{studentsById.get(item.studentId)?.nome || "-"}</TableCell>
                          <TableCell><Badge variant={statusToBadgeVariant(item.status)}>{getEnrollmentStatusLabel(item.status)}</Badge></TableCell>
                          <TableCell>{item.dataEntrada || "-"}</TableCell>
                          <TableCell>{item.prioridade}</TableCell>
                          <TableCell>{conflict?.hasConflict ? <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />Conflito horario</span> : <span className="text-xs text-muted-foreground">Sem conflito</span>}</TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="outline" disabled={!isWriteEnabled} onClick={() => openEdit(item)}>Editar</Button></TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="turma" className="mt-3">
          <div className="grid gap-4 md:grid-cols-2">{classes.map((classItem) => { const list = filtered.filter((item) => item.classId === classItem.id); if (list.length === 0) return null; const activeCount = classOccupancy.get(classItem.id)?.ativos || 0; return <Card key={classItem.id}><CardHeader className="pb-2"><CardTitle className="text-base">{classItem.nome}</CardTitle><CardDescription>{activeCount}/{classItem.capacidadeMaxima} ativos</CardDescription></CardHeader><CardContent className="space-y-1">{list.map((item) => <div key={item.id} className="rounded-md border bg-slate-50 p-2 text-sm">{studentsById.get(item.studentId)?.nome || "-"} <span className="text-xs text-muted-foreground">({getEnrollmentStatusLabel(item.status)})</span></div>)}</CardContent></Card>; })}</div>
        </TabsContent>

        <TabsContent value="aluno" className="mt-3">
          <div className="grid gap-4 md:grid-cols-2">{students.map((student) => { const list = filtered.filter((item) => item.studentId === student.id); if (list.length === 0) return null; return <Card key={student.id}><CardHeader className="pb-2"><CardTitle className="text-base">{student.nome}</CardTitle></CardHeader><CardContent className="space-y-1">{list.map((item) => <div key={item.id} className="rounded-md border bg-slate-50 p-2 text-sm">{classesById.get(item.classId)?.nome || "-"} <span className="text-xs text-muted-foreground">({getEnrollmentStatusLabel(item.status)})</span></div>)}</CardContent></Card>; })}</div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar matricula" : "Nova matricula"}</DialogTitle>
            <DialogDescription>Controle de entrada/saida, prioridade e lista de espera.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Turma</Label><Select value={draft.classId} onValueChange={(value) => setDraft((prev) => ({ ...prev, classId: value }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Aluno</Label><Select value={draft.studentId} onValueChange={(value) => setDraft((prev) => ({ ...prev, studentId: value }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{students.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Status</Label><Select value={draft.status} onValueChange={(value) => setDraft((prev) => ({ ...prev, status: value as EnrollmentStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS.map((item) => <SelectItem key={item} value={item}>{getEnrollmentStatusLabel(item)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Prioridade</Label><Select value={draft.prioridade} onValueChange={(value) => setDraft((prev) => ({ ...prev, prioridade: value as EnrollmentPriority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITY.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Data de entrada</Label><Input type="date" value={draft.dataEntrada} onChange={(event) => setDraft((prev) => ({ ...prev, dataEntrada: event.target.value }))} /></div>
            <div className="space-y-1"><Label>Data de saida</Label><Input type="date" value={draft.dataSaida || ""} onChange={(event) => setDraft((prev) => ({ ...prev, dataSaida: event.target.value || null }))} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Origem do encaminhamento</Label><Input value={draft.origemEncaminhamento} onChange={(event) => setDraft((prev) => ({ ...prev, origemEncaminhamento: event.target.value }))} /></div>
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
