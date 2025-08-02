import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Settings, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Configuracoes() {
  const { userProfile } = useAuth();
  const { settings, updateSettings, saveSettings } = useSettings();
  const { toast } = useToast();
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);

  useEffect(() => {
    setTempSettings(settings);
  }, [settings]);

  const handleSettingsUpdate = () => {
    updateSettings(tempSettings);
    saveSettings();
    setIsEditingSettings(false);
    toast({
      title: "Configurações salvas",
      description: "Configurações do sistema atualizadas com sucesso!",
    });
  };

  const isAdmin = userProfile?.role === 'Coordenador Geral';

  // Redirect or show access denied if not admin
  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações do Sistema</h1>
          <p className="text-muted-foreground text-sm">
            Configurações gerais da aplicação
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Shield className="w-5 h-5" />
              <p>Acesso negado. Apenas administradores podem acessar esta página.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações do Sistema</h1>
        <p className="text-muted-foreground text-sm">
          Configurações gerais da aplicação
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="w-4 h-4" />
            Configurações Institucionais
          </CardTitle>
          <CardDescription className="text-xs">
            Informações da instituição que aparecerão no sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="instituicao_nome" className="text-sm font-medium">
                Nome da Instituição
              </Label>
              <Input
                id="instituicao_nome"
                value={isEditingSettings ? tempSettings.instituicao_nome : settings.instituicao_nome}
                onChange={(e) => setTempSettings(prev => ({ ...prev, instituicao_nome: e.target.value }))}
                disabled={!isEditingSettings}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instituicao_email" className="text-sm font-medium">
                E-mail da Instituição
              </Label>
              <Input
                id="instituicao_email"
                type="email"
                value={isEditingSettings ? tempSettings.instituicao_email : settings.instituicao_email}
                onChange={(e) => setTempSettings(prev => ({ ...prev, instituicao_email: e.target.value }))}
                disabled={!isEditingSettings}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instituicao_telefone" className="text-sm font-medium">
                Telefone da Instituição
              </Label>
              <Input
                id="instituicao_telefone"
                value={isEditingSettings ? tempSettings.instituicao_telefone : settings.instituicao_telefone}
                onChange={(e) => setTempSettings(prev => ({ ...prev, instituicao_telefone: e.target.value }))}
                disabled={!isEditingSettings}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instituicao_endereco" className="text-sm font-medium">
                Endereço da Instituição
              </Label>
              <Input
                id="instituicao_endereco"
                value={isEditingSettings ? tempSettings.instituicao_endereco : settings.instituicao_endereco}
                onChange={(e) => setTempSettings(prev => ({ ...prev, instituicao_endereco: e.target.value }))}
                disabled={!isEditingSettings}
                className="text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            {isEditingSettings ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsEditingSettings(false);
                    setTempSettings(settings);
                  }}
                  size="sm"
                >
                  Cancelar
                </Button>
                <Button onClick={handleSettingsUpdate} size="sm">
                  Salvar Configurações
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditingSettings(true)} size="sm">
                Editar Configurações
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}