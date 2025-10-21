import { ReactNode, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  module: string;
  permission: string;
  fallback?: ReactNode;
}

export function ProtectedRoute({ children, module, permission, fallback }: ProtectedRouteProps) {
  const { hasPermission, loading } = usePermissions();

  // >>> INÍCIO: bypass para super admin
  const isSuperAdmin = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (!raw) return false;
      const u = JSON.parse(raw);
      return typeof u?.role === 'string' && u.role.toLowerCase() === 'admin';
    } catch {
      return false;
    }
  }, []);

  if (isSuperAdmin) {
    return <>{children}</>;
  }
  // <<< FIM: bypass para super admin

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasPermission(module, permission)) {
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
            Você não tem permissão para acessar esta funcionalidade. 
            Entre em contato com o administrador para solicitar acesso.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}

// Hook para verificar permissões em componentes
export function useModulePermissions(module: string) {
  const { hasPermission, getModulePermissions } = usePermissions();

  return {
    canView: hasPermission(module, 'view'),
    canCreate: hasPermission(module, 'create'),
    canEdit: hasPermission(module, 'edit'),
    canDelete: hasPermission(module, 'delete'),
    permissions: getModulePermissions(module)
  };
}
