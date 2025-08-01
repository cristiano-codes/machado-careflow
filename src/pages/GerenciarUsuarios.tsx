import { UserManagement } from "@/components/admin/UserManagement";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";

export default function GerenciarUsuarios() {
  return (
    <ProtectedRoute module="usuarios" permission="view">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Gerenciar Usuários
          </h1>
          <p className="text-muted-foreground">
            Gerencie usuários, aprovações e permissões do sistema
          </p>
        </div>
        <UserManagement />
      </div>
    </ProtectedRoute>
  );
}