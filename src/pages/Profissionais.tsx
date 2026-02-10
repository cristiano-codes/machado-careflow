import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ProtectedRoute, useModulePermissions } from "@/components/common/ProtectedRoute";
import { apiService, type ProfessionalRole } from "@/services/api";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";

const WEEK_DAYS = ["seg", "ter", "qua", "qui", "sex"] as const;
type WeekDay = (typeof WEEK_DAYS)[number];

type ScaleDay = {
  ativo: boolean;
  inicio: string;
  fim: string;
};

type WeekScale = Record<WeekDay, ScaleDay>;

type ApiProfessional = {
  id: string;
  role_id?: number | null;
  role_nome?: string | null;
  user_name: string | null;
  email: string | null;
  status: string;
  specialty?: string | null;
  funcao?: string | null;
  tipo_contrato?: string | null;
  horas_semanais?: number | null;
  escala_semanal?: unknown;
};

type ProfessionalRow = ApiProfessional & {
  status_normalized: "ATIVO" | "INATIVO";
  escala_normalizada: WeekScale;
};

const DAY_LABELS: Record<WeekDay, string> = {
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
};

const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME = "17:20";

function isValidTime(value: string | null | undefined) {
  if (!value) return false;
  return /^\d{2}:\d{2}$/.test(value);
}

function parseTimeToMinutes(value: string | null | undefined) {
  if (!isValidTime(value)) return null;
  const [hoursRaw, minutesRaw] = (value || "").split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeStatus(status: string | null | undefined): "ATIVO" | "INATIVO" {
  const raw = (status || "").toLowerCase().trim();
  if (["inativo", "inactive", "afastado"].includes(raw)) return "INATIVO";
  return "ATIVO";
}

function cloneScale(scale: WeekScale): WeekScale {
  return {
    seg: { ...scale.seg },
    ter: { ...scale.ter },
    qua: { ...scale.qua },
    qui: { ...scale.qui },
    sex: { ...scale.sex },
  };
}

function buildDefaultScale(settings: ReturnType<typeof useSettings>["settings"]): WeekScale {
  const opening = isValidTime(settings.business_hours.opening_time)
    ? settings.business_hours.opening_time
    : DEFAULT_START_TIME;
  const closing = isValidTime(settings.business_hours.closing_time)
    ? settings.business_hours.closing_time
    : DEFAULT_END_TIME;

  return {
    seg: { ativo: Boolean(settings.business_hours.operating_days.seg), inicio: opening, fim: closing },
    ter: { ativo: Boolean(settings.business_hours.operating_days.ter), inicio: opening, fim: closing },
    qua: { ativo: Boolean(settings.business_hours.operating_days.qua), inicio: opening, fim: closing },
    qui: { ativo: Boolean(settings.business_hours.operating_days.qui), inicio: opening, fim: closing },
    sex: { ativo: Boolean(settings.business_hours.operating_days.sex), inicio: opening, fim: closing },
  };
}

function normalizeScale(value: unknown, defaults: WeekScale): WeekScale {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return cloneScale(defaults);
    }
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return cloneScale(defaults);
  }

  const source = raw as Record<string, unknown>;
  const result = cloneScale(defaults);

  for (const day of WEEK_DAYS) {
    const current = source[day];

    if (typeof current === "boolean") {
      result[day].ativo = current;
      continue;
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      continue;
    }

    const currentObj = current as Record<string, unknown>;
    const ativo =
      typeof currentObj.ativo === "boolean"
        ? currentObj.ativo
        : typeof currentObj.active === "boolean"
          ? currentObj.active
          : result[day].ativo;

    const inicioCandidate =
      typeof currentObj.inicio === "string"
        ? currentObj.inicio
        : typeof currentObj.start === "string"
          ? currentObj.start
          : result[day].inicio;

    const fimCandidate =
      typeof currentObj.fim === "string"
        ? currentObj.fim
        : typeof currentObj.end === "string"
          ? currentObj.end
          : result[day].fim;

    result[day] = {
      ativo,
      inicio: isValidTime(inicioCandidate) ? inicioCandidate : result[day].inicio,
      fim: isValidTime(fimCandidate) ? fimCandidate : result[day].fim,
    };
  }

  return result;
}

function getName(professional: ApiProfessional) {
  return professional.user_name || professional.email || "Profissional sem nome";
}

function getFunctionLabel(professional: ApiProfessional) {
  return professional.role_nome || professional.funcao || professional.specialty || "Nao informado";
}

function getScaleSummary(scale: WeekScale) {
  const enabled = WEEK_DAYS.filter((day) => scale[day].ativo);
  if (enabled.length === 0) return "Sem escala";
  if (enabled.length === WEEK_DAYS.length) return "Seg-Sex";
  return enabled.map((day) => DAY_LABELS[day]).join(", ");
}

