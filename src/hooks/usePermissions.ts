import { useMemo } from 'react';

type RawPerm =
  | string
  | { module?: string; permission?: string }
  | { name?: string; module?: string; action?: string };

type NormalizedPerm = { module: string; permission: string };

type StoredUser = {
  role?: string;
  permissions?: RawPerm[];
};

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

function readStoredUser(): StoredUser | null {
  const raw = sessionStorage.getItem('user') ?? localStorage.getItem('user');
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

function normalize(raw: RawPerm): NormalizedPerm[] {
  if (typeof raw === 'string') {
    const value = normalizeText(raw);
    if (!value.includes(':')) return [];

    const parts = value.split(':').map((s) => s.trim()).filter(Boolean);
    if (parts.length !== 2) return [];

    const [module, permission] = parts;
    return [{ module, permission }];
  }

  const entry = raw as Record<string, unknown>;
  const module = normalizeText(
    (typeof entry.module === 'string' ? entry.module : '') ||
      (typeof entry.modulo === 'string' ? entry.modulo : '')
  );

  const permission = normalizeText(
    (typeof entry.permission === 'string' ? entry.permission : '') ||
      (typeof entry.action === 'string' ? entry.action : '') ||
      (typeof entry.name === 'string' ? entry.name : '')
  );

  if (!module || !permission) return [];
  return [{ module, permission }];
}

function resolveModuleAliases(moduleName: string): string[] {
  const mod = normalizeText(moduleName);
  const aliases: Record<string, string[]> = {
    configuracoes: ['configuracoes', 'settings'],
    settings: ['settings', 'configuracoes'],
    usuarios: ['usuarios', 'users'],
    users: ['users', 'usuarios'],
    agenda: ['agenda', 'agendas', 'profissionais'],
    pre_agendamento: ['pre_agendamento', 'preagendamento'],
    pre_cadastro: ['pre_cadastro', 'precadastro'],
    avaliacoes: ['avaliacoes', 'avaliacao'],
    analise_vagas: ['analise_vagas', 'vagas'],
    vagas: ['vagas', 'analise_vagas'],
  };

  return aliases[mod] ?? [mod];
}

function normalizeScope(scope: string): string | null {
  const value = normalizeText(scope || '');
  if (!value.includes(':')) return null;
  const [module, permission, extra] = value.split(':').map((part) => part.trim());
  if (!module || !permission || extra) return null;
  return `${module}:${permission}`;
}

export function usePermissions() {
  const user = useMemo(() => readStoredUser(), []);
  const role = normalizeText(user?.role?.toString() || '');

  const normalizedPermissions = useMemo<NormalizedPerm[]>(() => {
    const raw = user?.permissions;
    if (!raw || !Array.isArray(raw)) return [];

    const list: NormalizedPerm[] = [];
    for (const item of raw) list.push(...normalize(item));
    return list;
  }, [user]);

  function hasPermission(module: string, permission: string) {
    const adminRoles = ['admin', 'adm', 'administrador', 'coordenador_geral'];
    const readonlyRoles = ['usuario', 'consulta'];

    if (adminRoles.includes(role)) return true;

    const mod = normalizeText(module || '');
    const perm = normalizeText(permission || '');
    const modulesToMatch = resolveModuleAliases(mod);

    if (
      readonlyRoles.includes(role) &&
      perm === 'view' &&
      (modulesToMatch.includes('profissionais') || modulesToMatch.includes('configuracoes'))
    ) {
      return true;
    }

    const matchPair = normalizedPermissions.some((p) =>
      modulesToMatch.some(
        (targetModule) =>
          (p.module === targetModule || p.module === '*') &&
          (p.permission === perm || p.permission === '*')
      )
    );
    if (matchPair) return true;

    const hasAdminMacro = normalizedPermissions.some(
      (p) =>
        p.permission === 'admin_panel_access' ||
        p.permission === 'adminpanelaccess' ||
        p.permission === 'admin_access'
    );
    if (hasAdminMacro) return true;

    return false;
  }

  function getModulePermissions(module: string) {
    const mod = normalizeText(module || '');
    const modulesToMatch = resolveModuleAliases(mod);
    const perms = new Set<string>();
    const adminRoles = ['admin', 'adm', 'administrador', 'coordenador_geral'];
    const readonlyRoles = ['usuario', 'consulta'];

    if (adminRoles.includes(role)) {
      return new Set<string>(['view', 'create', 'edit', 'delete', 'access', '*']);
    }

    if (
      readonlyRoles.includes(role) &&
      (modulesToMatch.includes('profissionais') || modulesToMatch.includes('configuracoes'))
    ) {
      perms.add('view');
    }

    for (const p of normalizedPermissions) {
      if (modulesToMatch.includes(p.module) || p.module === '*') perms.add(p.permission);
    }

    const hasAdminMacro = normalizedPermissions.some(
      (p) =>
        p.permission === 'admin_panel_access' ||
        p.permission === 'adminpanelaccess' ||
        p.permission === 'admin_access'
    );
    if (hasAdminMacro) {
      perms.add('view');
      perms.add('create');
      perms.add('edit');
      perms.add('delete');
      perms.add('access');
      perms.add('*');
    }

    return perms;
  }

  function hasScope(scope: string) {
    const normalized = normalizeScope(scope);
    if (!normalized) return false;

    const [module, permission] = normalized.split(':');
    return hasPermission(module, permission);
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
    canView: hasPermission(module, 'view'),
    canCreate: hasPermission(module, 'create'),
    canEdit: hasPermission(module, 'edit'),
    canDelete: hasPermission(module, 'delete'),
    permissions: getModulePermissions(module),
  };
}
