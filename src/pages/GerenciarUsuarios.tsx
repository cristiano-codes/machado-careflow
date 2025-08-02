import { UserManagement } from "@/components/admin/UserManagement";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";

export default function GerenciarUsuarios() {
  return (
    <ProtectedRoute module="usuarios" permission="view">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gerenciar Usuários</h1>
          <p className="text-muted-foreground text-sm">
            Gerencie usuários, aprovações e permissões do sistema
          </p>
        </div>
        <UserManagement />
      </div>
    </ProtectedRoute>
  );
}