function getStatusVariant(status: "ATIVO" | "INATIVO"): "default" | "secondary" | "outline" | "destructive" {
  return status === "ATIVO" ? "default" : "outline";
}

function resolveRoleId(professional: ApiProfessional, roles: ProfessionalRole[]) {
  if (typeof professional.role_id === "number" && professional.role_id > 0) {
    return String(professional.role_id);
  }

  const currentLabel = getFunctionLabel(professional).toLowerCase();
  const byName = roles.find((role) => role.nome.toLowerCase() === currentLabel);
  return byName ? String(byName.id) : "";
}

function getWeeklyMinutes(scale: WeekScale) {
  let total = 0;
  for (const day of WEEK_DAYS) {
    const row = scale[day];
    if (!row.ativo) continue;

    const start = parseTimeToMinutes(row.inicio);
    const end = parseTimeToMinutes(row.fim);
    if (start === null || end === null || end <= start) continue;
    total += end - start;
  }

  return total;
}

export default function Profissionais() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { settings } = useSettings();
  const { canCreate, canEdit, permissions } = useModulePermissions("profissionais");

  const [professionals, setProfessionals] = useState<ProfessionalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roles, setRoles] = useState<ProfessionalRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ATIVO" | "INATIVO">("todos");

  const [editTarget, setEditTarget] = useState<ProfessionalRow | null>(null);
  const [editForm, setEditForm] = useState({
    roleId: "",
    contractType: "",
    weeklyHours: "",
    status: "ATIVO" as "ATIVO" | "INATIVO",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [scaleTarget, setScaleTarget] = useState<ProfessionalRow | null>(null);
  const [scaleForm, setScaleForm] = useState<WeekScale>({
    seg: { ativo: true, inicio: DEFAULT_START_TIME, fim: DEFAULT_END_TIME },
    ter: { ativo: true, inicio: DEFAULT_START_TIME, fim: DEFAULT_END_TIME },
    qua: { ativo: true, inicio: DEFAULT_START_TIME, fim: DEFAULT_END_TIME },
    qui: { ativo: true, inicio: DEFAULT_START_TIME, fim: DEFAULT_END_TIME },
    sex: { ativo: true, inicio: DEFAULT_START_TIME, fim: DEFAULT_END_TIME },
  });
  const [savingScale, setSavingScale] = useState(false);
  const [inactivatingId, setInactivatingId] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const defaultScale = useMemo(() => buildDefaultScale(settings), [settings]);

  const contractOptions = useMemo(() => {
    const configured = settings.professionals_config.allowed_contract_types || [];
    if (configured.length > 0) return configured;
    return ["CLT", "PJ", "Voluntario", "Estagio", "Temporario"];
  }, [settings.professionals_config.allowed_contract_types]);

  const canManageStatus = canEdit || permissions.has("status") || permissions.has("*");

  const loadProfessionals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiService.getProfessionals(today);
      if (!Array.isArray(response) && !response?.success) {
        throw new Error(response?.message || "Nao foi possivel carregar profissionais");
      }

      const rawList: ApiProfessional[] = Array.isArray(response)
        ? response
        : Array.isArray(response.professionals)
          ? response.professionals
          : [];

      const normalized: ProfessionalRow[] = rawList.map((item) => ({
        ...item,
        status_normalized: normalizeStatus(item.status),
        escala_normalizada: normalizeScale(item.escala_semanal, defaultScale),
      }));

      setProfessionals(normalized);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar profissionais";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [defaultScale, today]);

  const loadRoles = useCallback(async () => {
    try {
      setRolesLoading(true);
      const response = await apiService.getProfessionalRoles(true);
      if (!response.success) {
        throw new Error(response.message || "Nao foi possivel carregar funcoes");
      }
      setRoles(response.roles || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar funcoes";
      toast({ title: "Funcoes", description: message, variant: "destructive" });
    } finally {
      setRolesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadProfessionals();
  }, [loadProfessionals]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (!editTarget) return;
    if (editForm.roleId) return;

    const roleId = resolveRoleId(editTarget, roles);
    if (!roleId) return;

    setEditForm((prev) => ({ ...prev, roleId }));
  }, [editTarget, editForm.roleId, roles]);

  const filteredProfessionals = useMemo(() => {
    return professionals.filter((professional) => {
      const searchTerm = search.toLowerCase().trim();
      const searchable = [
        getName(professional),
        getFunctionLabel(professional),
        professional.tipo_contrato || "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchTerm.length === 0 || searchable.includes(searchTerm);
      const matchesStatus = statusFilter === "todos" || professional.status_normalized === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [professionals, search, statusFilter]);

  function openEditDialog(professional: ProfessionalRow) {
    const roleId = resolveRoleId(professional, roles);
    setEditTarget(professional);
    setEditForm({
      roleId,
      contractType: professional.tipo_contrato || contractOptions[0] || "",
      weeklyHours:
        professional.horas_semanais !== null && professional.horas_semanais !== undefined
          ? String(professional.horas_semanais)
          : "",
      status: professional.status_normalized,
    });
  }

  async function handleSaveEdit() {
    if (!editTarget) return;

    const selectedRole = roles.find((role) => String(role.id) === editForm.roleId);
    if (!selectedRole) {
      toast({ title: "Editar profissional", description: "Selecione uma funcao valida.", variant: "destructive" });
      return;
    }

    const weeklyHours = editForm.weeklyHours.trim().length > 0 ? Number(editForm.weeklyHours) : null;
    if (weeklyHours !== null && (!Number.isInteger(weeklyHours) || weeklyHours <= 0)) {
      toast({
        title: "Editar profissional",
        description: "Carga semanal deve ser um numero inteiro positivo.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSavingEdit(true);
      const response = await apiService.updateProfessional(editTarget.id, {
        role_id: selectedRole.id,
        funcao: selectedRole.nome,
        tipo_contrato: editForm.contractType,
        horas_semanais: weeklyHours,
        status: editForm.status,
      });

      if (!response?.success) {
        throw new Error(response?.message || "Nao foi possivel salvar profissional");
      }

      setEditTarget(null);
      await loadProfessionals();
      toast({ title: "Profissional atualizado", description: "Dados salvos com sucesso." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar profissional";
      toast({ title: "Editar profissional", description: message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  }

  function openScaleDialog(professional: ProfessionalRow) {
    setScaleTarget(professional);
    setScaleForm(cloneScale(professional.escala_normalizada));
  }

  function updateScaleDay(day: WeekDay, patch: Partial<ScaleDay>) {
    setScaleForm((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        ...patch,
      },
    }));
  }

  async function handleSaveScale() {
    if (!scaleTarget) return;

    let totalMinutes = 0;

    for (const day of WEEK_DAYS) {
      const row = scaleForm[day];
      if (!row.ativo) continue;

      const start = parseTimeToMinutes(row.inicio);
      const end = parseTimeToMinutes(row.fim);

      if (start === null || end === null) {
        toast({
          title: "Escala semanal",
          description: `Horario invalido em ${DAY_LABELS[day]}.`,
          variant: "destructive",
        });
        return;
      }

      if (end <= start) {
        toast({
          title: "Escala semanal",
          description: `Horario de fim deve ser maior que inicio em ${DAY_LABELS[day]}.`,
          variant: "destructive",
        });
        return;
      }

      totalMinutes += end - start;
    }

    if (
      typeof scaleTarget.horas_semanais === "number" &&
      scaleTarget.horas_semanais > 0 &&
      totalMinutes > scaleTarget.horas_semanais * 60
    ) {
      toast({
        title: "Escala semanal",
        description: "Escala ultrapassa a carga semanal configurada para este profissional.",
        variant: "destructive",
      });
      return;
    }

    try {
      const resolvedRoleId = resolveRoleId(scaleTarget, roles);
      const selectedRole = roles.find((role) => String(role.id) === resolvedRoleId);
      const fallbackContract = scaleTarget.tipo_contrato || contractOptions[0];
      if (!fallbackContract) {
        throw new Error("Nao foi possivel identificar tipo de contrato para salvar a escala.");
      }

      setSavingScale(true);
      const response = await apiService.updateProfessional(scaleTarget.id, {
        role_id: selectedRole?.id,
        funcao: selectedRole?.nome || getFunctionLabel(scaleTarget),
        tipo_contrato: fallbackContract,
        horas_semanais: scaleTarget.horas_semanais ?? null,
        status: scaleTarget.status_normalized,
        escala_semanal: scaleForm,
      });

      if (!response?.success) {
        throw new Error(response?.message || "Nao foi possivel salvar escala");
      }

      setScaleTarget(null);
      await loadProfessionals();
      toast({ title: "Escala atualizada", description: "Escala semanal salva com sucesso." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar escala";
      toast({ title: "Escala semanal", description: message, variant: "destructive" });
    } finally {
      setSavingScale(false);
    }
  }

  async function handleInactivate(professional: ProfessionalRow) {
    const confirmed = window.confirm(
      `Deseja inativar ${getName(professional)}? Esta acao funciona como exclusao logica.`
    );
    if (!confirmed) return;

    try {
      setInactivatingId(professional.id);
      const response = await apiService.updateProfessionalStatus(professional.id, "INATIVO");
      if (!response?.success) {
        throw new Error(response?.message || "Nao foi possivel inativar profissional");
      }

      await loadProfessionals();
      toast({ title: "Profissional inativado", description: "Registro mantido com status inativo." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao inativar profissional";
      toast({ title: "Excluir profissional", description: message, variant: "destructive" });
    } finally {
      setInactivatingId(null);
    }
  }

  return (
    <ProtectedRoute module="profissionais" permission="view">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Profissionais</h1>
            <p className="text-sm text-muted-foreground">Cadastro da equipe e escala semanal</p>
          </div>

          {canCreate && (
            <Button className="flex items-center gap-2" onClick={() => navigate("/profissionais/novo")}>
              <Plus className="h-4 w-4" />
              Novo profissional
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Equipe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <Input
                placeholder="Buscar por nome, funcao ou contrato"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              <Select value={statusFilter} onValueChange={(value: "todos" | "ATIVO" | "INATIVO") => setStatusFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="INATIVO">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading && (
              <div className="flex min-h-[120px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
              </div>
            )}

            {!loading && error && <p className="text-sm text-destructive">{error}</p>}

            {!loading && !error && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Funcao</TableHead>
                      <TableHead>Tipo de contrato</TableHead>
                      <TableHead>Carga semanal</TableHead>
                      <TableHead>Escala</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfessionals.map((professional) => (
                      <TableRow key={professional.id}>
                        <TableCell className="font-medium">{getName(professional)}</TableCell>
                        <TableCell>{getFunctionLabel(professional)}</TableCell>
                        <TableCell>{professional.tipo_contrato || "Nao informado"}</TableCell>
                        <TableCell>
                          {professional.horas_semanais !== null && professional.horas_semanais !== undefined
                            ? `${professional.horas_semanais}h`
                            : "-"}
                        </TableCell>
                        <TableCell>{getScaleSummary(professional.escala_normalizada)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(professional.status_normalized)}>
                            {professional.status_normalized === "ATIVO" ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(professional)}
                              disabled={!canEdit}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openScaleDialog(professional)}
                              disabled={!canEdit}
                            >
                              <CalendarClock className="mr-1 h-3.5 w-3.5" />
                              Escala
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => void handleInactivate(professional)}
                              disabled={!canManageStatus || inactivatingId === professional.id || professional.status_normalized === "INATIVO"}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Excluir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {filteredProfessionals.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhum profissional encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar profissional</DialogTitle>
            <DialogDescription>{editTarget ? getName(editTarget) : ""}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Funcao</Label>
              <Select
                value={editForm.roleId}
                onValueChange={(value) => setEditForm((prev) => ({ ...prev, roleId: value }))}
                disabled={rolesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a funcao" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de contrato</Label>
              <Select
                value={editForm.contractType}
                onValueChange={(value) => setEditForm((prev) => ({ ...prev, contractType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o contrato" />
                </SelectTrigger>
                <SelectContent>
                  {contractOptions.map((contract) => (
                    <SelectItem key={contract} value={contract}>
                      {contract}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="weekly-hours">Carga semanal (h)</Label>
                <Input
                  id="weekly-hours"
                  type="number"
                  min={1}
                  value={editForm.weeklyHours}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, weeklyHours: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value: "ATIVO" | "INATIVO") => setEditForm((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVO">Ativo</SelectItem>
                    <SelectItem value="INATIVO">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={savingEdit || !editForm.roleId || !editForm.contractType}>
              {savingEdit ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(scaleTarget)} onOpenChange={(open) => !open && setScaleTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Escala semanal</DialogTitle>
            <DialogDescription>{scaleTarget ? getName(scaleTarget) : ""}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {WEEK_DAYS.map((day) => (
              <div key={day} className="grid grid-cols-[80px_80px_1fr_1fr] items-center gap-3 rounded-md border p-3">
                <span className="text-sm font-medium">{DAY_LABELS[day]}</span>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scaleForm[day].ativo}
                    onChange={(event) => updateScaleDay(day, { ativo: event.target.checked })}
                  />
                  Ativo
                </label>

                <div className="space-y-1">
                  <Label className="text-xs">Inicio</Label>
                  <Input
                    type="time"
                    value={scaleForm[day].inicio}
                    disabled={!scaleForm[day].ativo}
                    onChange={(event) => updateScaleDay(day, { inicio: event.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Fim</Label>
                  <Input
                    type="time"
                    value={scaleForm[day].fim}
                    disabled={!scaleForm[day].ativo}
                    onChange={(event) => updateScaleDay(day, { fim: event.target.value })}
                  />
                </div>
              </div>
            ))}

            <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              Carga configurada: {(getWeeklyMinutes(scaleForm) / 60).toFixed(1)}h semanais
              {typeof scaleTarget?.horas_semanais === "number" && scaleTarget.horas_semanais > 0
                ? ` (limite do profissional: ${scaleTarget.horas_semanais}h)`
                : ""}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScaleTarget(null)} disabled={savingScale}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSaveScale()} disabled={savingScale}>
              {savingScale ? "Salvando..." : "Salvar escala"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
