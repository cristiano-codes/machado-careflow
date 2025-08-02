import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useState } from "react";

interface AgendaItem {
  id: number;
  hora: string;
  paciente: string;
  servico: string;
  status: 'agendado' | 'confirmado' | 'concluido' | 'cancelado';
  profissional: string;
}

export default function Agenda() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const agendamentos: AgendaItem[] = [
    {
      id: 1,
      hora: "08:00",
      paciente: "Maria Silva",
      servico: "Avaliação Psicológica",
      status: "confirmado",
      profissional: "Dr. João Santos"
    },
    {
      id: 2,
      hora: "09:30",
      paciente: "Carlos Oliveira",
      servico: "Terapia Individual",
      status: "agendado",
      profissional: "Dra. Ana Costa"
    },
    {
      id: 3,
      hora: "11:00",
      paciente: "Lucia Ferreira",
      servico: "Orientação Profissional",
      status: "concluido",
      profissional: "Dr. Pedro Lima"
    },
    {
      id: 4,
      hora: "14:00",
      paciente: "Roberto Santos",
      servico: "Terapia em Grupo",
      status: "agendado",
      profissional: "Dra. Carmen Rosa"
    },
    {
      id: 5,
      hora: "15:30",
      paciente: "Amanda Costa",
      servico: "Avaliação Psicológica",
      status: "cancelado",
      profissional: "Dr. João Santos"
    }
  ];

  const getStatusBadge = (status: string) => {
    const variants = {
      'agendado': { variant: 'secondary' as const, text: 'Agendado' },
      'confirmado': { variant: 'default' as const, text: 'Confirmado' },
      'concluido': { variant: 'outline' as const, text: 'Concluído' },
      'cancelado': { variant: 'destructive' as const, text: 'Cancelado' }
    };
    
    const config = variants[status as keyof typeof variants];
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const changeDate = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
            <p className="text-muted-foreground text-sm">Visualize e gerencie os agendamentos</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Novo Agendamento
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {formatDate(currentDate)}
                </CardTitle>
                <CardDescription>
                  {agendamentos.length} agendamentos para hoje
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => changeDate(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Hoje
                </Button>
                <Button variant="outline" size="sm" onClick={() => changeDate(1)}>
                  Próximo
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agendamentos.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">{item.hora}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{item.paciente}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">{item.servico}</div>
                      <div className="text-xs text-muted-foreground">
                        Profissional: {item.profissional}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(item.status)}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        Editar
                      </Button>
                      {item.status === 'agendado' && (
                        <Button size="sm">
                          Confirmar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Agendamentos Hoje</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{agendamentos.length}</div>
              <p className="text-sm text-muted-foreground">Total do dia</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Confirmados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {agendamentos.filter(a => a.status === 'confirmado').length}
              </div>
              <p className="text-sm text-muted-foreground">Pacientes confirmados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">
                {agendamentos.filter(a => a.status === 'agendado').length}
              </div>
              <p className="text-sm text-muted-foreground">Aguardando confirmação</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}