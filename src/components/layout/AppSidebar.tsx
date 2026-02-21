import type { ComponentType } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Calendar,
  Users,
  UserPlus,
  MessageSquare,
  ClipboardList,
  BarChart3,
  FileText,
  DollarSign,
  Settings,
  Building,
  UserCheck,
  BookOpen,
  User,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePermissions } from "@/hooks/usePermissions";

type SidebarItem = {
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  requiredAnyScopes: string[];
};

const MAIN_ITEMS: SidebarItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3, requiredAnyScopes: ["dashboard:view"] },
  {
    title: "Pre-Agendamento",
    url: "/pre-agendamento",
    icon: MessageSquare,
    requiredAnyScopes: ["pre_agendamento:view"],
  },
  {
    title: "Agenda",
    url: "/agenda",
    icon: Calendar,
    requiredAnyScopes: ["agenda:view", "profissionais:view"],
  },
  {
    title: "Pre-Cadastro",
    url: "/pre-cadastro",
    icon: UserPlus,
    requiredAnyScopes: ["pre_cadastro:view"],
  },
  { title: "Entrevistas", url: "/entrevistas", icon: Users, requiredAnyScopes: ["entrevistas:view"] },
  { title: "Avaliacoes", url: "/avaliacoes", icon: ClipboardList, requiredAnyScopes: ["avaliacoes:view"] },
  {
    title: "Analise de Vagas",
    url: "/analise-vagas",
    icon: UserCheck,
    requiredAnyScopes: ["analise_vagas:view", "vagas:view"],
  },
];

const MANAGEMENT_ITEMS: SidebarItem[] = [
  {
    title: "Gerenciar Usuarios",
    url: "/gerenciar-usuarios",
    icon: Users,
    requiredAnyScopes: ["usuarios:view", "users:view", "admin:access"],
  },
  {
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
  { title: "Frequencia", url: "/frequencia", icon: BookOpen, requiredAnyScopes: ["frequencia:view"] },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign, requiredAnyScopes: ["financeiro:view"] },
  {
    title: "Profissionais",
    url: "/profissionais",
    icon: Building,
    requiredAnyScopes: ["profissionais:view"],
  },
  { title: "Relatorios", url: "/relatorios", icon: FileText, requiredAnyScopes: ["relatorios:view"] },
];

const SETTINGS_ITEM: SidebarItem = {
  title: "Configuracoes",
  url: "/configuracoes",
  icon: Settings,
  requiredAnyScopes: ["configuracoes:view", "settings:view", "admin:access"],
};

const MODULE_VIEW_SCOPES = [
  "dashboard:view",
  "pre_agendamento:view",
  "agenda:view",
  "pre_cadastro:view",
  "entrevistas:view",
  "avaliacoes:view",
  "analise_vagas:view",
  "vagas:view",
  "usuarios:view",
  "users:view",
  "permissions:view",
  "profissionais:view",
  "financeiro:view",
  "frequencia:view",
  "relatorios:view",
  "configuracoes:view",
  "settings:view",
  "admin:access",
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { hasAnyScope } = usePermissions();
  const location = useLocation();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";

  const hasAnyModuleView = hasAnyScope(MODULE_VIEW_SCOPES);
  const visibleMainItems = hasAnyModuleView
    ? MAIN_ITEMS.filter((item) => hasAnyScope(item.requiredAnyScopes))
    : [];
  const visibleManagementItems = hasAnyModuleView
    ? MANAGEMENT_ITEMS.filter((item) => hasAnyScope(item.requiredAnyScopes))
    : [];
  const canSeeSettings = hasAnyModuleView && hasAnyScope(SETTINGS_ITEM.requiredAnyScopes);

  const getNavClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "bg-primary text-primary-foreground font-medium"
      : "hover:bg-accent/10 text-foreground/80 hover:text-foreground";

  return (
    <Sidebar
      className="pt-16 transition-all duration-300 border-r border-border bg-card"
      collapsible="icon"
    >
      <SidebarContent className="p-0">
        {visibleMainItems.length > 0 && (
          <SidebarGroup className="px-0">
            <SidebarGroupLabel className="px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {!isCollapsed && "Modulos Principais"}
            </SidebarGroupLabel>
            <SidebarGroupContent className="px-2">
              <SidebarMenu>
                {visibleMainItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="h-10">
                      <NavLink
                        to={item.url}
                        end
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ${getNavClass(
                            { isActive }
                          )}`
                        }
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {!isCollapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleManagementItems.length > 0 && (
          <SidebarGroup className="px-0">
            <SidebarGroupLabel className="px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {!isCollapsed && "Gestao"}
            </SidebarGroupLabel>
            <SidebarGroupContent className="px-2">
              <SidebarMenu>
                {visibleManagementItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="h-10">
                      <NavLink
                        to={item.url}
                        end
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ${getNavClass(
                            { isActive }
                          )}`
                        }
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {!isCollapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <div className="mt-auto p-2 space-y-1">
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-10">
              <NavLink
                to="/perfil"
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ${getNavClass(
                    { isActive }
                  )}`
                }
              >
                <User className="w-4 h-4 flex-shrink-0" />
                {!isCollapsed && <span className="text-sm">Meu Perfil</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {canSeeSettings && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10">
                <NavLink
                  to="/configuracoes"
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ${getNavClass(
                      { isActive }
                    )}`
                  }
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && <span className="text-sm">Configuracoes</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
