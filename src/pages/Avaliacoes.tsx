import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, User, Calendar, FileText, Plus, Eye } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useState } from "react";

interface Avaliacao {
  id: number;
  aluno: string;
  tipo: string;
  data_inicio: string;
  data_conclusao?: string;
  profissional: string;
  status: 'em_andamento' | 'concluida' | 'agendada' | 'cancelada';
  resultado?: string;
  observacoes?: string;
}

export default function Avaliacoes() {
  const [avaliacoes] = useState<Avaliacao[]>([
    {
      id: 1,
      aluno: "Maria Silva",
      tipo: "Avaliação Psicológica Completa",
      data_inicio: "2024-02-10",
      data_conclusao: "2024-02-15",
      profissional: "Dr. João Santos",
      status: "concluida",
      resultado: "Relatório disponível",
      observacoes: "Avaliação para fins terapêuticos"
    },
    {
      id: 2,
      aluno: "Carlos Oliveira",
      tipo: "Avaliação Neuropsicológica",
      data_inicio: "2024-02-12",
      profissional: "Dra. Ana Costa",
      status: "em_andamento",
      observacoes: "Bateria de testes em aplicação"
    },
    {
      id: 3,
      aluno: "Lucia Ferreira",
      tipo: "Avaliação Vocacional",
      data_inicio: "2024-02-20",
      profissional: "Dr. Pedro Lima",
      status: "agendada",
      observacoes: "Primeira sessão agendada"
    },
    {
      id: 4,
      aluno: "Roberto Santos",
      tipo: "Avaliação de Personalidade",
      data_inicio: "2024-02-08",
      profissional: "Dra. Carmen Rosa",
      status: "cancelada",
      observacoes: "Cancelada a pedido do aluno"
    },
    {
      id: 5,
      aluno: "Amanda Costa",
      tipo: "Avaliação Cognitiva",
      data_inicio: "2024-02-14",
      data_conclusao: "2024-02-18",
      profissional: "Dr. João Santos",
      status: "concluida",
      resultado: "Funções cognitivas preservadas"
    }
  ]);

  const getStatusBadge = (status: string) => {
    const variants = {
      'em_andamento': { variant: 'default' as const, text: 'Em Andamento' },
      'concluida': { variant: 'outline' as const, text: 'Concluída' },
      'agendada': { variant: 'secondary' as const, text: 'Agendada' },
      'cancelada': { variant: 'destructive' as const, text: 'Cancelada' }
    };
    
    const config = variants[status as keyof typeof variants];
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const avaliacoesConcluidas = avaliacoes.filter(a => a.status === 'concluida');
  const avaliacoesAndamento = avaliacoes.filter(a => a.status === 'em_andamento');
  const avaliacoesAgendadas = avaliacoes.filter(a => a.status === 'agendada');

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Avaliações</h1>
            <p className="text-muted-foreground text-sm">Gerencie avaliações psicológicas e neuropsicológicas</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nova Avaliação
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{avaliacoes.length}</div>
              <p className="text-sm text-muted-foreground">Avaliações registradas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Em Andamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{avaliacoesAndamento.length}</div>
              <p className="text-sm text-muted-foreground">Avaliações ativas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Concluídas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{avaliacoesConcluidas.length}</div>
              <p className="text-sm text-muted-foreground">Avaliações finalizadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Agendadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{avaliacoesAgendadas.length}</div>
              <p className="text-sm text-muted-foreground">Próximas avaliações</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="todas" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="todas">Todas ({avaliacoes.length})</TabsTrigger>
            <TabsTrigger value="andamento">Em Andamento ({avaliacoesAndamento.length})</TabsTrigger>
            <TabsTrigger value="concluidas">Concluídas ({avaliacoesConcluidas.length})</TabsTrigger>
            <TabsTrigger value="agendadas">Agendadas ({avaliacoesAgendadas.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="todas">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Todas as Avaliações
                </CardTitle>
                <CardDescription>
                  Lista completa de avaliações psicológicas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Tipo de Avaliação</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Conclusão</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {avaliacoes.map((avaliacao) => (
                      <TableRow key={avaliacao.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            {avaliacao.aluno}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate">{avaliacao.tipo}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            {formatDate(avaliacao.data_inicio)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {avaliacao.data_conclusao ? formatDate(avaliacao.data_conclusao) : '-'}
                        </TableCell>
                        <TableCell>{avaliacao.profissional}</TableCell>
                        <TableCell>{getStatusBadge(avaliacao.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
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

          <TabsContent value="andamento">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5" />
                  Avaliações em Andamento
                </CardTitle>
                <CardDescription>
                  Avaliações que estão sendo realizadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {avaliacoesAndamento.map((avaliacao) => (
                    <Card key={avaliacao.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{avaliacao.aluno}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{avaliacao.tipo}</p>
                            <p className="text-xs text-muted-foreground">
                              Iniciada em {formatDate(avaliacao.data_inicio)} • {avaliacao.profissional}
                            </p>
                            {avaliacao.observacoes && (
                              <p className="text-sm text-muted-foreground italic">{avaliacao.observacoes}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              Continuar
                            </Button>
                            <Button size="sm">
                              Finalizar
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="concluidas">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Avaliações Concluídas
                </CardTitle>
                <CardDescription>
                  Histórico de avaliações finalizadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {avaliacoesConcluidas.map((avaliacao) => (
                      <TableRow key={avaliacao.id}>
                        <TableCell className="font-medium">{avaliacao.aluno}</TableCell>
                        <TableCell className="max-w-xs truncate">{avaliacao.tipo}</TableCell>
                        <TableCell>
                          {formatDate(avaliacao.data_inicio)} a {avaliacao.data_conclusao ? formatDate(avaliacao.data_conclusao) : '-'}
                        </TableCell>
                        <TableCell>{avaliacao.profissional}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {avaliacao.resultado || 'Relatório disponível'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              Relatório
                            </Button>
                            <Button variant="outline" size="sm">
                              Download
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
                  <Calendar className="w-5 h-5" />
                  Avaliações Agendadas
                </CardTitle>
                <CardDescription>
                  Avaliações marcadas para os próximos dias
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {avaliacoesAgendadas.map((avaliacao) => (
                    <Card key={avaliacao.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{avaliacao.aluno}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{avaliacao.tipo}</p>
                            <p className="text-xs text-muted-foreground">
                              Agendada para {formatDate(avaliacao.data_inicio)} • {avaliacao.profissional}
                            </p>
                            {avaliacao.observacoes && (
                              <p className="text-sm text-muted-foreground italic">{avaliacao.observacoes}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              Reagendar
                            </Button>
                            <Button size="sm">
                              Iniciar
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}