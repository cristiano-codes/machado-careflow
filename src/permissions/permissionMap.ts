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

export const AGENDA_READ_PRIMARY_SCOPES: string[] = ["agenda:view"];
export const AGENDA_LEGACY_COMPAT_DEPRECATION_PHASE = "phase5_controlled_removal";
export const AGENDA_LEGACY_COMPAT_ENABLED = true;
// Compatibilidade temporaria da Fase 5: manter profissionais:view somente
// para leitura da agenda ate a migracao completa dos perfis para agenda:view.
export const AGENDA_READ_LEGACY_COMPAT_SCOPES: string[] = ["profissionais:view"];
export function buildAgendaReadRequiredScopes(includeLegacy = AGENDA_LEGACY_COMPAT_ENABLED): string[] {
  return includeLegacy
    ? [...AGENDA_READ_PRIMARY_SCOPES, ...AGENDA_READ_LEGACY_COMPAT_SCOPES]
    : [...AGENDA_READ_PRIMARY_SCOPES];
}
export const AGENDA_READ_REQUIRED_SCOPES: string[] = buildAgendaReadRequiredScopes();
export const LEGACY_AGENDA_ROUTE_REQUIRED_SCOPES: string[] = [...AGENDA_READ_REQUIRED_SCOPES];
export const UNIT_OPERATIONS_PRIMARY_SCOPES: string[] = [
  "salas:view",
  "atividades_unidade:view",
  "turmas:view",
  "grade:view",
  "matriculas:view",
];
export const UNIT_OPERATIONS_REQUIRED_SCOPES: string[] = [...UNIT_OPERATIONS_PRIMARY_SCOPES];
export const UNIT_OPERATIONS_AGENDA_REQUIRED_SCOPES: string[] = ["grade:view"];
export const OFFICIAL_AGENDA_ROUTE_REQUIRED_SCOPES: string[] = [
  ...UNIT_OPERATIONS_AGENDA_REQUIRED_SCOPES,
];
export const UNIT_OPERATIONS_ROOMS_REQUIRED_SCOPES: string[] = ["salas:view"];
export const UNIT_OPERATIONS_ACTIVITIES_REQUIRED_SCOPES: string[] = ["atividades_unidade:view"];
export const UNIT_OPERATIONS_CLASSES_REQUIRED_SCOPES: string[] = ["turmas:view"];
export const UNIT_OPERATIONS_GRADE_REQUIRED_SCOPES: string[] = ["grade:view"];
export const UNIT_OPERATIONS_ENROLLMENTS_REQUIRED_SCOPES: string[] = ["matriculas:view"];
export const UNIT_OPERATIONS_ROOMS_WRITE_REQUIRED_SCOPES: string[] = [
  "salas:create",
  "salas:edit",
  "salas:status",
];
export const UNIT_OPERATIONS_ACTIVITIES_WRITE_REQUIRED_SCOPES: string[] = [
  "atividades_unidade:create",
  "atividades_unidade:edit",
  "atividades_unidade:status",
];
export const UNIT_OPERATIONS_CLASSES_WRITE_REQUIRED_SCOPES: string[] = [
  "turmas:create",
  "turmas:edit",
  "turmas:status",
];
export const UNIT_OPERATIONS_GRADE_WRITE_REQUIRED_SCOPES: string[] = [
  "grade:create",
  "grade:edit",
  "grade:allocate",
  "grade:status",
];
export const UNIT_OPERATIONS_ENROLLMENTS_WRITE_REQUIRED_SCOPES: string[] = [
  "matriculas:create",
  "matriculas:edit",
  "matriculas:status",
  "matriculas:enroll",
];

