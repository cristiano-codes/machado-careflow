import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserManagement } from "@/components/admin/UserManagement";
import { useState } from "react";
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

const stats = [
  {
    title: "Crianças Atendidas",
    value: "247",
    description: "Total ativo no instituto",
    icon: Users,
    color: "text-primary"
  },
  {
    title: "Entrevistas Agendadas",
    value: "12",
    description: "Próximas 7 dias",
    icon: Calendar,
    color: "text-accent"
  },
  {
    title: "Avaliações Pendentes",
    value: "8",
    description: "Aguardando análise",
    icon: ClipboardList,
    color: "text-warning"
  },
  {
    title: "Receita Mensal",
    value: "R$ 89.450",
    description: "Faturamento de dezembro",
    icon: DollarSign,
    color: "text-success"
  }
];

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

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return <UserManagement />;
      case 'overview':
      default:
        return (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.title} className="border-0" style={{ boxShadow: 'var(--shadow-soft)' }}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                    <p className="text-xs text-muted-foreground">
                      {stat.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts and Activities */}
            <div className="grid gap-6 md:grid-cols-2">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Painel Principal
          </h1>
          <p className="text-muted-foreground">
            Visão geral das atividades do Instituto Lauir Machado
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
          <Button 
            variant={activeTab === 'users' ? 'default' : 'outline'}
            onClick={() => setActiveTab('users')}
            className="flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            Usuários
          </Button>
        </div>
      </div>

      {renderContent()}
    </div>
  );
}