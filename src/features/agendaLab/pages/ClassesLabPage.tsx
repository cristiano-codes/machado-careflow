import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, Search } from "lucide-react";
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
import { MaskedDateInput } from "@/features/agendaLab/components/MaskedDateInput";
import { AgendaLabSyncBanner } from "@/features/agendaLab/components/AgendaLabSyncBanner";
import { CollapsibleFilters } from "@/features/agendaLab/components/CollapsibleFilters";
import { FiltersHeaderRow } from "@/features/agendaLab/components/FiltersHeaderRow";
import { useAgendaLab } from "@/features/agendaLab/context/AgendaLabContext";
import { useLabFiltersPanel } from "@/features/agendaLab/hooks/useLabFiltersPanel";
import type { ClassStatus, GroupClass } from "@/features/agendaLab/types";
import {
  formatFromApiDate,
  formatToApiDate,
  isValidCalendarDate,
  parsePtBrDate,
} from "@/features/agendaLab/utils/dateInput";
import { makeLabId } from "@/features/agendaLab/utils/id";
import { getClassStatusLabel, statusToBadgeVariant } from "@/features/agendaLab/utils/presentation";
import {
  isSingleUnitUxMode,
  resolveDefaultUnit,
  resolveDefaultUnitId,
} from "@/features/agendaLab/utils/units";

type ClassDraft = Omit<GroupClass, "id">;
type DateFieldKey = "dataInicio" | "dataTermino";
type DateFieldState = Record<DateFieldKey, string>;
type DateFieldErrors = Partial<Record<DateFieldKey, string>>;

const STATUSES: ClassStatus[] = ["ativa", "planejada", "pausada", "encerrada"];
const DATE_RANGE_ERROR_MESSAGE = "Data de termino nao pode ser menor que data de inicio.";

function createDraft(unitId: string, activityId: string, professionalId: string): ClassDraft {
  return {
    unitId,
    nome: "",
    activityId,
    descricao: "",
    objetivo: "",
    publicoAlvo: "",
    faixaEtaria: "",
    capacidadeMinima: 4,
    capacidadeIdeal: 8,
    capacidadeMaxima: 10,
    status: "planejada",
    dataInicio: "",
    dataTermino: null,
    profissionalPrincipalId: professionalId,
    profissionalApoioId: null,
    exigeSalaEspecifica: false,
    projetoConvenio: "",
    observacoes: "",
  };
}

function toDateFieldState(item: Pick<ClassDraft, "dataInicio" | "dataTermino">): DateFieldState {
  return {
    dataInicio: formatFromApiDate(item.dataInicio),
    dataTermino: formatFromApiDate(item.dataTermino),
  };
}

function validateDateField(
  value: string,
  options: { required: boolean; fieldLabel: string }
): string | null {
  const text = value.trim();
  if (!text) {
    return options.required ? `${options.fieldLabel} e obrigatoria.` : null;
  }

  const parsed = parsePtBrDate(text);
  if (!parsed) {
    return `${options.fieldLabel} deve estar no formato dd/mm/aaaa.`;
  }

  if (!isValidCalendarDate(parsed)) {
    return `${options.fieldLabel} invalida.`;
  }

  return null;
}

function validateClassDateFields(dateFields: DateFieldState): {
  errors: DateFieldErrors;
  dataInicioApi: string | null;
  dataTerminoApi: string | null;
} {
  const errors: DateFieldErrors = {};

  const dataInicioError = validateDateField(dateFields.dataInicio, {
    required: true,
    fieldLabel: "Data de inicio da turma",
  });
  if (dataInicioError) {
    errors.dataInicio = dataInicioError;
  }

  const dataTerminoError = validateDateField(dateFields.dataTermino, {
    required: false,
    fieldLabel: "Data de termino da turma",
  });
  if (dataTerminoError) {
    errors.dataTermino = dataTerminoError;
  }

  const dataInicioApi = errors.dataInicio ? null : formatToApiDate(dateFields.dataInicio);
  const hasDataTermino = dateFields.dataTermino.trim().length > 0;
  const dataTerminoApi =
    errors.dataTermino || !hasDataTermino ? null : formatToApiDate(dateFields.dataTermino);

  if (!errors.dataInicio && !dataInicioApi) {
    errors.dataInicio = "Data de inicio da turma deve estar no formato dd/mm/aaaa.";
  }

  if (hasDataTermino && !errors.dataTermino && !dataTerminoApi) {
    errors.dataTermino = "Data de termino da turma deve estar no formato dd/mm/aaaa.";
  }

  if (
    !errors.dataInicio &&
    !errors.dataTermino &&
    dataInicioApi &&
    dataTerminoApi &&
    dataTerminoApi < dataInicioApi
  ) {
    errors.dataTermino = DATE_RANGE_ERROR_MESSAGE;
  }

  return { errors, dataInicioApi, dataTerminoApi };
}

