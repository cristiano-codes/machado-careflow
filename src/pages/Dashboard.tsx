import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserManagement } from "@/components/admin/UserManagement";
import { useState, useEffect } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { ProtectedRoute, useModulePermissions } from "@/components/common/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { 
  Users, 
  Calendar, 
  ClipboardList, 
  DollarSign, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Activity,
  Settings,
  BarChart3
} from "lucide-react";

interface StatsData {
  totalStudents: number;
  scheduledInterviews: number;
  pendingEvaluations: number;
  monthlyRevenue: number;
}

const defaultStats: StatsData = {
  totalStudents: 0,
  scheduledInterviews: 0,
  pendingEvaluations: 0,
  monthlyRevenue: 0
};

const recentActivities = [
  {
    id: 1,
    type: "entrevista",
    description: "Entrevista agendada - Maria Silva",
    time: "2 horas atrás",
    status: "scheduled",
    icon: Calendar
  },
  {
    id: 2,
    type: "avaliacao",
    description: "Avaliação concluída - João Santos",
    time: "4 horas atrás",
    status: "completed",
    icon: CheckCircle2
  },
  {
    id: 3,
    type: "pre-agendamento",
    description: "Novo contato - Ana Costa",
    time: "6 horas atrás",
    status: "pending",
    icon: Clock
  },
  {
    id: 4,
    type: "frequencia",
    description: "Alerta de frequência - Pedro Lima",
    time: "1 dia atrás",
    status: "warning",
    icon: AlertCircle
  }
];

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "text-success";
    case "warning":
      return "text-warning";
    case "pending":
      return "text-accent";
    default:
      return "text-muted-foreground";
  }
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<StatsData>(defaultStats);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const { settings } = useSettings();
  const { canView: canViewUsers } = useModulePermissions('usuarios');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Carregar estatísticas do banco
      const [
        patientsResult,
        interviewsResult,
        evaluationsResult,
        financialResult
      ] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact' }).eq('status', 'ativo'),
        supabase.from('interviews').select('id', { count: 'exact' }).eq('status', 'scheduled').gte('interview_date', new Date().toISOString().split('T')[0]),
        supabase.from('evaluations').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('financial_transactions').select('amount').eq('type', 'income').gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      ]);

      const monthlyRevenue = financialResult.data?.reduce((total, transaction) => total + Number(transaction.amount), 0) || 0;

      setStats({
        totalStudents: patientsResult.count || 0,
        scheduledInterviews: interviewsResult.count || 0,
        pendingEvaluations: evaluationsResult.count || 0,
        monthlyRevenue
      });

      // Carregar atividades recentes
      const { data: activities } = await supabase
        .from('interviews')
        .select(`
          id,
          type,
          interview_date,
          status,
          patients(name)
        `)
        .order('created_at', { ascending: false })
        .limit(4);

      if (activities) {
        const formattedActivities = activities.map(activity => ({
          id: activity.id,
          type: 'entrevista',
          description: `Entrevista ${activity.status === 'scheduled' ? 'agendada' : 'realizada'} - ${activity.patients?.name}`,
          time: new Date(activity.interview_date).toLocaleDateString('pt-BR'),
          status: activity.status,
          icon: Calendar
        }));
        setRecentActivities(formattedActivities);
      }
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return <UserManagement />;
      case 'overview':
      default:
        return (
          <div className="space-y-4">
            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-0" style={{ boxShadow: 'var(--shadow-soft)' }}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Alunos Atendidos
                  </CardTitle>
                  <Users className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{stats.totalStudents}</div>
                  <p className="text-xs text-muted-foreground">
                    Total ativo no instituto
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-0" style={{ boxShadow: 'var(--shadow-soft)' }}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Entrevistas Agendadas
                  </CardTitle>
                  <Calendar className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{stats.scheduledInterviews}</div>
                  <p className="text-xs text-muted-foreground">
                    Próximas 7 dias
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-0" style={{ boxShadow: 'var(--shadow-soft)' }}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Avaliações Pendentes
                  </CardTitle>
                  <ClipboardList className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{stats.pendingEvaluations}</div>
                  <p className="text-xs text-muted-foreground">
                    Aguardando análise
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-0" style={{ boxShadow: 'var(--shadow-soft)' }}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Receita Mensal
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    R$ {stats.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Faturamento do mês
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts and Activities */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Weekly Overview */}
              <Card className="border-0" style={{ boxShadow: 'var(--shadow-soft)' }}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Visão Semanal
                  </CardTitle>
                  <CardDescription>
                    Atividades da última semana
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Entrevistas realizadas</span>
                      <span className="font-medium">15</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Avaliações concluídas</span>
                      <span className="font-medium">23</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Novos pré-cadastros</span>
                      <span className="font-medium">8</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Taxa de frequência</span>
                      <span className="font-medium text-success">92%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activities */}
              <Card className="border-0" style={{ boxShadow: 'var(--shadow-soft)' }}>
                <CardHeader>
                  <CardTitle>Atividades Recentes</CardTitle>
                  <CardDescription>
                    Últimas atualizações do sistema
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentActivities.map((activity) => (
                      <div key={activity.id} className="flex items-center gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                        <div className={`rounded-full p-2 bg-muted ${getStatusColor(activity.status)}`}>
                          <activity.icon className="h-3 w-3" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {activity.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activity.time}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card className="border-0" style={{ boxShadow: 'var(--shadow-soft)' }}>
              <CardHeader>
                <CardTitle>Ações Rápidas</CardTitle>
                <CardDescription>
                  Acesse rapidamente as funcionalidades mais utilizadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                  <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                    <Users className="h-8 w-8 text-primary mb-2" />
                    <span className="text-sm font-medium">Novo Pré-cadastro</span>
                  </div>
                  <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                    <Calendar className="h-8 w-8 text-accent mb-2" />
                    <span className="text-sm font-medium">Agendar Entrevista</span>
                  </div>
                  <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                    <ClipboardList className="h-8 w-8 text-warning mb-2" />
                    <span className="text-sm font-medium">Nova Avaliação</span>
                  </div>
                  <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                    <DollarSign className="h-8 w-8 text-success mb-2" />
                    <span className="text-sm font-medium">Registro Financeiro</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
    }
  };
  return (
    <ProtectedRoute module="dashboard" permission="view">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel Principal</h1>
          <p className="text-muted-foreground text-sm">
            Visão geral das atividades do {settings.instituicao_nome}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={activeTab === 'overview' ? 'default' : 'outline'}
            onClick={() => setActiveTab('overview')}
            className="flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            Visão Geral
          </Button>
          {canViewUsers && (
            <Button 
              variant={activeTab === 'users' ? 'default' : 'outline'}
              onClick={() => setActiveTab('users')}
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Usuários
            </Button>
          )}
        </div>

        {renderContent()}
      </div>
    </ProtectedRoute>
  );
}