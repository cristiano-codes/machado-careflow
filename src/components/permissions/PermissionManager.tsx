import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Shield, Search, Users, Eye, Edit, Plus, Trash2 } from 'lucide-react';
import { usePermissions, UserPermission } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export function PermissionManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedUserPermissions, setSelectedUserPermissions] = useState<UserPermission[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  const {
    allModules,
    allPermissions,
    grantPermission,
    revokePermission,
    loadUserPermissionsByUserId
  } = usePermissions();

  // Carregar usuários
  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, status')
        .eq('status', 'ativo')
        .order('name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar usuários",
        variant: "destructive"
      });
    }
  };

  // Carregar permissões do usuário selecionado
  const loadSelectedUserPermissions = async (userId: string) => {
    setLoading(true);
    try {
      const permissions = await loadUserPermissionsByUserId(userId);
      setSelectedUserPermissions(permissions);
    } catch (error) {
      console.error('Erro ao carregar permissões do usuário:', error);
    } finally {
      setLoading(false);
    }
  };

  // Verificar se usuário tem permissão específica
  const userHasPermission = (moduleId: string, permissionId: string): boolean => {
    return selectedUserPermissions.some(up => 
      up.module_id === moduleId && up.permission_id === permissionId
    );
  };

  // Alternar permissão
  const togglePermission = async (moduleId: string, permissionId: string, hasPermission: boolean) => {
    if (!selectedUser) return;

    let success;
    if (hasPermission) {
      success = await revokePermission(selectedUser, moduleId, permissionId);
    } else {
      success = await grantPermission(selectedUser, moduleId, permissionId);
    }

    if (success) {
      await loadSelectedUserPermissions(selectedUser);
    }
  };

  // Conceder todas as permissões de um módulo
  const grantAllModulePermissions = async (moduleId: string) => {
    if (!selectedUser) return;

    setLoading(true);
    try {
      for (const permission of allPermissions) {
        if (!userHasPermission(moduleId, permission.id)) {
          await grantPermission(selectedUser, moduleId, permission.id);
        }
      }
      await loadSelectedUserPermissions(selectedUser);
      toast({
        title: "Sucesso",
        description: "Todas as permissões do módulo foram concedidas",
      });
    } catch (error) {
      console.error('Erro ao conceder permissões:', error);
    } finally {
      setLoading(false);
    }
  };

  // Revogar todas as permissões de um módulo
  const revokeAllModulePermissions = async (moduleId: string) => {
    if (!selectedUser) return;

    setLoading(true);
    try {
      for (const permission of allPermissions) {
        if (userHasPermission(moduleId, permission.id)) {
          await revokePermission(selectedUser, moduleId, permission.id);
        }
      }
      await loadSelectedUserPermissions(selectedUser);
      toast({
        title: "Sucesso",
        description: "Todas as permissões do módulo foram revogadas",
      });
    } catch (error) {
      console.error('Erro ao revogar permissões:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPermissionIcon = (permissionName: string) => {
    switch (permissionName) {
      case 'view': return <Eye className="w-4 h-4" />;
      case 'create': return <Plus className="w-4 h-4" />;
      case 'edit': return <Edit className="w-4 h-4" />;
      case 'delete': return <Trash2 className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getPermissionColor = (permissionName: string) => {
    switch (permissionName) {
      case 'view': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'create': return 'bg-green-100 text-green-800 border-green-200';
      case 'edit': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'delete': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Filtrar usuários por termo de busca
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      loadSelectedUserPermissions(selectedUser);
    }
  }, [selectedUser]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gerenciar Permissões</h1>
          <p className="text-muted-foreground">
            Configure permissões de acesso dos usuários aos módulos do sistema
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Users className="w-4 h-4 mr-1" />
          {users.length} usuários ativos
        </Badge>
      </div>

      <Tabs defaultValue="permissions" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="permissions" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Configurar Permissões
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Visão Geral
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Selecionar Usuário</CardTitle>
              <CardDescription>
                Escolha um usuário para configurar suas permissões
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar usuário..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="w-80">
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          <span className="text-sm text-muted-foreground">({user.email})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {selectedUser && (
            <Card>
              <CardHeader>
                <CardTitle>Configurar Permissões</CardTitle>
                <CardDescription>
                  Gerencie as permissões de acesso aos módulos do sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Módulo</TableHead>
                      {allPermissions.map((permission) => (
                        <TableHead key={permission.id} className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getPermissionIcon(permission.name)}
                            {permission.display_name}
                          </div>
                        </TableHead>
                      ))}
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allModules.map((module) => (
                      <TableRow key={module.id}>
                        <TableCell className="font-medium">
                          <div>
                            <div className="font-medium">{module.display_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {module.description}
                            </div>
                          </div>
                        </TableCell>
                        {allPermissions.map((permission) => {
                          const hasPermission = userHasPermission(module.id, permission.id);
                          return (
                            <TableCell key={permission.id} className="text-center">
                              <Checkbox
                                checked={hasPermission}
                                onCheckedChange={() =>
                                  togglePermission(module.id, permission.id, hasPermission)
                                }
                                disabled={loading}
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => grantAllModulePermissions(module.id)}
                              disabled={loading}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => revokeAllModulePermissions(module.id)}
                              disabled={loading}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumo de Permissões</CardTitle>
              <CardDescription>
                Visão geral das permissões configuradas por usuário
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((user) => (
                  <div key={user.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </div>
                      <Badge variant="secondary">{user.role}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedUserPermissions
                        .filter(up => up.user_id === user.id)
                        .map((up) => (
                          <Badge
                            key={`${up.module_id}-${up.permission_id}`}
                            variant="outline"
                            className={`text-xs ${getPermissionColor(up.permission.name)}`}
                          >
                            {up.module.display_name}: {up.permission.display_name}
                          </Badge>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}