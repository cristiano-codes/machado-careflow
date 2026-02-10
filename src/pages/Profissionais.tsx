import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ProtectedRoute, useModulePermissions } from "@/components/common/ProtectedRoute";
import { apiService } from "@/services/api";
import { getServiceLabel } from "@/utils/serviceLabels";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Clock3,
  Filter,
  HeartPulse,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";

type WeekScale = {
  seg: boolean;
  ter: boolean;
  qua: boolean;
  qui: boolean;
  sex: boolean;
};

type ApiProfessional = {
  id: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  crp: string | null;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  agenda_hoje: number;
  funcao?: string | null;
  horas_semanais?: number | null;
  data_nascimento?: string | null;
  tipo_contrato?: string | null;
  escala_semanal?: WeekScale | string | null;
};

type ApiAppointment = {
  id: string;
  professional_id: string;
  appointment_time: string;
  status: string;
  patient_name: string;
  service_name: string | null;
  notes: string | null;
};

type Professional = ApiProfessional & {
  agenda: ApiAppointment[];
  ocupacao: number;
  pacientesHoje: number;
  status_normalized: "ATIVO" | "INATIVO";
  escala_normalizada: WeekScale;
};

const CAPACIDADE_DIA = 10;
const WEEK_DAYS: Array<keyof WeekScale> = ["seg", "ter", "qua", "qui", "sex"];
const WEEK_LABELS: Record<keyof WeekScale, string> = {
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
};
const DEFAULT_WEEK_SCALE: WeekScale = { seg: true, ter: true, qua: true, qui: true, sex: true };

const statusLabels: Record<"ATIVO" | "INATIVO", string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
};

const statusVariant: Record<"ATIVO" | "INATIVO", "default" | "secondary" | "outline" | "destructive"> = {
  ATIVO: "default",
  INATIVO: "outline",
};

function getInitials(name: string | null | undefined) {
  if (!name) return "PR";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function normalizeStatus(status: string | null | undefined): "ATIVO" | "INATIVO" {
  const raw = (status || "").toLowerCase().trim();
  if (["ativo", "active", "plantao", "onboarding"].includes(raw)) return "ATIVO";
  if (["inativo", "inactive", "afastado"].includes(raw)) return "INATIVO";
  return "ATIVO";
}

function normalizeScale(scale: WeekScale | string | null | undefined): WeekScale {
  if (!scale) return { ...DEFAULT_WEEK_SCALE };

  let raw: unknown = scale;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_WEEK_SCALE };
    }
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_WEEK_SCALE };
  }

  const source = raw as Partial<WeekScale>;
  return {
    seg: typeof source.seg === "boolean" ? source.seg : DEFAULT_WEEK_SCALE.seg,
    ter: typeof source.ter === "boolean" ? source.ter : DEFAULT_WEEK_SCALE.ter,
    qua: typeof source.qua === "boolean" ? source.qua : DEFAULT_WEEK_SCALE.qua,
    qui: typeof source.qui === "boolean" ? source.qui : DEFAULT_WEEK_SCALE.qui,
    sex: typeof source.sex === "boolean" ? source.sex : DEFAULT_WEEK_SCALE.sex,
  };
}

function getName(prof: ApiProfessional) {
  return prof.user_name || prof.email || "Profissional sem nome";
}

function getDisplayFunction(prof: ApiProfessional) {
  return prof.funcao || prof.specialty || "Funcao nao informada";
}

function getScaleSummary(scale: WeekScale) {
  const enabled = WEEK_DAYS.filter((day) => scale[day]);
  if (enabled.length === 0) return "Sem dias definidos";
  if (enabled.length === WEEK_DAYS.length) return "Seg-Sex";
  return enabled.map((day) => WEEK_LABELS[day]).join(", ");
}

function getAgeFromBirthDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  const dayDiff = now.getDate() - date.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years >= 0 ? years : null;
}

function formatBirthDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR");
}