export function ClassesLabPage() {
  const { toast } = useToast();
  const { units, activities, professionals, classes, classOccupancy, upsertClass, isWriteEnabled } = useAgendaLab();
  const hasActivities = activities.length > 0;
  const defaultUnit = resolveDefaultUnit(units);
  const defaultUnitId = resolveDefaultUnitId(units);
  const singleUnitUxMode = isSingleUnitUxMode(units);
  const [filtersOpen, setFiltersOpen] = useLabFiltersPanel("classes");
  const [unitFilter, setUnitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ClassStatus | "all">("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GroupClass | null>(null);
  const [draft, setDraft] = useState<ClassDraft>(() =>
    createDraft(defaultUnitId, activities[0]?.id || "", professionals[0]?.id || "")
  );
  const [dateFields, setDateFields] = useState<DateFieldState>(() => ({ dataInicio: "", dataTermino: "" }));
  const [dateErrors, setDateErrors] = useState<DateFieldErrors>({});

  useEffect(() => {
    if (!open || editing || draft.unitId || !defaultUnitId) return;
    setDraft((prev) => ({ ...prev, unitId: defaultUnitId }));
  }, [defaultUnitId, draft.unitId, editing, open]);

  const filtered = useMemo(
    () =>
      classes.filter((item) => {
        if (unitFilter !== "all" && item.unitId !== unitFilter) return false;
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        if (activityFilter !== "all" && item.activityId !== activityFilter) return false;
        const text = `${item.nome} ${item.publicoAlvo} ${item.faixaEtaria} ${item.projetoConvenio}`.toLowerCase();
        return text.includes(search.trim().toLowerCase());
      }),
    [activityFilter, classes, search, statusFilter, unitFilter]
  );

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (unitFilter !== "all") {
      const unit = units.find((item) => item.id === unitFilter);
      labels.push(`Unidade: ${unit?.nome || unitFilter}`);
    }
    if (activityFilter !== "all") {
      const activity = activities.find((item) => item.id === activityFilter);
      labels.push(`Atividade: ${activity?.nome || activityFilter}`);
    }
    if (statusFilter !== "all") {
      labels.push(`Status: ${getClassStatusLabel(statusFilter)}`);
    }
    if (search.trim()) {
      labels.push(`Busca: ${search.trim()}`);
    }
    return labels;
  }, [activities, activityFilter, search, statusFilter, unitFilter, units]);

  function openCreate() {
    const nextDraft = createDraft(defaultUnitId, activities[0]?.id || "", professionals[0]?.id || "");
    setEditing(null);
    setDraft(nextDraft);
    setDateFields(toDateFieldState(nextDraft));
    setDateErrors({});
    setOpen(true);
  }

  function openEdit(item: GroupClass) {
    setEditing(item);
    setDraft({ ...item });
    setDateFields(toDateFieldState(item));
    setDateErrors({});
    setOpen(true);
  }

  function updateDateField(field: DateFieldKey, value: string) {
    setDateFields((prev) => ({ ...prev, [field]: value }));
    setDateErrors((prev) => ({
      ...prev,
      [field]: undefined,
      ...(prev.dataTermino === DATE_RANGE_ERROR_MESSAGE ? { dataTermino: undefined } : {}),
    }));
  }

  function handleDateBlur() {
    const { errors } = validateClassDateFields(dateFields);
    setDateErrors(errors);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setDateErrors({});
  }

  async function handleSave() {
    if (!editing && !hasActivities) {
      toast({
        title: "Turma",
        description: "Nenhuma atividade/serviço ativo cadastrado. Cadastre em /operacao-unidade/atividades.",
        variant: "destructive",
      });
      return;
    }
    const resolvedUnitId = draft.unitId || defaultUnitId;
    if (!resolvedUnitId || !draft.nome.trim() || !draft.activityId || !draft.profissionalPrincipalId) {
      toast({ title: "Turma", description: "Unidade, nome, atividade e profissional principal sao obrigatorios.", variant: "destructive" });
      return;
    }
    if (draft.capacidadeMinima > draft.capacidadeIdeal || draft.capacidadeIdeal > draft.capacidadeMaxima) {
      toast({
        title: "Turma",
        description: "Capacidades invalidas: minimo <= ideal <= maximo.",
        variant: "destructive",
      });
      return;
    }
    const { errors, dataInicioApi, dataTerminoApi } = validateClassDateFields(dateFields);
    if (errors.dataInicio || errors.dataTermino || !dataInicioApi) {
      setDateErrors(errors);
      toast({
        title: "Turma",
        description: errors.dataInicio || errors.dataTermino || "Datas da turma invalidas.",
        variant: "destructive",
      });
      return;
    }
    try {
      await upsertClass({
        id: editing?.id || makeLabId("class"),
        ...draft,
        unitId: resolvedUnitId,
        dataInicio: dataInicioApi,
        dataTermino: dataTerminoApi,
      });
      setOpen(false);
      toast({ title: "Turma", description: editing ? "Turma atualizada." : "Turma criada com sucesso." });
    } catch (error) {
      toast({
        title: "Turma",
        description: error instanceof Error ? error.message : "Nao foi possivel salvar a turma.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <AgendaLabHeader
        title="Turmas Teste"
        subtitle="Ambiente de homologacao para cadastro das turmas com capacidade e equipe responsavel."
        actions={
          <Button size="sm" className="h-9" disabled={!isWriteEnabled} onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova turma
          </Button>
        }
      />

      <AgendaLabSyncBanner />

      <FiltersHeaderRow
        summary={`${filtered.length} turmas no recorte atual.`}
        open={filtersOpen}
        activeFiltersCount={activeFilterLabels.length}
        onToggle={() => setFiltersOpen((current) => !current)}
      />

      <CollapsibleFilters
        open={filtersOpen}
        filters={activeFilterLabels}
        description="Filtros de visualizacao para leitura operacional de turmas."
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Unidade</Label>
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{units.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Atividade</Label>
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{activities.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ClassStatus | "all")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{STATUSES.map((status) => <SelectItem key={status} value={status}>{getClassStatusLabel(status)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Busca</Label>
            <div className="relative"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, publico, faixa etaria" /></div>
          </div>
        </div>
      </CollapsibleFilters>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-4 w-4" />Registros de turmas</CardTitle>
          <CardDescription>{filtered.length} registro(s) encontrados no filtro atual.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Turma</TableHead><TableHead>Atividade</TableHead><TableHead>Profissional principal</TableHead><TableHead>Capacidade</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Acoes</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma turma encontrada.</TableCell></TableRow>
              ) : (
                filtered.map((item) => {
                  const activeCount = classOccupancy.get(item.id)?.ativos || 0;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.nome}<p className="text-xs text-muted-foreground">{item.faixaEtaria || "-"}</p></TableCell>
                      <TableCell>{activities.find((activity) => activity.id === item.activityId)?.nome || "-"}</TableCell>
                      <TableCell>{professionals.find((professional) => professional.id === item.profissionalPrincipalId)?.nome || "-"}</TableCell>
                      <TableCell><p>{activeCount}/{item.capacidadeMaxima}</p><p className="text-xs text-muted-foreground">min {item.capacidadeMinima} | ideal {item.capacidadeIdeal}</p></TableCell>
                      <TableCell><Badge variant={statusToBadgeVariant(item.status)}>{getClassStatusLabel(item.status)}</Badge></TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" disabled={!isWriteEnabled} onClick={() => openEdit(item)}>Editar</Button></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar turma" : "Nova turma"}</DialogTitle>
            <DialogDescription>Cadastro mestre de turma separado das alocacoes de grade.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Unidade</Label>{singleUnitUxMode ? <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">{units.find((item) => item.id === (draft.unitId || defaultUnitId))?.nome || defaultUnit?.nome || draft.unitId || "Nenhuma unidade disponivel"}</div> : <Select value={draft.unitId} onValueChange={(value) => setDraft((prev) => ({ ...prev, unitId: value }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{units.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select>}</div>
            <div className="space-y-1"><Label>Nome da turma</Label><Input value={draft.nome} onChange={(event) => setDraft((prev) => ({ ...prev, nome: event.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Atividade/servico</Label>
              <Select
                value={draft.activityId}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, activityId: value }))}
                disabled={!editing && !hasActivities}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{activities.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent>
              </Select>
              {!editing && !hasActivities ? (
                <p className="text-xs text-destructive">
                  Nenhuma atividade/serviço ativo cadastrado. Cadastre em /operacao-unidade/atividades.
                </p>
              ) : null}
            </div>
            <div className="space-y-1"><Label>Status</Label><Select value={draft.status} onValueChange={(value) => setDraft((prev) => ({ ...prev, status: value as ClassStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((item) => <SelectItem key={item} value={item}>{getClassStatusLabel(item)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Profissional principal</Label><Select value={draft.profissionalPrincipalId} onValueChange={(value) => setDraft((prev) => ({ ...prev, profissionalPrincipalId: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{professionals.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Profissional de apoio</Label><Select value={draft.profissionalApoioId || "none"} onValueChange={(value) => setDraft((prev) => ({ ...prev, profissionalApoioId: value === "none" ? null : value }))}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent><SelectItem value="none">Sem apoio</SelectItem>{professionals.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Publico-alvo</Label><Input value={draft.publicoAlvo} onChange={(event) => setDraft((prev) => ({ ...prev, publicoAlvo: event.target.value }))} /></div>
            <div className="space-y-1"><Label>Faixa etaria</Label><Input value={draft.faixaEtaria} onChange={(event) => setDraft((prev) => ({ ...prev, faixaEtaria: event.target.value }))} placeholder="Ex.: 8-12" /></div>
            <div className="space-y-1"><Label>Capacidade minima</Label><Input type="number" min={1} value={draft.capacidadeMinima} onChange={(event) => setDraft((prev) => ({ ...prev, capacidadeMinima: Number(event.target.value || 0) }))} /></div>
            <div className="space-y-1"><Label>Capacidade ideal</Label><Input type="number" min={1} value={draft.capacidadeIdeal} onChange={(event) => setDraft((prev) => ({ ...prev, capacidadeIdeal: Number(event.target.value || 0) }))} /></div>
            <div className="space-y-1"><Label>Capacidade maxima</Label><Input type="number" min={1} value={draft.capacidadeMaxima} onChange={(event) => setDraft((prev) => ({ ...prev, capacidadeMaxima: Number(event.target.value || 0) }))} /></div>
            <div className="space-y-1"><Label>Projeto/convenio</Label><Input value={draft.projetoConvenio} onChange={(event) => setDraft((prev) => ({ ...prev, projetoConvenio: event.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Data de inicio</Label>
              <MaskedDateInput
                value={dateFields.dataInicio}
                onValueChange={(value) => updateDateField("dataInicio", value)}
                onBlur={handleDateBlur}
                aria-invalid={Boolean(dateErrors.dataInicio)}
              />
              {dateErrors.dataInicio ? (
                <p className="text-xs text-destructive">{dateErrors.dataInicio}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Data de termino</Label>
              <MaskedDateInput
                value={dateFields.dataTermino}
                onValueChange={(value) => updateDateField("dataTermino", value)}
                onBlur={handleDateBlur}
                aria-invalid={Boolean(dateErrors.dataTermino)}
              />
              {dateErrors.dataTermino ? (
                <p className="text-xs text-destructive">{dateErrors.dataTermino}</p>
              ) : null}
            </div>
            <div className="space-y-1 md:col-span-2"><Label>Descricao</Label><Textarea rows={2} value={draft.descricao} onChange={(event) => setDraft((prev) => ({ ...prev, descricao: event.target.value }))} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Objetivo</Label><Textarea rows={2} value={draft.objetivo} onChange={(event) => setDraft((prev) => ({ ...prev, objetivo: event.target.value }))} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Observacoes</Label><Textarea rows={2} value={draft.observacoes} onChange={(event) => setDraft((prev) => ({ ...prev, observacoes: event.target.value }))} /></div>
            <div className="flex items-center gap-3 md:col-span-2"><Switch checked={draft.exigeSalaEspecifica} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, exigeSalaEspecifica: checked }))} /><Label>Exige sala especifica</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!isWriteEnabled || (!editing && !hasActivities)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
