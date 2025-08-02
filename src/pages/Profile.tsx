import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { EditProfileForm } from "@/components/auth/EditProfileForm";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { User, Settings, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { user, userProfile, signOut, updateProfile } = useAuth();
  const { settings, updateSettings, saveSettings } = useSettings();
  const { toast } = useToast();
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);

  useEffect(() => {
    setTempSettings(settings);
  }, [settings]);

  const handlePasswordChangeSuccess = () => {
    toast({
      title: "Senha alterada",
      description: "Senha alterada com sucesso!",
    });
  };

  const handleProfileUpdateSuccess = (updatedUser: any) => {
    toast({
      title: "Perfil atualizado",
      description: "Informações atualizadas com sucesso!",
    });
  };

  const handleSettingsUpdate = () => {
    updateSettings(tempSettings);
    saveSettings();
    setIsEditingSettings(false);
    toast({
      title: "Configurações salvas",
      description: "Configurações do sistema atualizadas com sucesso!",
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isAdmin = userProfile?.role === 'Coordenador Geral';

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu Perfil</h1>
        <p className="text-muted-foreground text-sm">
          Gerencie suas informações pessoais e configurações {isAdmin ? 'do sistema' : 'de conta'}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 md:grid-cols-2 grid-cols-1 h-[calc(100vh-200px)]">
        {/* Informações do Usuário */}
        <Card className="flex flex-col">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="w-4 h-4" />
              Informações Pessoais
            </CardTitle>
            <CardDescription className="text-xs">
              Suas informações básicas de perfil
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={userProfile?.avatar_url} />
                <AvatarFallback className="text-sm bg-primary/10">
                  {userProfile ? getInitials(userProfile.name) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{userProfile?.name || 'Usuário'}</h3>
                <p className="text-xs text-muted-foreground">{userProfile?.email}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{userProfile?.role}</Badge>
                  {isAdmin && <Shield className="w-3 h-3 text-primary" />}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alterar Senha */}
        <ChangePasswordForm onSuccess={handlePasswordChangeSuccess} />

        {/* Editar Perfil */}
        {userProfile && (
          <EditProfileForm 
            user={userProfile} 
            onSuccess={handleProfileUpdateSuccess}
          />
        )}

        {/* Configurações do Sistema (apenas para admin) */}
        {isAdmin && (
          <Card className="lg:col-span-3 md:col-span-2">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="w-4 h-4" />
                Configurações do Sistema
              </CardTitle>
              <CardDescription className="text-xs">
                Configurações gerais da aplicação (visível apenas para administradores)
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
        )}
      </div>
    </div>
  );
}