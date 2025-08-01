import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Permission {
  id: string;
  name: string;
  display_name: string;
  description?: string;
}

export interface Module {
  id: string;
  name: string;
  display_name: string;
  description?: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  module_id: string;
  permission_id: string;
  module: Module;
  permission: Permission;
}

export function usePermissions() {
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Carregar permissões do usuário atual
  const loadUserPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_permissions')
        .select(`
          *,
          module:modules(*),
          permission:permissions(*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      setUserPermissions(data || []);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
    }
  };

  // Carregar todos os módulos
  const loadModules = async () => {
    try {
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .order('display_name');

      if (error) throw error;
      setAllModules(data || []);
    } catch (error) {
      console.error('Erro ao carregar módulos:', error);
    }
  };

  // Carregar todas as permissões
  const loadPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('name');

      if (error) throw error;
      setAllPermissions(data || []);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
    }
  };

  // Verificar se usuário tem permissão específica
  const hasPermission = (moduleName: string, permissionName: string): boolean => {
    return userPermissions.some(up => 
      up.module.name === moduleName && up.permission.name === permissionName
    );
  };

  // Obter permissões de um módulo
  const getModulePermissions = (moduleName: string): string[] => {
    return userPermissions
      .filter(up => up.module.name === moduleName)
      .map(up => up.permission.name);
  };

  // Conceder permissão a um usuário
  const grantPermission = async (userId: string, moduleId: string, permissionId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('user_permissions')
        .insert({
          user_id: userId,
          module_id: moduleId,
          permission_id: permissionId,
          granted_by: user.id
        });

      if (error) throw error;

      toast({
        title: "Permissão concedida",
        description: "Permissão adicionada com sucesso",
      });

      return true;
    } catch (error) {
      console.error('Erro ao conceder permissão:', error);
      toast({
        title: "Erro",
        description: "Erro ao conceder permissão",
        variant: "destructive"
      });
      return false;
    }
  };

  // Revogar permissão de um usuário
  const revokePermission = async (userId: string, moduleId: string, permissionId: string) => {
    try {
      const { error } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)
        .eq('module_id', moduleId)
        .eq('permission_id', permissionId);

      if (error) throw error;

      toast({
        title: "Permissão revogada",
        description: "Permissão removida com sucesso",
      });

      return true;
    } catch (error) {
      console.error('Erro ao revogar permissão:', error);
      toast({
        title: "Erro",
        description: "Erro ao revogar permissão",
        variant: "destructive"
      });
      return false;
    }
  };

  // Carregar permissões de um usuário específico (para admins)
  const loadUserPermissionsByUserId = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_permissions')
        .select(`
          *,
          module:modules(*),
          permission:permissions(*)
        `)
        .eq('user_id', userId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erro ao carregar permissões do usuário:', error);
      return [];
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        loadUserPermissions(),
        loadModules(),
        loadPermissions()
      ]);
      setLoading(false);
    };

    loadData();

    // Configurar real-time updates para permissões do usuário
    const channel = supabase
      .channel('user-permissions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_permissions'
        },
        () => {
          loadUserPermissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    userPermissions,
    allModules,
    allPermissions,
    loading,
    hasPermission,
    getModulePermissions,
    grantPermission,
    revokePermission,
    loadUserPermissionsByUserId,
    refreshPermissions: loadUserPermissions
  };
}