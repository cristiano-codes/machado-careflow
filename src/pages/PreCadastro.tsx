import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, User, MapPin, Phone, Mail } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function PreCadastro() {
  const [formData, setFormData] = useState({
    nome: '',
    cpf: '',
    rg: '',
    data_nascimento: '',
    email: '',
    telefone: '',
    celular: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
    profissao: '',
    estado_civil: '',
    escolaridade: '',
    convenio: '',
    numero_convenio: '',
    observacoes: ''
  });
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Pré-cadastro realizado!",
      description: "Seus dados foram salvos com sucesso.",
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
          <h1 className="text-2xl font-bold tracking-tight">Pré-Cadastro</h1>
          <p className="text-muted-foreground text-sm">Cadastre informações básicas do paciente</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados Pessoais */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Dados Pessoais
              </CardTitle>
              <CardDescription>
                Informações básicas do paciente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nome">Nome Completo*</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="data_nascimento">Data de Nascimento*</Label>
                  <Input
                    id="data_nascimento"
                    type="date"
                    value={formData.data_nascimento}
                    onChange={(e) => setFormData(prev => ({ ...prev, data_nascimento: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cpf">CPF*</Label>
                  <Input
                    id="cpf"
                    placeholder="000.000.000-00"
                    value={formData.cpf}
                    onChange={(e) => setFormData(prev => ({ ...prev, cpf: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="rg">RG</Label>
                  <Input
                    id="rg"
                    value={formData.rg}
                    onChange={(e) => setFormData(prev => ({ ...prev, rg: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="estado_civil">Estado Civil</Label>
                  <Select value={formData.estado_civil} onValueChange={(value) => setFormData(prev => ({ ...prev, estado_civil: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                      <SelectItem value="casado">Casado(a)</SelectItem>
                      <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                      <SelectItem value="viuvo">Viúvo(a)</SelectItem>
                      <SelectItem value="uniao_estavel">União Estável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="escolaridade">Escolaridade</Label>
                  <Select value={formData.escolaridade} onValueChange={(value) => setFormData(prev => ({ ...prev, escolaridade: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fundamental">Ensino Fundamental</SelectItem>
                      <SelectItem value="medio">Ensino Médio</SelectItem>
                      <SelectItem value="superior">Ensino Superior</SelectItem>
                      <SelectItem value="pos">Pós-graduação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="profissao">Profissão</Label>
                <Input
                  id="profissao"
                  value={formData.profissao}
                  onChange={(e) => setFormData(prev => ({ ...prev, profissao: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Contato */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Informações de Contato
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">E-mail*</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    placeholder="(11) 1234-5678"
                    value={formData.telefone}
                    onChange={(e) => setFormData(prev => ({ ...prev, telefone: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="celular">Celular*</Label>
                <Input
                  id="celular"
                  placeholder="(11) 99999-9999"
                  value={formData.celular}
                  onChange={(e) => setFormData(prev => ({ ...prev, celular: e.target.value }))}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Endereço */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Endereço
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    placeholder="00000-000"
                    value={formData.cep}
                    onChange={(e) => setFormData(prev => ({ ...prev, cep: e.target.value }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="endereco">Endereço</Label>
                  <Input
                    id="endereco"
                    value={formData.endereco}
                    onChange={(e) => setFormData(prev => ({ ...prev, endereco: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="numero">Número</Label>
                  <Input
                    id="numero"
                    value={formData.numero}
                    onChange={(e) => setFormData(prev => ({ ...prev, numero: e.target.value }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input
                    id="complemento"
                    value={formData.complemento}
                    onChange={(e) => setFormData(prev => ({ ...prev, complemento: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input
                    id="bairro"
                    value={formData.bairro}
                    onChange={(e) => setFormData(prev => ({ ...prev, bairro: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={formData.cidade}
                    onChange={(e) => setFormData(prev => ({ ...prev, cidade: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="estado">Estado</Label>
                  <Select value={formData.estado} onValueChange={(value) => setFormData(prev => ({ ...prev, estado: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SP">São Paulo</SelectItem>
                      <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                      <SelectItem value="MG">Minas Gerais</SelectItem>
                      {/* Adicionar outros estados conforme necessário */}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Convênio */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Informações do Convênio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="convenio">Convênio</Label>
                  <Select value={formData.convenio} onValueChange={(value) => setFormData(prev => ({ ...prev, convenio: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o convênio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="particular">Particular</SelectItem>
                      <SelectItem value="unimed">Unimed</SelectItem>
                      <SelectItem value="bradesco">Bradesco Saúde</SelectItem>
                      <SelectItem value="sulamerica">SulAmérica</SelectItem>
                      <SelectItem value="amil">Amil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="numero_convenio">Número do Convênio</Label>
                  <Input
                    id="numero_convenio"
                    value={formData.numero_convenio}
                    onChange={(e) => setFormData(prev => ({ ...prev, numero_convenio: e.target.value }))}
                  />
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
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline">
              Cancelar
            </Button>
            <Button type="submit">
              Salvar Pré-Cadastro
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}