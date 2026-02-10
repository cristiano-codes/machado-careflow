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
};

const CAPACIDADE_DIA = 10; // capacidade base para estimar ocupação

const statusLabels: Record<string, string> = {
  active: "Disponível",
  inactive: "Inativo",
  afastado: "Afastado",
  plantao: "Plantão",
  onboarding: "Onboarding",
};

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  plantao: "secondary",
  onboarding: "secondary",
  afastado: "destructive",
  inactive: "outline",
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

export default function Profissionais() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [especialidadeFilter, setEspecialidadeFilter] = useState<string>("todas");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsResumo, setStatsResumo] = useState<{ total: number; agendaHoje: number; porStatus: any[] }>({
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
          throw new Error(profRes?.message || "Não foi possível carregar profissionais");
        }

        const rawList: ApiProfessional[] = Array.isArray(profRes)
          ? profRes
          : profRes.professionals || [];

        const listWithAgenda: Professional[] = await Promise.all(
          rawList.map(async (p) => {
            const agendaRes = await apiService.getProfessionalAgenda(p.id, today);
            const agenda: ApiAppointment[] = agendaRes?.success ? agendaRes.agenda : [];
            const ocupacao = Math.min(
              100,
              Math.round(((agenda.length || 0) / CAPACIDADE_DIA) * 100)
            );
            return { ...p, agenda, ocupacao, pacientesHoje: agenda.length };
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

  const especialidades = useMemo(
    () =>
      Array.from(new Set(professionals.map((p) => p.specialty).filter(Boolean) as string[])),
    [professionals]
  );

  const filteredProfessionals = useMemo(() => {
    return professionals.filter((prof) => {
      const nome = prof.user_name || prof.email || "";
      const matchesSearch =
        nome.toLowerCase().includes(search.toLowerCase()) ||
        (prof.specialty || "").toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === "todos" ? true : prof.status === statusFilter;
      const matchesEspecialidade =
        especialidadeFilter === "todas" ? true : prof.specialty === especialidadeFilter;
      const withinLoad = !onlyAvailable || prof.ocupacao < 90;

      return matchesSearch && matchesStatus && matchesEspecialidade && withinLoad;
    });
  }, [especialidadeFilter, onlyAvailable, professionals, search, statusFilter]);

  const stats = useMemo(() => {
    const ativos = professionals.filter((p) => p.status === "active");
    const disponiveis = ativos.filter((p) => p.ocupacao < 90);
    const cobertura = professionals.filter((p) => p.status === "plantao").length;
    const afastados = professionals.filter((p) => p.status === "afastado" || p.status === "inactive").length;
    return {
      total: statsResumo.total || professionals.length,
      disponiveis: disponiveis.length,
      cobertura,
      afastados,
      agendaHoje: statsResumo.agendaHoje,
    };
  }, [professionals, statsResumo]);

  const pendencias = useMemo(
    () => professionals.filter((p) => p.status !== "active"),
    [professionals]
  );

  const equipeCobertura = useMemo(
    () => professionals.filter((p) => p.status === "plantao" || p.status === "onboarding"),
    [professionals]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Central de times</p>
            <h1 className="text-2xl font-bold tracking-tight">Profissionais</h1>
            <p className="text-muted-foreground text-sm">
              Disponibilidade, escala e alocação rápida de casos
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              Escala do dia
            </Button>
            {canCreate && (
              <Button className="flex items-center gap-2" onClick={() => navigate("/profissionais/novo")}>
                <UserPlus className="w-4 h-4" />
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
                <Building2 className="w-4 h-4 text-primary" />
                Operação de hoje
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Inclui todos os status</p>
            </CardContent>
          </Card>

          <Card className="border-0" style={{ boxShadow: "var(--shadow-soft)" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Disponíveis agora</CardTitle>
              <CardDescription className="flex items-center gap-2 text-sm">
                <HeartPulse className="w-4 h-4 text-success" />
                Agenda com folga &lt; 90%
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
                <ShieldCheck className="w-4 h-4 text-accent" />
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
              <CardTitle className="text-sm text-muted-foreground">Indisponíveis</CardTitle>
              <CardDescription className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Fora de operação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-warning">{stats.afastados}</div>
              <p className="text-xs text-muted-foreground">Direcionar carteira dos pacientes</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtrar escala
            </CardTitle>
            <CardDescription>Refine por disponibilidade, status e especialidade</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Input
                placeholder="Buscar por nome ou especialidade"
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
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="plantao">Plantão</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="afastado">Afastados</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={especialidadeFilter}
              onValueChange={(v) => setEspecialidadeFilter(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Especialidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {especialidades.map((esp) => (
                  <SelectItem key={esp} value={esp}>
                    {esp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Somente disponíveis</p>
                <p className="text-xs text-muted-foreground">Até 90% da agenda</p>
              </div>
              <Switch checked={onlyAvailable} onCheckedChange={setOnlyAvailable} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 border-0 bg-gradient-to-br from-muted/60 via-background to-background">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5" />
                Disponibilidade do dia
              </CardTitle>
              <CardDescription>Agenda e carga de cada profissional</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {filteredProfessionals.slice(0, 4).map((prof) => {
                const disponibilidade = 100 - prof.ocupacao;
                return (
                  <div
                    key={prof.id}
                    className="rounded-lg border bg-card/60 p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{prof.specialty || "Especialidade não informada"}</p>
                        <p className="text-base font-semibold">{prof.user_name || prof.email}</p>
                        <p className="text-sm text-muted-foreground">{prof.crp || "CRP não informado"}</p>
                      </div>
                      <Badge variant={statusVariant[prof.status] || "outline"}>
                        {statusLabels[prof.status] || prof.status}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Próximo</span>
                        <span className="font-medium">
                          {prof.agenda[0]?.appointment_time?.slice(0, 5) || "Sem horários"}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Carga do dia</span>
                          <span className="font-medium">{prof.ocupacao}%</span>
                        </div>
                        <Progress value={prof.ocupacao} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {disponibilidade}% da agenda ainda livre
                        </p>
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
                <AlertTriangle className="w-4 h-4 text-warning" />
                Pendências / indisponíveis
              </CardTitle>
              <CardDescription>Fora de operação ou plantão</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendencias.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma pendência registrada</p>
              )}
              {pendencias.map((prof) => (
                <div key={prof.id} className="rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{prof.user_name || prof.email}</p>
                      <p className="text-xs text-muted-foreground">{prof.specialty || "Especialidade não informada"}</p>
                    </div>
                    <Badge variant={statusVariant[prof.status] || "outline"}>
                      {statusLabels[prof.status] || prof.status}
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
              <Users className="w-5 h-5" />
              Equipe e alocação
            </CardTitle>
            <CardDescription>Monitoramento da agenda, especialidade e status operacional</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead>Agenda do dia</TableHead>
                  <TableHead>Ocupação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfessionals.map((prof) => (
                  <TableRow key={prof.id} className="align-top">
                    <TableCell className="space-y-1">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback>{getInitials(prof.user_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold leading-tight">{prof.user_name || prof.email}</p>
                          <p className="text-xs text-muted-foreground">{prof.crp || "CRP não informado"}</p>
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
                        <p className="font-medium">{prof.specialty || "Especialidade não informada"}</p>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock3 className="w-3 h-3" />
                          Atualizado hoje
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
                                {slot.service_name ? getServiceLabel(slot.service_name) : "Serviço"}
                              </p>
                            </div>
                          </div>
                        ))}
                        {prof.agenda.length === 0 && (
                          <p className="text-sm text-muted-foreground">Sem agenda hoje</p>
                        )}
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
                          Próx.: {prof.agenda[0]?.appointment_time?.slice(0, 5) || "Sem horário"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant[prof.status] || "outline"}>
                          {statusLabels[prof.status] || prof.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-y-2">
                      <Button size="sm" variant="outline" className="w-full">
                        Distribuir caso
                      </Button>
                      <Button size="sm" variant="ghost" className="w-full text-primary">
                        Ver perfil
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Cobertura e onboarding
            </CardTitle>
            <CardDescription>Profissionais em plantão, sombra ou integração</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {equipeCobertura.map((prof) => (
              <div key={prof.id} className="rounded-lg border p-3 bg-muted/50">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{prof.user_name || prof.email}</p>
                    <p className="text-xs text-muted-foreground">{prof.specialty || "Especialidade"}</p>
                    <p className="text-xs text-muted-foreground">Agenda: {prof.pacientesHoje} atendimentos</p>
                  </div>
                  <Badge variant={statusVariant[prof.status] || "outline"}>
                    {statusLabels[prof.status] || prof.status}
                  </Badge>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    {prof.agenda[0]?.appointment_time?.slice(0, 5) || "Sem horários"}
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
