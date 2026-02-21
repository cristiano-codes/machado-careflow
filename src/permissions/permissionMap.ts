import type { ComponentType } from "react";
import {
  BarChart3,
  BookOpen,
  Building,
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
  MessageSquare,
  Settings,
  Shield,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

export type SidebarItemConfig = {
  id: string;
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  requiredAnyScopes: string[];
};

export type RoutePermissionConfig = {
  path: string;
  requiredAnyScopes: string[];
  match?: "exact" | "prefix";
};

export const STANDARD_PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "access"] as const;
export const ADMIN_MACRO_PERMISSION_NAMES = new Set([
  "admin_panel_access",
  "adminpanelaccess",
  "admin_access",
]);

const STANDARD_PERMISSION_ACTION_SET = new Set<string>(STANDARD_PERMISSION_ACTIONS);

const MODULE_ALIASES: Record<string, string[]> = {
  configuracoes: ["configuracoes", "settings"],
  settings: ["settings", "configuracoes"],
  usuarios: ["usuarios", "users"],
  users: ["users", "usuarios"],
  pre_agendamento: ["pre_agendamento", "preagendamento"],
  pre_cadastro: ["pre_cadastro", "precadastro"],
  avaliacoes: ["avaliacoes", "avaliacao"],
  analise_vagas: ["analise_vagas", "vagas"],
  vagas: ["vagas", "analise_vagas"],
};

function normalizePath(pathname: string) {
  const normalized = (pathname || "").trim();
  if (!normalized || normalized === "/") return "/";
  return normalized.replace(/\/+$/, "");
}

export function normalizePermissionToken(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

export function parseScope(scope: string): { module: string; permission: string } | null {
  const normalized = normalizePermissionToken(scope || "");
  if (!normalized.includes(":")) return null;

  const [module, permission, extra] = normalized.split(":").map((part) => part.trim());
  if (!module || !permission || extra) return null;
  return { module, permission };
}

export function buildScope(module: string, permission: string) {
  return `${normalizePermissionToken(module)}:${normalizePermissionToken(permission)}`;
}

export function resolveModuleAliases(moduleName: string): string[] {
  const normalized = normalizePermissionToken(moduleName || "");
  return MODULE_ALIASES[normalized] ?? [normalized];
}

export function isStandardPermissionAction(permission: string) {
  return STANDARD_PERMISSION_ACTION_SET.has(normalizePermissionToken(permission || ""));
}

export const MAIN_MENU_ITEMS: SidebarItemConfig[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    url: "/dashboard",
    icon: BarChart3,
    requiredAnyScopes: ["dashboard:view"],
  },
  {
    id: "pre_agendamento",
    title: "Pre-Agendamento",
    url: "/pre-agendamento",
    icon: MessageSquare,
    requiredAnyScopes: ["pre_agendamento:view"],
  },
  {
    id: "agenda",
    title: "Agenda",
    url: "/agenda",
    icon: Calendar,
    requiredAnyScopes: ["agenda:view", "profissionais:view"],
  },
  {
    id: "pre_cadastro",
    title: "Pre-Cadastro",
    url: "/pre-cadastro",
    icon: UserPlus,
    requiredAnyScopes: ["pre_cadastro:view"],
  },
  {
    id: "entrevistas",
    title: "Entrevistas",
    url: "/entrevistas",
    icon: Users,
    requiredAnyScopes: ["entrevistas:view"],
  },
  {
    id: "avaliacoes",
    title: "Avaliacoes",
    url: "/avaliacoes",
    icon: ClipboardList,
    requiredAnyScopes: ["avaliacoes:view"],
  },
  {
    id: "analise_vagas",
    title: "Analise de Vagas",
    url: "/analise-vagas",
    icon: UserCheck,
    requiredAnyScopes: ["analise_vagas:view", "vagas:view"],
  },
];

