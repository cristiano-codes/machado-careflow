import { useMemo } from 'react';

type RawPerm =
  | string
  | { module?: string; permission?: string }
  | { name?: string; module?: string; action?: string };

type NormalizedPerm = { module: string; permission: string };

function readStoredUser(): any | null {
  // Tenta sessionStorage primeiro (reabre → limpa), depois localStorage (fallback)
  const raw =
    sessionStorage.getItem('user') ??
    localStorage.getItem('user');

  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalize(raw: RawPerm): NormalizedPerm[] {
  // Aceita formatos:
  // 1) "ADMIN_PANEL_ACCESS"
  // 2) "admin:access"
  // 3) { module: 'admin', permission: 'view' }
  // 4) { module: 'admin', action: 'view' }
  // 5) { name: 'ADMIN_PANEL_ACCESS' }
  if (typeof raw === 'string') {
    if (raw.includes(':')) {
      const [module, permission] = raw.split(':').map(s => s.trim().toLowerCase());
      return [{ module, permission }];
    }
    return [{ module: '*', permission: raw.trim().toLowerCase() }];
  }

  const module =
    (raw as any).module?.toString().trim().toLowerCase() ||
    (raw as any).modulo?.toString().trim().toLowerCase() ||
    '*';

  const permission =
    (raw as any).permission?.toString().trim().toLowerCase() ||
    (raw as any).action?.toString().trim().toLowerCase() ||
    (raw as any).name?.toString().trim().toLowerCase() ||
    'access';

  return [{ module, permission }];
}

export function usePermissions() {
  // Lê o usuário armazenado (definido após login no teu front)
  const user = useMemo(() => readStoredUser(), []);

  // role do usuário (super admin)
  const role = user?.role?.toString().trim().toLowerCase();

  const normalizedPermissions = useMemo<NormalizedPerm[]>(() => {
    const raw = (user as any)?.permissions as RawPerm[] | undefined;
    if (!raw || !Array.isArray(raw)) return [];
    const list: NormalizedPerm[] = [];
    for (const item of raw) list.push(...normalize(item));
    return list;
  }, [user]);

  function hasPermission(module: string, permission: string) {
    // 1) super admin passa em tudo
    if (role === 'admin') return true;

    // 2) normalização de inputs
    const mod = (module || '').toString().trim().toLowerCase();
    const perm = (permission || '').toString().trim().toLowerCase();

    // 3) match direto module/permission
    const matchPair = normalizedPermissions.some(
      p => (p.module === mod || p.module === '*') && (p.permission === perm || p.permission === '*')
    );
    if (matchPair) return true;

    // 4) fallback: macro de admin para módulo admin
    const hasAdminMacro = normalizedPermissions.some(
      p =>
        p.permission === 'admin_panel_access' ||
        p.permission === 'adminpanelaccess' ||
        p.permission === 'admin_access'
    );
    if (hasAdminMacro && mod === 'admin') return true;

    return false;
  }

  function getModulePermissions(module: string) {
    const mod = (module || '').toString().trim().toLowerCase();
    const perms = new Set<string>();

    if (role === 'admin') {
      return new Set<string>(['view', 'create', 'edit', 'delete', 'access', '*']);
    }

    for (const p of normalizedPermissions) {
      if (p.module === mod || p.module === '*') perms.add(p.permission);
    }

    const hasAdminMacro = normalizedPermissions.some(
      p =>
        p.permission === 'admin_panel_access' ||
        p.permission === 'adminpanelaccess' ||
        p.permission === 'admin_access'
    );
    if (hasAdminMacro && mod === 'admin') perms.add('access');

    return perms;
  }

  // Sem depender de carregamento externo agora
  const loading = false;

  return { hasPermission, getModulePermissions, loading };
}

// Hook auxiliar exportado no teu arquivo original:
export function useModulePermissions(module: string) {
  const { hasPermission, getModulePermissions } = usePermissions();
  return {
    canView: hasPermission(module, 'view'),
    canCreate: hasPermission(module, 'create'),
    canEdit: hasPermission(module, 'edit'),
    canDelete: hasPermission(module, 'delete'),
    permissions: getModulePermissions(module),
  };
}
