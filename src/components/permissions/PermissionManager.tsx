import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Shield, Search, Users, Eye, Edit, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface Module {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
}

interface Permission {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
}

interface UserPermissionDetail {
  id?: string;
  user_id: string;
  module_id: string;
  permission_id: string;
  module: Module;
  permission: Permission;
}

interface PermissionOverview {
  user_id: string;
  user: {
    name: string;
    email: string;
    role: string;
  };
  module: Module;
  permission: Permission;
}

export function PermissionManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedUserPermissions, setSelectedUserPermissions] = useState<UserPermissionDetail[]>([]);
  const [overviewPermissions, setOverviewPermissions] = useState<PermissionOverview[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const API_BASE = useMemo(() => {
    const envBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
    const fallback = 'http://localhost:3000';

    let base = envBase && envBase.length > 0 ? envBase : fallback;

    if (!envBase && typeof window !== 'undefined' && window.location?.origin) {
      try {
        const originUrl = new URL(window.location.origin);
        if (
          originUrl.hostname === 'localhost' &&
          ['5000', '5173', '4173'].includes(originUrl.port || '')
        ) {
          originUrl.port = '3000';
          base = originUrl.toString();
        } else {
          base = window.location.origin;
        }
      } catch (error) {
        base = fallback;
      }
    }

    return base.replace(/\/$/, '');
  }, []);

  function getAuthHeaders(withJson = false) {
    const raw = sessionStorage.getItem('token') || localStorage.getItem('token');
    let token = '';

    if (raw) {
      try {
        token = JSON.parse(raw);
      } catch (error) {
        token = raw;
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (withJson) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  async function parseJson<T>(res: Response, fallbackMessage: string): Promise<T> {
    if (!res.ok) {
      let message = fallbackMessage;
      try {
        const payload = await res.json();
        if (payload?.message) {
          message = payload.message;
        }
      } catch (error) {
        // Ignore JSON parse errors for error payloads
      }
      throw new Error(message);
    }

    try {
      return (await res.json()) as T;
    } catch (error) {
      return {} as T;
    }
  }

  const loadUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/permissions/users`, {
        headers: getAuthHeaders(),
      });

      const payload = await parseJson<any>(res, 'Erro ao carregar usuários');
      const data: User[] = Array.isArray(payload)
        ? payload
        : payload?.users ?? payload?.data ?? [];

      const activeUsers = data.filter((user) => user.status === 'ativo');
      setUsers(activeUsers);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      setUsers([]);
      toast({
        title: 'Erro',
        description:
          error instanceof Error ? error.message : 'Erro ao carregar usuários',
        variant: 'destructive',
      });
    }
  };

  const loadModules = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/permissions/modules`, {
        headers: getAuthHeaders(),
      });

      const payload = await parseJson<any>(res, 'Erro ao carregar módulos');
      const data: Module[] = Array.isArray(payload)
        ? payload
        : payload?.modules ?? [];

      setAllModules(data);
    } catch (error) {
      console.error('Erro ao carregar módulos:', error);
      setAllModules([]);
      toast({
        title: 'Erro',
        description:
          error instanceof Error ? error.message : 'Erro ao carregar módulos',
        variant: 'destructive',
      });
    }
  };

  const loadPermissionsList = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/permissions/permissions`, {
        headers: getAuthHeaders(),
      });

      const payload = await parseJson<any>(res, 'Erro ao carregar permissões');
      const data: Permission[] = Array.isArray(payload)
        ? payload
        : payload?.permissions ?? [];

      setAllPermissions(data);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
      setAllPermissions([]);
      toast({
        title: 'Erro',
        description:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar permissões',
        variant: 'destructive',
      });
    }
  };

  const loadOverviewPermissions = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/permissions/overview`, {
        headers: getAuthHeaders(),
      });

      const payload = await parseJson<any>(res, 'Erro ao carregar visão geral');
      const data: PermissionOverview[] = Array.isArray(payload)
        ? payload
        : payload?.permissions ?? [];

      setOverviewPermissions(data);
    } catch (error) {
      console.error('Erro ao carregar visão geral de permissões:', error);
      setOverviewPermissions([]);
      toast({
        title: 'Erro',
        description:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar visão geral de permissões',
        variant: 'destructive',
      });
    }
  };

  const loadSelectedUserPermissions = async (userId: string) => {
    if (!userId) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/permissions/users/${userId}/permissions`,
        {
          headers: getAuthHeaders(),
        }
      );

      const payload = await parseJson<any>(
        res,
        'Erro ao carregar permissões do usuário'
      );
      const data: UserPermissionDetail[] = Array.isArray(payload)
        ? payload
        : payload?.permissions ?? [];

      setSelectedUserPermissions(data);
    } catch (error) {
      console.error('Erro ao carregar permissões do usuário:', error);
      setSelectedUserPermissions([]);
      toast({
        title: 'Erro',
        description:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar permissões do usuário',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshPermissionsData = async (userId: string) => {
    await Promise.all([
      loadSelectedUserPermissions(userId),
      loadOverviewPermissions(),
    ]);
  };

  const userHasPermission = (moduleId: string, permissionId: string): boolean => {
    return selectedUserPermissions.some(
      (permission) =>
        permission.module_id === moduleId &&
        permission.permission_id === permissionId
    );
  };

  const togglePermission = async (
    moduleId: string,
    permissionId: string,
    hasPermission: boolean
  ) => {
    if (!selectedUser) return;

    setLoading(true);
    try {
      const endpoint = hasPermission ? 'revoke' : 'grant';
      const res = await fetch(
        `${API_BASE}/api/permissions/users/${selectedUser}/${endpoint}`,
        {
          method: 'POST',
          headers: getAuthHeaders(true),
          body: JSON.stringify({ moduleId, permissionId }),
        }
      );

      const payload = await parseJson<any>(
        res,
        hasPermission
          ? 'Erro ao revogar permissão'
          : 'Erro ao conceder permissão'
      );

      toast({
        title: 'Sucesso',
        description:
          payload?.message ||
          `${hasPermission ? 'Permissão revogada' : 'Permissão concedida'} com sucesso`,
      });

      await refreshPermissionsData(selectedUser);
    } catch (error) {
      console.error('Erro na ação de permissão:', error);
      toast({
        title: 'Erro',
        description:
          error instanceof Error
            ? error.message
            : 'Erro ao processar a permissão',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const grantBasicPermissions = async (userId: string) => {
    if (!userId) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/permissions/users/${userId}/grant-basic`,
        {
          method: 'POST',
          headers: getAuthHeaders(true),
          body: JSON.stringify({}),
        }
      );

      const payload = await parseJson<any>(
        res,
        'Erro ao conceder permissões básicas'
      );

      toast({
        title: 'Sucesso',
        description:
          payload?.message || 'Permissões básicas concedidas com sucesso',
      });

      await refreshPermissionsData(userId);
    } catch (error) {
      console.error('Erro ao conceder permissões básicas:', error);
      toast({
        title: 'Erro',
        description:
          error instanceof Error
            ? error.message
            : 'Erro ao conceder permissões básicas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const grantAllPermissions = async (userId: string) => {
    if (!userId) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/permissions/users/${userId}/grant-all`,
        {
          method: 'POST',
          headers: getAuthHeaders(true),
          body: JSON.stringify({}),
        }
      );

      const payload = await parseJson<any>(
        res,
        'Erro ao conceder todas as permissões'
      );

      toast({
        title: 'Sucesso',
        description:
          payload?.message || 'Acesso total concedido com sucesso',
      });

      await refreshPermissionsData(userId);
    } catch (error) {
      console.error('Erro ao conceder todas as permissões:', error);
      toast({
        title: 'Erro',
        description:
          error instanceof Error
            ? error.message
            : 'Erro ao conceder todas as permissões',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const revokeAllModulePermissions = async (moduleId: string) => {
    if (!selectedUser) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/permissions/users/${selectedUser}/revoke-module`,
        {
          method: 'POST',
          headers: getAuthHeaders(true),
          body: JSON.stringify({ moduleId }),
        }
      );

      const payload = await parseJson<any>(
        res,
        'Erro ao revogar permissões do módulo'
      );

      toast({
        title: 'Sucesso',
        description:
          payload?.message || 'Todas as permissões do módulo foram revogadas',
      });

      await refreshPermissionsData(selectedUser);
    } catch (error) {
      console.error('Erro ao revogar permissões do módulo:', error);
      toast({
        title: 'Erro',
        description:
          error instanceof Error
            ? error.message
            : 'Erro ao revogar permissões do módulo',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getPermissionIcon = (permissionName: string) => {
    switch (permissionName) {
      case 'view':
        return <Eye className="w-4 h-4" />;
      case 'create':
        return <Plus className="w-4 h-4" />;
      case 'edit':
        return <Edit className="w-4 h-4" />;
      case 'delete':
        return <Trash2 className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  const getPermissionColor = (permissionName: string) => {
    switch (permissionName) {
      case 'view':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'create':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'edit':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'delete':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredUsers = users.filter((user) => {
    const name = user.name?.toLowerCase?.() ?? '';
    const email = user.email?.toLowerCase?.() ?? '';
    const term = searchTerm.toLowerCase();

    return name.includes(term) || email.includes(term);
  });

  useEffect(() => {
    const initialize = async () => {
      setPageLoading(true);
      await Promise.all([
        loadModules(),
        loadPermissionsList(),
        loadUsers(),
        loadOverviewPermissions(),
      ]);
      setPageLoading(false);
    };

    initialize();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      loadSelectedUserPermissions(selectedUser);
    } else {
      setSelectedUserPermissions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser]);

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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
                    {filteredUsers.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Nenhum usuário encontrado
                      </div>
                    ) : (
                      filteredUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{user.name}</span>
                            <span className="text-sm text-muted-foreground">
                              ({user.email})
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedUser && (
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={() => grantBasicPermissions(selectedUser)}
                    disabled={loading}
                    variant="outline"
                  >
                    Liberar Acesso Básico
                  </Button>
                  <Button
                    onClick={() => grantAllPermissions(selectedUser)}
                    disabled={loading}
                    variant="default"
                  >
                    Liberar Acesso Total
                  </Button>
                </div>
              )}
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
                {allModules.length === 0 || allPermissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum módulo ou permissão cadastrado. Configure-os antes de gerenciar usuários.
                  </p>
                ) : (
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
                                {module.description ?? 'Sem descrição'}
                              </div>
                            </div>
                          </TableCell>
                          {allPermissions.map((permission) => {
                            const hasPermission = userHasPermission(
                              module.id,
                              permission.id
                            );
                            return (
                              <TableCell key={permission.id} className="text-center">
                                <Checkbox
                                  checked={hasPermission}
                                  onCheckedChange={() =>
                                    togglePermission(
                                      module.id,
                                      permission.id,
                                      hasPermission
                                    )
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
                                onClick={() => grantAllPermissions(selectedUser)}
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
                )}
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
                {users.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum usuário ativo encontrado.
                  </p>
                ) : (
                  users.map((user) => {
                    const userPermissions = overviewPermissions.filter(
                      (permission) => permission.user_id === user.id
                    );

                    return (
                      <div key={user.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                          <Badge variant="secondary">{user.role}</Badge>
                        </div>
                        {userPermissions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Nenhuma permissão concedida.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {userPermissions.map((permission) => (
                              <Badge
                                key={`${permission.user_id}-${permission.module.id}-${permission.permission.id}`}
                                variant="outline"
                                className={`text-xs ${getPermissionColor(permission.permission.name)}`}
                              >
                                {permission.module.display_name}: {permission.permission.display_name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