export const UNIT_OPERATIONS_LANDING_PRIORITY: Array<{
  path: string;
  requiredAnyScopes: string[];
}> = [
  { path: "/operacao-unidade/grade", requiredAnyScopes: UNIT_OPERATIONS_GRADE_REQUIRED_SCOPES },
  { path: "/operacao-unidade/salas", requiredAnyScopes: UNIT_OPERATIONS_ROOMS_REQUIRED_SCOPES },
  { path: "/operacao-unidade/atividades", requiredAnyScopes: UNIT_OPERATIONS_ACTIVITIES_REQUIRED_SCOPES },
  { path: "/operacao-unidade/turmas", requiredAnyScopes: UNIT_OPERATIONS_CLASSES_REQUIRED_SCOPES },
  { path: "/operacao-unidade/matriculas", requiredAnyScopes: UNIT_OPERATIONS_ENROLLMENTS_REQUIRED_SCOPES },
];

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
  fila_espera: ["fila_espera", "filaespera", "pre_agendamento", "preagendamento"],
  pre_agendamento: ["pre_agendamento", "preagendamento", "fila_espera", "filaespera"],
  pre_cadastro: ["pre_cadastro", "precadastro"],
  entrevistas: [
    "entrevistas",
    "entrevista_social",
    "entrevista_sociais",
    "social_interviews",
    "social_interview",
  ],
  entrevista_social: [
    "entrevista_social",
    "entrevistas",
    "social_interviews",
    "social_interview",
  ],
  social_interviews: [
    "social_interviews",
    "social_interview",
    "entrevistas",
    "entrevista_social",
  ],
  triagem_social: ["triagem_social", "triagem", "social_triage"],
  social_triage: ["social_triage", "triagem_social", "triagem"],
  avaliacoes: ["avaliacoes", "avaliacao", "evaluations"],
  avaliacao: ["avaliacao", "avaliacoes", "evaluations"],
  evaluations: ["evaluations", "avaliacoes", "avaliacao"],
  analise_vagas: ["analise_vagas", "vagas"],
  vagas: ["vagas", "analise_vagas"],
  pias: ["pias", "pia"],
  pia: ["pia", "pias"],
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
    id: "fila_espera",
    title: "Fila de Espera",
    url: "/fila-de-espera",
    icon: MessageSquare,
    requiredAnyScopes: ["fila_espera:view", "pre_agendamento:view"],
  },
  {
    id: "triagem_social",
    title: "Triagem Social",
    url: "/triagem-social",
    icon: UserCheck,
    requiredAnyScopes: ["triagem_social:view"],
  },
  {
    id: "pre_cadastro",
    title: "Pre-Cadastro",
    url: "/pre-cadastro",
    icon: UserPlus,
    requiredAnyScopes: ["pre_cadastro:view"],
  },
  {
    id: "agenda",
    title: "Agenda",
    url: "/agenda",
    icon: Calendar,
    requiredAnyScopes: OFFICIAL_AGENDA_ROUTE_REQUIRED_SCOPES,
  },
  {
    id: "operacao_unidade",
    title: "Gestao da Unidade",
    url: "/operacao-unidade",
    icon: BookOpen,
    requiredAnyScopes: UNIT_OPERATIONS_REQUIRED_SCOPES,
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
  { path: "/agenda", requiredAnyScopes: OFFICIAL_AGENDA_ROUTE_REQUIRED_SCOPES },
  { path: "/agenda-legado", requiredAnyScopes: LEGACY_AGENDA_ROUTE_REQUIRED_SCOPES },
  { path: "/agenda-teste", requiredAnyScopes: AGENDA_READ_REQUIRED_SCOPES },
  { path: "/salas-teste", requiredAnyScopes: AGENDA_READ_REQUIRED_SCOPES },
  { path: "/atividades-teste", requiredAnyScopes: AGENDA_READ_REQUIRED_SCOPES },
  { path: "/turmas-teste", requiredAnyScopes: AGENDA_READ_REQUIRED_SCOPES },
  { path: "/grade-teste", requiredAnyScopes: AGENDA_READ_REQUIRED_SCOPES },
  { path: "/alocacoes-teste", requiredAnyScopes: AGENDA_READ_REQUIRED_SCOPES },
  { path: "/matriculas-teste", requiredAnyScopes: AGENDA_READ_REQUIRED_SCOPES },
  { path: "/operacao-unidade/agenda", requiredAnyScopes: UNIT_OPERATIONS_AGENDA_REQUIRED_SCOPES },
  { path: "/operacao-unidade/salas", requiredAnyScopes: UNIT_OPERATIONS_ROOMS_REQUIRED_SCOPES },
  { path: "/operacao-unidade/atividades", requiredAnyScopes: UNIT_OPERATIONS_ACTIVITIES_REQUIRED_SCOPES },
  { path: "/operacao-unidade/turmas", requiredAnyScopes: UNIT_OPERATIONS_CLASSES_REQUIRED_SCOPES },
  { path: "/operacao-unidade/grade", requiredAnyScopes: UNIT_OPERATIONS_GRADE_REQUIRED_SCOPES },
  { path: "/operacao-unidade/matriculas", requiredAnyScopes: UNIT_OPERATIONS_ENROLLMENTS_REQUIRED_SCOPES },
  { path: "/operacao-unidade", requiredAnyScopes: UNIT_OPERATIONS_REQUIRED_SCOPES, match: "prefix" },
  { path: "/fila-de-espera", requiredAnyScopes: ["fila_espera:view", "pre_agendamento:view"] },
  { path: "/pre-agendamento", requiredAnyScopes: ["fila_espera:view", "pre_agendamento:view"] },
  { path: "/triagem-social", requiredAnyScopes: ["triagem_social:view"] },
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
