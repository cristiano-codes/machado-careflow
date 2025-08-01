import { PermissionManager } from "@/components/permissions/PermissionManager";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";

export default function PermissionManagerPage() {
  return (
    <ProtectedRoute module="usuarios" permission="view">
      <PermissionManager />
    </ProtectedRoute>
  );
}