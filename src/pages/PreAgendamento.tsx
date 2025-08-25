import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MessageSquare, Clock, User } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error('Erro ao carregar serviços:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('pre_appointments')
        .insert({
          name: formData.nome,
          phone: formData.telefone,
          email: formData.email,
          service_type: formData.servico,
          preferred_date: formData.data_preferencia || null,
          preferred_time: formData.horario_preferencia || null,
          notes: formData.observacoes || null,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "Pré-agendamento realizado!",
        description: "Entraremos em contato para confirmar o horário.",
      });

      // Limpar formulário
      setFormData({
        nome: '',
        telefone: '',
        email: '',
        servico: '',
        data_preferencia: '',
        horario_preferencia: '',
        observacoes: ''
      });
    } catch (error) {
      console.error('Erro ao salvar pré-agendamento:', error);
      toast({
        title: "Erro",
        description: "Erro ao salvar pré-agendamento. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      {services.map((service) => (
                        <SelectItem key={service.id} value={service.name}>
                          {service.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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

              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  <p><strong>Horários:</strong> Seg-Sex: 8h-18h | Sáb: 8h-12h</p>
                  <p><strong>Dica:</strong> Chegue 15min antes • Traga documento com foto</p>
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Salvando...' : 'Solicitar Pré-Agendamento'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}