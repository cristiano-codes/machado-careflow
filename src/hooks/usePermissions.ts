import { useMemo } from "react";
import {
  ADMIN_MACRO_PERMISSION_NAMES,
  isStandardPermissionAction,
  normalizePermissionToken,
  parseScope,
  resolveModuleAliases,
} from "@/permissions/permissionMap";

type RawPerm =
  | string
  | { module?: string; modulo?: string; permission?: string; name?: string; action?: string };

type NormalizedPerm = { module: string; permission: string };

type StoredUser = {
  role?: string;
  permissions?: RawPerm[];
};

const ADMIN_ROLES = new Set(["admin", "adm", "administrador", "coordenador_geral"]);
const READONLY_ROLES = new Set(["usuario", "consulta"]);
const ENABLE_READONLY_ROLE_IMPLICIT_VIEW_BYPASS =
  String(import.meta.env?.VITE_ENABLE_READONLY_ROLE_IMPLICIT_VIEW_BYPASS || "false")
    .trim()
    .toLowerCase() === "true";

function readStoredUser(): StoredUser | null {
  const raw = sessionStorage.getItem("user") ?? localStorage.getItem("user");
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

function normalize(raw: RawPerm): NormalizedPerm[] {
  if (typeof raw === "string") {
    const parsed = parseScope(raw);
    return parsed ? [parsed] : [];
  }

  const entry = raw as Record<string, unknown>;
  const module = normalizePermissionToken(
    (typeof entry.module === "string" ? entry.module : "") ||
      (typeof entry.modulo === "string" ? entry.modulo : "")
  );
  const permission = normalizePermissionToken(
    (typeof entry.permission === "string" ? entry.permission : "") ||
      (typeof entry.action === "string" ? entry.action : "") ||
      (typeof entry.name === "string" ? entry.name : "")
  );

  if (!module || !permission) return [];
  return [{ module, permission }];
}

function checkAdminMacro(permissions: NormalizedPerm[]) {
  return permissions.some(
    (item) =>
      ADMIN_MACRO_PERMISSION_NAMES.has(item.permission) ||
      (item.module === "admin" && (item.permission === "access" || item.permission === "all"))
  );
}

export function usePermissions() {
  const user = useMemo(() => readStoredUser(), []);
  const role = normalizePermissionToken(user?.role?.toString() || "");

  const normalizedPermissions = useMemo<NormalizedPerm[]>(() => {
    const raw = user?.permissions;
    if (!raw || !Array.isArray(raw)) return [];

    const list: NormalizedPerm[] = [];
    for (const item of raw) {
      list.push(...normalize(item));
    }

    return list;
  }, [user]);

  const hasAdminMacro = useMemo(
    () => checkAdminMacro(normalizedPermissions),
    [normalizedPermissions]
  );

  function hasPermission(module: string, permission: string) {
    const targetModule = normalizePermissionToken(module || "");
    const targetPermission = normalizePermissionToken(permission || "");

    if (!targetModule || !targetPermission) return false;
    if (ADMIN_ROLES.has(role)) return true;

    const modulesToMatch = resolveModuleAliases(targetModule);

    if (
      ENABLE_READONLY_ROLE_IMPLICIT_VIEW_BYPASS &&
      READONLY_ROLES.has(role) &&
      targetPermission === "view" &&
      (modulesToMatch.includes("profissionais") || modulesToMatch.includes("configuracoes"))
    ) {
      return true;
    }

    const explicitMatch = normalizedPermissions.some((item) =>
      modulesToMatch.some(
        (candidate) =>
          (item.module === candidate || item.module === "*") &&
          (item.permission === targetPermission || item.permission === "*")
      )
    );
    if (explicitMatch) return true;

    if (hasAdminMacro && isStandardPermissionAction(targetPermission)) {
      return true;
    }

    return false;
  }

  function getModulePermissions(module: string) {
    const targetModule = normalizePermissionToken(module || "");
    const modulesToMatch = resolveModuleAliases(targetModule);
    const permissions = new Set<string>();

    if (ADMIN_ROLES.has(role)) {
      return new Set<string>(["view", "create", "edit", "delete", "access"]);
    }

    if (
      ENABLE_READONLY_ROLE_IMPLICIT_VIEW_BYPASS &&
      READONLY_ROLES.has(role) &&
      (modulesToMatch.includes("profissionais") || modulesToMatch.includes("configuracoes"))
    ) {
      permissions.add("view");
    }

    for (const item of normalizedPermissions) {
      if (modulesToMatch.includes(item.module) || item.module === "*") {
        if (item.permission === "*") {
          permissions.add("view");
          permissions.add("create");
          permissions.add("edit");
          permissions.add("delete");
          permissions.add("access");
        } else {
          permissions.add(item.permission);
        }
      }
    }

    if (hasAdminMacro) {
      permissions.add("view");
      permissions.add("create");
      permissions.add("edit");
      permissions.add("delete");
      permissions.add("access");
    }

    return permissions;
  }

  function hasScope(scope: string) {
    const parsed = parseScope(scope);
    if (!parsed) return false;
    return hasPermission(parsed.module, parsed.permission);
  }

  function hasAnyScope(scopes: string[]) {
    if (!Array.isArray(scopes) || scopes.length === 0) return false;
    return scopes.some((scope) => hasScope(scope));
  }

  const loading = false;

  return { hasPermission, getModulePermissions, hasScope, hasAnyScope, loading };
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
