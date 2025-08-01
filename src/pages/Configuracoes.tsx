import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Bell, Shield, Database, Mail } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/SettingsContext";

export default function Configuracoes() {
  const { settings, updateSettings, saveSettings } = useSettings();
  const { toast } = useToast();

  const handleSave = (section: string) => {
    saveSettings();
    toast({
      title: "Configurações salvas!",
      description: `As configurações de ${section} foram atualizadas com sucesso.`,
    });
  };

  const updateSetting = (key: string, value: any) => {
    updateSettings({ [key]: value });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Configurações</h1>
            <p className="text-muted-foreground">Gerencie as configurações do sistema</p>
          </div>
        </div>

        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="geral" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="notificacoes" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notificações
            </TabsTrigger>
            <TabsTrigger value="seguranca" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Segurança
            </TabsTrigger>
            <TabsTrigger value="sistema" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Sistema
            </TabsTrigger>
          </TabsList>

          <TabsContent value="geral">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações Gerais
                </CardTitle>
                <CardDescription>
                  Informações básicas da instituição
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="instituicao_nome">Nome da Instituição</Label>
                    <Input
                      id="instituicao_nome"
                      value={settings.instituicao_nome}
                      onChange={(e) => updateSetting('instituicao_nome', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="instituicao_email">E-mail Principal</Label>
                    <Input
                      id="instituicao_email"
                      type="email"
                      value={settings.instituicao_email}
                      onChange={(e) => updateSetting('instituicao_email', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="instituicao_telefone">Telefone</Label>
                    <Input
                      id="instituicao_telefone"
                      value={settings.instituicao_telefone}
                      onChange={(e) => updateSetting('instituicao_telefone', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="instituicao_endereco">Endereço</Label>
                  <Input
                    id="instituicao_endereco"
                    value={settings.instituicao_endereco}
                    onChange={(e) => updateSetting('instituicao_endereco', e.target.value)}
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => handleSave('gerais')}>
                    Salvar Configurações Gerais
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notificacoes">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Configurações de Notificações
                </CardTitle>
                <CardDescription>
                  Configure como deseja receber notificações
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Notificações por E-mail</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba notificações importantes por e-mail
                      </p>
                    </div>
                    <Switch
                      checked={settings.email_notifications}
                      onCheckedChange={(checked) => updateSetting('email_notifications', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Notificações por SMS</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba alertas importantes via SMS
                      </p>
                    </div>
                    <Switch
                      checked={settings.sms_notifications}
                      onCheckedChange={(checked) => updateSetting('sms_notifications', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Notificações Push</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba notificações no navegador
                      </p>
                    </div>
                    <Switch
                      checked={settings.push_notifications}
                      onCheckedChange={(checked) => updateSetting('push_notifications', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Relatórios Semanais</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba relatórios semanais por e-mail
                      </p>
                    </div>
                    <Switch
                      checked={settings.weekly_reports}
                      onCheckedChange={(checked) => updateSetting('weekly_reports', checked)}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => handleSave('notificações')}>
                    Salvar Configurações de Notificações
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="seguranca">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Configurações de Segurança
                </CardTitle>
                <CardDescription>
                  Configure as políticas de segurança do sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Autenticação de Dois Fatores</Label>
                      <p className="text-sm text-muted-foreground">
                        Adicione uma camada extra de segurança
                      </p>
                    </div>
                    <Switch
                      checked={settings.two_factor_auth}
                      onCheckedChange={(checked) => updateSetting('two_factor_auth', checked)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="password_expiry_days">Expiração de Senha (dias)</Label>
                      <Input
                        id="password_expiry_days"
                        type="number"
                        value={settings.password_expiry_days}
                        onChange={(e) => updateSetting('password_expiry_days', parseInt(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="max_login_attempts">Máximo de Tentativas de Login</Label>
                      <Input
                        id="max_login_attempts"
                        type="number"
                        value={settings.max_login_attempts}
                        onChange={(e) => updateSetting('max_login_attempts', parseInt(e.target.value))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="session_timeout">Timeout de Sessão (minutos)</Label>
                    <Input
                      id="session_timeout"
                      type="number"
                      value={settings.session_timeout}
                      onChange={(e) => updateSetting('session_timeout', parseInt(e.target.value))}
                      className="max-w-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => handleSave('segurança')}>
                    Salvar Configurações de Segurança
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sistema">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Configurações do Sistema
                </CardTitle>
                <CardDescription>
                  Configure parâmetros técnicos do sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Atualizações Automáticas</Label>
                      <p className="text-sm text-muted-foreground">
                        Instalar atualizações de segurança automaticamente
                      </p>
                    </div>
                    <Switch
                      checked={settings.auto_updates}
                      onCheckedChange={(checked) => updateSetting('auto_updates', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Modo Debug</Label>
                      <p className="text-sm text-muted-foreground">
                        Ativar logs detalhados para diagnóstico
                      </p>
                    </div>
                    <Switch
                      checked={settings.debug_mode}
                      onCheckedChange={(checked) => updateSetting('debug_mode', checked)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="data_retention_days">Retenção de Dados (dias)</Label>
                      <Input
                        id="data_retention_days"
                        type="number"
                        value={settings.data_retention_days}
                        onChange={(e) => updateSetting('data_retention_days', parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => handleSave('sistema')}>
                    Salvar Configurações do Sistema
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}