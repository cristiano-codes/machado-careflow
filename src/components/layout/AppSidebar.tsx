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

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Pré-Agendamento", url: "/pre-agendamento", icon: MessageSquare },
  { title: "Agenda", url: "/agenda", icon: Calendar },
  { title: "Pré-Cadastro", url: "/pre-cadastro", icon: UserPlus },
  { title: "Entrevistas", url: "/entrevistas", icon: Users },
  { title: "Avaliações", url: "/avaliacoes", icon: ClipboardList },
  { title: "Análise de Vagas", url: "/analise-vagas", icon: UserCheck },
];

const managementItems = [
  { title: "Gerenciar Usuários", url: "/gerenciar-usuarios", icon: Users },
  { title: "Gerenciar Permissões", url: "/gerenciar-permissoes", icon: Shield },
  { title: "Frequência", url: "/frequencia", icon: BookOpen },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Profissionais", url: "/profissionais", icon: Building },
  { title: "Relatórios", url: "/relatorios", icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";

  const isActive = (path: string) => currentPath === path;
  const isMainExpanded = mainItems.some((item) => isActive(item.url));
  const isManagementExpanded = managementItems.some((item) => isActive(item.url));

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
        {/* Main Modules */}
        <SidebarGroup className="px-0">
          <SidebarGroupLabel className="px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {!isCollapsed && "Módulos Principais"}
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <SidebarMenu>
              {mainItems.map((item) => (
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

        {/* Management Modules */}
        <SidebarGroup className="px-0">
          <SidebarGroupLabel className="px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {!isCollapsed && "Gestão"}
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <SidebarMenu>
              {managementItems.map((item) => (
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

        {/* Settings */}
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
                {!isCollapsed && <span className="text-sm">Configurações</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
