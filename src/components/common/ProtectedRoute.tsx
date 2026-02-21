import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, AlertTriangle } from "lucide-react";
import { buildScope, getRouteRequiredScopes } from "@/permissions/permissionMap";

interface ProtectedRouteProps {
  children: ReactNode;
  module?: string;
  permission?: string;
  requiredAnyScopes?: string[];
  fallback?: ReactNode;
}

export function ProtectedRoute({
  children,
  module,
  permission,
  requiredAnyScopes,
  fallback,
}: ProtectedRouteProps) {
  const location = useLocation();
  const { hasAnyScope, loading } = usePermissions();

  const mappedScopes = getRouteRequiredScopes(location.pathname);
  const explicitScopes =
    Array.isArray(requiredAnyScopes) && requiredAnyScopes.length > 0
      ? requiredAnyScopes
      : module && permission
        ? [buildScope(module, permission)]
        : [];

  const scopesToCheck = mappedScopes.length > 0 ? mappedScopes : explicitScopes;
  const canAccess =
    scopesToCheck.length === 0 ? true : hasAnyScope(scopesToCheck);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!canAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex items-center justify-center min-h-[400px] p-8">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Acesso Restrito
          </AlertTitle>
          <AlertDescription>
            Voce nao tem permissao para acessar esta funcionalidade.
            Entre em contato com o administrador para solicitar acesso.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}

export function useModulePermissions(module: string) {
  const { hasPermission, getModulePermissions } = usePermissions();

  return {
    canView: hasPermission(module, "view"),
    canCreate: hasPermission(module, "create"),
    canEdit: hasPermission(module, "edit"),
    canDelete: hasPermission(module, "delete"),
    permissions: getModulePermissions(module),
  };
}
