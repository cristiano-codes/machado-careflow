import { ReactNode } from "react";
import { Navigate, matchPath, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, AlertTriangle } from "lucide-react";
import {
  buildScope,
  ROUTE_PERMISSION_MAP,
  type RoutePermissionConfig,
} from "@/permissions/permissionMap";

const PUBLIC_ROUTE_WHITELIST = new Set([
  "/",
  "/dashboard",
  "/trocar-senha-obrigatoria",
]);

const UNAUTHORIZED_REDIRECT_PATH = "/";

function normalizePathname(rawPathname: string) {
  const withoutHash = (rawPathname || "").split("#")[0] || "";
  const withoutQuery = withoutHash.split("?")[0] || "";
  const normalized = withoutQuery.trim();

  if (!normalized || normalized === "/") return "/";

  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_WHITELIST.has(normalizePathname(pathname));
}

function routeMatchesPath(routeConfig: RoutePermissionConfig, pathname: string) {
  const routePath = normalizePathname(routeConfig.path);

  if (routeConfig.match === "prefix") {
    if (pathname === routePath) {
      return true;
    }

    const prefixPattern = routePath === "/" ? "/*" : `${routePath}/*`;
    return Boolean(
      matchPath(
        {
          path: prefixPattern,
          end: false,
        },
        pathname
      )
    );
  }

  return Boolean(
    matchPath(
      {
        path: routePath,
        end: true,
      },
      pathname
    )
  );
}

function findMappedRoute(pathname: string) {
  for (const routeConfig of ROUTE_PERMISSION_MAP) {
    if (routeMatchesPath(routeConfig, pathname)) {
      return routeConfig;
    }
  }

  return null;
}

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
  const normalizedPathname = normalizePathname(
    `${location.pathname}${location.search}${location.hash}`
  );
  const isPublic = isPublicRoute(normalizedPathname);
  const mappedRoute = isPublic ? null : findMappedRoute(normalizedPathname);
  const mappedScopes = mappedRoute?.requiredAnyScopes ?? [];
  const hasMappedScopes = mappedScopes.length > 0;
  const hasMappedPermission = hasMappedScopes && hasAnyScope(mappedScopes);
  const passedCentralGuard =
    isPublic || (Boolean(mappedRoute) && hasMappedScopes && hasMappedPermission);

  const explicitScopes =
    Array.isArray(requiredAnyScopes) && requiredAnyScopes.length > 0
      ? requiredAnyScopes
      : module && permission
        ? [buildScope(module, permission)]
        : [];
  const passedComponentGuard =
    explicitScopes.length === 0 || hasAnyScope(explicitScopes);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!passedCentralGuard) {
    return <Navigate to={UNAUTHORIZED_REDIRECT_PATH} replace />;
  }

  if (!passedComponentGuard) {
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