export const MANAGEMENT_MENU_ITEMS: SidebarItemConfig[] = [
  {
    id: "gerenciar_usuarios",
    title: "Gerenciar Usuarios",
    url: "/gerenciar-usuarios",
    icon: Users,
    requiredAnyScopes: ["usuarios:view", "users:view", "admin:access"],
  },
  {
    id: "gerenciar_permissoes",
    title: "Gerenciar Permissoes",
    url: "/gerenciar-permissoes",
    icon: Shield,
    requiredAnyScopes: [
      "permissions:view",
      "permissions:edit",
      "permissions:manage",
      "usuarios:view",
      "users:view",
      "admin:access",
    ],
  },
  {
    id: "frequencia",
    title: "Frequencia",
    url: "/frequencia",
    icon: BookOpen,
    requiredAnyScopes: ["frequencia:view"],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    url: "/financeiro",
    icon: DollarSign,
    requiredAnyScopes: ["financeiro:view"],
  },
  {
    id: "profissionais",
    title: "Profissionais",
    url: "/profissionais",
    icon: Building,
    requiredAnyScopes: ["profissionais:view"],
  },
  {
    id: "relatorios",
    title: "Relatorios",
    url: "/relatorios",
    icon: FileText,
    requiredAnyScopes: ["relatorios:view"],
  },
];

export const SETTINGS_MENU_ITEM: SidebarItemConfig = {
  id: "configuracoes",
  title: "Configuracoes",
  url: "/configuracoes",
  icon: Settings,
  requiredAnyScopes: ["configuracoes:view", "settings:view", "admin:access"],
};

export const ALLOW_MANAGEMENT_WITHOUT_MAIN_MODULE = false;

export const ROUTE_PERMISSION_MAP: RoutePermissionConfig[] = [
  { path: "/dashboard", requiredAnyScopes: ["dashboard:view"] },
  { path: "/agenda", requiredAnyScopes: ["agenda:view", "profissionais:view"] },
  { path: "/pre-agendamento", requiredAnyScopes: ["pre_agendamento:view"] },
  { path: "/pre-cadastro", requiredAnyScopes: ["pre_cadastro:view"] },
  { path: "/entrevistas", requiredAnyScopes: ["entrevistas:view"] },
  { path: "/avaliacoes", requiredAnyScopes: ["avaliacoes:view"] },
  { path: "/analise-vagas", requiredAnyScopes: ["analise_vagas:view", "vagas:view"] },
  { path: "/profissionais", requiredAnyScopes: ["profissionais:view"] },
  { path: "/profissionais/novo", requiredAnyScopes: ["profissionais:create"] },
  { path: "/gerenciar-usuarios", requiredAnyScopes: ["usuarios:view", "users:view", "admin:access"] },
  {
    path: "/gerenciar-permissoes",
    requiredAnyScopes: [
      "permissions:view",
      "permissions:edit",
      "permissions:manage",
      "usuarios:view",
      "users:view",
      "admin:access",
    ],
  },
  {
    path: "/configuracoes",
    requiredAnyScopes: ["configuracoes:view", "settings:view", "admin:access"],
  },
];

export function getRouteRequiredScopes(pathname: string): string[] {
  const normalizedPath = normalizePath(pathname);
  if (normalizedPath === "/") return [];

  for (const item of ROUTE_PERMISSION_MAP) {
    const matchMode = item.match || "exact";
    const target = normalizePath(item.path);

    if (matchMode === "exact" && target === normalizedPath) {
      return item.requiredAnyScopes;
    }

    if (matchMode === "prefix" && normalizedPath.startsWith(`${target}/`)) {
      return item.requiredAnyScopes;
    }
  }

  return [];
}

export function buildSidebarVisibility(hasAnyScope: (scopes: string[]) => boolean) {
  const visibleMainItems = MAIN_MENU_ITEMS.filter((item) => hasAnyScope(item.requiredAnyScopes));
  const hasVisibleMainModules = visibleMainItems.length > 0;

  const shouldShowManagement = ALLOW_MANAGEMENT_WITHOUT_MAIN_MODULE || hasVisibleMainModules;
  const visibleManagementItems = shouldShowManagement
    ? MANAGEMENT_MENU_ITEMS.filter((item) => hasAnyScope(item.requiredAnyScopes))
    : [];

  const canViewSettings = hasAnyScope(SETTINGS_MENU_ITEM.requiredAnyScopes);

  return {
    hasVisibleMainModules,
    visibleMainItems,
    visibleManagementItems,
    canViewSettings,
  };
}