export default function Profissionais() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [funcaoFilter, setFuncaoFilter] = useState<string>("todas");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsResumo, setStatsResumo] = useState<{ total: number; agendaHoje: number; porStatus: unknown[] }>({
    total: 0,
    agendaHoje: 0,
    porStatus: [],
  });

  const { canCreate } = useModulePermissions("profissionais");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const profRes = await apiService.getProfessionals(today);
        if (!Array.isArray(profRes) && !profRes?.success) {
          throw new Error(profRes?.message || "Nao foi possivel carregar profissionais");
        }

        const rawList: ApiProfessional[] = Array.isArray(profRes) ? profRes : profRes.professionals || [];

        const listWithAgenda: Professional[] = await Promise.all(
          rawList.map(async (p) => {
            let agenda: ApiAppointment[] = [];
            try {
              const agendaRes = await apiService.getProfessionalAgenda(p.id, today);
              agenda = agendaRes?.success ? agendaRes.agenda || [] : [];
            } catch {
              agenda = [];
            }

            const ocupacao = Math.min(100, Math.round(((agenda.length || 0) / CAPACIDADE_DIA) * 100));
            return {
              ...p,
              agenda,
              ocupacao,
              pacientesHoje: agenda.length,
              status_normalized: normalizeStatus(p.status),
              escala_normalizada: normalizeScale(p.escala_semanal),
            };
          })
        );

        setProfessionals(listWithAgenda);

        const statsRes = await apiService.getProfessionalsStats(today);
        if (statsRes?.success) {
          setStatsResumo(statsRes.stats);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao carregar dados";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [today]);

  const funcoes = useMemo(
    () => Array.from(new Set(professionals.map((p) => getDisplayFunction(p)).filter(Boolean))),
    [professionals]
  );

  const filteredProfessionals = useMemo(() => {
    return professionals.filter((prof) => {
      const nome = getName(prof).toLowerCase();
      const funcao = getDisplayFunction(prof).toLowerCase();
      const contrato = (prof.tipo_contrato || "").toLowerCase();

      const term = search.toLowerCase();
      const matchesSearch = nome.includes(term) || funcao.includes(term) || contrato.includes(term);

      const matchesStatus = statusFilter === "todos" ? true : prof.status_normalized === statusFilter;
      const matchesFuncao = funcaoFilter === "todas" ? true : getDisplayFunction(prof) === funcaoFilter;
      const withinLoad = !onlyAvailable || (prof.status_normalized === "ATIVO" && prof.ocupacao < 90);

      return matchesSearch && matchesStatus && matchesFuncao && withinLoad;
    });
  }, [funcaoFilter, onlyAvailable, professionals, search, statusFilter]);

  const stats = useMemo(() => {
    const ativos = professionals.filter((p) => p.status_normalized === "ATIVO");
    const disponiveis = ativos.filter((p) => p.ocupacao < 90);
    const inativos = professionals.filter((p) => p.status_normalized === "INATIVO").length;

    return {
      total: statsResumo.total || professionals.length,
      disponiveis: disponiveis.length,
      inativos,
      agendaHoje: statsResumo.agendaHoje,
    };
  }, [professionals, statsResumo]);

  const pendencias = useMemo(
    () => professionals.filter((p) => p.status_normalized === "INATIVO"),
    [professionals]
  );

  const equipeAtiva = useMemo(
    () => professionals.filter((p) => p.status_normalized === "ATIVO"),
    [professionals]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <ProtectedRoute module="profissionais" permission="view">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Central de times</p>
            <h1 className="text-2xl font-bold tracking-tight">Profissionais</h1>
            <p className="text-sm text-muted-foreground">Disponibilidade, funcao, contrato e escala da equipe</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Escala do dia
            </Button>
            {canCreate && (
              <Button className="flex items-center gap-2" onClick={() => navigate("/profissionais/novo")}>
                <UserPlus className="h-4 w-4" />
                Novo profissional
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-0 bg-gradient-to-br from-primary/10 via-background to-background">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Profissionais</CardTitle>
              <CardDescription className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-primary" />
                Operacao de hoje
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Inclui todos os status</p>
            </CardContent>
          </Card>

          <Card className="border-0" style={{ boxShadow: "var(--shadow-soft)" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Disponiveis agora</CardTitle>
              <CardDescription className="flex items-center gap-2 text-sm">
                <HeartPulse className="h-4 w-4 text-success" />
                Ativos com folga &lt; 90%
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-success">{stats.disponiveis}</div>
              <p className="text-xs text-muted-foreground">Prontos para receber novos casos</p>
            </CardContent>
          </Card>

          <Card className="border-0" style={{ boxShadow: "var(--shadow-soft)" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Agenda de hoje</CardTitle>
              <CardDescription className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Total de atendimentos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-accent">{stats.agendaHoje}</div>
              <p className="text-xs text-muted-foreground">Somando todos os profissionais</p>
            </CardContent>
          </Card>

          <Card className="border border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Inativos</CardTitle>
              <CardDescription className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Fora de operacao
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-warning">{stats.inativos}</div>
              <p className="text-xs text-muted-foreground">Direcionar carteira dos assistidos</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtrar escala
            </CardTitle>
            <CardDescription>Refine por disponibilidade, status e funcao</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Input
                placeholder="Buscar por nome, funcao ou contrato"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ATIVO">Ativos</SelectItem>
                <SelectItem value="INATIVO">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={funcaoFilter} onValueChange={(v) => setFuncaoFilter(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Funcao" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {funcoes.map((funcao) => (
                  <SelectItem key={funcao} value={funcao}>
                    {funcao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Somente disponiveis</p>
                <p className="text-xs text-muted-foreground">Ativos com carga menor que 90%</p>
              </div>
              <Switch checked={onlyAvailable} onCheckedChange={setOnlyAvailable} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 border-0 bg-gradient-to-br from-muted/60 via-background to-background">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Disponibilidade do dia
              </CardTitle>
              <CardDescription>Agenda, contrato e carga de cada profissional</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {filteredProfessionals.slice(0, 4).map((prof) => {
                const disponibilidade = 100 - prof.ocupacao;
                return (
                  <div
                    key={prof.id}
                    className="rounded-lg border bg-card/60 p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{getDisplayFunction(prof)}</p>
                        <p className="text-base font-semibold">{getName(prof)}</p>
                        <p className="text-xs text-muted-foreground">
                          {prof.tipo_contrato || "Contrato nao informado"}
                          {prof.horas_semanais ? ` • ${prof.horas_semanais}h/sem` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">Escala: {getScaleSummary(prof.escala_normalizada)}</p>
                      </div>
                      <Badge variant={statusVariant[prof.status_normalized]}>
                        {statusLabels[prof.status_normalized]}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Proximo</span>
                        <span className="font-medium">
                          {prof.agenda[0]?.appointment_time?.slice(0, 5) || "Sem horarios"}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Carga do dia</span>
                          <span className="font-medium">{prof.ocupacao}%</span>
                        </div>
                        <Progress value={prof.ocupacao} className="h-2" />
                        <p className="mt-1 text-xs text-muted-foreground">{disponibilidade}% da agenda livre</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Pendencias / inativos
              </CardTitle>
              <CardDescription>Profissionais fora de operacao</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendencias.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma pendencia registrada</p>
              )}
              {pendencias.map((prof) => (
                <div key={prof.id} className="rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{getName(prof)}</p>
                      <p className="text-xs text-muted-foreground">{getDisplayFunction(prof)}</p>
                    </div>
                    <Badge variant={statusVariant[prof.status_normalized]}>
                      {statusLabels[prof.status_normalized]}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Equipe e alocacao
            </CardTitle>
            <CardDescription>Monitoramento da agenda, funcao, contrato e status operacional</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Funcao/Contrato</TableHead>
                  <TableHead>Agenda do dia</TableHead>
                  <TableHead>Ocupacao</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfessionals.map((prof) => {
                  const idade = getAgeFromBirthDate(prof.data_nascimento);
                  const nascimento = formatBirthDate(prof.data_nascimento);

                  return (
                    <TableRow key={prof.id} className="align-top">
                      <TableCell className="space-y-1">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback>{getInitials(prof.user_name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold leading-tight">{getName(prof)}</p>
                            <p className="text-xs text-muted-foreground">{prof.crp || "CRP nao informado"}</p>
                            {nascimento && (
                              <p className="text-xs text-muted-foreground">
                                Nasc.: {nascimento}
                                {idade !== null ? ` (${idade} anos)` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-2">
                          {prof.phone && (
                            <Badge variant="outline" className="text-[11px]">
                              {prof.phone}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{getDisplayFunction(prof)}</p>
                          <p className="text-xs text-muted-foreground">
                            {prof.tipo_contrato || "Contrato nao informado"}
                            {prof.horas_semanais ? ` • ${prof.horas_semanais}h/sem` : ""}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock3 className="h-3 w-3" />
                            Escala: {getScaleSummary(prof.escala_normalizada)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {prof.agenda.slice(0, 2).map((slot) => (
                            <div key={slot.id} className="flex items-start gap-2 text-sm">
                              <Badge variant="secondary">{slot.appointment_time?.slice(0, 5)}</Badge>
                              <div>
                                <p className="font-medium leading-tight">{slot.patient_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {slot.service_name ? getServiceLabel(slot.service_name) : "Servico"}
                                </p>
                              </div>
                            </div>
                          ))}
                          {prof.agenda.length === 0 && <p className="text-sm text-muted-foreground">Sem agenda hoje</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span>{prof.ocupacao}%</span>
                            <span className="text-muted-foreground">{prof.pacientesHoje} atend.</span>
                          </div>
                          <Progress value={prof.ocupacao} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            Prox.: {prof.agenda[0]?.appointment_time?.slice(0, 5) || "Sem horario"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[prof.status_normalized]}>
                          {statusLabels[prof.status_normalized]}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-y-2 text-right">
                        <Button size="sm" variant="outline" className="w-full">
                          Distribuir caso
                        </Button>
                        <Button size="sm" variant="ghost" className="w-full text-primary">
                          Ver perfil
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Escala semanal
            </CardTitle>
            <CardDescription>Profissionais ativos e dias configurados para atendimento</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {equipeAtiva.map((prof) => (
              <div key={prof.id} className="rounded-lg border bg-muted/50 p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{getName(prof)}</p>
                    <p className="text-xs text-muted-foreground">{getDisplayFunction(prof)}</p>
                    <p className="text-xs text-muted-foreground">Escala: {getScaleSummary(prof.escala_normalizada)}</p>
                    <p className="text-xs text-muted-foreground">
                      {prof.horas_semanais ? `${prof.horas_semanais}h semanais` : "Horas nao informadas"}
                    </p>
                  </div>
                  <Badge variant={statusVariant[prof.status_normalized]}>{statusLabels[prof.status_normalized]}</Badge>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    {prof.agenda[0]?.appointment_time?.slice(0, 5) || "Sem horarios"}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
