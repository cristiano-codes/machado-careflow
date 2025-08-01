import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, FileText, Clock, User, Plus } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useState } from "react";

interface Entrevista {
  id: number;
  paciente: string;
  data: string;
  hora: string;
  tipo: string;
  profissional: string;
  status: 'agendada' | 'realizada' | 'cancelada' | 'pendente';
  observacoes?: string;
}

export default function Entrevistas() {
  const [entrevistas] = useState<Entrevista[]>([
    {
      id: 1,
      paciente: "Maria Silva",
      data: "2024-02-15",
      hora: "09:00",
      tipo: "Inicial",
      profissional: "Dr. João Santos",
      status: "realizada",
      observacoes: "Primeira consulta, anamnese completa"
    },
    {
      id: 2,
      paciente: "Carlos Oliveira",
      data: "2024-02-16",
      hora: "10:30",
      tipo: "Retorno",
      profissional: "Dra. Ana Costa",
      status: "agendada"
    },
    {
      id: 3,
      paciente: "Lucia Ferreira",
      data: "2024-02-17",
      hora: "14:00",
      tipo: "Avaliação",
      profissional: "Dr. Pedro Lima",
      status: "pendente"
    },
    {
      id: 4,
      paciente: "Roberto Santos",
      data: "2024-02-18",
      hora: "15:30",
      tipo: "Seguimento",
      profissional: "Dra. Carmen Rosa",
      status: "cancelada",
      observacoes: "Cancelada pelo paciente"
    }
  ]);

  const getStatusBadge = (status: string) => {
    const variants = {
      'agendada': { variant: 'default' as const, text: 'Agendada' },
      'realizada': { variant: 'outline' as const, text: 'Realizada' },
      'cancelada': { variant: 'destructive' as const, text: 'Cancelada' },
      'pendente': { variant: 'secondary' as const, text: 'Pendente' }
    };
    
    const config = variants[status as keyof typeof variants];
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const entrevistasRealizadas = entrevistas.filter(e => e.status === 'realizada');
  const entrevistasAgendadas = entrevistas.filter(e => e.status === 'agendada');
  const entrevistasPendentes = entrevistas.filter(e => e.status === 'pendente');

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Entrevistas</h1>
              <p className="text-muted-foreground">Gerencie as entrevistas e consultas</p>
            </div>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nova Entrevista
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{entrevistas.length}</div>
              <p className="text-sm text-muted-foreground">Entrevistas registradas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Agendadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{entrevistasAgendadas.length}</div>
              <p className="text-sm text-muted-foreground">Próximas entrevistas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Realizadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{entrevistasRealizadas.length}</div>
              <p className="text-sm text-muted-foreground">Entrevistas concluídas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{entrevistasPendentes.length}</div>
              <p className="text-sm text-muted-foreground">Aguardando confirmação</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="todas" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="todas">Todas ({entrevistas.length})</TabsTrigger>
            <TabsTrigger value="agendadas">Agendadas ({entrevistasAgendadas.length})</TabsTrigger>
            <TabsTrigger value="realizadas">Realizadas ({entrevistasRealizadas.length})</TabsTrigger>
            <TabsTrigger value="pendentes">Pendentes ({entrevistasPendentes.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="todas">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Todas as Entrevistas
                </CardTitle>
                <CardDescription>
                  Lista completa de entrevistas registradas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entrevistas.map((entrevista) => (
                      <TableRow key={entrevista.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            {entrevista.paciente}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <div>{formatDate(entrevista.data)}</div>
                              <div className="text-sm text-muted-foreground">{entrevista.hora}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{entrevista.tipo}</TableCell>
                        <TableCell>{entrevista.profissional}</TableCell>
                        <TableCell>{getStatusBadge(entrevista.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              Ver
                            </Button>
                            <Button variant="outline" size="sm">
                              Editar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agendadas">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Entrevistas Agendadas
                </CardTitle>
                <CardDescription>
                  Entrevistas marcadas para os próximos dias
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entrevistasAgendadas.map((entrevista) => (
                      <TableRow key={entrevista.id}>
                        <TableCell className="font-medium">{entrevista.paciente}</TableCell>
                        <TableCell>
                          {formatDate(entrevista.data)} às {entrevista.hora}
                        </TableCell>
                        <TableCell>{entrevista.tipo}</TableCell>
                        <TableCell>{entrevista.profissional}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm">
                              Confirmar
                            </Button>
                            <Button variant="outline" size="sm">
                              Reagendar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="realizadas">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Entrevistas Realizadas
                </CardTitle>
                <CardDescription>
                  Histórico de entrevistas concluídas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Observações</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entrevistasRealizadas.map((entrevista) => (
                      <TableRow key={entrevista.id}>
                        <TableCell className="font-medium">{entrevista.paciente}</TableCell>
                        <TableCell>{formatDate(entrevista.data)}</TableCell>
                        <TableCell>{entrevista.tipo}</TableCell>
                        <TableCell>{entrevista.profissional}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {entrevista.observacoes || '-'}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm">
                            Relatório
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pendentes">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Entrevistas Pendentes
                </CardTitle>
                <CardDescription>
                  Entrevistas que aguardam confirmação
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entrevistasPendentes.map((entrevista) => (
                      <TableRow key={entrevista.id}>
                        <TableCell className="font-medium">{entrevista.paciente}</TableCell>
                        <TableCell>
                          {formatDate(entrevista.data)} às {entrevista.hora}
                        </TableCell>
                        <TableCell>{entrevista.tipo}</TableCell>
                        <TableCell>{entrevista.profissional}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm">
                              Confirmar
                            </Button>
                            <Button variant="destructive" size="sm">
                              Cancelar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}