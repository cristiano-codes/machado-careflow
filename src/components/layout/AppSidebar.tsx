import { NavLink } from "react-router-dom";
import { User } from "lucide-react";
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
import {
  SETTINGS_MENU_ITEM,
  buildSidebarVisibility,
} from "@/permissions/permissionMap";

export function AppSidebar() {
  const { state } = useSidebar();
  const { hasAnyScope } = usePermissions();
  const isCollapsed = state === "collapsed";

  const { visibleMainItems, visibleManagementItems, canViewSettings } =
    buildSidebarVisibility(hasAnyScope);

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
                  <SidebarMenuItem key={item.id}>
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
                  <SidebarMenuItem key={item.id}>
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

          {canViewSettings && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10">
                <NavLink
                  to={SETTINGS_MENU_ITEM.url}
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ${getNavClass(
                      { isActive }
                    )}`
                  }
                >
                  <SETTINGS_MENU_ITEM.icon className="w-4 h-4 flex-shrink-0" />
                  {!isCollapsed && <span className="text-sm">{SETTINGS_MENU_ITEM.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
