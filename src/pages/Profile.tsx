import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { EditProfileForm } from "@/components/auth/EditProfileForm";
import { useAuth } from "@/contexts/AuthContext";
import { User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { user, userProfile, signOut, updateProfile } = useAuth();
  const { toast } = useToast();

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


  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu Perfil</h1>
        <p className="text-muted-foreground text-sm">
          Gerencie suas informações pessoais e configurações de conta
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
                <Badge variant="secondary" className="text-xs">{userProfile?.role}</Badge>
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

      </div>
    </div>
  );
}