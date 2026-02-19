import { UserManagement } from "@/components/admin/UserManagement";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";

export default function GerenciarUsuarios() {
  return (
    <ProtectedRoute module="usuarios" permission="view">
      <div className="mx-auto h-full max-w-7xl">
        <UserManagement />
      </div>
    </ProtectedRoute>
  );
}
