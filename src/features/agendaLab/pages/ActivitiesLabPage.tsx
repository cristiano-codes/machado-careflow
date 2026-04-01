import { useMemo, useState } from "react";
import { ClipboardList, Plus, Search } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AgendaLabHeader } from "@/features/agendaLab/components/AgendaLabHeader";
import { CollapsibleFilters } from "@/features/agendaLab/components/CollapsibleFilters";
import { FiltersHeaderRow } from "@/features/agendaLab/components/FiltersHeaderRow";
import { useAgendaLab } from "@/features/agendaLab/context/AgendaLabContext";
import { useLabFiltersPanel } from "@/features/agendaLab/hooks/useLabFiltersPanel";
import type { Activity, ActivityAttendanceType, ActivityCategory, ActivityMode, ActivityStatus } from "@/features/agendaLab/types";
import { makeLabId } from "@/features/agendaLab/utils/id";
import { getActivityStatusLabel, statusToBadgeVariant } from "@/features/agendaLab/utils/presentation";

type ActivityDraft = Omit<Activity, "id">;

const CATEGORIES: ActivityCategory[] = ["terapeutica", "pedagogica", "assistencial", "expressiva", "autonomia"];
const MODALITIES: ActivityMode[] = ["presencial", "hibrido", "externo"];
const ATTENDANCE: ActivityAttendanceType[] = ["individual", "grupo"];
const STATUS: ActivityStatus[] = ["ativa", "em_revisao", "inativa"];

function createDraft(): ActivityDraft {
  return {
    nome: "",
    categoria: "terapeutica",
    descricao: "",
    duracaoPadraoMinutos: 90,
    modalidade: "presencial",
    faixaEtariaSugerida: "",
    atendimentoTipo: "grupo",
    exigeSalaEspecifica: false,
    exigeEquipamento: false,
    corIdentificacao: "#1d4ed8",
    status: "ativa",
    observacoes: "",
  };
}

