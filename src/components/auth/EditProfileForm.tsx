import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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
  const { updateProfile } = useAuth();
  const [formData, setFormData] = useState({
    name: user.name || "",
    email: user.email || "",
    username: user.username || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Se o email mudou, atualizar no Supabase Auth também
      if (formData.email !== user.email) {
        const { error: authError } = await supabase.auth.updateUser({
          email: formData.email
        });
        
        if (authError) {
          throw new Error("Erro ao atualizar email: " + authError.message);
        }
        
        // Enviar email de confirmação
        await sendEmailConfirmation(formData.email, user.name);
      }
      
      // Atualizar perfil na tabela users
      const result = await updateProfile(formData);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      toast.success("Perfil atualizado com sucesso!");
      if (formData.email !== user.email) {
        toast.info("Confirme o novo email para ativá-lo");
      }
      onSuccess(formData);
      setIsEditing(false);
    } catch (error: any) {
      console.error("Erro:", error);
      toast.error(error.message || "Erro ao atualizar perfil");
    } finally {
      setLoading(false);
    }
  };

  const sendEmailConfirmation = async (email: string, name: string) => {
    try {
      await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject: "Confirmação de Alteração de Email - Instituto Lauir",
          html: `
            <h2>Olá, ${name}!</h2>
            <p>Seu email foi alterado para: <strong>${email}</strong></p>
            <p>Se você não fez esta alteração, entre em contato conosco imediatamente.</p>
            <p>Atenciosamente,<br>Instituto Lauir</p>
          `
        }
      });
    } catch (error) {
      console.error("Erro ao enviar email:", error);
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