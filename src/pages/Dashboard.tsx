import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ClipboardList, Clock, Users, Activity, AlertCircle, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProtectedRoute, useModulePermissions } from "@/components/common/ProtectedRoute";
import { UserManagement } from "@/components/admin/UserManagement";
import {
  apiService,
  DashboardJourneySummaryItem,
  DashboardStats,
  JOURNEY_STATUS_FLOW,
  JOURNEY_STATUS_LABELS,
} from "@/services/api";

const buildEmptyJourneySummary = (): DashboardJourneySummaryItem[] =>
  JOURNEY_STATUS_FLOW.map((status) => ({
    status,
    label: JOURNEY_STATUS_LABELS[status],
    total: 0,
  }));

const defaultStats: DashboardStats = {
  totalAssistidos: 0,
  unknownStatusCount: 0,
  journeyTotals: {
    em_triagem: 0,
    em_avaliacao_e_vaga: 0,
    decisao_vaga: 0,
    em_acompanhamento: 0,
    encerrados: 0,
    em_fluxo_institucional: 0,
  },
  journeyStatusSummary: buildEmptyJourneySummary(),
  updatedAt: null,
};

function coerceNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function normalizeDashboardStats(payload: DashboardStats | null | undefined): DashboardStats {
  if (!payload) return defaultStats;

  const summaryMap = new Map<string, DashboardJourneySummaryItem>();
  for (const item of payload.journeyStatusSummary || []) {
    summaryMap.set(item.status, {
      status: item.status,
      label: JOURNEY_STATUS_LABELS[item.status] || item.label || item.status,
      total: coerceNumber(item.total),
    });
  }

  return {
    totalAssistidos: coerceNumber(payload.totalAssistidos),
    unknownStatusCount: coerceNumber(payload.unknownStatusCount),
    journeyTotals: {
      em_triagem: coerceNumber(payload.journeyTotals?.em_triagem),
      em_avaliacao_e_vaga: coerceNumber(payload.journeyTotals?.em_avaliacao_e_vaga),
      decisao_vaga: coerceNumber(payload.journeyTotals?.decisao_vaga),
      em_acompanhamento: coerceNumber(payload.journeyTotals?.em_acompanhamento),
      encerrados: coerceNumber(payload.journeyTotals?.encerrados),
      em_fluxo_institucional: coerceNumber(payload.journeyTotals?.em_fluxo_institucional),
    },
    journeyStatusSummary: JOURNEY_STATUS_FLOW.map((status) => {
      const item = summaryMap.get(status);
      return {
        status,
        label: JOURNEY_STATUS_LABELS[status],
        total: item ? item.total : 0,
      };
    }),
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
  };
}

function formatDateTime(value?: string | null): string {
  if (!value) return "sem atualizacao";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "sem atualizacao";
  return parsed.toLocaleString("pt-BR");
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const { canView: canViewUsers } = useModulePermissions("usuarios");

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);

    try {
      const data = await apiService.getDashboardStats();
      if (data.success) {
        setStats(normalizeDashboardStats(data.stats));
        return;
      }

      setStats(defaultStats);
      setStatsError(data.message || "Nao foi possivel carregar o resumo da jornada.");
    } catch (error) {
      console.error("Erro ao carregar estatisticas do dashboard:", error);
      setStats(defaultStats);
      setStatsError("Nao foi possivel carregar o resumo da jornada.");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const stageCards = useMemo(
    () => [
      {
        title: "Cadastros principais",
        value: stats.totalAssistidos,
        description: "Base institucional consolidada por status_jornada.",
        icon: Users,
        tone: "text-primary",
      },
      {
        title: "Fila de espera",
        value: stats.journeyTotals.em_triagem,
        description: "Triagem social, pre-cadastro e agendamento permanecem aqui.",
        icon: Clock,
        tone: "text-accent",
      },
      {
        title: "Avaliação e vaga",
        value: stats.journeyTotals.em_avaliacao_e_vaga,
        description: "Inclui em_avaliacao e em_analise_vaga.",
        icon: ClipboardList,
        tone: "text-warning",
      },
      {
        title: "Acompanhamento",
        value: stats.journeyTotals.em_acompanhamento,
        description: "Matriculado, ativo e inativo assistencial.",
        icon: Activity,
        tone: "text-success",
      },
    ],
    [stats]
  );

  const renderOverview = () => (
    <div className="space-y-4">
      {statsError && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{statsError}</p>
                <p className="text-xs text-muted-foreground">
                  O dashboard continua carregando com valores neutros para nao misturar leitura institucional com fallback silencioso.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stageCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="border-0" style={{ boxShadow: "var(--shadow-soft)" }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <Icon className={`h-4 w-4 ${card.tone}`} />
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold text-foreground">{loadingStats ? "..." : card.value}</div>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="border-0" style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Resumo institucional da jornada
            </CardTitle>
            <CardDescription>
              Leitura oficial por <code>status_jornada</code>, sem dependencia de <code>status</code> legado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {stats.journeyStatusSummary.map((item) => (
                <div
                  key={item.status}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">status_jornada oficial</p>
                  </div>
                  <Badge variant={item.total > 0 ? "default" : "secondary"}>{item.total}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0" style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader>
            <CardTitle>Leitura de governanca</CardTitle>
            <CardDescription>Campos e alertas que ajudam a evitar drift conceitual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">Fonte institucional</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Todo resumo de jornada deve partir de <code>status_jornada</code>.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">Compatibilidade legada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                <code>status</code> pode existir para apoio operacional, mas nao deve dirigir dashboard institucional.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">Registros fora do fluxo</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.unknownStatusCount} registro(s) com status_jornada nao oficial foram detectados.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">Ultima atualizacao</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(stats.updatedAt)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "users":
        return <UserManagement />;
      case "overview":
      default:
        return renderOverview();
    }
  };

  return (
    <ProtectedRoute module="dashboard" permission="view">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel Principal</h1>
          <p className="text-muted-foreground text-sm">
            Visao institucional da jornada por status_jornada.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant={activeTab === "overview" ? "default" : "outline"}
            onClick={() => setActiveTab("overview")}
            className="flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            Visao Geral
          </Button>
          {canViewUsers && (
            <Button
              variant={activeTab === "users" ? "default" : "outline"}
              onClick={() => setActiveTab("users")}
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Usuarios
            </Button>
          )}
        </div>

        {renderContent()}
      </div>
    </ProtectedRoute>
  );
}
