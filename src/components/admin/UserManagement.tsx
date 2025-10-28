import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Lock, Unlock } from "lucide-react";

interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
}

export function UserManagement() {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Base URL do backend (defina VITE_API_URL no .env do front se quiser)
  const API_BASE = useMemo(() => {
    const envBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
    const fallback =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost:3000";

    const base = envBase && envBase.length > 0 ? envBase : fallback;
    return base.replace(/\/$/, "");
  }, []);

  function getAuthHeaders(withJson = false) {
    const raw = sessionStorage.getItem("token") || localStorage.getItem("token");
    let token = "";

    if (raw) {
      try {
        token = JSON.parse(raw);
      } catch (error) {
        token = raw;
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (withJson) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  const fetchUsers = async () => {
    try {
      setIsLoading(true);

      // Chama o backend local em vez do supabase
      const res = await fetch(`${API_BASE}/api/users`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null);
        const message =
          errorPayload?.message || `GET /api/users -> ${res.status}`;
        throw new Error(message);
      }

      const payload = await res.json();
      const data: User[] = Array.isArray(payload) ? payload : payload?.users ?? [];

      // Ordena por created_at desc (garantia no front, caso o backend não ordene)
      const ordered = [...data].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const pendentes = ordered.filter((u) => u.status === "pendente");

      setAllUsers(ordered);
      setPendingUsers(pendentes);
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      setAllUsers([]);
      setPendingUsers([]);
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Erro ao carregar usuários",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUserAction = async (userId: string, action: "approve" | "reject" | "block") => {
    try {
      let newStatus: string;
      let message: string;
      let endpoint: string;

      switch (action) {
        case "approve":
          newStatus = "ativo";
          message = "Usuário aprovado com sucesso";
          endpoint = `${API_BASE}/api/users/${userId}/approve`;
          break;
        case "reject":
          newStatus = "rejeitado";
          message = "Usuário rejeitado";
          endpoint = `${API_BASE}/api/users/${userId}/reject`;
          break;
        case "block":
          newStatus = "bloqueado";
          message = "Usuário bloqueado";
          endpoint = `${API_BASE}/api/users/${userId}/block`;
          break;
        default:
          return;
      }

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null);
        const responseMessage =
          errorPayload?.message || `PATCH ${endpoint} -> ${res.status}`;
        throw new Error(responseMessage);
      }

      toast({
        title: "Sucesso",
        description: message,
        variant: "default",
      });

      await fetchUsers();
    } catch (error) {
      console.error("Erro na ação do usuário:", error);
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Erro ao processar ação",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ativo":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" /> Ativo
          </Badge>
        );
      case "pendente":
        return (
          <Badge variant="secondary">
            <XCircle className="w-3 h-3 mr-1" /> Pendente
          </Badge>
        );
      case "bloqueado":
        return (
          <Badge variant="destructive">
            <Lock className="w-3 h-3 mr-1" /> Bloqueado
          </Badge>
        );
      case "rejeitado":
        return (
          <Badge variant="outline">
            <XCircle className="w-3 h-3 mr-1" /> Rejeitado
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Pendentes</CardTitle>
            <Badge variant="secondary">{pendingUsers.length}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingUsers.length}</div>
            <p className="text-xs text-muted-foreground">Aguardando aprovação</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
            <Badge variant="outline">{allUsers.length}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allUsers.length}</div>
            <p className="text-xs text-muted-foreground">Todos os usuários no sistema</p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">Pendentes ({pendingUsers.length})</TabsTrigger>
          <TabsTrigger value="all">Todos os Usuários ({allUsers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Usuários Pendentes</CardTitle>
              <CardDescription>Usuários aguardando aprovação para acessar o sistema</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Nenhum usuário pendente no momento
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Data de Cadastro</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>{formatDate(user.created_at)}</TableCell>
                        <TableCell>{getStatusBadge(user.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleUserAction(user.id, "approve")}
                            >
                              Aprovar
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleUserAction(user.id, "reject")}
                            >
                              Rejeitar
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
        </TabsContent>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>Todos os Usuários</CardTitle>
              <CardDescription>Gerenciar todos os usuários do sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Data de Cadastro</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>{user.role}</TableCell>
                      <TableCell>{formatDate(user.created_at)}</TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {user.status === "ativo" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUserAction(user.id, "block")}
                            >
                              <Lock className="w-3 h-3 mr-1" />
                              Bloquear
                            </Button>
                          ) : user.status === "bloqueado" ? (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleUserAction(user.id, "approve")}
                            >
                              <Unlock className="w-3 h-3 mr-1" />
                              Ativar
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
