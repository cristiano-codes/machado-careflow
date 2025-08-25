import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCheck, Briefcase, Users, TrendingUp, Plus, Eye } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useState, useEffect } from "react";
import { apiService } from "@/services/api";

interface Vaga {
  id: string;
  titulo: string;
  empresa: string;
  descricao: string;
  requisitos: string[];
  salario: string;
  tipo: 'clt' | 'pj' | 'estagio' | 'temporario';
  nivel: 'junior' | 'pleno' | 'senior';
  status: 'ativa' | 'pausada' | 'preenchida' | 'cancelada';
  candidatos: number;
  data_criacao: string;
}

interface Candidato {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  vaga_id: string;
  status: 'novo' | 'em_analise' | 'aprovado' | 'rejeitado';
  pontuacao?: number;
  observacoes?: string;
}

export default function AnaliseVagas() {
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);

  useEffect(() => {
    loadVagas();
    loadCandidatos();
  }, []);

  const loadVagas = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/job-vacancies');
      const data = await response.json();
      
      if (data.success) {
        setVagas(data.vacancies);
      }
    } catch (error) {
      console.error('Erro ao carregar vagas:', error);
    }
  };

  const loadCandidatos = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/job-candidates');
      const data = await response.json();
      
      if (data.success) {
        setCandidatos(data.candidates);
      }
    } catch (error) {
      console.error('Erro ao carregar candidatos:', error);
    }
  };

  const getStatusBadge = (status: string, type: 'vaga' | 'candidato' = 'vaga') => {
    if (type === 'vaga') {
      const variants = {
        'ativa': { variant: 'default' as const, text: 'Ativa' },
        'pausada': { variant: 'secondary' as const, text: 'Pausada' },
        'preenchida': { variant: 'outline' as const, text: 'Preenchida' },
        'cancelada': { variant: 'destructive' as const, text: 'Cancelada' }
      };
      const config = variants[status as keyof typeof variants];
      return <Badge variant={config.variant}>{config.text}</Badge>;
    } else {
      const variants = {
        'novo': { variant: 'secondary' as const, text: 'Novo' },
        'em_analise': { variant: 'default' as const, text: 'Em Análise' },
        'aprovado': { variant: 'outline' as const, text: 'Aprovado' },
        'rejeitado': { variant: 'destructive' as const, text: 'Rejeitado' }
      };
      const config = variants[status as keyof typeof variants];
      return <Badge variant={config.variant}>{config.text}</Badge>;
    }
  };

  const getTipoBadge = (tipo: string) => {
    const variants = {
      'clt': { variant: 'default' as const, text: 'CLT' },
      'pj': { variant: 'secondary' as const, text: 'PJ' },
      'estagio': { variant: 'outline' as const, text: 'Estágio' },
      'temporario': { variant: 'outline' as const, text: 'Temporário' }
    };
    const config = variants[tipo as keyof typeof variants];
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  const getNivelBadge = (nivel: string) => {
    const variants = {
      'junior': { variant: 'secondary' as const, text: 'Júnior' },
      'pleno': { variant: 'default' as const, text: 'Pleno' },
      'senior': { variant: 'outline' as const, text: 'Sênior' }
    };
    const config = variants[nivel as keyof typeof variants];
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const vagasAtivas = vagas.filter(v => v.status === 'ativa');
  const candidatosNovos = candidatos.filter(c => c.status === 'novo');
  const candidatosAprovados = candidatos.filter(c => c.status === 'aprovado');

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Análise de Vagas</h1>
            <p className="text-muted-foreground text-sm">Gerencie vagas e análise de candidatos</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nova Vaga
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Vagas Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{vagasAtivas.length}</div>
              <p className="text-sm text-muted-foreground">Vagas em andamento</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total Candidatos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{candidatos.length}</div>
              <p className="text-sm text-muted-foreground">Candidatos cadastrados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Novos Candidatos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{candidatosNovos.length}</div>
              <p className="text-sm text-muted-foreground">Aguardando análise</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Aprovados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{candidatosAprovados.length}</div>
              <p className="text-sm text-muted-foreground">Candidatos aprovados</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="vagas" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="vagas" className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              Vagas ({vagas.length})
            </TabsTrigger>
            <TabsTrigger value="candidatos" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Candidatos ({candidatos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vagas">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5" />
                  Vagas Disponíveis
                </CardTitle>
                <CardDescription>
                  Lista de vagas cadastradas no sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Tipo/Nível</TableHead>
                      <TableHead>Salário</TableHead>
                      <TableHead>Candidatos</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vagas.map((vaga) => (
                      <TableRow key={vaga.id}>
                        <TableCell className="font-medium">
                          <div>
                            <div>{vaga.titulo}</div>
                            <div className="text-sm text-muted-foreground truncate max-w-xs">
                              {vaga.descricao}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{vaga.empresa}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {getTipoBadge(vaga.tipo)}
                            {getNivelBadge(vaga.nivel)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{vaga.salario}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{vaga.candidatos}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(vaga.status, 'vaga')}</TableCell>
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

          <TabsContent value="candidatos">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Candidatos
                </CardTitle>
                <CardDescription>
                  Lista de candidatos para análise
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Vaga</TableHead>
                      <TableHead>Pontuação</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidatos.map((candidato) => {
                      const vaga = vagas.find(v => v.id === candidato.vaga_id);
                      return (
                        <TableRow key={candidato.id}>
                          <TableCell className="font-medium">{candidato.nome}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{candidato.email}</div>
                              <div className="text-muted-foreground">{candidato.telefone}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{vaga?.titulo}</div>
                              <div className="text-muted-foreground">{vaga?.empresa}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {candidato.pontuacao && (
                              <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">{candidato.pontuacao}%</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(candidato.status, 'candidato')}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm">
                                Analisar
                              </Button>
                              {candidato.status === 'novo' && (
                                <Button size="sm">
                                  Aprovar
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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