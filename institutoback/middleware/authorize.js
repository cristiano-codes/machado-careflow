const ROLE_ALIASES = {
  ADM: ['adm', 'admin', 'administrador', 'coordenador geral', 'gestao', 'gestão', 'gestor'],
  USUARIO: ['usuario', 'usuário', 'user'],
  CONSULTA: ['consulta'],
};

const ROLE_POLICIES = {
  ADM: { '*': ['*'] },
  USUARIO: { profissionais: ['view'], configuracoes: ['view'] },
  CONSULTA: { profissionais: ['view'], configuracoes: ['view'] },
};

function normalizeRole(role) {
  const raw = (role || '').toString().trim().toLowerCase();
  if (!raw) return '';

  for (const [canonical, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.includes(raw)) {
      return canonical;
    }
  }

  return raw.toUpperCase();
}

function normalizePermissionEntries(rawPermissions) {
  if (!Array.isArray(rawPermissions)) return [];

  return rawPermissions.flatMap((entry) => {
    if (typeof entry === 'string') {
      const raw = entry.trim().toLowerCase();
      if (!raw.includes(':')) return [];

      const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
      if (parts.length !== 2) return [];

      return [{ module: parts[0], action: parts[1] }];
    }

    if (entry && typeof entry === 'object') {
      const module = (entry.module || '').toString().trim().toLowerCase();
      const action =
        (entry.permission || entry.action || '').toString().trim().toLowerCase();

      if (!module || !action) return [];
      return [{ module, action }];
    }

    return [];
  });
}

function roleAllows(role, moduleName, action) {
  const policy = ROLE_POLICIES[role];
  if (!policy) return false;

  const wildcardActions = policy['*'] || [];
  if (wildcardActions.includes('*') || wildcardActions.includes(action)) {
    return true;
  }

  const moduleActions = policy[moduleName] || [];
  return moduleActions.includes('*') || moduleActions.includes(action);
}

function permissionAllows(scopes, moduleName, action) {
  return scopes.some((scope) => {
    const matchesModule = scope.module === moduleName || scope.module === '*';
    const matchesAction = scope.action === action || scope.action === '*';
    return matchesModule && matchesAction;
  });
}

function authorize(moduleName, action) {
  const normalizedModule = (moduleName || '').toString().trim().toLowerCase();
  const normalizedAction = (action || '').toString().trim().toLowerCase();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Não autenticado' });
    }

    const role = normalizeRole(req.user.role);
    if (roleAllows(role, normalizedModule, normalizedAction)) {
      return next();
    }

    const scopes = normalizePermissionEntries(req.user.permissions);
    if (permissionAllows(scopes, normalizedModule, normalizedAction)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Acesso negado para esta operação',
    });
  };
}

module.exports = {
  authorize,
  normalizeRole,
  normalizePermissionEntries,
};
