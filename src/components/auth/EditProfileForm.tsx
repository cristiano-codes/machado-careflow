import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit } from "lucide-react";
import { toast } from "sonner";
import { apiService } from "@/services/api";

interface EditProfileFormProps {
  user: {
    name: string;
    email: string;
    username: string;
  };
  onSuccess: (updatedUser: any) => void;
}

export function EditProfileForm({ user, onSuccess }: EditProfileFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user.name || "",
    email: user.email || "",
    username: user.username || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Aqui você pode adicionar a chamada para a API para atualizar o perfil
      // Por enquanto, vamos simular a atualização
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast.success("Perfil atualizado com sucesso!");
      onSuccess(formData);
      setIsEditing(false);
    } catch (error) {
      toast.error("Erro ao atualizar perfil");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: user.name || "",
      email: user.email || "",
      username: user.username || "",
    });
    setIsEditing(false);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit className="w-4 h-4" />
            <span className="text-lg">Editar Informações</span>
          </div>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="text-xs"
            >
              Editar
            </Button>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Atualize suas informações pessoais
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name" className="text-sm">Nome Completo</Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={!isEditing}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="username" className="text-sm">Nome de Usuário</Label>
            <Input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              disabled={!isEditing}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email" className="text-sm">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={!isEditing}
              required
            />
          </div>

          {isEditing && (
            <div className="flex gap-2 pt-3">
              <Button type="submit" disabled={loading} className="text-sm flex-1">
                {loading ? "Salvando..." : "Salvar"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCancel}
                disabled={loading}
                className="text-sm flex-1"
              >
                Cancelar
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}