export function ActivitiesLabPage() {
  const { toast } = useToast();
  const { activities, upsertActivity } = useAgendaLab();
  const [filtersOpen, setFiltersOpen] = useLabFiltersPanel("activities");
  const [statusFilter, setStatusFilter] = useState<ActivityStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [draft, setDraft] = useState<ActivityDraft>(createDraft());

  const filtered = useMemo(
    () =>
      activities.filter((activity) => {
        if (statusFilter !== "all" && activity.status !== statusFilter) return false;
        if (categoryFilter !== "all" && activity.categoria !== categoryFilter) return false;
        const text = `${activity.nome} ${activity.categoria} ${activity.descricao} ${activity.faixaEtariaSugerida}`.toLowerCase();
        return text.includes(search.trim().toLowerCase());
      }),
    [activities, categoryFilter, search, statusFilter]
  );

  const indicators = useMemo(
    () => ({
      total: activities.length,
      active: activities.filter((item) => item.status === "ativa").length,
      requiresSpecificRoom: activities.filter((item) => item.exigeSalaEspecifica).length,
    }),
    [activities]
  );

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (categoryFilter !== "all") labels.push(`Categoria: ${categoryFilter}`);
    if (statusFilter !== "all") labels.push(`Status: ${getActivityStatusLabel(statusFilter)}`);
    if (search.trim()) labels.push(`Busca: ${search.trim()}`);
    return labels;
  }, [categoryFilter, search, statusFilter]);

  function openCreate() {
    setEditing(null);
    setDraft(createDraft());
    setOpen(true);
  }

  function openEdit(activity: Activity) {
    setEditing(activity);
    setDraft({ ...activity });
    setOpen(true);
  }

  function handleSave() {
    if (!draft.nome.trim()) {
      toast({ title: "Atividade", description: "Nome da atividade e obrigatorio.", variant: "destructive" });
      return;
    }
    if (draft.duracaoPadraoMinutos <= 0) {
      toast({ title: "Atividade", description: "Duracao padrao deve ser maior que zero.", variant: "destructive" });
      return;
    }
    upsertActivity({ id: editing?.id || makeLabId("activity"), ...draft });
    setOpen(false);
    toast({ title: "Atividade", description: editing ? "Atividade atualizada." : "Atividade criada no laboratorio." });
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <AgendaLabHeader
        title="Atividades Teste"
        subtitle="Ambiente de homologacao para cadastro de atividades, oficinas e servicos."
        actions={
          <Button size="sm" className="h-9" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova atividade
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-semibold">{indicators.total}</p></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ativas</p><p className="text-2xl font-semibold">{indicators.active}</p></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Exigem sala especifica</p><p className="text-2xl font-semibold">{indicators.requiresSpecificRoom}</p></CardContent></Card>
      </div>

      <FiltersHeaderRow
        summary={`${filtered.length} atividades no recorte atual.`}
        open={filtersOpen}
        activeFiltersCount={activeFilterLabels.length}
        onToggle={() => setFiltersOpen((current) => !current)}
      />

      <CollapsibleFilters
        open={filtersOpen}
        filters={activeFilterLabels}
        description="Filtros de visualizacao para leitura operacional de atividades."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as ActivityCategory | "all")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ActivityStatus | "all")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{STATUS.map((item) => <SelectItem key={item} value={item}>{getActivityStatusLabel(item)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Busca</Label>
            <div className="relative"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, descricao, faixa etaria" /></div>
          </div>
        </div>
      </CollapsibleFilters>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" />Registros de atividades</CardTitle>
          <CardDescription>{filtered.length} registro(s) encontrados no filtro atual.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Atividade</TableHead><TableHead>Categoria</TableHead><TableHead>Duracao</TableHead><TableHead>Modalidade</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Acoes</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma atividade encontrada.</TableCell></TableRow>
              ) : (
                filtered.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="font-medium"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border" style={{ backgroundColor: activity.corIdentificacao }} />{activity.nome}</div></TableCell>
                    <TableCell>{activity.categoria}</TableCell>
                    <TableCell>{activity.duracaoPadraoMinutos} min</TableCell>
                    <TableCell>{activity.modalidade}</TableCell>
                    <TableCell><Badge variant={statusToBadgeVariant(activity.status)}>{getActivityStatusLabel(activity.status)}</Badge></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openEdit(activity)}>Editar</Button></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar atividade" : "Nova atividade"}</DialogTitle>
            <DialogDescription>Formulario laboratorio para validar modelagem de servicos/atividades.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Nome da atividade</Label><Input value={draft.nome} onChange={(e) => setDraft((prev) => ({ ...prev, nome: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Categoria</Label><Select value={draft.categoria} onValueChange={(value) => setDraft((prev) => ({ ...prev, categoria: value as ActivityCategory }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Duracao padrao (min)</Label><Input type="number" min={15} value={draft.duracaoPadraoMinutos} onChange={(e) => setDraft((prev) => ({ ...prev, duracaoPadraoMinutos: Number(e.target.value || 0) }))} /></div>
            <div className="space-y-1"><Label>Modalidade</Label><Select value={draft.modalidade} onValueChange={(value) => setDraft((prev) => ({ ...prev, modalidade: value as ActivityMode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODALITIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Faixa etaria sugerida</Label><Input value={draft.faixaEtariaSugerida} onChange={(e) => setDraft((prev) => ({ ...prev, faixaEtariaSugerida: e.target.value }))} placeholder="Ex.: 8-13" /></div>
            <div className="space-y-1"><Label>Tipo de atendimento</Label><Select value={draft.atendimentoTipo} onValueChange={(value) => setDraft((prev) => ({ ...prev, atendimentoTipo: value as ActivityAttendanceType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ATTENDANCE.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Status</Label><Select value={draft.status} onValueChange={(value) => setDraft((prev) => ({ ...prev, status: value as ActivityStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS.map((item) => <SelectItem key={item} value={item}>{getActivityStatusLabel(item)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Cor identificacao</Label><Input type="color" value={draft.corIdentificacao} onChange={(e) => setDraft((prev) => ({ ...prev, corIdentificacao: e.target.value }))} /></div>
            <div className="flex items-center gap-3"><Switch checked={draft.exigeSalaEspecifica} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, exigeSalaEspecifica: checked }))} /><Label>Exige sala especifica</Label></div>
            <div className="flex items-center gap-3"><Switch checked={draft.exigeEquipamento} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, exigeEquipamento: checked }))} /><Label>Exige equipamento</Label></div>
            <div className="space-y-1 md:col-span-2"><Label>Descricao</Label><Textarea rows={2} value={draft.descricao} onChange={(e) => setDraft((prev) => ({ ...prev, descricao: e.target.value }))} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Observacoes</Label><Textarea rows={2} value={draft.observacoes} onChange={(e) => setDraft((prev) => ({ ...prev, observacoes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
