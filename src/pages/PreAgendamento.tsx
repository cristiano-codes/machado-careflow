import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MessageSquare, Clock, User } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function PreAgendamento() {
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    email: '',
    servico: '',
    data_preferencia: '',
    horario_preferencia: '',
    observacoes: ''
  });
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Pré-agendamento realizado!",
      description: "Entraremos em contato para confirmar o horário.",
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pré-Agendamento</h1>
          <p className="text-muted-foreground text-sm">Solicite um agendamento e entraremos em contato</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Solicitação de Agendamento
                </CardTitle>
                <CardDescription>
                  Preencha os dados para solicitar um agendamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="nome">Nome Completo</Label>
                      <Input
                        id="nome"
                        value={formData.nome}
                        onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="telefone">Telefone</Label>
                      <Input
                        id="telefone"
                        value={formData.telefone}
                        onChange={(e) => setFormData(prev => ({ ...prev, telefone: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="servico">Serviço Desejado</Label>
                    <Select value={formData.servico} onValueChange={(value) => setFormData(prev => ({ ...prev, servico: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o serviço" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="avaliacao">Avaliação Psicológica</SelectItem>
                        <SelectItem value="terapia">Terapia Individual</SelectItem>
                        <SelectItem value="grupo">Terapia em Grupo</SelectItem>
                        <SelectItem value="orientacao">Orientação Profissional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="data">Data de Preferência</Label>
                      <Input
                        id="data"
                        type="date"
                        value={formData.data_preferencia}
                        onChange={(e) => setFormData(prev => ({ ...prev, data_preferencia: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="horario">Horário de Preferência</Label>
                      <Select value={formData.horario_preferencia} onValueChange={(value) => setFormData(prev => ({ ...prev, horario_preferencia: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o horário" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manha">Manhã (8h às 12h)</SelectItem>
                          <SelectItem value="tarde">Tarde (13h às 17h)</SelectItem>
                          <SelectItem value="noite">Noite (18h às 20h)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="observacoes">Observações</Label>
                    <Textarea
                      id="observacoes"
                      placeholder="Informações adicionais..."
                      value={formData.observacoes}
                      onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                    />
                  </div>

                  <Button type="submit" className="w-full">
                    Solicitar Pré-Agendamento
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Horários de Funcionamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Segunda a Sexta:</span>
                  <span className="font-medium">8h às 18h</span>
                </div>
                <div className="flex justify-between">
                  <span>Sábado:</span>
                  <span className="font-medium">8h às 12h</span>
                </div>
                <div className="flex justify-between">
                  <span>Domingo:</span>
                  <span className="font-medium">Fechado</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Dicas Importantes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• Chegue 15 minutos antes do horário</p>
                <p>• Traga documento com foto</p>
                <p>• Confirme seu agendamento por telefone</p>
                <p>• Em caso de falta, reagende com antecedência</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}