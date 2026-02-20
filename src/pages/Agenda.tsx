import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProtectedRoute as ModuleProtectedRoute } from "@/components/common/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/services/api";
import { ChevronLeft, ChevronRight, Clock, User } from "lucide-react";

type AgendaStatus =
  | "scheduled"
  | "agendado"
  | "confirmed"
  | "confirmado"
  | "completed"
  | "concluido"
  | "cancelled"
  | "cancelado"
  | string;

type AgendaItem = {
  id: string;
  professional_id: string;
  appointment_date: string;
  appointment_time: string;
  status: AgendaStatus;
  notes?: string | null;
  patient_id?: string | null;
  patient_name?: string | null;
  service_id?: string | null;
  service_name?: string | null;
};

type ProfessionalOption = {
  id: string;
  user_name?: string | null;
  role_nome?: string | null;
  funcao?: string | null;
  status?: string;
};

type AgendaAccessContext = {
  professionalId: string | null;
  canViewAllProfessionals: boolean;
};

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLong(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeStatus(rawStatus: AgendaStatus) {
  const normalized = (rawStatus || "").toString().trim().toLowerCase();
  if (["confirmed", "confirmado"].includes(normalized)) {
    return { variant: "default" as const, label: "Confirmado" };
  }
  if (["completed", "concluido"].includes(normalized)) {
    return { variant: "outline" as const, label: "Concluido" };
  }
  if (["cancelled", "cancelado"].includes(normalized)) {
    return { variant: "destructive" as const, label: "Cancelado" };
  }
  return { variant: "secondary" as const, label: "Agendado" };
}

function professionalName(item: ProfessionalOption) {
  return item.user_name || item.role_nome || item.funcao || `Profissional ${item.id}`;
}

export default function Agenda() {
  const { userProfile } = useAuth();
  const { settings } = useSettings();
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("");
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [accessContext, setAccessContext] = useState<AgendaAccessContext>({
    professionalId: null,
    canViewAllProfessionals: false,
  });

  const dateParam = useMemo(() => toIsoDate(currentDate), [currentDate]);

  const canViewOtherProfessionals = useMemo(() => {
    if (!accessContext.professionalId) return true;
    return accessContext.canViewAllProfessionals && settings.allow_professional_view_others;
  }, [
    accessContext.canViewAllProfessionals,
    accessContext.professionalId,
    settings.allow_professional_view_others,
  ]);

  const shouldForceOwnAgenda = Boolean(accessContext.professionalId) && !canViewOtherProfessionals;
  const showProfessionalSelector = canViewOtherProfessionals && professionals.length > 1;

  const counts = useMemo(() => {
    const total = agenda.length;
    const confirmed = agenda.filter((item) =>
      ["confirmed", "confirmado"].includes((item.status || "").toString().toLowerCase())
    ).length;
    const pending = agenda.filter((item) =>
      ["scheduled", "agendado"].includes((item.status || "").toString().toLowerCase())
    ).length;
    return { total, confirmed, pending };
  }, [agenda]);

  const refreshAccessContext = useCallback(async () => {
    try {
      const me = await apiService.getProfessionalMe();
      setAccessContext({
        professionalId: me.professional_id ? String(me.professional_id) : null,
        canViewAllProfessionals: me.can_view_all_professionals === true,
      });
      return;
    } catch {
      const fallbackProfessionalId = userProfile?.professional_id
        ? String(userProfile.professional_id)
        : null;
      setAccessContext({
        professionalId: fallbackProfessionalId,
        canViewAllProfessionals: userProfile?.can_view_all_professionals === true,
      });
    }
  }, [userProfile?.can_view_all_professionals, userProfile?.professional_id]);

  const refreshProfessionals = useCallback(async () => {
    try {
      setLoadingProfessionals(true);
      const response = await apiService.getProfessionals({
        date: dateParam,
        forAgenda: true,
      });

      const list = Array.isArray(response?.professionals)
        ? (response.professionals as ProfessionalOption[])
        : Array.isArray(response)
          ? (response as ProfessionalOption[])
          : [];

      setProfessionals(list);

      setSelectedProfessionalId((current) => {
        if (shouldForceOwnAgenda && accessContext.professionalId) {
          return accessContext.professionalId;
        }

        if (current && list.some((item) => String(item.id) === String(current))) {
          return current;
        }

        if (
          accessContext.professionalId &&
          list.some((item) => String(item.id) === String(accessContext.professionalId))
        ) {
          return String(accessContext.professionalId);
        }

        return list[0]?.id ? String(list[0].id) : "";
      });
    } catch (error) {
      setProfessionals([]);
      setSelectedProfessionalId("");
      toast({
        title: "Agenda",
        description: error instanceof Error ? error.message : "Nao foi possivel carregar profissionais.",
        variant: "destructive",
      });
    } finally {
      setLoadingProfessionals(false);
    }
  }, [accessContext.professionalId, dateParam, shouldForceOwnAgenda, toast]);

  const refreshAgenda = useCallback(async () => {
    if (!selectedProfessionalId) {
      setAgenda([]);
      return;
    }

    try {
      setLoadingAgenda(true);
      const response = await apiService.getProfessionalAgenda(selectedProfessionalId, dateParam);
      const items = Array.isArray(response?.agenda) ? (response.agenda as AgendaItem[]) : [];
      setAgenda(items);
    } catch (error) {
      setAgenda([]);
      toast({
        title: "Agenda",
        description: error instanceof Error ? error.message : "Nao foi possivel carregar agenda.",
        variant: "destructive",
      });
    } finally {
      setLoadingAgenda(false);
    }
  }, [dateParam, selectedProfessionalId, toast]);

  useEffect(() => {
    void refreshAccessContext();
  }, [refreshAccessContext]);

  useEffect(() => {
    void refreshProfessionals();
  }, [refreshProfessionals]);

  useEffect(() => {
    void refreshAgenda();
  }, [refreshAgenda]);

  useEffect(() => {
    if (shouldForceOwnAgenda && accessContext.professionalId) {
      setSelectedProfessionalId(String(accessContext.professionalId));
    }
  }, [accessContext.professionalId, shouldForceOwnAgenda]);

  const selectedProfessional = professionals.find(
    (item) => String(item.id) === String(selectedProfessionalId)
  );

  return (
    <ModuleProtectedRoute module="profissionais" permission="view">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
            <p className="text-muted-foreground text-sm">
              Visualize os agendamentos por profissional
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {formatDateLong(currentDate)}
                </CardTitle>
                <CardDescription>
                  {counts.total} agendamento(s) no dia
                  {selectedProfessional ? ` - ${professionalName(selectedProfessional)}` : ""}
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {showProfessionalSelector ? (
                  <Select
                    value={selectedProfessionalId}
                    onValueChange={setSelectedProfessionalId}
                    disabled={loadingProfessionals}
                  >
                    <SelectTrigger className="w-[260px]">
                      <SelectValue placeholder="Selecione o profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      {professionals.map((professional) => (
                        <SelectItem key={professional.id} value={String(professional.id)}>
                          {professionalName(professional)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}

                {shouldForceOwnAgenda ? (
                  <Badge variant="outline">Visualizacao restrita a propria agenda</Badge>
                ) : null}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = new Date(currentDate);
                    next.setDate(next.getDate() - 1);
                    setCurrentDate(next);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Hoje
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = new Date(currentDate);
                    next.setDate(next.getDate() + 1);
                    setCurrentDate(next);
                  }}
                >
                  Proximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingAgenda || loadingProfessionals ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Carregando agenda...
              </div>
            ) : !selectedProfessionalId ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nenhum profissional disponivel para visualizacao.
              </div>
            ) : agenda.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Sem agendamentos para esta data.
              </div>
            ) : (
              <div className="space-y-3">
                {agenda.map((item) => {
                  const status = normalizeStatus(item.status);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-xl font-semibold text-primary">{item.appointment_time}</div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {item.patient_name || "Paciente nao informado"}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {item.service_name || "Servico nao informado"}
                          </p>
                        </div>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Agendamentos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{counts.total}</div>
              <p className="text-sm text-muted-foreground">Total no dia</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Confirmados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{counts.confirmed}</div>
              <p className="text-sm text-muted-foreground">Com presenca confirmada</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{counts.pending}</div>
              <p className="text-sm text-muted-foreground">Aguardando confirmacao</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ModuleProtectedRoute>
  );
}
